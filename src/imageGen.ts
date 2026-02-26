/**
 * Image for slides: try Gemini image model; fallback to placeholder URL.
 * Run in parallel for multiple slides.
 */

const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta";

export interface SlideForImage {
  title: string;
  body: string[];
  notes?: string;
}

/**
 * Try Gemini image-generation model (e.g. gemini-3.1-flash-image-preview).
 * Returns base64 PNG or null. Frontend can show placeholder when null.
 */
export async function generateSlideImage(
  apiKey: string,
  slide: SlideForImage,
  slideIndex: number,
  abortSignal?: AbortSignal
): Promise<string | null> {
  const prompt = `A highly detailed, realistic, and professional background image for a presentation slide. Theme: ${slide.title}. Context: ${(slide.body?.[0] ?? "").slice(0, 80)}. Do NOT include any text or words in the image. High quality, 16:9 aspect ratio.`;
  const model = "gemini-3.1-flash-image-preview";
  const url = `${GEMINI_BASE}/models/${model}:generateContent?key=${apiKey}`;
  const body = {
    contents: [{ role: "user", parts: [{ text: prompt }] }],
  };

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: abortSignal,
    });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      candidates?: Array<{
        content?: { parts?: Array<{ inlineData?: { mimeType?: string; data?: string } }> };
      }>;
    };
    const parts = data.candidates?.[0]?.content?.parts ?? [];
    for (const part of parts) {
      if (part.inlineData?.data) return part.inlineData.data;
    }
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") return null;
    console.error("Image gen error:", err);
  }
  return null;
}

/** Placeholder image URL per slide (deterministic from index). */
export function placeholderImageUrl(slideIndex: number, topic: string): string {
  const seed = encodeURIComponent(topic.slice(0, 20)) + slideIndex;
  return `https://picsum.photos/seed/${seed}/800/450`;
}
