/**
 * Pure-string MJML repair utilities. Safe to run on the server or client.
 * LLM output frequently contains markdown fences, unclosed void-like tags
 * (<mj-image ...>, <mj-font ...>) and mismatched closers; this normalises all of it
 * before the code reaches the `mjml` compiler.
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
  "mj-social-element-empty",
]);

/** Head tags that hold plain text only; any following MJML tag implies they were left open. */
const TEXT_ONLY_TAGS = new Set(["mj-preview", "mj-title"]);

const TAG_RE = /<(\/?)(mjml|mj-[a-z0-9-]+)((?:\s+[^<>]*?)?)(\/?)>/gi;

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

export function repairMjml(input: string): RepairResult {
  const fixes: string[] = [];
  let source = extractMjmlDocument(input);

  if (!source.trim()) return { code: "", fixes };

  if (!/<mjml[\s>]/i.test(source)) {
    fixes.push("Added missing <mjml> root element");
    source = `<mjml>${source}</mjml>`;
  }

  const stack: string[] = [];
  let out = "";
  let cursor = 0;
  let match: RegExpExecArray | null;
  TAG_RE.lastIndex = 0;

  const closeTo = (index: number) => {
    while (stack.length > index) {
      const name = stack.pop()!;
      out += `</${name}>`;
      fixes.push(`Closed unclosed <${name}>`);
    }
  };

  while ((match = TAG_RE.exec(source)) !== null) {
    const [full, closing, rawName, attrs, selfClosing] = match;
    const name = rawName.toLowerCase();
    out += source.slice(cursor, match.index);
    cursor = match.index + full.length;

    if (closing) {
      if (EMPTY_TAGS.has(name)) {
        fixes.push(`Removed stray </${name}>`);
        continue;
      }
      const at = stack.lastIndexOf(name);
      if (at === -1) {
        fixes.push(`Removed unmatched </${name}>`);
        continue;
      }
      closeTo(at + 1);
      stack.pop();
      out += `</${name}>`;
      continue;
    }

    while (stack.length && TEXT_ONLY_TAGS.has(stack[stack.length - 1])) {
      const name = stack.pop()!;
      out += `</${name}>`;
      fixes.push(`Closed unclosed <${name}>`);
    }

    if (selfClosing) {
      out += full;
      continue;
    }

    if (EMPTY_TAGS.has(name)) {
      const rest = source.slice(cursor);
      const explicitClose = new RegExp(`^\\s*</${name}\\s*>`, "i").exec(rest);
      if (explicitClose) {
        cursor += explicitClose[0].length;
      }
      out += `<${name}${attrs.replace(/\s+$/, "")} />`;
      if (!explicitClose) fixes.push(`Self-closed <${name}>`);
      continue;
    }

    stack.push(name);
    out += full;
  }

  out += source.slice(cursor);
  closeTo(0);

  let code = out;

  if (!/<mj-body[\s>]/i.test(code)) {
    fixes.push("Wrapped content in <mj-body>");
    code = code.replace(/<mjml([^>]*)>([\s\S]*)<\/mjml>/i, (_m, a, inner) => {
      const headMatch = inner.match(/<mj-head[\s>][\s\S]*?<\/mj-head>/i);
      const head = headMatch ? headMatch[0] : "";
      const body = headMatch ? inner.replace(headMatch[0], "") : inner;
      return `<mjml${a}>${head}<mj-body>${body}</mj-body></mjml>`;
    });
  }

  // mj-preview / mj-title / mj-font belong in <mj-head>.
  const headTags: string[] = [];
  code = code.replace(
    /<mj-(preview|title)[^>]*>[\s\S]*?<\/mj-\1>|<mj-font\s[^>]*\/>/gi,
    (tag, _n, offset: number) => {
      const headRange = /<mj-head[\s>][\s\S]*?<\/mj-head>/i.exec(code);
      if (headRange && offset >= headRange.index && offset < headRange.index + headRange[0].length) {
        return tag;
      }
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
