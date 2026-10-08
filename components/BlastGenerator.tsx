"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  Check,
  ClipboardCopy,
  Code2,
  Eye,
  FileCode,
  Loader2,
  Mail,
  RefreshCw,
  Save,
  Send,
  Sparkles,
  Wand2,
  ExternalLink,
} from "lucide-react";
import { useStore } from "@/lib/store";
import { copyText, openHtmlInNewTab, postJson } from "@/lib/client-utils";
import { mailchimpReady } from "@/lib/html";
import type { BlastResponse, SectionRevision, ViewMode } from "@/lib/types";
import { EmptyState, Segmented, Spinner, useToast } from "./ui";
import { EmailPreview } from "./EmailPreview";
import { SaveBlastModal, SendTestModal } from "./BlastModals";
import { ReviseSectionsModal } from "./ReviseSectionsModal";
import { ReferenceScreenshots } from "./ReferenceScreenshots";
import { resolveBrandTokens } from "@/lib/brand-tokens";
import type { ServerStatus } from "./AppShell";

const SAMPLE_BLUEPRINT = `# Your Health, Delivered: Save 20% on Maintenance Meds

Stay on track with your wellness goals. This month, enjoy easier refills and exclusive savings.

## Why you'll love it
- **Free delivery:** Get medicines at your door within 48 hours.
- **20% off:** Use code HEALTH20 on your first maintenance order.
- **Easy refills:** Set up auto-refill in two taps.
- **Pharmacist support:** Chat with licensed pharmacists anytime.

## Call to action
[Order now](https://example.com/order)
`;

const STRUCTURED_BLUEPRINT = `# Campaign Blueprint: Maintenance Meds Month

1. PREHEADER BAR
Free delivery on all maintenance medicine orders until Oct 31.

2. HEADER LOGO BLOCK
Co-branded: Brand logo | Partner pharmacy logo

3. HERO BANNER
Headline: Save more on the meds you take every day
Sub-banner: Member prices now live

4. PATIENT-FACING INTRO HOOK
Hi *|FNAME|*, here is how members save on their monthly maintenance medicines.

5. MEDICINE PRICE COMPARISON TABLE MATRIX
| Medicine | Regular price | Member price |
| Metformin 500mg | PHP 420 | PHP 336 |
| Losartan 50mg | PHP 380 | PHP 304 |
Disclaimer: Prices are subject to change. Terms apply.

6. MEMBER SAVINGS BENEFIT CARDS
- **20% off:** On every maintenance refill
- **Free delivery:** Within 48 hours

7. DID YOU KNOW CALLOUT BOX
Refilling before you run out helps you stay on your treatment plan.

8. STEP-BY-STEP ORDERING GUIDE
1. Upload your prescription
2. Confirm your order
3. Receive it at home
Promo tip: Use code HEALTH20 at checkout.

9. PRIMARY CALL TO ACTION
[Order now](https://example.com/order)
Offer ends October 31.

10. DOCTOR TELECONSULT CALLOUT
Need a prescription? [Book a teleconsult](https://example.com/consult)

11. TERMS AND FOOTER
Terms apply. Questions? support@example.com
`;

export function BlastGenerator({ status, onOpenSettings }: { status: ServerStatus | null; onOpenSettings: () => void }) {
  const workspace = useStore((s) => s.workspace);
  const update = useStore((s) => s.updateWorkspace);
  const setViewMode = useStore((s) => s.setViewMode);
  const books = useStore((s) => s.brandBooks);
  const allAssets = useStore((s) => s.assets);
  const settings = useStore((s) => s.settings);
  const referenceImages = useStore((s) => s.referenceImages);
  const addAsset = useStore((s) => s.addAsset);
  const toast = useToast();
  const [saveRefToBook, setSaveRefToBook] = useState(false);

  const [busy, setBusy] = useState(false);
  const [compiling, setCompiling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [modal, setModal] = useState<null | "revise" | "send" | "save">(null);
  const [copied, setCopied] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const compileSeq = useRef(0);
  const lastCompiled = useRef(workspace.mjml);

  const book = books.find((b) => b.id === workspace.brandBookId) ?? null;
  const bookAssets = useMemo(() => (book ? allAssets.filter((a) => a.bookId === book.id) : []), [allAssets, book]);
  const cdnCount = bookAssets.filter((a) => a.kind === "cdn-url").length;
  const tokens = useMemo(
    () => resolveBrandTokens({ tokens: book?.tokens, directives: workspace.directives, assets: bookAssets }),
    [book, workspace.directives, bookAssets],
  );
  const bannerSrc = bookAssets.find((a) => a.kind === "cdn-url" && /hero|banner/i.test(`${a.role} ${a.name}`))?.url;
  const hasKey = !!settings.geminiApiKey || !!status?.gemini;
  const hasOutput = !!workspace.html;

  const generate = useCallback(
    async (revisions?: SectionRevision[]) => {
      if (!revisions && !workspace.blueprint.trim()) {
        setError("Paste a content blueprint first.");
        return;
      }
      setBusy(true);
      setError(null);
      try {
        const data = await postJson<BlastResponse>("/api/generate-blast", {
          blueprint: workspace.blueprint,
          brandName: book?.name,
          assets: bookAssets,
          directives: workspace.directives,
          brandTokens: book?.tokens,
          referenceImages: referenceImages.map(({ name, mime, dataUrl }) => ({ name, mime, dataUrl })),
          model: settings.geminiModel,
          apiKey: settings.geminiApiKey,
          revision: revisions ? { previousMjml: workspace.mjml, sections: revisions } : undefined,
        });
        if (saveRefToBook && book && referenceImages.length) {
          let saved = 0;
          for (const img of referenceImages) {
            if (allAssets.some((a) => a.bookId === book.id && a.dataUrl === img.dataUrl)) continue;
            addAsset({
              bookId: book.id,
              kind: "image",
              name: img.name,
              mime: img.mime,
              size: Math.round(img.dataUrl.length * 0.75),
              dataUrl: img.dataUrl,
              directive: "Reference screenshot attached to custom directives",
            });
            saved++;
          }
          if (saved) toast(`Saved ${saved} reference image${saved > 1 ? "s" : ""} to “${book.name}”.`, "success");
        }
        lastCompiled.current = data.mjml;
        update({ mjml: data.mjml, html: data.html, source: data.source, warnings: data.warnings });
        setModal(null);
        toast(revisions ? "Sections revised." : "Blast generated.", "success");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Generation failed.");
      } finally {
        setBusy(false);
      }
    },
    [
      workspace.blueprint,
      workspace.mjml,
      workspace.directives,
      book,
      bookAssets,
      allAssets,
      referenceImages,
      saveRefToBook,
      addAsset,
      settings.geminiModel,
      settings.geminiApiKey,
      update,
      toast,
    ],
  );

  const transpile = useCallback(
    async (code: string, silent = true) => {
      const seq = ++compileSeq.current;
      setCompiling(true);
      try {
        const data = await postJson<{ mjml: string; html: string; warnings: string[] }>("/api/transpile-mjml", {
          mjml: code,
          brandTokens: book?.tokens,
        });
        if (seq !== compileSeq.current) return;
        lastCompiled.current = code;
        update({ html: data.html, warnings: data.warnings, source: "manual" });
        setError(null);
        if (!silent) toast("MJML recompiled.", "success");
      } catch (err) {
        if (seq !== compileSeq.current) return;
        setError(err instanceof Error ? err.message : "Compilation failed.");
      } finally {
        if (seq === compileSeq.current) setCompiling(false);
      }
    },
    [update, toast, book?.tokens],
  );

  const applyBlocks = useCallback(
    async (code: string): Promise<string | null> => {
      try {
        const data = await postJson<{ mjml: string; html: string; warnings: string[] }>("/api/transpile-mjml", {
          mjml: code,
          brandTokens: book?.tokens,
        });
        compileSeq.current++;
        lastCompiled.current = data.mjml;
        update({ mjml: data.mjml, html: data.html, warnings: data.warnings, source: "manual" });
        setError(null);
        setModal(null);
        toast("Block changes applied and recompiled.", "success");
        return null;
      } catch (err) {
        return err instanceof Error ? err.message : "Compilation failed.";
      }
    },
    [book?.tokens, update, toast],
  );

  useEffect(() => {
    if (workspace.mjml === lastCompiled.current || !workspace.mjml.trim()) return;
    const t = setTimeout(() => void transpile(workspace.mjml), 900);
    return () => clearTimeout(t);
  }, [workspace.mjml, transpile]);

  const copyForMailchimp = async () => {
    if (!hasOutput) return;
    const ok = await copyText(mailchimpReady(workspace.html));
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      toast("Production HTML copied. In Mailchimp choose Code your own → Paste in code.", "success");
    } else toast("Clipboard unavailable. Copy from the Raw HTML tab.", "error");
  };

  const printPreview = () => {
    const win = iframeRef.current?.contentWindow;
    if (win) win.print();
    else if (!openHtmlInNewTab(workspace.html)) toast("Pop-up blocked.", "error");
  };

  return (
    <div className="grid h-full grid-cols-1 lg:grid-cols-[40%_60%]">
      <section className="flex min-h-0 flex-col border-b border-slate-800 lg:border-b-0 lg:border-r">
        <div className="flex-1 space-y-5 overflow-y-auto p-4 md:p-6">
          <header>
            <h1 className="text-xl font-semibold text-slate-100">Blast Generator</h1>
            <p className="mt-1 text-sm text-slate-400">Turn an App 1 content blueprint into branded, Mailchimp-ready MJML.</p>
          </header>

          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <label className="label !mb-0" htmlFor="blueprint">Content blueprint (Markdown)</label>
              <span className="flex items-center gap-3">
                <button className="text-xs text-blue-400 hover:text-blue-300" onClick={() => update({ blueprint: SAMPLE_BLUEPRINT })}>
                  Load sample
                </button>
                <button className="text-xs text-blue-400 hover:text-blue-300" onClick={() => update({ blueprint: STRUCTURED_BLUEPRINT })}>
                  Load 11-section sample
                </button>
              </span>
            </div>
            <textarea
              id="blueprint"
              rows={12}
              className="input font-mono text-[13px] leading-relaxed"
              placeholder="# Subject / headline&#10;&#10;## Section&#10;- Bullet…&#10;&#10;[CTA label](https://…)"
              value={workspace.blueprint}
              onChange={(e) => update({ blueprint: e.target.value })}
            />
          </div>

          <div>
            <label className="label" htmlFor="brand-select">Brand book</label>
            <select id="brand-select" className="input" value={workspace.brandBookId ?? ""} onChange={(e) => update({ brandBookId: e.target.value || null })}>
              <option value="">No brand book</option>
              {books.map((b) => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>
            <p className="mt-1.5 text-xs text-slate-500">
              {book
                ? `${bookAssets.length} asset${bookAssets.length === 1 ? "" : "s"} injected · ${cdnCount} CDN URL${cdnCount === 1 ? "" : "s"} available as image sources.`
                : books.length
                  ? "Select a brand book to inject asset rules and CDN URLs."
                  : "Create a brand book in tab 1 to inject logos, banners and rules."}
            </p>
          </div>

          <div>
            <label className="label" htmlFor="directives">Custom directives</label>
            <textarea
              id="directives"
              rows={5}
              className="input text-[13px]"
              placeholder={"Layout, color and merge tag rules, e.g.\n- Primary color #0b5cab, CTA button emerald\n- Greet with *|FNAME|*, footer must include *|UNSUB|*"}
              value={workspace.directives}
              onChange={(e) => update({ directives: e.target.value })}
            />
            <ReferenceScreenshots
              hasBrandBook={!!book}
              brandBookName={book?.name}
              saveToBook={saveRefToBook}
              onSaveToBookChange={setSaveRefToBook}
            />
          </div>

          {!hasKey && (
            <div className="flex gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-200">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <p>
                No Gemini API key found, so the offline template builder will be used.{" "}
                <button className="underline hover:text-slate-100" onClick={onOpenSettings}>Add a key</button> for AI-written layouts.
              </p>
            </div>
          )}
        </div>

        <div className="border-t border-slate-800 bg-slate-950 p-4">
          {error && (
            <p role="alert" className="alert-error mb-3">{error}</p>
          )}
          <button className="btn-primary w-full py-2.5" disabled={busy || !workspace.blueprint.trim()} onClick={() => void generate()}>
            {busy ? <Spinner /> : <Sparkles className="h-4 w-4" />}
            {busy ? "Generating MJML…" : hasOutput ? "Regenerate Blast" : "Generate Blast"}
          </button>
        </div>
      </section>

      <section className="flex min-h-[640px] min-w-0 flex-col lg:min-h-0">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 px-4 py-3">
          <Segmented<ViewMode>
            value={workspace.viewMode}
            onChange={setViewMode}
            options={[
              { value: "preview", label: "Visual Preview", icon: <Eye className="h-3.5 w-3.5" /> },
              { value: "mjml", label: "MJML Code Editor", icon: <Code2 className="h-3.5 w-3.5" /> },
              { value: "html", label: "Raw HTML", icon: <FileCode className="h-3.5 w-3.5" /> },
            ]}
          />
          <div className="flex items-center gap-2 text-xs text-slate-500">
            {compiling && (
              <span className="flex items-center gap-1 text-blue-300">
                <Loader2 className="h-3 w-3 animate-spin" /> Transpiling…
              </span>
            )}
            {hasOutput && workspace.source && (
              <span className="rounded border border-slate-800 px-1.5 py-0.5">
                {workspace.source === "gemini" ? "Gemini" : workspace.source === "fallback" ? "Offline template" : "Edited"}
              </span>
            )}
          </div>
        </div>

        <div className="flex flex-wrap gap-2 border-b border-slate-800 px-4 py-2.5">
          <button className="btn-success" disabled={!hasOutput} onClick={copyForMailchimp}>
            {copied ? <Check className="h-4 w-4" /> : <ClipboardCopy className="h-4 w-4" />}
            Copy for Mailchimp
          </button>
          <button className="btn-ghost" disabled={!hasOutput || busy} onClick={() => setModal("revise")}>
            <Wand2 className="h-4 w-4" /> Revise Sections
          </button>
          <button className="btn-ghost" disabled={!hasOutput} onClick={() => setModal("send")}>
            <Send className="h-4 w-4" /> Send Test Email
          </button>
          <button className="btn-ghost" disabled={!hasOutput} onClick={() => setModal("save")}>
            <Save className="h-4 w-4" /> Save Blast
          </button>
        </div>

        {workspace.warnings.length > 0 && hasOutput && (
          <details className="border-b border-slate-800 bg-slate-900/40 px-4 py-2 text-xs text-slate-400">
            <summary className="cursor-pointer select-none text-slate-300">
              {workspace.warnings.length} auto-repair note{workspace.warnings.length > 1 ? "s" : ""}
            </summary>
            <ul className="mt-1.5 list-disc space-y-0.5 pl-5">
              {workspace.warnings.map((w, i) => (
                <li key={i}>{w}</li>
              ))}
            </ul>
          </details>
        )}

        <div className="flex min-h-0 flex-1 flex-col p-4">
          {busy && !hasOutput ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-3 text-sm text-slate-400">
              <Spinner className="h-6 w-6 text-blue-400" />
              Writing MJML and compiling responsive HTML…
            </div>
          ) : !hasOutput && workspace.viewMode !== "mjml" ? (
            <EmptyState
              icon={<Mail className="h-5 w-5" />}
              title="No blast yet"
              body="Paste a blueprint, choose a brand book, and hit Generate Blast. The preview, MJML and HTML appear here."
            />
          ) : workspace.viewMode === "preview" ? (
            <div className="relative flex min-h-0 flex-1 flex-col">
              <EmailPreview ref={iframeRef} html={workspace.html} className="flex-1" />
              <div className="mt-2 flex justify-end gap-2">
                <button className="btn-ghost py-1.5 text-xs" onClick={() => openHtmlInNewTab(workspace.html)}>
                  <ExternalLink className="h-3.5 w-3.5" /> Open in new tab
                </button>
                <button className="btn-ghost py-1.5 text-xs" onClick={printPreview}>Print</button>
              </div>
              {busy && <Overlay label="Applying changes…" />}
            </div>
          ) : workspace.viewMode === "mjml" ? (
            <div className="relative flex min-h-0 flex-1 flex-col">
              <textarea
                aria-label="MJML code editor"
                spellCheck={false}
                className="input min-h-[420px] flex-1 resize-none font-mono text-[12.5px] leading-relaxed"
                placeholder="<mjml>…</mjml> — paste or write MJML here. It is auto-repaired and transpiled on the server as you type."
                value={workspace.mjml}
                onChange={(e) => update({ mjml: e.target.value })}
              />
              <div className="mt-2 flex items-center justify-between text-xs text-slate-500">
                <span>Auto-transpiles 1s after you stop typing.</span>
                <button className="btn-ghost py-1.5 text-xs" disabled={!workspace.mjml.trim() || compiling} onClick={() => void transpile(workspace.mjml, false)}>
                  <RefreshCw className="h-3.5 w-3.5" /> Transpile now
                </button>
              </div>
              {busy && <Overlay label="Applying changes…" />}
            </div>
          ) : (
            <div className="flex min-h-0 flex-1 flex-col">
              <textarea
                aria-label="Raw HTML output"
                readOnly
                spellCheck={false}
                className="input min-h-[420px] flex-1 resize-none font-mono text-[12.5px] leading-relaxed"
                value={workspace.html}
              />
              <p className="mt-2 text-xs text-slate-500">Read-only compiled output. Edit the MJML to change it.</p>
            </div>
          )}
        </div>
      </section>

      {modal === "revise" && (
        <ReviseSectionsModal
          mjml={workspace.mjml}
          busy={busy}
          error={error}
          tokens={tokens}
          bannerSrc={bannerSrc}
          onClose={() => setModal(null)}
          onSubmitPrompt={(r) => void generate(r)}
          onApplyBlocks={applyBlocks}
        />
      )}
      {modal === "send" && <SendTestModal html={workspace.html} mjml={workspace.mjml} onClose={() => setModal(null)} />}
      {modal === "save" && (
        <SaveBlastModal
          mjml={workspace.mjml}
          html={workspace.html}
          blueprint={workspace.blueprint}
          brandBookId={workspace.brandBookId}
          onClose={() => setModal(null)}
        />
      )}
    </div>
  );
}

function Overlay({ label }: { label: string }) {
  return (
    <div className="absolute inset-0 flex items-center justify-center gap-2 rounded-md bg-slate-950/70 text-sm text-slate-200 backdrop-blur-[1px]">
      <Spinner /> {label}
    </div>
  );
}
