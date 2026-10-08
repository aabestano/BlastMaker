import type { BrandAsset, SectionRevision } from "./types";

export const MJML_SYSTEM_INSTRUCTION = `You are a senior email developer who writes production-grade MJML 4 for marketing email blasts that are pasted into Mailchimp ("Code your own").

OUTPUT RULES
- Return ONLY one complete MJML document, starting with <mjml> and ending with </mjml>. No markdown fences, no commentary.
- Structure: <mjml><mj-head>...</mj-head><mj-body>...</mj-body></mjml>.
- <mj-head> must contain: <mj-title>, <mj-preview> (45-90 chars of preheader text), <mj-attributes> with sensible defaults, optional <mj-font> (self-closed with />), and optional <mj-style>.
- Always close every tag. <mj-image />, <mj-divider />, <mj-spacer />, <mj-font /> are self-closing.
- Body width 600px, mobile-first, single-column friendly; use <mj-section>/<mj-column> for layout and <mj-group> only when columns must stay side by side on mobile.
- Mark each block with a comment so it can be revised later, in this order: <!-- SECTION: HEADER -->, <!-- SECTION: HERO -->, <!-- SECTION: VALUE GRID -->, <!-- SECTION: CTA -->, <!-- SECTION: FOOTER -->.
- Every <mj-image> needs alt text and a width/height-appropriate setup. Only use image URLs that appear in the BRAND ASSET LIBRARY below. Never invent image URLs, never use data: URIs, never use placeholder hosts. If no suitable image exists, design the block with typography and color instead.
- Every link must be an absolute https URL taken from the blueprint or the asset library, or a Mailchimp merge tag URL such as *|UNSUB|*.
- Preserve Mailchimp merge tags exactly as written (e.g. *|FNAME|*, *|UNSUB|*, *|UPDATE_PROFILE|*, *|MC:SUBJECT|*). Never wrap them in HTML entities and never convert them into other syntax.
- The footer must contain an unsubscribe link using *|UNSUB|* and the sender address merge tag *|LIST:ADDRESS|* unless the user directives say otherwise.
- Use accessible color contrast, web-safe font fallbacks, and keep copy faithful to the content blueprint. Do not invent claims, prices, dates or legal text that are not in the blueprint.`;

const MAX_TEMPLATE_CHARS = 24000;

export function describeAssets(assets: BrandAsset[]): string {
  const cdn = assets.filter((a) => a.kind === "cdn-url" && a.url);
  const templates = assets.filter((a) => a.kind === "template" && a.text);
  const visual = assets.filter((a) => a.kind === "image" || a.kind === "pdf");

  const parts: string[] = [];

  if (cdn.length) {
    parts.push(
      "HOSTED IMAGE / LINK ASSETS (the ONLY URLs you may use as image sources):\n" +
        cdn
          .map(
            (a, i) =>
              `${i + 1}. [${a.role || "Asset"}] ${a.name}\n   URL: ${a.url}\n   Usage directive: ${a.directive?.trim() || "none"}`,
          )
          .join("\n"),
    );
  } else {
    parts.push("HOSTED IMAGE / LINK ASSETS: none provided. Do not use <mj-image>.");
  }

  if (visual.length) {
    parts.push(
      "ATTACHED VISUAL REFERENCES (PDFs / screenshots are attached to this request for style, tone, layout and color reference only; they are NOT hosted and must not be used as image URLs):\n" +
        visual
          .map((a) => `- ${a.name}${a.directive ? ` — ${a.directive}` : ""}`)
          .join("\n"),
    );
  }

  if (templates.length) {
    parts.push(
      "REFERENCE TEMPLATE CODE / BRAND TEXT (match its structure, spacing, typography and tone where relevant):\n" +
        templates
          .map((a) => `--- ${a.name}${a.directive ? ` (${a.directive})` : ""} ---\n${(a.text ?? "").slice(0, MAX_TEMPLATE_CHARS)}`)
          .join("\n\n"),
    );
  }

  return parts.join("\n\n");
}

export function buildGenerationPrompt(args: {
  blueprint: string;
  brandName?: string;
  assets: BrandAsset[];
  directives?: string;
}): string {
  return [
    `BRAND: ${args.brandName?.trim() || "Unspecified brand"}`,
    "BRAND ASSET LIBRARY\n" + describeAssets(args.assets),
    "CONTENT BLUEPRINT (Markdown, from the content-planning app):\n" + args.blueprint.trim(),
    "CUSTOM DIRECTIVES (layout, color and merge-tag rules — these override defaults):\n" +
      (args.directives?.trim() || "none"),
    "Write the complete MJML email now.",
  ].join("\n\n=====\n\n");
}

export function buildRevisionPrompt(args: {
  blueprint: string;
  brandName?: string;
  assets: BrandAsset[];
  directives?: string;
  previousMjml: string;
  sections: SectionRevision[];
}): string {
  return [
    `BRAND: ${args.brandName?.trim() || "Unspecified brand"}`,
    "BRAND ASSET LIBRARY\n" + describeAssets(args.assets),
    "ORIGINAL CONTENT BLUEPRINT:\n" + (args.blueprint.trim() || "(not provided)"),
    "CUSTOM DIRECTIVES:\n" + (args.directives?.trim() || "none"),
    "CURRENT MJML:\n" + args.previousMjml,
    "REVISION REQUESTS (block by block):\n" +
      args.sections.map((s) => `- ${s.section}: ${s.instruction.trim()}`).join("\n"),
    "Return the FULL updated MJML document. Change only the requested sections; keep every other section, the head, and the section marker comments byte-for-byte identical unless a request requires otherwise.",
  ].join("\n\n=====\n\n");
}
