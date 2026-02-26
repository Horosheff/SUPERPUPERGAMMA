/**
 * Message in Gemini API format (role + parts).
 */
export interface GeminiContent {
  role: "user" | "model";
  parts: Array<{ text: string }>;
}

/**
 * Parsed agent response: thought, action, params.
 * Model must respond with exactly this JSON shape.
 */
export interface AgentResponse {
  thought: string;
  action: string;
  params?: Record<string, unknown>;
}

/**
 * Tool registry: action name -> async/sync function.
 */
export type ToolFn = (params: unknown) => unknown | Promise<unknown>;
export type ToolRegistry = Record<string, ToolFn>;

/**
 * Result of agent run: final thought/text and full message history for debugging.
 */
export interface RunResult {
  result: string;
  history: GeminiContent[];
  steps: number;
  finished: boolean;
}

/**
 * Options for VanillaAgent constructor.
 */
export interface VanillaAgentOptions {
  apiKey: string;
  model: string;
  tools: ToolRegistry;
  systemPrompt?: string;
  maxSteps?: number;
  debugLog?: (event: string, data: unknown) => void;
  /** Optional AbortSignal to cancel in-flight Gemini requests. */
  abortSignal?: AbortSignal;
}
