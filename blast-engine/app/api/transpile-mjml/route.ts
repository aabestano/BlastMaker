import { NextResponse } from "next/server";
import { compileMjml } from "@/lib/mjml-compile";

export const runtime = "nodejs";

export async function POST(req: Request) {
  let body: { mjml?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }

  const code = body.mjml ?? "";
  if (!code.trim()) {
    return NextResponse.json({ error: "No MJML provided." }, { status: 400 });
  }

  const result = await compileMjml(code);
  if (result.errors.length || !result.html) {
    return NextResponse.json(
      { error: result.errors.join("; ") || "Compilation produced no output.", mjml: result.mjml, warnings: result.warnings },
      { status: 422 },
    );
  }
  return NextResponse.json({ mjml: result.mjml, html: result.html, warnings: result.warnings });
}
