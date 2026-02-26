/**
 * Image generation for slides via Gemini Nano Banana.
 * Uses Design-Agent-crafted prompts for theme-accurate images.
 * No more random picsum.photos — fallback is gradient + icon on the frontend.
 */

const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta";

export interface SlideForImage {
  title: string;
  body: string[];
  notes?: string;
}

/**
 * Generate an image using the Design Agent's prompt (or a fallback prompt
 * built from slide content). Returns base64 image data or null.
 */
export async function generateSlideImage(
  apiKey: string,
  slide: SlideForImage,
  slideIndex: number,
  customPrompt?: string,
): Promise<string | null> {
  const prompt =
    customPrompt ??
    buildDefaultPrompt(slide);

  const model = "gemini-2.0-flash-exp-image-generation";
  const url = `${GEMINI_BASE}/models/${model}:generateContent?key=${apiKey}`;
  const body = {
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    generationConfig: {
      responseModalities: ["TEXT", "IMAGE"],
    },
  };

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      console.error(`Image gen HTTP ${res.status} for slide ${slideIndex}:`, errText.slice(0, 200));
      return null;
    }

    const data = (await res.json()) as {
      candidates?: Array<{
        content?: {
          parts?: Array<{
            text?: string;
            inlineData?: { mimeType?: string; data?: string };
          }>;
        };
      }>;
    };

    const parts = data.candidates?.[0]?.content?.parts ?? [];
    for (const part of parts) {
      if (part.inlineData?.data) return part.inlineData.data;
    }
  } catch (err) {
    console.error("Image gen error for slide", slideIndex, ":", err);
  }
  return null;
}

function buildDefaultPrompt(slide: SlideForImage): string {
  const context = slide.body.slice(0, 2).join(". ").slice(0, 120);
  return `Create a visually stunning, modern illustration for a presentation slide about "${slide.title}". ${context ? `Context: ${context}.` : ""} Style: ultra-modern, clean, professional, dark background with vibrant accent colors, abstract geometric shapes and glowing elements. Do NOT include any text, words, or letters in the image. 16:9 aspect ratio, high quality.`;
}
