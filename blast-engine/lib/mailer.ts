import { Resend } from "resend";
import type { MailerProvider } from "./types";

export interface MailInput {
  provider: MailerProvider;
  apiKey?: string;
  fromName?: string;
  fromEmail?: string;
  to: string[];
  subject: string;
  html: string;
}

const ENV_KEYS: Record<MailerProvider, string> = {
  resend: "RESEND_API_KEY",
  sendgrid: "SENDGRID_API_KEY",
  mandrill: "MANDRILL_API_KEY",
};

export function resolveMailerKey(provider: MailerProvider, requestKey?: string): string | undefined {
  return requestKey?.trim() || process.env[ENV_KEYS[provider]] || undefined;
}

export function mailerEnvStatus(): Record<MailerProvider, boolean> {
  return {
    resend: !!process.env.RESEND_API_KEY,
    sendgrid: !!process.env.SENDGRID_API_KEY,
    mandrill: !!process.env.MANDRILL_API_KEY,
  };
}

function parseFrom(input: MailInput): { name: string; email: string } {
  const envFrom = process.env.MAIL_FROM;
  let email = input.fromEmail?.trim();
  let name = input.fromName?.trim() ?? "";
  if (!email && envFrom) {
    const m = envFrom.match(/^(?:"?([^"<]*)"?\s*)?<([^>]+)>$/);
    if (m) {
      name = name || (m[1] ?? "").trim();
      email = m[2].trim();
    } else {
      email = envFrom.trim();
    }
  }
  if (!email && input.provider === "resend") email = "onboarding@resend.dev";
  if (!email) throw new Error("A verified sender email is required. Set it in API & Mail Settings.");
  return { name, email };
}

async function readError(res: Response): Promise<string> {
  const text = await res.text().catch(() => "");
  try {
    const json = JSON.parse(text);
    return json.message || json.errors?.[0]?.message || json.error || text;
  } catch {
    return text || res.statusText;
  }
}

export async function sendMail(input: MailInput): Promise<{ id?: string; provider: MailerProvider }> {
  const apiKey = resolveMailerKey(input.provider, input.apiKey);
  if (!apiKey) throw new Error(`No ${input.provider} API key configured. Add one in API & Mail Settings.`);
  const from = parseFrom(input);
  const fromHeader = from.name ? `${from.name} <${from.email}>` : from.email;

  if (input.provider === "resend") {
    const resend = new Resend(apiKey);
    const { data, error } = await resend.emails.send({
      from: fromHeader,
      to: input.to,
      subject: input.subject,
      html: input.html,
    });
    if (error) throw new Error(error.message || "Resend rejected the message.");
    return { id: data?.id, provider: "resend" };
  }

  if (input.provider === "sendgrid") {
    const res = await fetch("https://api.sendgrid.com/v3/mail/send", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        personalizations: [{ to: input.to.map((email) => ({ email })) }],
        from: { email: from.email, ...(from.name ? { name: from.name } : {}) },
        subject: input.subject,
        content: [{ type: "text/html", value: input.html }],
      }),
    });
    if (!res.ok) throw new Error(`SendGrid error (${res.status}): ${await readError(res)}`);
    return { id: res.headers.get("x-message-id") ?? undefined, provider: "sendgrid" };
  }

  const res = await fetch("https://mandrillapp.com/api/1.0/messages/send.json", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      key: apiKey,
      message: {
        html: input.html,
        subject: input.subject,
        from_email: from.email,
        from_name: from.name || undefined,
        to: input.to.map((email) => ({ email, type: "to" })),
      },
    }),
  });
  if (!res.ok) throw new Error(`Mandrill error (${res.status}): ${await readError(res)}`);
  const json = (await res.json()) as { status?: string; reject_reason?: string; _id?: string }[];
  const first = json[0];
  if (first && (first.status === "rejected" || first.status === "invalid")) {
    throw new Error(`Mandrill ${first.status}: ${first.reject_reason ?? "unknown reason"}`);
  }
  return { id: first?._id, provider: "mandrill" };
}
