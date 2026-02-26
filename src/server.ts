/**
 * Web UI server: static files + POST /api/slides (SSE stream of log + slides + designs + images).
 */

import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { join, dirname, extname } from "node:path";
import { fileURLToPath } from "node:url";
import { SlideOrchestrator } from "./orchestrator/SlideOrchestrator.js";
import type { Slide, SlideDesign } from "./orchestrator/slideTypes.js";
import { generateSlideImage } from "./imageGen.js";

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
  res.write("data: " + JSON.stringify(obj) + "\n\n");
}

function parseBody(req: IncomingMessage): Promise<{ topic?: string }> {
  return new Promise((resolve, reject) => {
    let buf = "";
    req.on("data", (ch) => { buf += ch; });
    req.on("end", () => {
      try { resolve(buf ? JSON.parse(buf) : {}); }
      catch { resolve({}); }
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
  const topic = (body.topic ?? "").trim() || "Презентация";
  const apiKey = getApiKey();
  const model = "gemini-2.5-flash";

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders?.();

  const send = (obj: object) => sendSSE(res, obj);

  const slideDesigns: Record<number, SlideDesign> = {};
  const slideContents: Record<number, Slide> = {};

  try {
    const orchestrator = new SlideOrchestrator({
      apiKey,
      model,
      topic,
      debugLog: (event, data) => send({ type: "log", event, data }),

      onSlideWritten(index, slide) {
        slideContents[index] = slide;
        send({ type: "slide", index, slide });
      },

      onDesignWritten(index, design) {
        slideDesigns[index] = design;
        send({ type: "design", index, design });

        const slide = slideContents[index];
        if (!slide) return;

        generateSlideImage(apiKey, slide, index, design.imagePrompt)
          .then((imageBase64) => {
            if (imageBase64) send({ type: "slideImage", index, imageBase64 });
          })
          .catch((err) => {
            console.error("Image gen failed for slide", index, err);
          });
      },
    });

    const result = await orchestrator.run();

    // If some designs arrived but images haven't been triggered (no imagePrompt),
    // fall back to generating images for slides that still have no image.
    const imagePromises: Promise<void>[] = [];
    for (let i = 0; i < result.slides.length; i++) {
      const slide = result.slides[i];
      if (!slide) continue;
      if (!slideDesigns[i + 1]) {
        imagePromises.push(
          generateSlideImage(apiKey, slide, i + 1)
            .then((img) => { if (img) send({ type: "slideImage", index: i + 1, imageBase64: img }); })
            .catch(() => {}),
        );
      }
    }
    if (imagePromises.length > 0) await Promise.all(imagePromises);

    send({
      type: "done",
      slides: result.slides as (Slide | null)[],
      designs: result.designs as (SlideDesign | null)[],
    });
  } catch (err) {
    send({ type: "error", message: err instanceof Error ? err.message : String(err) });
  } finally {
    res.end();
  }
}

const server = createServer((req, res) => {
  const url = new URL(req.url ?? "/", "http://localhost");
  if (req.method === "POST" && url.pathname === "/api/slides") {
    handlePostSlides(req, res).catch(() => res.end());
    return;
  }
  if (req.method === "GET" && serveStatic(res, url.pathname)) return;
  res.statusCode = req.method === "GET" ? 404 : 405;
  res.end();
});

const PORT = Number(process.env.PORT) || 3780;
loadEnv();

server.listen(PORT, () => {
  console.log("Server: http://localhost:" + PORT);
});
