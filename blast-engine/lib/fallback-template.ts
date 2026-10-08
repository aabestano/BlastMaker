import type { BrandAsset } from "./types";

/**
 * Offline MJML builder used when no Gemini key is configured. It turns a Markdown content
 * blueprint into a clean, section-marked MJML layout using the brand's hosted assets so the
 * whole pipeline (preview, edit, revise, save, send) stays usable without credentials.
 */

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function inline(md: string): string {
  return esc(md)
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2" style="color:inherit">$1</a>')
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/(^|[^*])\*([^*|]+)\*(?!\|)/g, "$1<em>$2</em>");
}

function plain(md: string): string {
  return md.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1").replace(/[*_`#>]/g, "").trim();
}

interface Block {
  heading: string;
  paragraphs: string[];
  bullets: string[];
}

function parseBlueprint(md: string) {
  const lines = md.split(/\r?\n/);
  let title = "";
  const blocks: Block[] = [];
  let current: Block = { heading: "", paragraphs: [], bullets: [] };
  let para: string[] = [];

  const flushPara = () => {
    if (para.length) current.paragraphs.push(para.join(" ").trim());
    para = [];
  };
  const pushBlock = () => {
    flushPara();
    if (current.heading || current.paragraphs.length || current.bullets.length) blocks.push(current);
  };

  for (const raw of lines) {
    const line = raw.trim();
    const h1 = line.match(/^#\s+(.+)/);
    const h = line.match(/^#{2,4}\s+(.+)/);
    const bullet = line.match(/^(?:[-*+]|\d+\.)\s+(.+)/);
    if (h1 && !title) {
      title = plain(h1[1]);
    } else if (h || h1) {
      pushBlock();
      current = { heading: plain((h ?? h1)![1]), paragraphs: [], bullets: [] };
    } else if (bullet) {
      flushPara();
      current.bullets.push(bullet[1]);
    } else if (!line) {
      flushPara();
    } else if (!/^(---|\*\*\*|___)$/.test(line)) {
      para.push(line);
    }
  }
  pushBlock();

  if (!title) {
    const first = blocks.find((b) => b.heading) ?? blocks[0];
    title = first?.heading || plain(first?.paragraphs[0] ?? "") || "Your email subject";
  }
  const links = Array.from(md.matchAll(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g)).map((m) => ({
    label: plain(m[1]),
    url: m[2],
  }));
  return { title: title.slice(0, 120), blocks, links };
}

export function buildFallbackMjml(args: {
  blueprint: string;
  brandName?: string;
  assets: BrandAsset[];
  directives?: string;
}): string {
  const { title, blocks, links } = parseBlueprint(args.blueprint);
  const cdn = args.assets.filter((a) => a.kind === "cdn-url" && a.url);
  const logo = cdn.find((a) => /logo/i.test(`${a.role} ${a.name}`));
  const hero = cdn.find((a) => /hero|banner/i.test(`${a.role} ${a.name}`));
  const accent = args.directives?.match(/#[0-9a-fA-F]{6}\b/)?.[0] ?? "#1d4ed8";
  const brand = args.brandName?.trim() || "Your Brand";

  const intro = blocks.find((b) => b.paragraphs.length) ?? blocks[0];
  const heroCopy = intro?.paragraphs[0] ?? "";
  const gridSource = blocks.filter((b) => b !== intro || blocks.length === 1);
  let cards: { title: string; body: string }[] = [];
  const bulletBlock = blocks.find((b) => b.bullets.length);
  if (bulletBlock && bulletBlock.bullets.length >= 2) {
    cards = bulletBlock.bullets.slice(0, 6).map((b) => {
      const m = b.match(/^\*\*([^*]+)\*\*[:\s\-–—]*(.*)$/);
      return m ? { title: m[1], body: m[2] } : { title: "", body: b };
    });
  } else {
    cards = gridSource
      .filter((b) => b.heading || b.paragraphs.length)
      .slice(0, 6)
      .map((b) => ({ title: b.heading, body: b.paragraphs[0] ?? "" }));
  }
  const cta = links[0] ?? { label: "Learn more", url: "*|ARCHIVE|*" };
  const preheader = plain(heroCopy || title).slice(0, 90);

  const gridRows: string[] = [];
  for (let i = 0; i < cards.length; i += 2) {
    const pair = cards.slice(i, i + 2);
    gridRows.push(`    <mj-section background-color="#ffffff" padding="0 16px">
${pair
  .map(
    (c) => `      <mj-column width="50%" padding="8px">
        <mj-text font-size="16px" font-weight="700" color="${accent}" padding-bottom="4px">${inline(c.title || "Highlight")}</mj-text>
        <mj-text font-size="14px" line-height="22px" color="#334155" padding-top="0">${inline(c.body)}</mj-text>
      </mj-column>`,
  )
  .join("\n")}
    </mj-section>`);
  }

  return `<mjml>
  <mj-head>
    <mj-title>${esc(title)}</mj-title>
    <mj-preview>${esc(preheader)}</mj-preview>
    <mj-attributes>
      <mj-all font-family="Helvetica, Arial, sans-serif" />
      <mj-text font-size="15px" line-height="24px" color="#1e293b" />
      <mj-button background-color="${accent}" color="#ffffff" font-size="16px" font-weight="700" border-radius="6px" inner-padding="14px 28px" />
    </mj-attributes>
    <mj-style>
      a { color: ${accent}; }
    </mj-style>
  </mj-head>
  <mj-body background-color="#f1f5f9" width="600px">
    <!-- SECTION: HEADER -->
    <mj-section background-color="#ffffff" padding="24px 16px 8px">
      <mj-column>
${
  logo
    ? `        <mj-image src="${esc(logo.url!)}" alt="${esc(brand)} logo" width="160px" align="center" />`
    : `        <mj-text align="center" font-size="22px" font-weight="700" color="${accent}">${esc(brand)}</mj-text>`
}
      </mj-column>
    </mj-section>
    <!-- SECTION: HERO -->
${hero ? `    <mj-section background-color="#ffffff" padding="0">
      <mj-column padding="0">
        <mj-image src="${esc(hero.url!)}" alt="${esc(title)}" padding="0" />
      </mj-column>
    </mj-section>` : ""}
    <mj-section background-color="#ffffff" padding="24px 24px 8px">
      <mj-column>
        <mj-text align="center" font-size="28px" line-height="34px" font-weight="700" color="#0f172a">Hi *|FNAME|*, ${esc(title)}</mj-text>
        <mj-text align="center" font-size="16px" color="#475569">${inline(heroCopy)}</mj-text>
      </mj-column>
    </mj-section>
    <!-- SECTION: VALUE GRID -->
${gridRows.join("\n")}
    <!-- SECTION: CTA -->
    <mj-section background-color="#ffffff" padding="16px 24px 32px">
      <mj-column>
        <mj-button href="${esc(cta.url)}" align="center">${esc(cta.label)}</mj-button>
      </mj-column>
    </mj-section>
    <!-- SECTION: FOOTER -->
    <mj-section padding="24px 16px">
      <mj-column>
        <mj-text align="center" font-size="12px" line-height="18px" color="#64748b">You are receiving this email from ${esc(brand)}.<br />*|LIST:ADDRESS|*</mj-text>
        <mj-text align="center" font-size="12px" color="#64748b"><a href="*|UPDATE_PROFILE|*">Update preferences</a> &#183; <a href="*|UNSUB|*">Unsubscribe</a></mj-text>
      </mj-column>
    </mj-section>
  </mj-body>
</mjml>`;
}
