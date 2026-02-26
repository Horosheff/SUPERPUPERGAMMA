import { VanillaAgent } from "../VanillaAgent.js";
import type { Slide, Blackboard } from "./slideTypes.js";
import { SLIDE_COUNT } from "./slideTypes.js";
import { createSlideTools } from "./slideTools.js";

export interface SlideOrchestratorOptions {
  apiKey: string;
  model: string;
  topic: string;
  debugLog?: (event: string, data: unknown) => void;
  /** Called when an agent writes a slide (for real-time UI + image generation). */
  onSlideWritten?: (index: number, slide: Slide) => void;
}

/**
 * Orchestrator: 5 agents in parallel, shared blackboard, each agent creates one slide.
 */
export class SlideOrchestrator {
  private readonly apiKey: string;
  private readonly model: string;
  private readonly topic: string;
  private readonly debugLog: (event: string, data: unknown) => void;
  private readonly onSlideWritten?: (index: number, slide: Slide) => void;

  constructor(options: SlideOrchestratorOptions) {
    this.apiKey = options.apiKey;
    this.model = options.model;
    this.topic = options.topic;
    this.debugLog = options.debugLog ?? (() => {});
    this.onSlideWritten = options.onSlideWritten;
  }

  /**
   * Run 5 agents in parallel; return array of 5 slides (null for any failure).
   */
  async run(): Promise<(Slide | null)[]> {
    const blackboard: Blackboard = Array.from(
      { length: SLIDE_COUNT },
      () => null
    );

    this.debugLog("orchestrator_start", { topic: this.topic, agents: SLIDE_COUNT });

    const agents = Array.from({ length: SLIDE_COUNT }, (_, i) => {
      const tools = createSlideTools(
        blackboard,
        i,
        (index, slide) => this.onSlideWritten?.(index, slide)
      );
      const systemPrompt = this.getSystemPrompt(i + 1);
      const prefix = `[Agent-${i + 1}]`;
      return new VanillaAgent({
        apiKey: this.apiKey,
        model: this.model,
        tools,
        systemPrompt,
        maxSteps: 15,
        debugLog: (event, data) =>
          this.debugLog(prefix, { event, data }),
      });
    });

    const userPrompts = Array.from(
      { length: SLIDE_COUNT },
      (_, i) =>
        `Create slide ${i + 1} of ${SLIDE_COUNT} for the presentation. Topic: ${this.topic}. Use readSlides() to see other slides, then write your slide with writeSlide(${i + 1}, { title: "...", body: ["..."], notes: "..." }). When done, respond with action FINISH.`
    );

    const results = await Promise.all(
      agents.map((agent, i) => {
        this.debugLog("agent_start", { agent: i + 1 });
        return agent.run(userPrompts[i]);
      })
    );

    results.forEach((r, i) => {
      this.debugLog("agent_done", {
        agent: i + 1,
        steps: r.steps,
        finished: r.finished,
      });
    });

    this.debugLog("orchestrator_done", {
      slides: blackboard.map((s, i) => (s ? { index: i + 1, title: s.title } : null)),
    });

    return blackboard.map((s) => s);
  }

  private getSystemPrompt(slideIndex: number): string {
    return `You are the agent for slide ${slideIndex} of ${SLIDE_COUNT} in a presentation.
You must respond with exactly one JSON object per turn: { "thought": "...", "action": "tool_name_or_FINISH", "params": {} }

Available tools:
- readSlides(): no params. Returns current state of all 5 slides (placeholder for not yet written).
- writeSlide(params): params = { index: ${slideIndex}, content: { title: string, body: string[], notes?: string } }. You may only write slide ${slideIndex}.

First call readSlides() to see other agents' slides, then create your slide and call writeSlide(${slideIndex}, { title: "...", body: ["..."], notes: "..." }). Then respond with action "FINISH".
Output only valid JSON.`;
  }
}
