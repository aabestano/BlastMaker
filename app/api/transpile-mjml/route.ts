import { NextResponse } from "next/server";
import { compileMjml } from "@/lib/mjml-compile";
import { applyBrandTokens, resolveBrandTokens } from "@/lib/brand-tokens";
import type { BrandTokens } from "@/lib/types";

export const runtime = "nodejs";

export async function POST(req: Request) {
  let body: { mjml?: string; brandTokens?: BrandTokens };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }

  const code = body.mjml ?? "";
  if (!code.trim()) {
    return NextResponse.json({ error: "No MJML provided." }, { status: 400 });
  }

  const tokens = resolveBrandTokens({ tokens: body.brandTokens });
  const resolved = applyBrandTokens(code, tokens);
  const result = await compileMjml(resolved.mjml);
  const warnings = [
    ...(resolved.replaced.length ? [`Resolved brand tokens: ${resolved.replaced.join(", ")}.`] : []),
    ...result.warnings,
  ];
  if (result.errors.length || !result.html) {
    return NextResponse.json(
      { error: result.errors.join("; ") || "Compilation produced no output.", mjml: result.mjml, warnings },
      { status: 422 },
    );
  }
  return NextResponse.json({ mjml: result.mjml, html: result.html, warnings });
}
