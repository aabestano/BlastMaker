import test from "node:test";
import assert from "node:assert/strict";
import { applyBrandTokens, resolveBrandTokens, DEFAULT_TOKENS, parseTokenHints } from "../lib/brand-tokens";
import { detectBlueprintSections, buildGenerationPrompt, MJML_SYSTEM_INSTRUCTION } from "../lib/prompt";
import { parseReferenceImages } from "../lib/gemini";
import { parseBlocks } from "../lib/blocks";
import { POST } from "../app/api/generate-blast/route";
import { POST as transpile } from "../app/api/transpile-mjml/route";

const PIXEL = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

test("token resolution priority: brand book > directives > defaults", () => {
  const t = resolveBrandTokens({
    tokens: { primary: "#112233" },
    directives: "Primary color: #aaaaaa\nAccent: #FF8800\nfont-family: Georgia, serif",
  });
  assert.equal(t.primary, "#112233");
  assert.equal(t.accent, "#FF8800");
  assert.equal(t.fontFamily, "Georgia, serif");
  assert.equal(t.secondary, DEFAULT_TOKENS.secondary);
  assert.deepEqual(parseTokenHints("{{BRAND_SECONDARY_COLOR}} = #0b5cab").secondary, "#0b5cab");
});

test("applyBrandTokens replaces known, derived and unknown tokens", () => {
  const t = resolveBrandTokens({ tokens: { primary: "#0B5CAB", canvasBg: "#EEEEEE" } });
  const r = applyBrandTokens(
    '<mj-body background-color="{{BRAND_CANVAS_BG}}"><mj-button background-color="{{ BRAND_PRIMARY_COLOR }}" color="{{BRAND_BUTTON_TEXT_COLOR}}" /><mj-text color="{{BRAND_HIGHLIGHT_COLOR}}" font-family="{{BRAND_FONT_FAMILY}}" /><x a="{{BRAND_MYSTERY}}" />',
    t,
  );
  assert.ok(!r.mjml.includes("{{"));
  assert.match(r.mjml, /background-color="#EEEEEE"/);
  assert.match(r.mjml, /background-color="#0B5CAB"/);
  assert.match(r.mjml, /color="#0B5CAB"/);
  assert.deepEqual(r.unknown.sort(), ["BRAND_HIGHLIGHT_COLOR", "BRAND_MYSTERY"]);
});

test("blueprint section detection supports structured and free-form blueprints", () => {
  const structured = "1. PREHEADER BAR\ntext\n## 3. HERO BANNER — Headline\n**5. MEDICINE PRICE COMPARISON TABLE MATRIX**\n- not a heading\n11. TERMS AND FOOTER";
  assert.deepEqual(detectBlueprintSections(structured), [
    "PREHEADER BAR",
    "HERO BANNER",
    "MEDICINE PRICE COMPARISON TABLE MATRIX",
    "TERMS AND FOOTER",
  ]);
  assert.deepEqual(detectBlueprintSections("# Spring sale\n## Why you will love it\nBullets"), []);
  const p = buildGenerationPrompt({ blueprint: structured, assets: [], tokens: DEFAULT_TOKENS, referenceCount: 2 });
  assert.match(p, /structured campaign blueprint/);
  assert.match(p, /2 images are attached/);
  const free = buildGenerationPrompt({ blueprint: "# Hello", assets: [], tokens: DEFAULT_TOKENS });
  assert.match(free, /flexible \/ free-form/);
});

test("system prompt keeps markers, co-branding, tables and tokens", () => {
  for (const needle of ["<!-- SECTION: HERO BANNER -->", "<!-- END SECTION: HERO BANNER -->", "<mj-group>", "<mj-table>", "{{BRAND_ACCENT_COLOR}}", "{{BRAND_FONT_FAMILY}}", "ONLY the sections the blueprint asks for", "WINTER_PROMO"]) {
    assert.ok(MJML_SYSTEM_INSTRUCTION.includes(needle), needle);
  }
});

test("reference images are validated into inline base64 parts", () => {
  const { images, warnings } = parseReferenceImages([
    { name: "a.png", mime: "image/png", dataUrl: PIXEL },
    { name: "b.jpg", mime: "image/jpeg", dataUrl: "data:image/jpeg;base64,/9j/4AAQ" },
    { name: "c.gif", mime: "image/gif", dataUrl: "data:image/gif;base64,R0lGOD" },
    { name: "d.png", mime: "image/png", dataUrl: PIXEL },
    { name: "e.png", mime: "image/png", dataUrl: PIXEL },
  ]);
  assert.equal(images.length, 3);
  assert.deepEqual(images.map((i) => i.mime), ["image/png", "image/jpeg", "image/png"]);
  assert.ok(!images[0].data.startsWith("data:"));
  assert.ok(warnings.some((w) => w.includes("c.gif")));
});

test("generate-blast route (offline fallback) returns marked, valid, token-free output", async () => {
  delete process.env.GEMINI_API_KEY;
  delete process.env.GOOGLE_API_KEY;
  const res = await POST(
    new Request("http://x/api/generate-blast", {
      method: "POST",
      body: JSON.stringify({
        blueprint: "# Save 20%\n\nIntro text.\n\n## Perks\n- **Free delivery:** fast\n- **20% off:** code\n\n[Order now](https://example.com/o)",
        brandName: "MedGrocer",
        brandTokens: { primary: "#0B5CAB" },
        referenceImages: [{ name: "ref.png", mime: "image/png", dataUrl: PIXEL }],
        assets: [
          { id: "1", bookId: "b", kind: "cdn-url", name: "Brand logo", role: "Logo", url: "https://cdn.example.com/a.png", createdAt: 0 },
          { id: "2", bookId: "b", kind: "cdn-url", name: "Partner logo", role: "Logo", url: "https://cdn.example.com/b.png", createdAt: 0 },
        ],
      }),
    }),
  );
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.source, "fallback");
  assert.ok(data.warnings.some((w: string) => w.includes("Reference screenshots")));
  assert.ok(!data.html.includes("{{BRAND"));
  assert.ok(data.html.includes("#0B5CAB") || data.html.includes("#0b5cab"));
  assert.ok(data.mjml.includes("<mj-group>"), "two logos must be co-branded in an mj-group");
  const blocks = parseBlocks(data.mjml).blocks;
  assert.deepEqual(blocks.map((b) => b.key), ["header-logo", "hero", "savings-cards", "cta-primary", "footer"]);
  assert.match(data.mjml, /<!-- END SECTION: HERO BANNER -->/);
});

test("transpile route repairs malformed MJML tables and resolves tokens", async () => {
  const mjml =
    '<mjml><mj-body background-color="{{BRAND_CANVAS_BG}}"><mj-section><mj-column><mj-table><tr><th>Med<th>Price<tr><td>A<td>1</mj-table></mj-column><mj-column><mj-text>x</mj-text></mj-column></mj-section></mj-body></mjml>';
  const res = await transpile(new Request("http://x/api/transpile-mjml", { method: "POST", body: JSON.stringify({ mjml }) }));
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.ok(!data.mjml.includes("{{"));
  assert.match(data.mjml, /<tr><th>Med<\/th><th>Price<\/th><\/tr><tr><td>A<\/td><td>1<\/td><\/tr>/);
  assert.ok(data.html.includes("<table"));
});
