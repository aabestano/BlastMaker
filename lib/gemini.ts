import { GoogleGenAI } from "@google/genai";
import type { BrandAsset } from "./types";

export const DEFAULT_MODEL = "gemini-2.5-flash";

const MAX_INLINE_BYTES = 12 * 1024 * 1024;
const MAX_INLINE_PARTS = 3;

type Part = { text: string } | { inlineData: { mimeType: string; data: string } };

function toInlinePart(asset: BrandAsset): Part | null {
  if (!asset.dataUrl) return null;
  const m = asset.dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!m) return null;
  return { inlineData: { mimeType: m[1], data: m[2] } };
}

export function resolveGeminiKey(requestKey?: string): string | undefined {
  return requestKey?.trim() || process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || undefined;
}

export function resolveModel(requested?: string): string {
  return requested?.trim() || process.env.GEMINI_MODEL || DEFAULT_MODEL;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export interface InlineImage {
  name?: string;
  mime: "image/png" | "image/jpeg";
  /** raw base64 payload (no data: prefix) */
  data: string;
}

const REFERENCE_MIMES = new Set(["image/png", "image/jpeg"]);
const MAX_REFERENCE_IMAGES = 3;
const MAX_REFERENCE_BYTES = 6 * 1024 * 1024;

/** Validates client-supplied screenshots and converts them to inline base64 parts. */
export function parseReferenceImages(input: { name?: string; mime: string; dataUrl: string }[] | undefined): {
  images: InlineImage[];
  warnings: string[];
} {
  const images: InlineImage[] = [];
  const warnings: string[] = [];
  let bytes = 0;
  for (const item of input ?? []) {
    if (images.length >= MAX_REFERENCE_IMAGES) {
      warnings.push(`Only the first ${MAX_REFERENCE_IMAGES} reference screenshots were used.`);
      break;
    }
    const m = /^data:(image\/(?:png|jpe?g));base64,([A-Za-z0-9+/=]+)$/.exec(item?.dataUrl ?? "");
    if (!m) {
      warnings.push(`Reference screenshot "${item?.name ?? "image"}" was skipped (only PNG/JPEG base64 images are supported).`);
      continue;
    }
    const mime = (m[1] === "image/jpg" ? "image/jpeg" : m[1]) as InlineImage["mime"];
    if (!REFERENCE_MIMES.has(mime)) continue;
    bytes += m[2].length * 0.75;
    if (bytes > MAX_REFERENCE_BYTES) {
      warnings.push("Reference screenshots exceeded the size limit; extra images were skipped.");
      break;
    }
    images.push({ name: item.name, mime, data: m[2] });
  }
  return { images, warnings };
}

export async function generateMjmlText(args: {
  apiKey: string;
  model: string;
  systemInstruction: string;
  prompt: string;
  assets: BrandAsset[];
  referenceImages?: InlineImage[];
}): Promise<string> {
  const ai = new GoogleGenAI({ apiKey: args.apiKey });

  const parts: Part[] = [];
  for (const ref of args.referenceImages ?? []) {
    parts.push(
      { text: `Reference screenshot${ref.name ? ` (${ref.name})` : ""} — emulate this layout and visual style:` },
      { inlineData: { mimeType: ref.mime, data: ref.data } },
    );
  }
  let bytes = 0;
  let attached = 0;
  for (const asset of args.assets) {
    if (asset.kind !== "image" && asset.kind !== "pdf") continue;
    if (attached >= MAX_INLINE_PARTS) break;
    const part = toInlinePart(asset);
    if (!part || !("inlineData" in part)) continue;
    bytes += part.inlineData.data.length * 0.75;
    if (bytes > MAX_INLINE_BYTES) break;
    attached++;
    parts.push({ text: `Attached reference file: ${asset.name}` }, part);
  }
  parts.push({ text: args.prompt });

  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const response = await ai.models.generateContent({
        model: args.model,
        contents: [{ role: "user", parts }],
        config: {
          systemInstruction: args.systemInstruction,
          temperature: 0.6,
          maxOutputTokens: 16384,
        },
      });
      const text = response.text;
      if (!text || !text.trim()) throw new Error("Gemini returned an empty response.");
      return text;
    } catch (err) {
      lastError = err;
      const message = err instanceof Error ? err.message : String(err);
      const transient = /\b(429|500|502|503|504)\b|UNAVAILABLE|overloaded|RESOURCE_EXHAUSTED/i.test(message);
      if (!transient || attempt === 2) break;
      await sleep(1500 * (attempt + 1));
    }
  }
  throw lastError instanceof Error ? lastError : new Error("Gemini request failed.");
}

export function friendlyGeminiError(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);
  if (/API key not valid|API_KEY_INVALID|PERMISSION_DENIED|401|403/i.test(raw)) {
    return "Gemini rejected the API key. Check it in API & Mail Settings.";
  }
  if (/404|not found|NOT_FOUND/i.test(raw)) {
    return "Gemini model not found. Pick another model in API & Mail Settings.";
  }
  if (/429|RESOURCE_EXHAUSTED/i.test(raw)) {
    return "Gemini rate limit or quota reached. Wait a moment and retry.";
  }
  const trimmed = raw.replace(/\s+/g, " ").slice(0, 300);
  return `Gemini request failed: ${trimmed}`;
}
