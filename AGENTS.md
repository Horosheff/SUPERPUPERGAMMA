# AGENTS.md

## Cursor Cloud specific instructions

### Overview

Vanilla ReAct Agent — a single-package Node.js + TypeScript project (npm, no monorepo). It implements an autonomous AI agent using direct REST calls to the Google Gemini API. Two entry points:

- **CLI** (`npm run dev`): single-agent or slide-orchestrator mode.
- **Web UI** (`npm run ui`): SSE-based server on port 3780 serving `public/index.html` for real-time slide generation.

### Required secret

`GEMINI_API_KEY` — required for all live AI functionality. Without it, only the built-in `demo` subcommand works (`npm run dev -- demo`). Obtain from [Google AI Studio](https://aistudio.google.com/apikey). The Cursor Cloud secret is named `KEY`; write it into `.env` as `GEMINI_API_KEY=$KEY` before running.

### Key commands

| Task | Command |
|------|---------|
| Install deps | `npm install` |
| Build (typecheck) | `npm run build` |
| CLI demo (no API key) | `npm run dev -- demo` |
| CLI single agent | `npm run dev -- "your prompt"` |
| CLI slides | `npm run dev -- slides "topic"` |
| Web UI (port 3780) | `npm run ui` |

### Non-obvious notes

- No linter or test framework is configured in this project. `npm run build` (tsc) is the primary code-quality check.
- The web UI server (`npm run ui`) reads `.env` at startup. If you update `GEMINI_API_KEY` in `.env`, you must restart the server.
- The frontend is plain HTML/CSS/JS in `public/index.html` — no build step needed for frontend changes.
- The `demo` CLI subcommand simulates the full ReAct loop (think → act → observe → finish) without making any API calls. Useful for verifying the agent framework works.
