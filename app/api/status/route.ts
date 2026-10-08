import { NextResponse } from "next/server";
import { mailerEnvStatus } from "@/lib/mailer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({
    gemini: !!(process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY),
    geminiModel: process.env.GEMINI_MODEL ?? null,
    mailers: mailerEnvStatus(),
  });
}
