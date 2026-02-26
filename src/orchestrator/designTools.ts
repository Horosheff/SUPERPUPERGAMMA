import type { ToolRegistry } from "../types.js";
import type { Slide, SlideDesign, Blackboard, DesignBoard } from "./slideTypes.js";
import { SLIDE_COUNT } from "./slideTypes.js";

function isDesignLike(obj: unknown): obj is SlideDesign {
  if (typeof obj !== "object" || obj === null) return false;
  const o = obj as Record<string, unknown>;
  return (
    typeof o.layout === "string" &&
    typeof o.accentColor === "string" &&
    typeof o.gradientFrom === "string" &&
    typeof o.gradientTo === "string" &&
    typeof o.icon === "string"
  );
}

/**
 * Build tool registry for the Design Agent.
 *   readSlides()  — read all slide content from the blackboard
 *   writeDesign() — write design metadata for a single slide
 *   writeAllDesigns() — write design metadata for all slides at once
 */
export function createDesignTools(
  blackboard: Blackboard,
  designBoard: DesignBoard,
  onDesignWritten?: (index: number, design: SlideDesign) => void,
): ToolRegistry {
  return {
    readSlides() {
      return blackboard.map((s, i) =>
        s === null
          ? { index: i + 1, placeholder: true }
          : { index: i + 1, title: s.title, body: s.body, notes: s.notes },
      );
    },

    writeDesign(params: unknown) {
      const p = params as { index?: number; design?: unknown };
      const index = p?.index;
      const raw = p?.design;
      if (typeof index !== "number" || index < 1 || index > SLIDE_COUNT) {
        return { ok: false, error: "index must be 1.." + SLIDE_COUNT };
      }
      if (!raw || !isDesignLike(raw)) {
        return {
          ok: false,
          error:
            'design must be { layout, accentColor, gradientFrom, gradientTo, gradientAngle, icon, darkText, highlightLines, imagePrompt?, tagline? }',
        };
      }
      const design = raw as SlideDesign;
      designBoard[index - 1] = design;
      onDesignWritten?.(index, design);
      return { ok: true, index };
    },

    writeAllDesigns(params: unknown) {
      const p = params as { designs?: unknown[] };
      if (!Array.isArray(p?.designs) || p.designs.length === 0) {
        return { ok: false, error: "designs must be an array of 5 design objects" };
      }
      const results: Array<{ index: number; ok: boolean; error?: string }> = [];
      for (let i = 0; i < Math.min(p.designs.length, SLIDE_COUNT); i++) {
        const raw = p.designs[i];
        if (!raw || !isDesignLike(raw as unknown)) {
          results.push({ index: i + 1, ok: false, error: "invalid design at index " + (i + 1) });
          continue;
        }
        const design = raw as unknown as SlideDesign;
        designBoard[i] = design;
        onDesignWritten?.(i + 1, design);
        results.push({ index: i + 1, ok: true });
      }
      return { ok: true, results };
    },
  };
}
