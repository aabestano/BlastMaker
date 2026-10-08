import { GoogleGenAI } from "@google/genai";
import type { BrandAsset } from "./types";

export const DEFAULT_MODEL = "gemini-2.5-flash";

const MAX_INLINE_BYTES = 12 * 1024 * 1024;
const MAX_INLINE_PARTS = 6;

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

export async function generateMjmlText(args: {
  apiKey: string;
  model: string;
  systemInstruction: string;
  prompt: string;
  assets: BrandAsset[];
}): Promise<string> {
  const ai = new GoogleGenAI({ apiKey: args.apiKey });

  const parts: Part[] = [];
  let bytes = 0;
  for (const asset of args.assets) {
    if (asset.kind !== "image" && asset.kind !== "pdf") continue;
    if (parts.length >= MAX_INLINE_PARTS) break;
    const part = toInlinePart(asset);
    if (!part || !("inlineData" in part)) continue;
    bytes += part.inlineData.data.length * 0.75;
    if (bytes > MAX_INLINE_BYTES) break;
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
