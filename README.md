# Vanilla ReAct Agent (Gemini API)

Autonomous AI agent on **pure Node.js + TypeScript**: no Vercel SDK, Langchain, or Pydantic. Uses only built-in modules and direct `fetch` to the Gemini API.

## Features

- **ReAct loop**: model responds with `{ thought, action, params }`; tools are executed from a registry; loop until `action: "FINISH"`.
- **VanillaAgent** class: configurable system prompt, tool registry, max steps, debug log.
- **SlideOrchestrator**: 5 agents in parallel, shared blackboard; each agent creates one slide and can read others via `readSlides()` / `writeSlide()`.
- **CLI**: single-agent mode or slides mode with debug output.

## Setup

1. **Install dependencies**

   ```bash
   npm install
   ```

2. **API key**

   Copy `.env.example` to `.env` and set your Gemini API key:

   ```bash
   cp .env.example .env
   # Edit .env: GEMINI_API_KEY=your_key
   ```

   Or set in the environment:

   ```bash
   export GEMINI_API_KEY=your_key   # Linux/macOS
   set GEMINI_API_KEY=your_key      # Windows cmd
   ```

3. **Run**

   Single agent (default tools: calculator, getTime):

   ```bash
   npm run dev -- "What is 25 * 4? Use calculator then FINISH."
   ```

   Five agents, each creates one slide (topic as argument):

   ```bash
   npm run dev -- slides "Introduction to AI"
   ```

   Web UI (slides + single agent):

   ```bash
   npm run ui
   ```

   Then open `http://localhost:3780` (or `PORT`).

   Or with `tsx` directly:

   ```bash
   npx tsx src/index.ts "your question"
   npx tsx src/index.ts slides "Presentation topic"
   ```

## Environment variables

- `GEMINI_API_KEY` (**required**): Gemini API key from [Google AI Studio](https://aistudio.google.com/apikey)
- `GEMINI_MODEL` (optional): model name (default: `gemini-2.5-flash`)
- `PORT` (optional): web server port for `npm run ui` (default: `3780`)

## Project structure

- `src/VanillaAgent.ts` — ReAct loop, Gemini fetch, tool execution.
- `src/types.ts` — message/response types, tool registry.
- `src/defaultTools.ts` — example tools (calculator, getTime).
- `src/orchestrator/` — SlideOrchestrator, slide types, readSlides/writeSlide tools.
- `src/index.ts` — CLI entry, loads `.env`, runs agent or orchestrator.

## Programmatic API

```ts
import { VanillaAgent } from "./VanillaAgent.js";
import { defaultTools } from "./defaultTools.js";

const agent = new VanillaAgent({
  apiKey: process.env.GEMINI_API_KEY!,
  model: "gemini-2.0-flash",
  tools: defaultTools,
  debugLog: (event, data) => console.log(event, data),
});
const result = await agent.run("What is 2+2?");
console.log(result.result, result.steps);
```

## Requirements

- Node.js 18+ (native `fetch`).
- Gemini API key from [Google AI Studio](https://aistudio.google.com/apikey).
