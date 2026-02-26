import { VanillaAgent } from "../VanillaAgent.js";
import type { Slide, SlideDesign, Blackboard, DesignBoard } from "./slideTypes.js";
import { SLIDE_COUNT } from "./slideTypes.js";
import { createSlideTools } from "./slideTools.js";
import { createDesignTools } from "./designTools.js";

export interface SlideOrchestratorOptions {
  apiKey: string;
  model: string;
  topic: string;
  debugLog?: (event: string, data: unknown) => void;
  onSlideWritten?: (index: number, slide: Slide) => void;
  onDesignWritten?: (index: number, design: SlideDesign) => void;
}

export interface OrchestratorResult {
  slides: (Slide | null)[];
  designs: (SlideDesign | null)[];
}

/**
 * Orchestrator: 5 content agents in parallel → 1 Design Agent → images.
 */
export class SlideOrchestrator {
  private readonly apiKey: string;
  private readonly model: string;
  private readonly topic: string;
  private readonly debugLog: (event: string, data: unknown) => void;
  private readonly onSlideWritten?: (index: number, slide: Slide) => void;
  private readonly onDesignWritten?: (index: number, design: SlideDesign) => void;

  constructor(options: SlideOrchestratorOptions) {
    this.apiKey = options.apiKey;
    this.model = options.model;
    this.topic = options.topic;
    this.debugLog = options.debugLog ?? (() => {});
    this.onSlideWritten = options.onSlideWritten;
    this.onDesignWritten = options.onDesignWritten;
  }

  async run(): Promise<OrchestratorResult> {
    const blackboard: Blackboard = Array.from({ length: SLIDE_COUNT }, () => null);
    const designBoard: DesignBoard = Array.from({ length: SLIDE_COUNT }, () => null);

    this.debugLog("orchestrator_start", { topic: this.topic, agents: SLIDE_COUNT });

    /* ── Phase 1: 5 content agents in parallel ── */
    const contentAgents = Array.from({ length: SLIDE_COUNT }, (_, i) => {
      const tools = createSlideTools(blackboard, i, (idx, slide) =>
        this.onSlideWritten?.(idx, slide),
      );
      const prefix = `[Agent-${i + 1}]`;
      return new VanillaAgent({
        apiKey: this.apiKey,
        model: this.model,
        tools,
        systemPrompt: this.contentSystemPrompt(i + 1),
        maxSteps: 15,
        debugLog: (event, data) => this.debugLog(prefix, { event, data }),
      });
    });

    const contentPrompts = Array.from(
      { length: SLIDE_COUNT },
      (_, i) =>
        `Create slide ${i + 1} of ${SLIDE_COUNT} for the presentation. Topic: ${this.topic}. Use readSlides() to see other slides, then write your slide with writeSlide(${i + 1}, { title: "...", body: ["..."], notes: "..." }). When done, respond with action FINISH.`,
    );

    const contentResults = await Promise.all(
      contentAgents.map((agent, i) => {
        this.debugLog("agent_start", { agent: i + 1 });
        return agent.run(contentPrompts[i]);
      }),
    );

    contentResults.forEach((r, i) => {
      this.debugLog("agent_done", { agent: i + 1, steps: r.steps, finished: r.finished });
    });

    /* ── Phase 2: Design Agent ── */
    this.debugLog("[DesignAgent]", { event: "start", data: "Analyzing slides for design…" });

    const designTools = createDesignTools(blackboard, designBoard, (idx, design) =>
      this.onDesignWritten?.(idx, design),
    );

    const designAgent = new VanillaAgent({
      apiKey: this.apiKey,
      model: this.model,
      tools: designTools,
      systemPrompt: this.designSystemPrompt(),
      maxSteps: 10,
      debugLog: (event, data) => this.debugLog("[DesignAgent]", { event, data }),
    });

    const designPrompt = `You are the Design Agent. The presentation topic is: "${this.topic}".
First call readSlides() to see all 5 slides. Then call writeAllDesigns with a "designs" array of 5 objects — one design per slide.

Each design object must have these fields:
- layout: one of "hero", "bullets", "split", "quote", "stats", "big-number", "minimal"
  • slide 1 should usually be "hero"
  • pick the best layout for each slide's content
- accentColor: a vibrant hex color (e.g. "#7c5cfc")
- gradientFrom: start color of background gradient (dark, rich color)
- gradientTo: end color of background gradient
- gradientAngle: angle in degrees (e.g. 135)
- icon: a single relevant emoji that represents the slide topic
- darkText: false (for dark backgrounds) or true (for light backgrounds)
- highlightLines: array of 0-based indices of body lines to visually highlight
- tagline: a short punchy subtitle (3-6 words) that complements the title
- imagePrompt: a detailed prompt for AI image generation. Describe a specific, visually striking scene or concept art that matches the slide. Be very descriptive about colors, mood, composition. Say "Do NOT include any text or letters." at the end.

Choose a cohesive color palette across all 5 slides — they should feel like one presentation. Use ultra-modern, premium aesthetics. Think: dark gradients, neon accents, glassmorphism vibes.

After writing all designs, respond with action FINISH.`;

    await designAgent.run(designPrompt);

    this.debugLog("orchestrator_done", {
      slides: blackboard.map((s, i) => (s ? { index: i + 1, title: s.title } : null)),
      designsReady: designBoard.filter((d) => d !== null).length,
    });

    return {
      slides: blackboard.map((s) => s),
      designs: designBoard.map((d) => d),
    };
  }

  private contentSystemPrompt(slideIndex: number): string {
    return `You are the agent for slide ${slideIndex} of ${SLIDE_COUNT} in a presentation.
You must respond with exactly one JSON object per turn: { "thought": "...", "action": "tool_name_or_FINISH", "params": {} }

Available tools:
- readSlides(): no params. Returns current state of all 5 slides (placeholder for not yet written).
- writeSlide(params): params = { index: ${slideIndex}, content: { title: string, body: string[], notes?: string } }. You may only write slide ${slideIndex}.

First call readSlides() to see other agents' slides, then create your slide and call writeSlide(${slideIndex}, { title: "...", body: ["..."], notes: "..." }). Then respond with action "FINISH".
Output only valid JSON.`;
  }

  private designSystemPrompt(): string {
    return `You are the Design Agent for a presentation. You analyze slide content and create ultra-modern visual design metadata.
You must respond with exactly one JSON object per turn: { "thought": "...", "action": "tool_name_or_FINISH", "params": {} }

Available tools:
- readSlides(): returns all 5 slides with their content.
- writeAllDesigns(params): params = { designs: [ ...5 design objects ] }. Write design for all slides at once.
- writeDesign(params): params = { index: number, design: {...} }. Write design for one slide.

You are an expert visual designer. Create premium, ultra-modern designs. Think: Gamma.app, Pitch, Beautiful.ai quality.
Output only valid JSON.`;
  }
}
