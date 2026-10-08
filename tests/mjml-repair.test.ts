import test from "node:test";
import assert from "node:assert/strict";
import { balanceTableHtml, repairMjml } from "../lib/mjml-repair";

const wrap = (body: string, head = "") => `<mjml>${head}<mj-body>${body}</mj-body></mjml>`;

test("strips markdown fences and closes void-like tags", () => {
  const { code, fixes } = repairMjml(
    "```mjml\n<mjml><mj-head><mj-font name=\"Inter\" href=\"https://f.com/i\"><mj-preview>Hi<mj-title>T</mj-title></mj-head><mj-body><mj-section><mj-column><mj-image src=\"https://a.com/x.png\"><mj-text>x</mj-text></mj-column></mj-section></mj-body></mjml>\n```",
  );
  assert.match(code, /<mj-font [^>]*\/>/);
  assert.match(code, /<mj-preview>Hi<\/mj-preview><mj-title>T<\/mj-title>/);
  assert.match(code, /<mj-image src="https:\/\/a.com\/x.png" \/>/);
  assert.ok(fixes.length >= 3);
  assert.ok(!code.includes("```"));
});

test("closes unclosed tr / td / table inside mj-table", () => {
  const { html, fixes } = balanceTableHtml("<tr><td>A<td>B<tr><td>C</tr><table><tr><td>inner");
  assert.equal(html, "<tr><td>A</td><td>B</td></tr><tr><td>C</td></tr><table><tr><td>inner</td></tr></table>");
  assert.ok(fixes.length > 0);
});

test("adds missing <tr> and drops stray closers in tables", () => {
  const { html } = balanceTableHtml("<td>one</td><td>two</td></td></tr>");
  assert.equal(html, "<tr><td>one</td><td>two</td></tr>");
});

test("repairs mj-table content and an unclosed mj-table", () => {
  const closed = repairMjml(wrap("<mj-section><mj-column><mj-table><tr><th>Med<th>Price<tr><td>A<td>1</mj-table></mj-column></mj-section>"));
  assert.match(closed.code, /<tr><th>Med<\/th><th>Price<\/th><\/tr><tr><td>A<\/td><td>1<\/td><\/tr><\/mj-table>/);

  const unclosed = repairMjml(wrap("<mj-section><mj-column><mj-table><tr><td>A</td></tr></mj-column></mj-section>"));
  assert.match(unclosed.code, /<\/tr><\/mj-table><\/mj-column><\/mj-section>/);
  assert.ok(unclosed.fixes.includes("Closed unclosed <mj-table>"));
});

test("wraps orphan mj-column elements in mj-section and keeps siblings together", () => {
  const { code, fixes } = repairMjml(wrap("<mj-column><mj-text>A</mj-text></mj-column><mj-column><mj-text>B</mj-text></mj-column>"));
  assert.equal(
    code,
    wrap("<mj-section><mj-column><mj-text>A</mj-text></mj-column><mj-column><mj-text>B</mj-text></mj-column></mj-section>"),
  );
  assert.ok(fixes.some((f) => f.includes("<mj-column> in a new <mj-section>")));
});

test("wraps orphan mj-group and orphan content", () => {
  const group = repairMjml(wrap("<mj-group><mj-column><mj-image src=\"https://a.com/l.png\" /></mj-column></mj-group>"));
  assert.match(group.code, /<mj-body><mj-section><mj-group>.*<\/mj-group><\/mj-section><\/mj-body>/);

  const orphan = repairMjml(wrap("<mj-text>Hello</mj-text><mj-button href=\"https://a.com\">Go</mj-button>"));
  assert.equal(orphan.code, wrap("<mj-section><mj-column><mj-text>Hello</mj-text><mj-button href=\"https://a.com\">Go</mj-button></mj-column></mj-section>"));

  const inSection = repairMjml(wrap("<mj-section><mj-text>Hi</mj-text></mj-section>"));
  assert.equal(inSection.code, wrap("<mj-section><mj-column><mj-text>Hi</mj-text></mj-column></mj-section>"));
});

test("closes an unclosed mj-section before the next one", () => {
  const { code } = repairMjml(wrap("<mj-section><mj-column><mj-text>A</mj-text><mj-section><mj-column><mj-text>B</mj-text></mj-column></mj-section>"));
  assert.equal(
    code,
    wrap("<mj-section><mj-column><mj-text>A</mj-text></mj-column></mj-section><mj-section><mj-column><mj-text>B</mj-text></mj-column></mj-section>"),
  );
});

test("does not wrap mj-attributes defaults or valid documents", () => {
  const valid = wrap(
    "<mj-section><mj-group><mj-column><mj-image src=\"https://a.com/a.png\" /></mj-column><mj-column><mj-image src=\"https://a.com/b.png\" /></mj-column></mj-group></mj-section>",
    "<mj-head><mj-attributes><mj-text font-size=\"15px\" /><mj-button background-color=\"#000\" /></mj-attributes></mj-head>",
  );
  const { code, fixes } = repairMjml(valid);
  assert.equal(code, valid);
  assert.deepEqual(fixes, []);
});

test("adds mj-body and root when missing and ignores tags inside comments", () => {
  const { code } = repairMjml("<mj-section><mj-column><mj-text>Hi</mj-text></mj-column></mj-section><!-- <mj-text>ghost -->");
  assert.match(code, /^<mjml><mj-body>.*<\/mj-body><\/mjml>$/s);
  assert.ok(code.includes("<!-- <mj-text>ghost -->"));
});

test("moves head-only tags from the body into mj-head", () => {
  const { code } = repairMjml(wrap("<mj-preview>Preheader</mj-preview><mj-section><mj-column><mj-text>x</mj-text></mj-column></mj-section>", "<mj-head><mj-title>T</mj-title></mj-head>"));
  assert.match(code, /<mj-head><mj-preview>Preheader<\/mj-preview><mj-title>T<\/mj-title><\/mj-head>/);
});
