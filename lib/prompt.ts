import { BLAST_SECTIONS, matchSection } from "./blocks";
import { describeTokensForPrompt, type ResolvedTokens } from "./brand-tokens";
import type { BrandAsset, SectionRevision } from "./types";

const CATALOG = BLAST_SECTIONS.map(
  (s, i) => `${i + 1}. ${s.marker} — ${s.description}`,
).join("\n");

export const MJML_SYSTEM_INSTRUCTION = `You are a senior email developer who writes production-grade MJML 4 for marketing email blasts that are pasted into Mailchimp ("Code your own").

OUTPUT RULES
- Return ONLY one complete MJML document, starting with <mjml> and ending with </mjml>. No markdown fences, no commentary.
- Structure: <mjml><mj-head>...</mj-head><mj-body>...</mj-body></mjml>.
- <mj-head> must contain: <mj-title>, <mj-preview> (45-90 chars of preheader text), <mj-attributes> with sensible defaults, optional <mj-font> (self-closed with />), and optional <mj-style>.
- Always close every tag. <mj-image />, <mj-divider />, <mj-spacer />, <mj-font /> are self-closing. Every <mj-column> must sit directly inside an <mj-section> or <mj-group>; every content component (<mj-text>, <mj-button>, <mj-image>, <mj-table>...) must sit inside an <mj-column>.
- Body width 600px, mobile-first and responsive.

SECTION MARKERS (required)
- Wrap EVERY top-level <mj-section> or <mj-wrapper> in explicit HTML comment markers:
  <!-- SECTION: HERO BANNER -->
  <mj-section>...</mj-section>
  <!-- END SECTION: HERO BANNER -->
- Several consecutive <mj-section> elements that form one block share one marker pair.
- Marker names are UPPERCASE and must use the standard names below when a section matches one.

STANDARD 11-SECTION CAMPAIGN COMPONENT DICTIONARY (use these exact marker names)
${CATALOG}

Component guidance
- PREHEADER BAR: slim top banner with a short alert line.
- HEADER LOGO BLOCK: co-branded header. For 2 or 3 logos use ONE <mj-section> containing an <mj-group> with 2-3 <mj-column> children (each with one <mj-image>), so the logos stay side by side on mobile instead of stacking. A single logo may use one <mj-column>.
- HERO BANNER: headline plus an announcement sub-banner.
- PATIENT-FACING INTRO HOOK: personalized greeting (use *|FNAME|*) and benefit text.
- MEDICINE PRICE COMPARISON TABLE MATRIX: use <mj-table> with plain HTML <tr>/<th>/<td> rows (no outer <table>), every <tr>, <th>, <td> explicitly closed, a header row, and the legal disclaimer in an <mj-text> directly below the table.
- MEMBER SAVINGS BENEFIT CARDS: 1, 2 or 3 benefit cards as side-by-side <mj-column> elements (cards stack on mobile).
- DID YOU KNOW CALLOUT BOX: tinted column with a border accent holding a short tip.
- STEP-BY-STEP ORDERING GUIDE: exactly 3 numbered steps plus a promo tip box.
- PRIMARY CALL TO ACTION: one prominent <mj-button> plus urgency microcopy.
- DOCTOR TELECONSULT CALLOUT: secondary CTA box with its own button.
- TERMS AND FOOTER: terms, support email, and an unsubscribe link using *|UNSUB|* with the sender address merge tag *|LIST:ADDRESS|* unless directives say otherwise.

DYNAMIC FLEXIBILITY RULE
- Generate ONLY the sections the blueprint asks for, in the blueprint's order. If the blueprint has fewer sections, extra sections, or custom ones, follow it exactly; do not pad the email with standard sections that were not requested and do not drop requested ones.
- For any section that is not in the standard 11, use a custom marker such as <!-- SECTION: WINTER_PROMO --> ... <!-- END SECTION: WINTER_PROMO --> (UPPERCASE, letters, digits, spaces, underscores).
- Blueprints may be free-form Markdown or a structured 11-section campaign blueprint (numbered or headed sections named like the dictionary). Support both.

BRAND TOKENS
- Style with the BRAND TOKENS provided in the request. You may write the placeholder tokens verbatim ({{BRAND_PRIMARY_COLOR}}, {{BRAND_SECONDARY_COLOR}}, {{BRAND_ACCENT_COLOR}}, {{BRAND_CANVAS_BG}}, {{BRAND_CONTAINER_BG}}, {{BRAND_FONT_FAMILY}}, {{BRAND_TEXT_COLOR}}, {{BRAND_MUTED_COLOR}}, {{BRAND_BORDER_COLOR}}, {{BRAND_BUTTON_TEXT_COLOR}}) or the hex values directly; placeholders are replaced server-side before compilation. Never invent other {{...}} tokens.

CONTENT RULES
- Preserve co-branding directives (partner logos, "in partnership with" lines, shared footers) exactly as the blueprint and custom directives state.
- Every <mj-image> needs alt text. Only use image URLs that appear in the BRAND ASSET LIBRARY below. Never invent image URLs, never use data: URIs, never use placeholder hosts. If no suitable image exists, design the block with typography and color instead.
- Every link must be an absolute https URL taken from the blueprint or the asset library, or a Mailchimp merge tag URL such as *|UNSUB|*.
- Preserve Mailchimp merge tags exactly as written (e.g. *|FNAME|*, *|UNSUB|*, *|UPDATE_PROFILE|*, *|MC:SUBJECT|*). Never wrap them in HTML entities and never convert them into other syntax.
- Use accessible color contrast and web-safe font fallbacks. Keep copy faithful to the blueprint. Do not invent claims, prices, dates or legal text that are not in the blueprint.
- If reference screenshots are attached, emulate their layout, spacing, hierarchy and visual style, but take all copy from the blueprint and never use the screenshots as image sources.`;

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

/** Finds headings / numbered lines in a blueprint that match the standard 11-section catalog. */
export function detectBlueprintSections(blueprint: string): string[] {
  const found: string[] = [];
  for (const line of blueprint.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.length > 140) continue;
    const label = trimmed
      .replace(/[*_`]/g, "")
      .replace(/^#{1,6}\s*/, "")
      .replace(/^[-+]\s+/, "")
      .replace(/^\d+[.)]\s*/, "")
      .replace(/^section\s*\d+\s*[:\-–—]\s*/i, "")
      .split(/\s+[—–-]\s+|\s*[:(]/)[0]
      .trim();
    if (label.length < 3) continue;
    const def = matchSection(label);
    if (def && !found.includes(def.marker)) found.push(def.marker);
  }
  return found;
}

function blueprintMode(blueprint: string): string {
  const detected = detectBlueprintSections(blueprint);
  if (detected.length >= 3) {
    return `BLUEPRINT TYPE: structured campaign blueprint. Standard sections detected, in order: ${detected.join(" | ")}. Build these (plus any other sections the blueprint lists) in the blueprint's order and nothing else.`;
  }
  if (detected.length) {
    return `BLUEPRINT TYPE: partially structured. Standard sections detected: ${detected.join(" | ")}. Build the sections the blueprint describes, using standard marker names where they match and custom markers otherwise.`;
  }
  return "BLUEPRINT TYPE: flexible / free-form. Derive sensible sections from the blueprint's headings and content. Use standard marker names where a section clearly matches the dictionary, custom markers otherwise, and generate only what the blueprint calls for.";
}

function referenceNote(count: number): string {
  return count
    ? `REFERENCE SCREENSHOTS: ${count} image${count > 1 ? "s are" : " is"} attached before this text. Use ${count > 1 ? "them" : "it"} as a visual layout/style reference.`
    : "";
}

export function buildGenerationPrompt(args: {
  blueprint: string;
  brandName?: string;
  assets: BrandAsset[];
  directives?: string;
  tokens: ResolvedTokens;
  referenceCount?: number;
}): string {
  return [
    `BRAND: ${args.brandName?.trim() || "Unspecified brand"}`,
    "BRAND TOKENS (placeholder = value):\n" + describeTokensForPrompt(args.tokens),
    "BRAND ASSET LIBRARY\n" + describeAssets(args.assets),
    blueprintMode(args.blueprint),
    "CONTENT BLUEPRINT (Markdown, from the content-planning app):\n" + args.blueprint.trim(),
    "CUSTOM DIRECTIVES (layout, color, co-branding and merge-tag rules — these override defaults):\n" +
      (args.directives?.trim() || "none"),
    referenceNote(args.referenceCount ?? 0),
    "Write the complete MJML email now, with SECTION / END SECTION markers around every top-level section.",
  ]
    .filter(Boolean)
    .join("\n\n=====\n\n");
}

export function buildRevisionPrompt(args: {
  blueprint: string;
  brandName?: string;
  assets: BrandAsset[];
  directives?: string;
  previousMjml: string;
  sections: SectionRevision[];
  tokens: ResolvedTokens;
  referenceCount?: number;
}): string {
  return [
    `BRAND: ${args.brandName?.trim() || "Unspecified brand"}`,
    "BRAND TOKENS (placeholder = value):\n" + describeTokensForPrompt(args.tokens),
    "BRAND ASSET LIBRARY\n" + describeAssets(args.assets),
    "ORIGINAL CONTENT BLUEPRINT:\n" + (args.blueprint.trim() || "(not provided)"),
    "CUSTOM DIRECTIVES:\n" + (args.directives?.trim() || "none"),
    referenceNote(args.referenceCount ?? 0),
    "CURRENT MJML:\n" + args.previousMjml,
    "REVISION REQUESTS (block by block, by SECTION marker name):\n" +
      args.sections.map((s) => `- ${s.section}: ${s.instruction.trim()}`).join("\n"),
    "Return the FULL updated MJML document. Change only the requested sections; keep every other section, the head, and every SECTION / END SECTION marker comment identical unless a request requires otherwise. Keep the same marker names, and add markers for any new section you create.",
  ]
    .filter(Boolean)
    .join("\n\n=====\n\n");
}
