import { NextResponse } from "next/server";
import { sendMail } from "@/lib/mailer";
import { applyPreviewMergeTags } from "@/lib/html";
import type { MailerProvider } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

const PROVIDERS: MailerProvider[] = ["resend", "sendgrid", "mandrill"];
const EMAIL_RE = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/;

interface SendBody {
  html?: string;
  subject?: string;
  to?: string | string[];
  provider?: MailerProvider;
  apiKey?: string;
  fromName?: string;
  fromEmail?: string;
}

export async function POST(req: Request) {
  let body: SendBody;
  try {
    body = (await req.json()) as SendBody;
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }

  const recipients = (Array.isArray(body.to) ? body.to : (body.to ?? "").split(/[,;\s]+/))
    .map((e) => e.trim())
    .filter(Boolean);
  if (!recipients.length) return NextResponse.json({ error: "Add at least one recipient." }, { status: 400 });
  if (recipients.length > 10) return NextResponse.json({ error: "Test sends are limited to 10 recipients." }, { status: 400 });
  const invalid = recipients.find((e) => !EMAIL_RE.test(e));
  if (invalid) return NextResponse.json({ error: `"${invalid}" is not a valid email address.` }, { status: 400 });
  if (!body.html?.trim()) return NextResponse.json({ error: "There is no HTML to send. Generate a blast first." }, { status: 400 });

  const provider = body.provider && PROVIDERS.includes(body.provider) ? body.provider : "resend";
  const subject = (body.subject?.trim() || "Test email").replace(/\*\|MC:SUBJECT\|\*/gi, "Test email");

  try {
    const result = await sendMail({
      provider,
      apiKey: body.apiKey,
      fromName: body.fromName,
      fromEmail: body.fromEmail,
      to: recipients,
      subject: `[TEST] ${applyPreviewMergeTags(subject)}`,
      html: applyPreviewMergeTags(body.html),
    });
    return NextResponse.json({ ok: true, ...result, recipients });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Sending failed." }, { status: 502 });
  }
}
