import type { BrandAsset, BrandTokens } from "./types";

export type ResolvedTokens = Required<BrandTokens> & {
  textColor: string;
  mutedColor: string;
  borderColor: string;
  buttonTextColor: string;
};

export const DEFAULT_TOKENS: ResolvedTokens = {
  primary: "#1D4ED8",
  secondary: "#0F172A",
  accent: "#10B981",
  canvasBg: "#F1F5F9",
  containerBg: "#FFFFFF",
  fontFamily: "Helvetica, Arial, sans-serif",
  textColor: "#1E293B",
  mutedColor: "#64748B",
  borderColor: "#E2E8F0",
  buttonTextColor: "#FFFFFF",
};

/** Token name (without braces) -> ResolvedTokens key. */
export const TOKEN_KEYS: Record<string, keyof ResolvedTokens> = {
  BRAND_PRIMARY_COLOR: "primary",
  BRAND_SECONDARY_COLOR: "secondary",
  BRAND_ACCENT_COLOR: "accent",
  BRAND_CANVAS_BG: "canvasBg",
  BRAND_CONTAINER_BG: "containerBg",
  BRAND_FONT_FAMILY: "fontFamily",
  BRAND_TEXT_COLOR: "textColor",
  BRAND_MUTED_COLOR: "mutedColor",
  BRAND_BORDER_COLOR: "borderColor",
  BRAND_BUTTON_TEXT_COLOR: "buttonTextColor",
};

const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;
const HEX_IN_TEXT = "(#(?:[0-9a-fA-F]{6}|[0-9a-fA-F]{3}))\\b";

export const isHex = (value: string | undefined): value is string => !!value && HEX.test(value.trim());
const cleanFont = (value: string | undefined) =>
  value && /^[\w\s,'"\-]{2,120}$/.test(value.trim()) ? value.trim().replace(/"/g, "'") : undefined;

/** Words that may precede a hex value in free-form directives, per token. */
const DIRECTIVE_PATTERNS: { key: keyof ResolvedTokens; names: string[] }[] = [
  { key: "primary", names: ["BRAND_PRIMARY_COLOR", "primary(?:\\s+brand)?(?:\\s+colou?r)?"] },
  { key: "secondary", names: ["BRAND_SECONDARY_COLOR", "secondary(?:\\s+colou?r)?"] },
  { key: "accent", names: ["BRAND_ACCENT_COLOR", "accent(?:\\s+colou?r)?"] },
  { key: "canvasBg", names: ["BRAND_CANVAS_BG", "(?:canvas|page|outer)(?:\\s+(?:background|bg))?"] },
  { key: "containerBg", names: ["BRAND_CONTAINER_BG", "(?:container|card|content)(?:\\s+(?:background|bg))?"] },
  { key: "textColor", names: ["BRAND_TEXT_COLOR", "(?:body\\s+)?text(?:\\s+colou?r)?"] },
  { key: "mutedColor", names: ["BRAND_MUTED_COLOR", "muted(?:\\s+colou?r)?"] },
  { key: "borderColor", names: ["BRAND_BORDER_COLOR", "border(?:\\s+colou?r)?"] },
  { key: "buttonTextColor", names: ["BRAND_BUTTON_TEXT_COLOR", "button\\s+text(?:\\s+colou?r)?"] },
];

/** Extracts `primary: #123456`, `{{BRAND_ACCENT_COLOR}} = #abc` style hints from free text. */
export function parseTokenHints(text: string | undefined): Partial<ResolvedTokens> {
  const out: Partial<ResolvedTokens> = {};
  if (!text) return out;
  for (const { key, names } of DIRECTIVE_PATTERNS) {
    const re = new RegExp(`(?:\\{\\{\\s*)?(?:${names.join("|")})(?:\\s*\\}\\})?\\s*(?:[:=\\-–]|is|should be|as)?\\s*${HEX_IN_TEXT}`, "i");
    const m = text.match(re);
    if (m) (out as Record<string, string>)[key] = m[1];
  }
  const font = text.match(/(?:BRAND_FONT_FAMILY|font(?:[\s-]family)?)\s*[:=]\s*([^\n;]{2,120})/i);
  const f = cleanFont(font?.[1]);
  if (f) out.fontFamily = f;
  return out;
}

/**
 * Merge order (highest priority first): saved brand-book tokens, hints in custom directives,
 * hints in asset usage directives, defaults.
 */
export function resolveBrandTokens(args: {
  tokens?: BrandTokens;
  directives?: string;
  assets?: BrandAsset[];
}): ResolvedTokens {
  const assetHints = parseTokenHints((args.assets ?? []).map((a) => a.directive ?? "").join("\n"));
  const directiveHints = parseTokenHints(args.directives);
  const book = args.tokens ?? {};
  const resolved: ResolvedTokens = { ...DEFAULT_TOKENS };

  for (const layer of [assetHints, directiveHints, book] as Partial<ResolvedTokens>[]) {
    for (const [key, raw] of Object.entries(layer)) {
      if (!raw) continue;
      if (key === "fontFamily") {
        const f = cleanFont(raw);
        if (f) resolved.fontFamily = f;
      } else if (isHex(raw)) {
        (resolved as Record<string, string>)[key] = raw.trim();
      }
    }
  }
  return resolved;
}

export interface TokenResolution {
  mjml: string;
  replaced: string[];
  unknown: string[];
}

const TOKEN_RE = /\{\{\s*(BRAND_[A-Z0-9_]+)\s*\}\}/g;

/** Replaces every {{BRAND_*}} placeholder in generated MJML with a concrete value. */
export function applyBrandTokens(mjml: string, tokens: ResolvedTokens): TokenResolution {
  const replaced = new Set<string>();
  const unknown = new Set<string>();
  const out = mjml.replace(TOKEN_RE, (_m, name: string) => {
    const key = TOKEN_KEYS[name];
    if (key) {
      replaced.add(name);
      return tokens[key];
    }
    if (/_FONT/.test(name)) {
      unknown.add(name);
      return tokens.fontFamily;
    }
    if (/_BG$|_BACKGROUND/.test(name)) {
      unknown.add(name);
      return tokens.containerBg;
    }
    if (/_COLOR$/.test(name)) {
      unknown.add(name);
      return tokens.primary;
    }
    unknown.add(name);
    return "";
  });
  return { mjml: out, replaced: Array.from(replaced), unknown: Array.from(unknown) };
}

export function describeTokensForPrompt(t: ResolvedTokens): string {
  return [
    `{{BRAND_PRIMARY_COLOR}} = ${t.primary}`,
    `{{BRAND_SECONDARY_COLOR}} = ${t.secondary}`,
    `{{BRAND_ACCENT_COLOR}} = ${t.accent}`,
    `{{BRAND_CANVAS_BG}} = ${t.canvasBg}`,
    `{{BRAND_CONTAINER_BG}} = ${t.containerBg}`,
    `{{BRAND_FONT_FAMILY}} = ${t.fontFamily}`,
    `{{BRAND_TEXT_COLOR}} = ${t.textColor}`,
    `{{BRAND_MUTED_COLOR}} = ${t.mutedColor}`,
    `{{BRAND_BORDER_COLOR}} = ${t.borderColor}`,
    `{{BRAND_BUTTON_TEXT_COLOR}} = ${t.buttonTextColor}`,
  ].join("\n");
}
