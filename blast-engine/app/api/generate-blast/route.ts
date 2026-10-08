import { NextResponse } from "next/server";
import { compileMjml } from "@/lib/mjml-compile";
import { buildFallbackMjml } from "@/lib/fallback-template";
import {
  friendlyGeminiError,
  generateMjmlText,
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
  const warnings: string[] = [];
  let source: BlastResponse["source"] = "gemini";
  let rawMjml: string;

  if (!apiKey) {
    source = "fallback";
    warnings.push(
      "No Gemini API key configured: generated with the built-in offline template. Add a key in API & Mail Settings for AI-written layouts.",
    );
    rawMjml = revision
      ? revision.previousMjml
      : buildFallbackMjml({ blueprint, brandName: body.brandName, assets, directives: body.directives });
    if (revision) warnings.push("Section revisions require a Gemini API key; the MJML was left unchanged.");
  } else {
    try {
      const prompt = revision
        ? buildRevisionPrompt({
            blueprint,
            brandName: body.brandName,
            assets,
            directives: body.directives,
            previousMjml: revision.previousMjml,
            sections: revision.sections,
          })
        : buildGenerationPrompt({ blueprint, brandName: body.brandName, assets, directives: body.directives });
      rawMjml = await generateMjmlText({
        apiKey,
        model,
        systemInstruction: MJML_SYSTEM_INSTRUCTION,
        prompt,
        assets,
      });
    } catch (err) {
      return NextResponse.json({ error: friendlyGeminiError(err) }, { status: 502 });
    }
  }

  let result = await compileMjml(rawMjml);

  if (result.errors.length && source === "gemini") {
    try {
      const retry = await generateMjmlText({
        apiKey: apiKey!,
        model,
        systemInstruction: MJML_SYSTEM_INSTRUCTION,
        prompt: `The following MJML failed to compile with this error: ${result.errors.join("; ")}\n\nFix it and return the full corrected MJML document only.\n\n${result.mjml || rawMjml}`,
        assets: [],
      });
      const second = await compileMjml(retry);
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
