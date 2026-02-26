/**
 * Web UI server: static files + POST /api/slides (SSE stream of log + slides).
 */

import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { join, dirname, extname } from "node:path";
import { fileURLToPath } from "node:url";
import { SlideOrchestrator } from "./orchestrator/SlideOrchestrator.js";
import type { Slide } from "./orchestrator/slideTypes.js";
import { generateSlideImage, placeholderImageUrl } from "./imageGen.js";
import { VanillaAgent } from "./VanillaAgent.js";
import { defaultTools } from "./defaultTools.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..", "public");

function loadEnv(): void {
  const envPath = join(__dirname, "..", ".env");
  if (!existsSync(envPath)) return;
  const raw = readFileSync(envPath, "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "").trim();
  }
}

function getApiKey(): string {
  const key = process.env.GEMINI_API_KEY;
  if (!key?.trim()) throw new Error("GEMINI_API_KEY not set in .env");
  return key.trim();
}

function sendSSE(res: ServerResponse, obj: object): void {
  if (res.writableEnded || res.destroyed) return;
  res.write("data: " + JSON.stringify(obj) + "\n\n");
}

function parseBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    let buf = "";
    req.on("data", (ch) => { buf += ch; });
    req.on("end", () => {
      try {
        resolve(buf ? JSON.parse(buf) : {});
      } catch {
        resolve({});
      }
    });
    req.on("error", reject);
  });
}

const MIMES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".ico": "image/x-icon",
};

function serveStatic(res: ServerResponse, pathname: string): boolean {
  if (pathname === "/") pathname = "/index.html";
  const file = join(ROOT, ...pathname.split("/").filter(Boolean));
  if (!file.startsWith(ROOT) || !existsSync(file)) return false;
  const ext = extname(file);
  res.setHeader("Content-Type", MIMES[ext] ?? "application/octet-stream");
  res.end(readFileSync(file));
  return true;
}

async function handlePostSlides(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const body = await parseBody(req);
  const topic = String(body.topic ?? "").trim() || "Презентация";
  const apiKey = getApiKey();
  const model = (process.env.GEMINI_MODEL ?? "").trim() || "gemini-2.5-flash";

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders?.();

  const send = (obj: object) => sendSSE(res, obj);
  const abortController = new AbortController();
  const signal = abortController.signal;
  req.on("close", () => abortController.abort());

  try {
    const orchestrator = new SlideOrchestrator({
      apiKey,
      model,
      topic,
      abortSignal: signal,
      debugLog: (event, data) => send({ type: "log", event, data }),
      onSlideWritten(index, slide) {
        if (signal.aborted) return;
        send({
          type: "slide",
          index,
          slide,
          placeholderUrl: placeholderImageUrl(index, topic),
        });
        generateSlideImage(apiKey, slide, index, signal)
          .then((imageBase64) => {
            if (signal.aborted) return;
            if (imageBase64) send({ type: "slideImage", index, imageBase64 });
          })
          .catch(() => {});
      },
    });
    const slides = await orchestrator.run();
    if (!signal.aborted) send({ type: "done", slides: slides as (Slide | null)[] });
  } catch (err) {
    if (!abortController.signal.aborted) {
      send({
        type: "error",
        message: err instanceof Error ? err.message : String(err),
      });
    }
  } finally {
    if (!res.writableEnded && !res.destroyed) res.end();
  }
}

async function handlePostRun(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const body = await parseBody(req);
  const message = String(body.message ?? "").trim() || "Hello!";
  const apiKey = getApiKey();
  const model = (process.env.GEMINI_MODEL ?? "").trim() || "gemini-2.5-flash";

  const abortController = new AbortController();
  req.on("close", () => abortController.abort());

  const agent = new VanillaAgent({
    apiKey,
    model,
    tools: defaultTools,
    maxSteps: 20,
    abortSignal: abortController.signal,
  });

  try {
    const result = await agent.run(message);
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.end(JSON.stringify({ ok: true, ...result }));
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.statusCode = abortController.signal.aborted ? 499 : 500;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.end(JSON.stringify({ ok: false, error: msg }));
  }
}

const server = createServer((req, res) => {
  const url = new URL(req.url ?? "/", "http://localhost");
  if (req.method === "POST" && url.pathname === "/api/slides") {
    handlePostSlides(req, res).catch(() => res.end());
    return;
  }
  if (req.method === "POST" && url.pathname === "/api/run") {
    handlePostRun(req, res).catch(() => res.end());
    return;
  }
  if (req.method === "GET" && serveStatic(res, url.pathname)) return;
  res.statusCode = req.method === "GET" ? 404 : 405;
  res.end();
});

loadEnv();
const PORT = Number(process.env.PORT) || 3780;

server.listen(PORT, () => {
  console.log("Server: http://localhost:" + PORT);
});
