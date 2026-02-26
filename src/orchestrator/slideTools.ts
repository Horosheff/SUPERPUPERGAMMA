import type { ToolRegistry } from "../types.js";
import type { Slide, Blackboard } from "./slideTypes.js";
import { SLIDE_COUNT } from "./slideTypes.js";

function isSlideLike(obj: unknown): obj is Slide {
  if (typeof obj !== "object" || obj === null) return false;
  const o = obj as Record<string, unknown>;
  return (
    typeof o.title === "string" &&
    Array.isArray(o.body) &&
    o.body.every((x) => typeof x === "string")
  );
}

/**
 * Build tool registry for one slide agent: readSlides + writeSlide (only for own index).
 * When writeSlide succeeds, onSlideWritten(index, slide) is called for real-time UI.
 */
export function createSlideTools(
  blackboard: Blackboard,
  agentIndex: number,
  onSlideWritten?: (index: number, slide: Slide) => void
): ToolRegistry {
  const myIndex = agentIndex;
  return {
    readSlides() {
      return blackboard.map((s, i) =>
        s === null ? { index: i + 1, placeholder: true } : { index: i + 1, ...s }
      );
    },

    writeSlide(params: unknown) {
      const p = params as { index?: number; content?: unknown };
      const index = p?.index;
      const content = p?.content;
      if (typeof index !== "number" || index < 1 || index > SLIDE_COUNT) {
        return { ok: false, error: "Invalid index (use 1..5)" };
      }
      if (index !== myIndex + 1) {
        return { ok: false, error: `You can only write slide ${myIndex + 1}` };
      }
      if (!content || !isSlideLike(content)) {
        return {
          ok: false,
          error:
            "content must be { title: string, body: string[], notes?: string }",
        };
      }
      const slide = content as Slide;
      blackboard[myIndex] = slide;
      onSlideWritten?.(myIndex + 1, slide);
      return { ok: true, index: myIndex + 1 };
    },
  };
}
