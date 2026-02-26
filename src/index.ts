/**
 * CLI entry: single agent or slides mode.
 * - npx tsx src/index.ts "user message"  -> one agent
 * - npx tsx src/index.ts slides "Topic: ..." -> 5 agents, 5 slides
 */

import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { VanillaAgent } from "./VanillaAgent.js";
import { defaultTools } from "./defaultTools.js";
import { SlideOrchestrator } from "./orchestrator/SlideOrchestrator.js";

function loadEnv(): void {
  const root = dirname(fileURLToPath(import.meta.url));
  const envPath = join(root, "..", ".env");
  if (!existsSync(envPath)) return;
  const raw = readFileSync(envPath, "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "").trim();
  }
}

function getApiKey(): string {
  const key = process.env.GEMINI_API_KEY;
  if (!key?.trim()) {
    console.error("Set GEMINI_API_KEY in .env or environment.");
    process.exit(1);
  }
  return key.trim();
}

function debugLogger(prefix: string) {
  return (event: string, data: unknown) => {
    const payload =
      typeof data === "object" && data !== null
        ? JSON.stringify(data, null, 2)
        : String(data);
    console.log(`${prefix} ${event} ${payload}`);
  };
}

async function runDemo() {
  const log = debugLogger("[Agent]");
  log("step", { step: 1 });
  log("request", { contentsCount: 1 });
  log("response_raw", { text: '{"thought":"I need to compute 7+8.","action":"calculator","params":{"expression":"7+8"}}' });
  log("response_parsed", { thought: "I need to compute 7+8.", action: "calculator", params: { expression: "7+8" } });
  log("tool_call", { action: "calculator", params: { expression: "7+8" } });
  const calcResult = defaultTools.calculator({ expression: "7+8" });
  log("tool_result", { action: "calculator", result: JSON.stringify(calcResult) });
  log("step", { step: 2 });
  log("request", { contentsCount: 3 });
  log("response_raw", { text: '{"thought":"The result is 15. Task done.","action":"FINISH","params":{}}' });
  log("response_parsed", { thought: "The result is 15. Task done.", action: "FINISH", params: {} });
  log("finish", { thought: "The result is 15. Task done." });
  console.log("\n--- Result ---\n");
  console.log("The result is 15. Task done.");
  console.log("\nSteps: 2, finished: true");
}

async function main() {
  loadEnv();
  const args = process.argv.slice(2);

  if (args[0] === "demo") {
    await runDemo();
    return;
  }

  const apiKey = getApiKey();
  const model = "gemini-2.5-flash";

  if (args[0] === "slides") {
    const topic = args[1] ?? "Introduction to AI";
    const orchestrator = new SlideOrchestrator({
      apiKey,
      model,
      topic,
      debugLog: debugLogger("[Orchestrator]"),
    });
    const slides = await orchestrator.run();
    console.log("\n--- Slides ---\n");
    slides.forEach((s, i) => {
      if (s) {
        console.log(`Slide ${i + 1}: ${s.title}`);
        s.body.forEach((line) => console.log(`  ${line}`));
        if (s.notes) console.log(`  Notes: ${s.notes}`);
      } else {
        console.log(`Slide ${i + 1}: (empty)`);
      }
      console.log("");
    });
    console.log("\n--- JSON ---\n");
    console.log(JSON.stringify(slides, null, 2));
    return;
  }

  const userMessage = args[0] ?? "What is 15 * 7? Use calculator then FINISH.";
  const agent = new VanillaAgent({
    apiKey,
    model,
    tools: defaultTools,
    debugLog: debugLogger("[Agent]"),
  });
  const result = await agent.run(userMessage);
  console.log("\n--- Result ---\n");
  console.log(result.result);
  console.log(`\nSteps: ${result.steps}, finished: ${result.finished}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
