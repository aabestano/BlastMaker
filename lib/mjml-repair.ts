/**
 * Pure-string MJML repair utilities. Safe to run on the server or client.
 *
 * LLM output frequently contains markdown fences, unclosed void-like tags (<mj-image ...>, <mj-font ...>),
 * mismatched closers, <mj-column> elements that are not inside an <mj-section> / <mj-group>, and
 * broken HTML tables inside <mj-table>. This module normalises all of it before the code reaches
 * the `mjml` compiler.
 */

/** Tags that never have children or text content. */
const EMPTY_TAGS = new Set([
  "mj-image",
  "mj-divider",
  "mj-spacer",
  "mj-font",
  "mj-breakpoint",
  "mj-all",
  "mj-class",
  "mj-carousel-image",
]);

/** Tags that only hold text/HTML: any following MJML tag implies they were left open. */
const TEXT_ONLY_TAGS = new Set(["mj-preview", "mj-title", "mj-text", "mj-button"]);

/** Components that must live inside an <mj-column> (or <mj-hero>). */
const CONTENT_TAGS = new Set([
  "mj-text",
  "mj-button",
  "mj-image",
  "mj-divider",
  "mj-spacer",
  "mj-table",
  "mj-social",
  "mj-navbar",
  "mj-accordion",
  "mj-carousel",
]);

const BODY_CONTAINERS = new Set(["mj-body", "mj-wrapper"]);

const TAG_RE = /<!--[\s\S]*?-->|<(\/?)(mjml|mj-[a-z0-9-]+)((?:\s+[^<>]*?)?)(\/?)>/gi;

export function stripFences(input: string): string {
  let text = input.trim();
  const fenced = text.match(/```(?:mjml|xml|html)?\s*\n([\s\S]*?)```/i);
  if (fenced) text = fenced[1].trim();
  else text = text.replace(/^```[a-z]*\s*\n?/i, "").replace(/\n?```\s*$/i, "");
  return text.trim();
}

export function extractMjmlDocument(input: string): string {
  const text = stripFences(input);
  const start = text.search(/<mjml[\s>]/i);
  if (start === -1) return text;
  const lower = text.toLowerCase();
  const end = lower.lastIndexOf("</mjml>");
  return end === -1 ? text.slice(start) : text.slice(start, end + "</mjml>".length);
}

export interface RepairResult {
  code: string;
  fixes: string[];
}

/* ------------------------------------------------------------------ */
/* HTML table balancing (content of <mj-table>)                        */
/* ------------------------------------------------------------------ */

const TABLE_TAG_RE = /<!--[\s\S]*?-->|<(\/?)(table|thead|tbody|tfoot|tr|td|th|colgroup|caption)\b([^<>]*?)(\/?)>/gi;
const CELLS = new Set(["td", "th"]);
const ROW_GROUPS = new Set(["thead", "tbody", "tfoot"]);

/** Closes unclosed / mismatched <table>, <tr>, <td>, <th> (and row groups) in an HTML fragment. */
export function balanceTableHtml(html: string): { html: string; fixes: string[] } {
  const fixes = new Set<string>();
  const stack: string[] = [];
  let out = "";
  let cursor = 0;
  let m: RegExpExecArray | null;
  const re = new RegExp(TABLE_TAG_RE.source, "gi");

  const pop = (note: boolean) => {
    const name = stack.pop()!;
    out += `</${name}>`;
    if (note) fixes.add(`Closed unclosed <${name}> in <mj-table>`);
  };
  const top = () => stack[stack.length - 1];

  while ((m = re.exec(html)) !== null) {
    const [full, closing, rawName, , selfClosing] = m;
    out += html.slice(cursor, m.index);
    cursor = m.index + full.length;
    if (!rawName) {
      out += full;
      continue;
    }
    const name = rawName.toLowerCase();

    if (closing) {
      const at = stack.lastIndexOf(name);
      const tableAbove = stack.slice(at + 1).includes("table");
      if (at === -1 || (name !== "table" && tableAbove)) {
        fixes.add(`Removed stray </${name}> in <mj-table>`);
        continue;
      }
      while (stack.length > at + 1) pop(true);
      pop(false);
      continue;
    }

    if (selfClosing) {
      out += full;
      continue;
    }

    if (CELLS.has(name)) {
      if (CELLS.has(top())) pop(true);
      if (top() !== "tr") {
        out += "<tr>";
        stack.push("tr");
        fixes.add("Added missing <tr> around table cells in <mj-table>");
      }
    } else if (name === "tr") {
      while (stack.length && (CELLS.has(top()) || top() === "tr")) pop(true);
    } else if (ROW_GROUPS.has(name)) {
      while (stack.length && (CELLS.has(top()) || top() === "tr" || ROW_GROUPS.has(top()))) pop(true);
    }

    out += full;
    stack.push(name);
  }

  out += html.slice(cursor);
  while (stack.length) pop(true);
  return { html: out, fixes: Array.from(fixes) };
}

/** Balances the HTML inside every <mj-table>, closing the <mj-table> itself if it was left open. */
function repairMjTables(source: string, fixes: string[]): string {
  let out = "";
  let cursor = 0;
  const openRe = /<mj-table\b([^<>]*?)(\/?)>/gi;
  let m: RegExpExecArray | null;
  while ((m = openRe.exec(source)) !== null) {
    if (m.index < cursor) continue;
    if (m[2]) continue;
    const innerStart = m.index + m[0].length;
    const nextMj = /<(\/?)mj-[a-z0-9-]+/gi;
    nextMj.lastIndex = innerStart;
    const next = nextMj.exec(source);
    let innerEnd: number;
    let closerLength = 0;
    if (next && next[1] && /^<\/mj-table/i.test(next[0])) {
      innerEnd = next.index;
      const closer = /^<\/mj-table\s*>/i.exec(source.slice(innerEnd));
      closerLength = closer ? closer[0].length : 0;
    } else {
      innerEnd = next ? next.index : source.length;
      fixes.push("Closed unclosed <mj-table>");
    }
    const balanced = balanceTableHtml(source.slice(innerStart, innerEnd));
    fixes.push(...balanced.fixes);
    out += source.slice(cursor, innerStart) + balanced.html + "</mj-table>";
    cursor = innerEnd + closerLength;
    openRe.lastIndex = cursor;
  }
  return out + source.slice(cursor);
}

/* ------------------------------------------------------------------ */
/* Main repair                                                         */
/* ------------------------------------------------------------------ */

interface Entry {
  name: string;
  synthetic: boolean;
}

function canContain(parent: string, child: string): boolean {
  if (parent === "mj-section") return child === "mj-column" || child === "mj-group" || CONTENT_TAGS.has(child) || child === "mj-raw";
  if (parent === "mj-column") return CONTENT_TAGS.has(child) || child === "mj-raw";
  return true;
}

export function repairMjml(input: string): RepairResult {
  const fixes: string[] = [];
  let source = extractMjmlDocument(input);

  if (!source.trim()) return { code: "", fixes };

  if (!/<mjml[\s>]/i.test(source)) {
    fixes.push("Added missing <mjml> root element");
    source = `<mjml>${source}</mjml>`;
  }

  if (!/<mj-body[\s>]/i.test(source)) {
    fixes.push("Wrapped content in <mj-body>");
    source = source.replace(/<mjml([^>]*)>([\s\S]*?)(?:<\/mjml>|$)/i, (_m, a, inner: string) => {
      const headMatch = inner.match(/<mj-head[\s>][\s\S]*?<\/mj-head>/i);
      const head = headMatch ? headMatch[0] : "";
      const body = headMatch ? inner.replace(headMatch[0], "") : inner;
      return `<mjml${a}>${head}<mj-body>${body}</mj-body></mjml>`;
    });
  }

  source = repairMjTables(source, fixes);

  const stack: Entry[] = [];
  let out = "";
  let cursor = 0;
  let match: RegExpExecArray | null;
  const re = new RegExp(TAG_RE.source, "gi");

  const top = () => stack[stack.length - 1];
  const names = () => stack.map((e) => e.name);
  const closeTop = () => {
    const entry = stack.pop()!;
    out += `</${entry.name}>`;
    if (!entry.synthetic) fixes.push(`Closed unclosed <${entry.name}>`);
  };
  const closeTo = (index: number) => {
    while (stack.length > index) closeTop();
  };
  const openSynthetic = (name: string, note: string) => {
    out += `<${name}>`;
    stack.push({ name, synthetic: true });
    fixes.push(note);
  };

  while ((match = re.exec(source)) !== null) {
    const [full, closing, rawName, attrs, selfClosing] = match;
    out += source.slice(cursor, match.index);
    cursor = match.index + full.length;

    if (!rawName) {
      out += full;
      continue;
    }
    const name = rawName.toLowerCase();

    if (closing) {
      if (EMPTY_TAGS.has(name)) {
        fixes.push(`Removed stray </${name}>`);
        continue;
      }
      const at = names().lastIndexOf(name);
      if (at === -1) {
        fixes.push(`Removed unmatched </${name}>`);
        continue;
      }
      closeTo(at + 1);
      stack.pop();
      out += `</${name}>`;
      continue;
    }

    while (stack.length && TEXT_ONLY_TAGS.has(top().name)) closeTop();

    const inBody = names().includes("mj-body");
    if (inBody) {
      while (stack.length && top().synthetic && !canContain(top().name, name)) closeTop();

      if (name === "mj-section" || name === "mj-wrapper") {
        while (stack.length && ["mj-section", "mj-column", "mj-group", "mj-hero"].includes(top().name)) closeTop();
      } else if (name === "mj-column" || name === "mj-group") {
        while (stack.length && top().name === "mj-column") closeTop();
      }

      const parent = stack.length ? top().name : "";
      if (name === "mj-column") {
        if (parent !== "mj-section" && parent !== "mj-group" && (BODY_CONTAINERS.has(parent) || !parent)) {
          openSynthetic("mj-section", "Wrapped <mj-column> in a new <mj-section>");
        }
      } else if (name === "mj-group") {
        if (BODY_CONTAINERS.has(parent)) openSynthetic("mj-section", "Wrapped <mj-group> in a new <mj-section>");
      } else if (CONTENT_TAGS.has(name)) {
        if (BODY_CONTAINERS.has(parent)) {
          openSynthetic("mj-section", `Wrapped orphan <${name}> in <mj-section>`);
          openSynthetic("mj-column", `Wrapped orphan <${name}> in <mj-column>`);
        } else if (parent === "mj-section" || parent === "mj-group") {
          openSynthetic("mj-column", `Wrapped orphan <${name}> in <mj-column>`);
        }
      }
    }

    if (selfClosing) {
      out += full;
      continue;
    }

    if (EMPTY_TAGS.has(name)) {
      const rest = source.slice(cursor);
      const explicitClose = new RegExp(`^\\s*</${name}\\s*>`, "i").exec(rest);
      if (explicitClose) cursor += explicitClose[0].length;
      out += `<${name}${attrs.replace(/\s+$/, "")} />`;
      if (!explicitClose) fixes.push(`Self-closed <${name}>`);
      continue;
    }

    stack.push({ name, synthetic: false });
    out += full;
  }

  out += source.slice(cursor);
  closeTo(0);

  let code = out;

  // mj-preview / mj-title / mj-font belong in <mj-head>.
  const headTags: string[] = [];
  const headRange = /<mj-head[\s>][\s\S]*?<\/mj-head>/i.exec(code);
  code = code.replace(
    /<mj-(preview|title)[^>]*>[\s\S]*?<\/mj-\1>|<mj-font\s[^>]*\/>/gi,
    (tag, _n, offset: number) => {
      if (headRange && offset >= headRange.index && offset < headRange.index + headRange[0].length) return tag;
      headTags.push(tag);
      return "";
    },
  );
  if (headTags.length) {
    fixes.push("Moved head-only tags into <mj-head>");
    if (/<mj-head[\s>]/i.test(code)) {
      code = code.replace(/<mj-head([^>]*)>/i, (m) => `${m}${headTags.join("")}`);
    } else {
      code = code.replace(/<mj-body/i, `<mj-head>${headTags.join("")}</mj-head><mj-body`);
    }
  }

  return { code: code.trim(), fixes: Array.from(new Set(fixes)) };
}
