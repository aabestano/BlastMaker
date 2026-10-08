import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_TOKENS } from "../lib/brand-tokens";
import {
  BLAST_SECTIONS,
  applySlotEdit,
  createBlock,
  enforceCoBrandedHeader,
  extractSlots,
  matchSection,
  parseBlocks,
  serializeBlocks,
} from "../lib/blocks";
import { compileMjml } from "../lib/mjml-compile";

const head = `<mj-head><mj-title>T</mj-title></mj-head>`;
const doc = (body: string) => `<mjml>${head}<mj-body>${body}</mj-body></mjml>`;
const sec = (inner: string) => `<mj-section><mj-column>${inner}</mj-column></mj-section>`;

test("catalog has the 11 blueprint sections in order", () => {
  assert.equal(BLAST_SECTIONS.length, 11);
  assert.deepEqual(
    BLAST_SECTIONS.map((s) => s.marker),
    [
      "PREHEADER BAR",
      "HEADER LOGO BLOCK",
      "HERO BANNER",
      "PATIENT-FACING INTRO HOOK",
      "MEDICINE PRICE COMPARISON TABLE MATRIX",
      "MEMBER SAVINGS BENEFIT CARDS",
      "DID YOU KNOW CALLOUT BOX",
      "STEP-BY-STEP ORDERING GUIDE",
      "PRIMARY CALL TO ACTION",
      "DOCTOR TELECONSULT CALLOUT",
      "TERMS AND FOOTER",
    ],
  );
});

test("legacy markers map onto the catalog", () => {
  assert.equal(matchSection("VALUE GRID")?.marker, "MEDICINE PRICE COMPARISON TABLE MATRIX");
  assert.equal(matchSection("header")?.marker, "HEADER LOGO BLOCK");
  assert.equal(matchSection("CTA")?.marker, "PRIMARY CALL TO ACTION");
  assert.equal(matchSection("Step by step ordering guide")?.key, "steps");
  assert.equal(matchSection("MY OWN THING"), undefined);
});

test("parses SECTION / END SECTION markers including custom sections", () => {
  const mjml = doc(`
    <!-- SECTION: HERO BANNER -->${sec('<mj-text>Hi</mj-text>')}<!-- END SECTION: HERO BANNER -->
    <!-- SECTION: VALUE GRID -->${sec('<mj-text>Grid</mj-text>')}<!-- END SECTION: VALUE GRID -->
    <!-- SECTION: WINTER_PROMO -->${sec('<mj-text>Custom</mj-text>')}<!-- END SECTION: WINTER_PROMO -->
  `);
  const d = parseBlocks(mjml);
  assert.deepEqual(
    d.blocks.map((b) => [b.key, b.name]),
    [
      ["hero", "HERO BANNER"],
      ["price-table", "MEDICINE PRICE COMPARISON TABLE MATRIX"],
      ["custom", "WINTER_PROMO"],
    ],
  );
});

test("legacy markers without END markers end at the next marker", () => {
  const d = parseBlocks(doc(`<!-- SECTION: HEADER -->${sec("<mj-image src=\"https://a.com/l.png\" />")}<!-- SECTION: FOOTER -->${sec("<mj-text>Bye</mj-text>")}`));
  assert.deepEqual(d.blocks.map((b) => b.key), ["header-logo", "footer"]);
});

test("heuristic classification of un-marked MJML", () => {
  const d = parseBlocks(
    doc(
      sec('<mj-image src="https://a.com/logo.png" />') +
        sec("<mj-text>Intro</mj-text>") +
        sec("<mj-table><tr><td>a</td></tr></mj-table>") +
        sec('<mj-button href="https://a.com">Order</mj-button>') +
        sec('<mj-button href="https://b.com">Consult</mj-button>') +
        sec('<mj-text>Terms <a href="*|UNSUB|*">unsubscribe</a></mj-text>'),
    ),
  );
  assert.deepEqual(d.blocks.map((b) => b.key), ["header-logo", "custom", "price-table", "cta-primary", "cta-secondary", "footer"]);
  assert.equal(d.blocks[1].name, "CONTENT BLOCK 1");
});

test("reorder / hide / re-show round trips and compiles to valid HTML", async () => {
  const mjml = doc(
    `<!-- SECTION: HERO BANNER -->${sec("<mj-text>Hero</mj-text>")}<!-- END SECTION: HERO BANNER -->` +
      `<!-- SECTION: PRIMARY CALL TO ACTION -->${sec('<mj-button href="https://a.com">Go</mj-button>')}<!-- END SECTION: PRIMARY CALL TO ACTION -->` +
      `<!-- SECTION: TERMS AND FOOTER -->${sec("<mj-text>Footer *|UNSUB|*</mj-text>")}<!-- END SECTION: TERMS AND FOOTER -->`,
  );
  const d = parseBlocks(mjml);
  [d.blocks[0], d.blocks[1]] = [d.blocks[1], d.blocks[0]];
  d.blocks[2].visible = false;
  const out = serializeBlocks(d);
  assert.ok(out.indexOf("PRIMARY CALL TO ACTION") < out.indexOf("HERO BANNER"));
  assert.match(out, /<!-- HIDDEN-BLOCK: TERMS AND FOOTER/);

  const compiled = await compileMjml(out);
  assert.deepEqual(compiled.errors, []);
  assert.ok(compiled.html.includes("Hero"));
  assert.ok(compiled.html.includes("Go"));
  assert.ok(!compiled.html.includes("Footer"), "hidden block must not render");

  const back = parseBlocks(out);
  assert.deepEqual(back.blocks.map((b) => [b.name, b.visible]), [
    ["PRIMARY CALL TO ACTION", true],
    ["HERO BANNER", true],
    ["TERMS AND FOOTER", false],
  ]);
  back.blocks[2].visible = true;
  assert.ok(serializeBlocks(back).includes("Footer *|UNSUB|*"));
});

test("slot extraction and editing keeps MJML valid", () => {
  const raw = `<mj-section><mj-column>
    <mj-image src="https://a.com/x.png" alt="Logo" />
    <mj-text font-size="20px">
      Save 20% &amp; more
    </mj-text>
    <mj-text>Visit <a href="https://x.com">our site</a></mj-text>
    <mj-button href="https://a.com/order?a=1&b=2">Order now</mj-button>
    <mj-table><tr><td>A</td></tr></mj-table>
  </mj-column></mj-section>`;
  const slots = extractSlots(raw);
  assert.deepEqual(
    slots.map((s) => [s.kind, s.value, s.html]),
    [
      ["image-src", "https://a.com/x.png", false],
      ["image-alt", "Logo", false],
      ["text", "Save 20% & more", false],
      ["text", 'Visit <a href="https://x.com">our site</a>', true],
      ["button-label", "Order now", false],
      ["button-href", "https://a.com/order?a=1&b=2", false],
      ["table-html", "<tr><td>A</td></tr>", true],
    ],
  );
  let next = applySlotEdit(raw, 2, "Fish & chips <now>\nline two");
  assert.match(next, /Fish &amp; chips &lt;now&gt;<br \/>line two/);
  next = applySlotEdit(next, 4, "Buy today");
  next = applySlotEdit(next, 5, 'https://b.com/?q="x"');
  next = applySlotEdit(next, 0, "https://cdn.com/new.png");
  assert.match(next, /<mj-button href="https:\/\/b.com\/\?q=&quot;x&quot;">Buy today<\/mj-button>/);
  assert.match(next, /<mj-image src="https:\/\/cdn.com\/new.png" alt="Logo" \/>/);
  assert.equal(extractSlots(next)[2].value, "Fish & chips <now>\nline two");
});

test("new block templates compile", async () => {
  for (const id of ["hero", "callout", "table", "cta", "banner", "custom"] as const) {
    const b = createBlock(id, DEFAULT_TOKENS, []);
    const d = parseBlocks(doc(""));
    d.blocks.push(b);
    const res = await compileMjml(serializeBlocks(d));
    assert.deepEqual(res.errors, [], id);
    assert.ok(res.html.length > 500, id);
  }
  const second = createBlock("cta", DEFAULT_TOKENS, [{ id: "x", key: "cta-primary", name: "", visible: true, raw: "" }]);
  assert.equal(second.key, "cta-secondary");
});

test("co-branded header columns are grouped so logos stay side by side", async () => {
  const mjml = doc(
    `<!-- SECTION: HEADER LOGO BLOCK --><mj-section><mj-column><mj-image src="https://a.com/1.png" /></mj-column><mj-column><mj-image src="https://a.com/2.png" /></mj-column></mj-section><!-- END SECTION: HEADER LOGO BLOCK -->`,
  );
  const r = enforceCoBrandedHeader(mjml);
  assert.ok(r.changed);
  assert.match(r.mjml, /<mj-group><mj-column>.*<\/mj-column><\/mj-group>/s);
  assert.equal(enforceCoBrandedHeader(r.mjml).changed, false);
  const res = await compileMjml(r.mjml);
  assert.deepEqual(res.errors, []);
});
