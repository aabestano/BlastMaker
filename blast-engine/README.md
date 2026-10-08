# Brand Engine · App 2 — Brand & MJML Email Engine

A Next.js 14 (App Router) app that turns App 1 content blueprints (Markdown) plus brand books into
responsive, Mailchimp-ready MJML email blasts. Stack: React, TypeScript, Tailwind CSS (dark), Lucide icons,
Zustand with localStorage persistence, server-side `mjml`, `@google/genai`, and `resend` / SendGrid / Mandrill.

## Run locally

```bash
npm install
cp .env.example .env.local   # optional, see below
npm run dev                  # http://localhost:4310
```

## Tabs

1. **Brand Books** — upload PDF guides, PNG/JPG blast screenshots (downscaled in-browser) and TXT/HTML template code, or save CDN image URLs
   (e.g. Mailchimp `mcusercontent.com`) with usage directives. Assets are grouped per brand book.
2. **Blast Generator** — paste a blueprint, pick a brand book, add directives (layout, colors, `*|FNAME|*` / `*|UNSUB|*` merge tags), generate.
   View Visual Preview / MJML Code Editor / Raw HTML. Copy for Mailchimp, Revise Sections, Send Test Email, Save Blast.
3. **Blast Repository** — saved blasts filtered by Promotional / Educational / Seasonal, with an inspector (live HTML editor, `.txt` / `.html`
   export, visual render, open in new tab / print).

The sidebar footer opens **API & Mail Settings** and shows the active Gemini model and mailer status.

## API routes

| Route | Purpose |
| --- | --- |
| `POST /api/generate-blast` | Builds the prompt from blueprint + brand assets + directives, calls Gemini server-side, repairs MJML, compiles with `mjml`, returns `{ mjml, html, warnings }`. Also handles section revisions. |
| `POST /api/transpile-mjml` | Repairs (unclosed `<mj-preview>`, `<mj-font>`, `<mj-image>`, stray closers, markdown fences, misplaced head tags) and compiles edited MJML. |
| `POST /api/send-test-email` | Sends the HTML via Resend (SDK), SendGrid or Mandrill from the server. Merge tags are replaced with sample values. |
| `GET /api/status` | Reports which keys exist in server env (never the values). |

## Configuration

Keys can be entered in the in-app settings modal (stored in browser localStorage, sent only to this app's routes) or set as server env vars:
`GEMINI_API_KEY`, `GEMINI_MODEL`, `RESEND_API_KEY`, `SENDGRID_API_KEY`, `MANDRILL_API_KEY`, `MAIL_FROM`.

Without a Gemini key the generator falls back to a built-in offline MJML template builder so the whole workflow remains usable.
Test sends require a mailer key and a verified sender address.

## Notes

- PDFs are limited to 3 MB each and screenshots are downscaled so localStorage stays within browser quotas.
- Only CDN URLs saved in the selected brand book are allowed as image sources in generated emails.
