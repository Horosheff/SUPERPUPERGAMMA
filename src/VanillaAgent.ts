import type {
  GeminiContent,
  AgentResponse,
  ToolRegistry,
  RunResult,
  VanillaAgentOptions,
} from "./types.js";

const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta";
const FINISH_ACTION = "FINISH";

function isAgentResponse(obj: unknown): obj is AgentResponse {
  return (
    typeof obj === "object" &&
    obj !== null &&
    "thought" in obj &&
    "action" in obj &&
    typeof (obj as AgentResponse).action === "string"
  );
}

/**
 * Vanilla ReAct agent: Gemini API via fetch, JSON thought/action/params, tool registry.
 */
export class VanillaAgent {
  private readonly apiKey: string;
  private readonly model: string;
  private readonly tools: ToolRegistry;
  private readonly systemPrompt: string;
  private readonly maxSteps: number;
  private readonly debugLog: (event: string, data: unknown) => void;

  constructor(options: VanillaAgentOptions) {
    this.apiKey = options.apiKey;
    this.model = options.model;
    this.tools = options.tools;
    this.systemPrompt =
      options.systemPrompt ?? this.getDefaultSystemPrompt();
    this.maxSteps = options.maxSteps ?? 20;
    this.debugLog = options.debugLog ?? (() => {});
  }

  private getDefaultSystemPrompt(): string {
    const toolNames = Object.keys(this.tools).join(", ");
    return `You are a reasoning agent. You must respond with exactly one JSON object per turn, no other text.
Format: { "thought": "your reasoning", "action": "tool_name_or_FINISH", "params": {} }

Available tools: ${toolNames}. Use action "FINISH" when the task is done and you have the final answer in "thought".
Always output valid JSON only.`;
  }

  /**
   * Call Gemini generateContent (REST).
   */
  private async callGemini(contents: GeminiContent[]): Promise<string> {
    const url = `${GEMINI_BASE}/models/${this.model}:generateContent?key=${this.apiKey}`;
    const body: {
      systemInstruction?: { parts: Array<{ text: string }> };
      contents: GeminiContent[];
    } = {
      systemInstruction: { parts: [{ text: this.systemPrompt }] },
      contents,
    };

    this.debugLog("request", { contentsCount: contents.length });

    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Gemini API error ${res.status}: ${errText}`);
    }

    const data = (await res.json()) as {
      candidates?: Array<{
        content?: { parts?: Array<{ text?: string }> };
      }>;
    };

    const parts = data.candidates?.[0]?.content?.parts ?? [];
    const text = parts
      .map((p) => (typeof p.text === "string" ? p.text : ""))
      .join("")
      .trim();

    this.debugLog("response_raw", { text: text.slice(0, 500) });
    return text;
  }

  /**
   * Parse model output as AgentResponse. Returns null on parse error.
   */
  private parseResponse(raw: string): AgentResponse | null {
    const trimmed = raw.replace(/^```json\s*/i, "").replace(/\s*```\s*$/i, "").trim();
    try {
      const parsed = JSON.parse(trimmed) as unknown;
      if (!isAgentResponse(parsed)) return null;
      return parsed;
    } catch {
      return null;
    }
  }

  /**
   * Run tool by name and return serialized result.
   */
  private async runTool(action: string, params: unknown): Promise<string> {
    const fn = this.tools[action];
    if (!fn) {
      this.debugLog("tool_call", { action, error: "Unknown tool" });
      return JSON.stringify({ error: "Unknown tool", action });
    }
    this.debugLog("tool_call", { action, params });
    try {
      const result = await Promise.resolve(fn(params));
      const out = typeof result === "string" ? result : JSON.stringify(result);
      this.debugLog("tool_result", { action, result: out.slice(0, 300) });
      return out;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.debugLog("tool_result", { action, error: msg });
      return JSON.stringify({ error: msg });
    }
  }

  /**
   * ReAct loop: send messages -> parse JSON -> execute tool or FINISH.
   */
  async run(userMessage: string): Promise<RunResult> {
    const history: GeminiContent[] = [
      { role: "user", parts: [{ text: userMessage }] },
    ];
    let steps = 0;
    let lastThought = "";

    while (steps < this.maxSteps) {
      steps++;
      this.debugLog("step", { step: steps });

      const raw = await this.callGemini(history);
      const parsed = this.parseResponse(raw);

      if (!parsed) {
        history.push({
          role: "user",
          parts: [
            {
              text: "Invalid JSON. Reply with exactly: { \"thought\": \"...\", \"action\": \"...\", \"params\": {} }",
            },
          ],
        });
        continue;
      }

      this.debugLog("response_parsed", parsed);
      lastThought = parsed.thought ?? "";

      history.push({
        role: "model",
        parts: [
          {
            text: JSON.stringify({
              thought: parsed.thought,
              action: parsed.action,
              params: parsed.params ?? {},
            }),
          },
        ],
      });

      if (parsed.action === FINISH_ACTION) {
        this.debugLog("finish", { thought: lastThought });
        return {
          result: lastThought,
          history,
          steps,
          finished: true,
        };
      }

      const observation = await this.runTool(parsed.action, parsed.params ?? {});
      history.push({
        role: "user",
        parts: [{ text: `Observation: ${observation}` }],
      });
    }

    this.debugLog("max_steps", { steps: this.maxSteps });
    return {
      result: lastThought || "Max steps reached.",
      history,
      steps,
      finished: false,
    };
  }
}
