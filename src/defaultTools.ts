import type { ToolRegistry } from "./types.js";

/**
 * Safe eval of numeric expressions (no code execution).
 */
function safeEval(expr: string): number {
  const trimmed = String(expr).trim().replace(/^[=:]/, "").trim();
  if (!/^[\d\s+\-*/().]+$/.test(trimmed)) {
    throw new Error("Only numbers and + - * / ( ) allowed");
  }
  return new Function(`return (${trimmed})`)() as number;
}

export const defaultTools: ToolRegistry = {
  calculator(params: unknown) {
    const p = params as { expression?: string };
    const expr = p?.expression ?? "";
    if (!expr) return { error: "Missing 'expression'" };
    try {
      const result = safeEval(expr);
      return { result };
    } catch (e) {
      return { error: e instanceof Error ? e.message : String(e) };
    }
  },

  getTime() {
    return {
      iso: new Date().toISOString(),
      locale: new Date().toLocaleString(),
    };
  },
};
