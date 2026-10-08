import { repairMjml } from "./mjml-repair";
import type { ResolvedTokens } from "./brand-tokens";

/* ------------------------------------------------------------------ */
/* Standard 11-section campaign blueprint catalog                      */
/* ------------------------------------------------------------------ */

export type SectionKey =
  | "preheader"
  | "header-logo"
  | "hero"
  | "intro-hook"
  | "price-table"
  | "savings-cards"
  | "callout"
  | "steps"
  | "cta-primary"
  | "cta-secondary"
  | "footer";

export interface SectionDef {
  key: SectionKey;
  /** Canonical marker name used in `<!-- SECTION: ... -->` comments. */
  marker: string;
  label: string;
  description: string;
  /** Normalised legacy / shorthand names that map onto this section. */
  aliases: string[];
}

export const BLAST_SECTIONS: SectionDef[] = [
  {
    key: "preheader",
    marker: "PREHEADER BAR",
    label: "Preheader Bar",
    description: "Top alert banner",
    aliases: ["PREHEADER", "ALERT BANNER", "TOP BANNER", "ANNOUNCEMENT BAR"],
  },
  {
    key: "header-logo",
    marker: "HEADER LOGO BLOCK",
    label: "Header Logo Block",
    description: "Co-branded 2-column or 3-column logo layout",
    aliases: ["HEADER", "HEADER LOGO", "LOGO BLOCK", "CO BRANDED HEADER", "LOGO HEADER"],
  },
  {
    key: "hero",
    marker: "HERO BANNER",
    label: "Hero Banner",
    description: "Headline and announcement sub-banner",
    aliases: ["HERO", "BANNER", "HERO SECTION"],
  },
  {
    key: "intro-hook",
    marker: "PATIENT-FACING INTRO HOOK",
    label: "Patient-Facing Intro Hook",
    description: "Personalized greeting and benefit text",
    aliases: ["INTRO", "INTRO HOOK", "GREETING", "PATIENT FACING INTRO"],
  },
  {
    key: "price-table",
    marker: "MEDICINE PRICE COMPARISON TABLE MATRIX",
    label: "Medicine Price Comparison Table",
    description: "<mj-table> price matrix and legal disclaimer",
    // Legacy: the old generator's VALUE GRID marker maps here.
    aliases: ["VALUE GRID", "PRICE COMPARISON", "PRICE COMPARISON TABLE", "PRICE TABLE", "MEDICINE PRICE COMPARISON TABLE"],
  },
  {
    key: "savings-cards",
    marker: "MEMBER SAVINGS BENEFIT CARDS",
    label: "Member Savings Benefit Cards",
    description: "1, 2 or 3 benefit cards",
    aliases: ["MEMBER SAVINGS CARDS", "SAVINGS CARDS", "BENEFIT CARDS", "MEMBER SAVINGS"],
  },
  {
    key: "callout",
    marker: "DID YOU KNOW CALLOUT BOX",
    label: "Did You Know Callout Box",
    description: "Highlighted tip callout",
    aliases: ["CALLOUT", "CALLOUT BOX", "DID YOU KNOW", "TIP BOX"],
  },
  {
    key: "steps",
    marker: "STEP-BY-STEP ORDERING GUIDE",
    label: "Step-by-Step Ordering Guide",
    description: "3-step process and promo tip box",
    aliases: ["3 STEP GUIDE", "3 STEP", "STEPS", "STEP BY STEP", "ORDERING GUIDE", "HOW IT WORKS"],
  },
  {
    key: "cta-primary",
    marker: "PRIMARY CALL TO ACTION",
    label: "Primary Call To Action",
    description: "Main order button and urgency microcopy",
    aliases: ["CTA", "PRIMARY CTA", "MAIN CTA", "CALL TO ACTION"],
  },
  {
    key: "cta-secondary",
    marker: "DOCTOR TELECONSULT CALLOUT",
    label: "Doctor Teleconsult Callout",
    description: "Secondary CTA box",
    aliases: ["SECONDARY CTA", "TELECONSULT", "DOCTOR TELECONSULT", "SECONDARY CALL TO ACTION"],
  },
  {
    key: "footer",
    marker: "TERMS AND FOOTER",
    label: "Terms and Footer",
    description: "Terms, support email and unsubscribe compliance footer",
    aliases: ["FOOTER", "TERMS", "TERMS FOOTER", "LEGAL FOOTER"],
  },
];

export const normalizeMarker = (name: string): string =>
  name
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ")
    .trim();

export function matchSection(name: string): SectionDef | undefined {
  const n = normalizeMarker(name);
  return BLAST_SECTIONS.find((d) => normalizeMarker(d.marker) === n || d.aliases.includes(n));
}

/* ------------------------------------------------------------------ */
/* Block document                                                      */
/* ------------------------------------------------------------------ */

export interface Block {
  id: string;
  key: SectionKey | "custom";
  /** Marker name. Canonical for known sections, free-form for custom ones. */
  name: string;
  visible: boolean;
  raw: string;
  added?: boolean;
}

export interface BlockDocument {
  /** Everything up to and including the opening <mj-body> tag. */
  prefix: string;
  /** </mj-body></mjml> */
  suffix: string;
  blocks: Block[];
  parsed: boolean;
}

let counter = 0;
const blockId = () => `blk_${Date.now().toString(36)}_${(counter++).toString(36)}`;

const encodeHidden = (raw: string) => raw.replace(/-->/g, "--&gt;");
const decodeHidden = (raw: string) => raw.replace(/--&gt;/g, "-->");

interface Mark {
  type: "start" | "end" | "hidden";
  name: string;
  start: number;
  end: number;
  body?: string;
}
interface Node {
  start: number;
  end: number;
}

const EVENT_RE = /<!--([\s\S]*?)-->|<(\/?)(mj-[a-z0-9-]+)((?:\s[^<>]*?)?)(\/?)>/gi;

function classifyUnmarked(raw: string, index: number, total: number, state: { buttons: number; custom: number }): Pick<Block, "key" | "name"> {
  const hasImage = /<mj-image\b/i.test(raw);
  const hasButton = /<mj-button\b/i.test(raw);
  const hasTable = /<mj-table\b/i.test(raw);
  const isLast = index === total - 1;
  const def = (key: SectionKey) => {
    const d = BLAST_SECTIONS.find((s) => s.key === key)!;
    return { key, name: d.marker };
  };
  if (/\*\|UNSUB\|\*|unsubscribe/i.test(raw) && (isLast || !hasButton)) return def("footer");
  if (index === 0 && hasImage && !hasButton && !hasTable) return def("header-logo");
  if (isLast && total > 1) return def("footer");
  if (hasTable) return def("price-table");
  if (hasButton) {
    state.buttons++;
    return def(state.buttons === 1 ? "cta-primary" : "cta-secondary");
  }
  state.custom++;
  return { key: "custom", name: `CONTENT BLOCK ${state.custom}` };
}

/**
 * Splits MJML into discrete blocks using `<!-- SECTION: NAME --> ... <!-- END SECTION: NAME -->` markers.
 * Legacy markers are mapped to the standard catalog, and un-marked top-level sections are classified heuristically.
 */
export function parseBlocks(mjml: string): BlockDocument {
  const { code } = repairMjml(mjml);
  const open = /<mj-body\b[^>]*>/i.exec(code);
  const closeIdx = code.toLowerCase().lastIndexOf("</mj-body>");
  if (!open || closeIdx === -1 || closeIdx < open.index) return { prefix: code, suffix: "", blocks: [], parsed: false };

  const prefix = code.slice(0, open.index + open[0].length);
  const inner = code.slice(open.index + open[0].length, closeIdx);
  const suffix = code.slice(closeIdx);

  const nodes: Node[] = [];
  const marks: Mark[] = [];
  let depth = 0;
  let nodeStart = -1;
  const re = new RegExp(EVENT_RE.source, "gi");
  let m: RegExpExecArray | null;
  while ((m = re.exec(inner)) !== null) {
    const end = m.index + m[0].length;
    if (m[1] !== undefined) {
      if (depth !== 0) continue;
      const text = m[1];
      let x: RegExpExecArray | null;
      if ((x = /^\s*END\s+SECTION:\s*(.+?)\s*$/i.exec(text))) marks.push({ type: "end", name: x[1], start: m.index, end });
      else if ((x = /^\s*SECTION:\s*(.+?)\s*$/i.exec(text))) marks.push({ type: "start", name: x[1], start: m.index, end });
      else if ((x = /^\s*HIDDEN-BLOCK:\s*([^\n]+?)\s*\n([\s\S]*)$/i.exec(text)))
        marks.push({ type: "hidden", name: x[1], start: m.index, end, body: decodeHidden(x[2]).trim() });
      continue;
    }
    const closing = m[2];
    const selfClosing = m[5];
    if (closing) {
      depth = Math.max(0, depth - 1);
      if (depth === 0 && nodeStart >= 0) {
        nodes.push({ start: nodeStart, end });
        nodeStart = -1;
      }
    } else if (selfClosing) {
      if (depth === 0) nodes.push({ start: m.index, end });
    } else {
      if (depth === 0) nodeStart = m.index;
      depth++;
    }
  }

  type Pending = { name: string; raw: string; visible: boolean; marked: boolean };
  const pending: Pending[] = [];
  let cur: { name: string; contentStart: number } | null = null;
  const flush = (endPos: number) => {
    if (!cur) return;
    const raw = inner.slice(cur.contentStart, endPos).trim();
    if (raw && /<mj-/i.test(raw)) pending.push({ name: cur.name, raw, visible: true, marked: true });
    cur = null;
  };

  const events = [
    ...nodes.map((n) => ({ kind: "node" as const, start: n.start, n })),
    ...marks.map((k) => ({ kind: "mark" as const, start: k.start, k })),
  ].sort((a, b) => a.start - b.start);

  for (const ev of events) {
    if (ev.kind === "mark") {
      const k = ev.k;
      if (k.type === "start") {
        flush(k.start);
        cur = { name: k.name, contentStart: k.end };
      } else if (k.type === "end") flush(k.start);
      else {
        flush(k.start);
        if (k.body) pending.push({ name: k.name, raw: k.body, visible: false, marked: true });
      }
    } else if (!cur) {
      pending.push({ name: "", raw: inner.slice(ev.n.start, ev.n.end), visible: true, marked: false });
    }
  }
  flush(inner.length);

  const state = { buttons: 0, custom: 0 };
  pending.filter((p) => p.marked && matchSection(p.name)?.key === "cta-primary").forEach(() => state.buttons++);

  const blocks: Block[] = pending.map((p, i) => {
    if (p.marked) {
      const def = matchSection(p.name);
      return def
        ? { id: blockId(), key: def.key, name: def.marker, visible: p.visible, raw: p.raw }
        : { id: blockId(), key: "custom" as const, name: p.name.trim().toUpperCase(), visible: p.visible, raw: p.raw };
    }
    const c = classifyUnmarked(p.raw, i, pending.length, state);
    return { id: blockId(), key: c.key, name: c.name, visible: true, raw: p.raw };
  });

  return { prefix, suffix, blocks, parsed: true };
}

const indent = (text: string, pad: string) =>
  text
    .split("\n")
    .map((line, i) => (i === 0 ? line : line.trim() ? pad + line.replace(/^\s{0,4}/, "") : line))
    .join("\n");

/** Re-assembles blocks into a clean MJML document with SECTION / END SECTION markers. */
export function serializeBlocks(doc: BlockDocument): string {
  const body = doc.blocks
    .map((b) => {
      const name = b.name.trim() || "CUSTOM BLOCK";
      if (!b.visible) return `    <!-- HIDDEN-BLOCK: ${name}\n${encodeHidden(b.raw)}\n    -->`;
      return `    <!-- SECTION: ${name} -->\n    ${indent(b.raw.trim(), "    ")}\n    <!-- END SECTION: ${name} -->`;
    })
    .join("\n");
  return `${doc.prefix}\n${body}\n  ${doc.suffix}`;
}

/** Names of the sections in a blast (used to target prompt-based revisions). */
export function listSectionNames(mjml: string): string[] {
  if (!mjml.trim()) return [];
  return parseBlocks(mjml)
    .blocks.filter((b) => b.visible)
    .map((b) => b.name);
}

/* ------------------------------------------------------------------ */
/* Co-branded header normalisation                                     */
/* ------------------------------------------------------------------ */

/** Wraps 2+ sibling columns of a header section in <mj-group> so logos stay side by side on mobile. */
function groupHeaderColumns(raw: string): { raw: string; changed: boolean } {
  let changed = false;
  const out = raw.replace(/(<mj-section\b[^>]*>)([\s\S]*?)(<\/mj-section>)/gi, (full, open: string, inner: string, close: string) => {
    if (/<mj-group\b/i.test(inner)) return full;
    const cols = inner.match(/<mj-column\b/gi);
    if (!cols || cols.length < 2) return full;
    const first = inner.search(/<mj-column\b/i);
    const lastClose = inner.toLowerCase().lastIndexOf("</mj-column>");
    if (first === -1 || lastClose === -1) return full;
    const end = lastClose + "</mj-column>".length;
    changed = true;
    return `${open}${inner.slice(0, first)}<mj-group>${inner.slice(first, end)}</mj-group>${inner.slice(end)}${close}`;
  });
  return { raw: out, changed };
}

export function enforceCoBrandedHeader(mjml: string): { mjml: string; changed: boolean } {
  const doc = parseBlocks(mjml);
  if (!doc.parsed) return { mjml, changed: false };
  let changed = false;
  for (const b of doc.blocks) {
    if (b.key !== "header-logo" || !b.visible) continue;
    const g = groupHeaderColumns(b.raw);
    if (g.changed) {
      b.raw = g.raw;
      changed = true;
    }
  }
  return changed ? { mjml: serializeBlocks(doc), changed } : { mjml, changed };
}

/* ------------------------------------------------------------------ */
/* Editable slots                                                      */
/* ------------------------------------------------------------------ */

export type SlotKind = "text" | "button-label" | "button-href" | "image-src" | "image-alt" | "table-html";

export interface Slot {
  kind: SlotKind;
  label: string;
  value: string;
  /** Value is raw inline HTML rather than plain text. */
  html: boolean;
  multiline: boolean;
  start: number;
  end: number;
}

const plainEligible = (core: string) => {
  const t = core.replace(/<br\s*\/?>/gi, "");
  return !t.includes("<") && !/&(?!(?:amp|lt|gt|quot);)/.test(t);
};
const decodePlain = (core: string) =>
  core
    .replace(/\s*\r?\n\s*/g, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&");
const encodePlain = (v: string) =>
  v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\r?\n/g, "<br />");
const escAttr = (v: string) => v.replace(/"/g, "&quot;").replace(/[\r\n]+/g, " ");

function coreRange(raw: string, start: number, end: number): [number, number] {
  const inner = raw.slice(start, end);
  const lead = /^[ \t]*\r?\n\s*/.exec(inner)?.[0].length ?? 0;
  const trail = lead === inner.length ? 0 : (/\r?\n\s*$/.exec(inner)?.[0].length ?? 0);
  return [start + lead, end - trail];
}

function attrRange(raw: string, tagStart: number, tagEnd: number, attr: string): [number, number] | null {
  const tag = raw.slice(tagStart, tagEnd);
  const m = new RegExp(`\\s${attr}\\s*=\\s*(["'])([\\s\\S]*?)\\1`, "i").exec(tag);
  if (!m) return null;
  const valueStart = tagStart + m.index + m[0].indexOf(m[1]) + 1;
  return [valueStart, valueStart + m[2].length];
}

export function extractSlots(raw: string): Slot[] {
  const slots: Slot[] = [];
  const re = /<mj-(text|button|image|table)\b([^<>]*?)(\/?)>/gi;
  let m: RegExpExecArray | null;
  let textCount = 0;
  while ((m = re.exec(raw)) !== null) {
    const tag = m[1].toLowerCase();
    const openEnd = m.index + m[0].length;

    if (tag === "image") {
      const src = attrRange(raw, m.index, openEnd, "src");
      if (src) slots.push({ kind: "image-src", label: "Image URL", value: raw.slice(src[0], src[1]), html: false, multiline: false, start: src[0], end: src[1] });
      const alt = attrRange(raw, m.index, openEnd, "alt");
      if (alt) slots.push({ kind: "image-alt", label: "Image alt text", value: raw.slice(alt[0], alt[1]), html: false, multiline: false, start: alt[0], end: alt[1] });
      continue;
    }
    if (m[3]) continue;

    const closer = new RegExp(`</mj-${tag}\\s*>`, "i");
    const rest = raw.slice(openEnd);
    const cm = closer.exec(rest);
    if (!cm) continue;
    const innerStart = openEnd;
    const innerEnd = openEnd + cm.index;

    if (tag === "table") {
      slots.push({ kind: "table-html", label: "Table rows (HTML)", value: raw.slice(innerStart, innerEnd).trim(), html: true, multiline: true, start: innerStart, end: innerEnd });
      continue;
    }

    const [cs, ce] = coreRange(raw, innerStart, innerEnd);
    const core = raw.slice(cs, ce);
    const plain = plainEligible(core);
    if (tag === "button") {
      slots.push({ kind: "button-label", label: "Button label", value: plain ? decodePlain(core) : core, html: !plain, multiline: false, start: cs, end: ce });
      const href = attrRange(raw, m.index, openEnd, "href");
      if (href) slots.push({ kind: "button-href", label: "Button URL", value: raw.slice(href[0], href[1]), html: false, multiline: false, start: href[0], end: href[1] });
    } else {
      textCount++;
      slots.push({
        kind: "text",
        label: textCount === 1 ? "Headline" : `Body text ${textCount - 1}`,
        value: plain ? decodePlain(core) : core,
        html: !plain,
        multiline: true,
        start: cs,
        end: ce,
      });
    }
  }
  return slots;
}

export function applySlotEdit(raw: string, slotIndex: number, value: string): string {
  const slot = extractSlots(raw)[slotIndex];
  if (!slot) return raw;
  let encoded: string;
  if (slot.kind === "text" || slot.kind === "button-label") encoded = slot.html ? value : encodePlain(value);
  else if (slot.kind === "table-html") encoded = `\n${value}\n`;
  else encoded = escAttr(value);
  return raw.slice(0, slot.start) + encoded + raw.slice(slot.end);
}

/* ------------------------------------------------------------------ */
/* New block templates                                                 */
/* ------------------------------------------------------------------ */

export type BlockTemplateId = "hero" | "callout" | "table" | "cta" | "banner" | "custom";

export const BLOCK_TEMPLATES: { id: BlockTemplateId; label: string; description: string }[] = [
  { id: "hero", label: "Hero", description: "Headline with supporting line" },
  { id: "callout", label: "Callout Box", description: "Highlighted tip or note" },
  { id: "table", label: "Table", description: "Price comparison <mj-table>" },
  { id: "cta", label: "CTA Button", description: "Centered action button" },
  { id: "banner", label: "Image Banner", description: "Full-width image" },
  { id: "custom", label: "Custom MJML", description: "Write your own snippet" },
];

export function createBlock(id: BlockTemplateId, t: ResolvedTokens, existing: Block[], bannerSrc?: string): Block {
  const has = (k: Block["key"]) => existing.some((b) => b.key === k);
  const def = (key: SectionKey) => BLAST_SECTIONS.find((s) => s.key === key)!.marker;
  const base = { id: blockId(), visible: true, added: true };

  switch (id) {
    case "hero":
      return {
        ...base,
        key: "hero",
        name: def("hero"),
        raw: `<mj-section background-color="${t.containerBg}" padding="24px 24px 8px">
  <mj-column>
    <mj-text align="center" font-size="28px" line-height="34px" font-weight="700" color="${t.secondary}">Your headline goes here</mj-text>
    <mj-text align="center" font-size="16px" line-height="24px" color="${t.mutedColor}">Add one or two lines that explain the offer.</mj-text>
  </mj-column>
</mj-section>`,
      };
    case "callout":
      return {
        ...base,
        key: "callout",
        name: def("callout"),
        raw: `<mj-section background-color="${t.containerBg}" padding="8px 24px">
  <mj-column background-color="${t.canvasBg}" border-left="4px solid ${t.accent}" border-radius="6px" padding="12px 16px">
    <mj-text font-size="15px" font-weight="700" color="${t.accent}" padding-bottom="4px">Did you know?</mj-text>
    <mj-text font-size="14px" line-height="22px" color="${t.textColor}" padding-top="0">Share a helpful tip or fact your members will care about.</mj-text>
  </mj-column>
</mj-section>`,
      };
    case "table":
      return {
        ...base,
        key: "price-table",
        name: def("price-table"),
        raw: `<mj-section background-color="${t.containerBg}" padding="16px 24px">
  <mj-column>
    <mj-text font-size="18px" font-weight="700" color="${t.secondary}">Price comparison</mj-text>
    <mj-table cellpadding="8" font-size="14px" color="${t.textColor}">
      <tr style="background-color:${t.primary};color:#ffffff;text-align:left;">
        <th>Medicine</th>
        <th>Regular price</th>
        <th>Member price</th>
      </tr>
      <tr style="border-bottom:1px solid ${t.borderColor};">
        <td>Medicine A</td>
        <td>PHP 000.00</td>
        <td><strong>PHP 000.00</strong></td>
      </tr>
      <tr style="border-bottom:1px solid ${t.borderColor};">
        <td>Medicine B</td>
        <td>PHP 000.00</td>
        <td><strong>PHP 000.00</strong></td>
      </tr>
    </mj-table>
    <mj-text font-size="11px" line-height="16px" color="${t.mutedColor}">Prices are indicative and subject to change. Terms and conditions apply.</mj-text>
  </mj-column>
</mj-section>`,
      };
    case "cta": {
      const key: SectionKey = has("cta-primary") ? "cta-secondary" : "cta-primary";
      return {
        ...base,
        key,
        name: def(key),
        raw: `<mj-section background-color="${t.containerBg}" padding="16px 24px 24px">
  <mj-column>
    <mj-button href="https://example.com" background-color="${t.primary}" color="${t.buttonTextColor}" font-size="16px" font-weight="700" border-radius="6px" inner-padding="14px 28px" align="center">Order now</mj-button>
  </mj-column>
</mj-section>`,
      };
    }
    case "banner":
      return {
        ...base,
        key: "custom",
        name: "IMAGE BANNER",
        raw: `<mj-section background-color="${t.containerBg}" padding="0">
  <mj-column padding="0">
    <mj-image src="${bannerSrc || "https://placehold.co/600x240/png?text=Banner"}" alt="Banner" padding="0" />
  </mj-column>
</mj-section>`,
      };
    default:
      return {
        ...base,
        key: "custom",
        name: "CUSTOM BLOCK",
        raw: `<mj-section background-color="${t.containerBg}" padding="16px 24px">
  <mj-column>
    <mj-text font-size="15px" color="${t.textColor}">Custom content</mj-text>
  </mj-column>
</mj-section>`,
      };
  }
}
