/** HTML helpers shared by client and server. */

export function cleanHtml(html: string): string {
  let out = html.replace(/\r\n/g, "\n").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  out = out.replace(/<html lang="und"/i, '<html lang="en"');
  if (!/^<!doctype/i.test(out)) out = `<!doctype html>\n${out}`;
  return out + "\n";
}

/** Production-ready HTML for pasting into Mailchimp "Code your own". Merge tags are left untouched. */
export function mailchimpReady(html: string): string {
  return cleanHtml(html);
}

const PREVIEW_MERGE_VALUES: Record<string, string> = {
  FNAME: "Alex",
  LNAME: "Rivera",
  NAME: "Alex Rivera",
  EMAIL: "alex@example.com",
  UNSUB: "#unsubscribe",
  UPDATE_PROFILE: "#update-profile",
  ARCHIVE: "#archive",
  FORWARD: "#forward",
  "MC:SUBJECT": "Your email subject",
  CURRENT_YEAR: String(new Date().getFullYear()),
  LIST: "Brand Subscribers",
  "LIST:COMPANY": "Your Company",
  "LIST:ADDRESS": "123 Example Street, City, Country",
  "LIST:DESCRIPTION": "You are receiving this email because you opted in.",
  REWARDS: "",
  "HTML:RSSFEED": "",
};

/** Replaces Mailchimp *|TAG|* merge tags with sample values for preview / test sends. */
export function applyPreviewMergeTags(html: string): string {
  return html.replace(/\*\|([A-Za-z0-9_:\-]+)\|\*/g, (_m, tag: string) => {
    const key = tag.toUpperCase();
    if (key in PREVIEW_MERGE_VALUES) return PREVIEW_MERGE_VALUES[key];
    if (key.startsWith("IF:") || key.startsWith("ELSE") || key.startsWith("END:")) return "";
    return "";
  });
}

export function extractSubject(source: string): string {
  const mjmlTitle = source.match(/<mj-title[^>]*>([\s\S]*?)<\/mj-title>/i);
  if (mjmlTitle) return decodeEntities(mjmlTitle[1]).trim();
  const htmlTitle = source.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (htmlTitle) return decodeEntities(htmlTitle[1]).trim();
  return "";
}

function decodeEntities(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

export function slugify(text: string): string {
  return (
    text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "blast"
  );
}
