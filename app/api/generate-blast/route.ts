import { NextResponse } from "next/server";
import { compileMjml } from "@/lib/mjml-compile";
import { buildFallbackMjml } from "@/lib/fallback-template";
import { applyBrandTokens, resolveBrandTokens } from "@/lib/brand-tokens";
import {
  friendlyGeminiError,
  generateMjmlText,
  parseReferenceImages,
  resolveGeminiKey,
  resolveModel,
} from "@/lib/gemini";
import { MJML_SYSTEM_INSTRUCTION, buildGenerationPrompt, buildRevisionPrompt } from "@/lib/prompt";
import type { BlastResponse, GenerateBlastRequest } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(req: Request) {
  let body: GenerateBlastRequest;
  try {
    body = (await req.json()) as GenerateBlastRequest;
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }

  const blueprint = body.blueprint?.trim() ?? "";
  const revision = body.revision;
  if (!blueprint && !revision?.previousMjml) {
    return NextResponse.json({ error: "Paste a content blueprint before generating." }, { status: 400 });
  }
  if (revision && (!revision.previousMjml?.trim() || !revision.sections?.length)) {
    return NextResponse.json({ error: "Revisions need existing MJML and at least one section request." }, { status: 400 });
  }

  const assets = body.assets ?? [];
  const model = resolveModel(body.model);
  const apiKey = resolveGeminiKey(body.apiKey);
  const tokens = resolveBrandTokens({ tokens: body.brandTokens, directives: body.directives, assets });
  const { images: referenceImages, warnings: referenceWarnings } = parseReferenceImages(body.referenceImages);
  const warnings: string[] = [...referenceWarnings];
  let source: BlastResponse["source"] = "gemini";
  let rawMjml: string;

  if (!apiKey) {
    source = "fallback";
    warnings.push(
      "No Gemini API key configured: generated with the built-in offline template. Add a key in API & Mail Settings for AI-written layouts.",
    );
    if (referenceImages.length) warnings.push("Reference screenshots are only used with a Gemini API key; they were ignored.");
    rawMjml = revision
      ? revision.previousMjml
      : buildFallbackMjml({ blueprint, brandName: body.brandName, assets, directives: body.directives, tokens });
    if (revision) warnings.push("Section revisions require a Gemini API key; the MJML was left unchanged.");
  } else {
    try {
      const common = {
        blueprint,
        brandName: body.brandName,
        assets,
        directives: body.directives,
        tokens,
        referenceCount: referenceImages.length,
      };
      const prompt = revision
        ? buildRevisionPrompt({ ...common, previousMjml: revision.previousMjml, sections: revision.sections })
        : buildGenerationPrompt(common);
      rawMjml = await generateMjmlText({
        apiKey,
        model,
        systemInstruction: MJML_SYSTEM_INSTRUCTION,
        prompt,
        assets,
        referenceImages,
      });
    } catch (err) {
      return NextResponse.json({ error: friendlyGeminiError(err) }, { status: 502 });
    }
  }

  const resolveTokens = (mjml: string) => {
    const r = applyBrandTokens(mjml, tokens);
    if (r.replaced.length) warnings.push(`Resolved brand tokens: ${r.replaced.join(", ")}.`);
    if (r.unknown.length) warnings.push(`Unknown brand tokens were given fallback values: ${r.unknown.join(", ")}.`);
    return r.mjml;
  };

  let result = await compileMjml(resolveTokens(rawMjml));

  if (result.errors.length && source === "gemini") {
    try {
      const retry = await generateMjmlText({
        apiKey: apiKey!,
        model,
        systemInstruction: MJML_SYSTEM_INSTRUCTION,
        prompt: `The following MJML failed to compile with this error: ${result.errors.join("; ")}\n\nFix it and return the full corrected MJML document only. Keep the SECTION / END SECTION markers.\n\n${result.mjml || rawMjml}`,
        assets: [],
      });
      const second = await compileMjml(resolveTokens(retry));
      if (!second.errors.length) {
        result = second;
        warnings.push("The first AI draft failed to compile and was automatically corrected.");
      }
    } catch {
      /* keep original error below */
    }
  }

  if (result.errors.length || !result.html) {
    return NextResponse.json(
      { error: `MJML could not be compiled: ${result.errors.join("; ") || "empty output"}`, mjml: result.mjml },
      { status: 422 },
    );
  }

  const response: BlastResponse = {
    mjml: result.mjml,
    html: result.html,
    warnings: [...warnings, ...result.warnings],
    source,
    model: source === "gemini" ? model : undefined,
  };
  return NextResponse.json(response);
}
