"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Archive,
  Download,
  ExternalLink,
  FileText,
  Mail,
  Pencil,
  Printer,
  RefreshCw,
  Save,
  Trash2,
} from "lucide-react";
import clsx from "clsx";
import { CATEGORY_STYLES, useStore } from "@/lib/store";
import { BLAST_CATEGORIES, type BlastCategory, type SavedBlast } from "@/lib/types";
import { downloadFile, openHtmlInNewTab, timeAgo } from "@/lib/client-utils";
import { slugify } from "@/lib/html";
import { EmailPreview } from "./EmailPreview";
import { EmptyState, Modal, useToast } from "./ui";

type Filter = "All" | BlastCategory;

export function BlastRepository() {
  const blasts = useStore((s) => s.blasts);
  const deleteBlast = useStore((s) => s.deleteBlast);
  const setTab = useStore((s) => s.setTab);
  const [filter, setFilter] = useState<Filter>("All");
  const [openId, setOpenId] = useState<string | null>(null);

  const filtered = useMemo(() => (filter === "All" ? blasts : blasts.filter((b) => b.category === filter)), [blasts, filter]);
  const opened = blasts.find((b) => b.id === openId) ?? null;
  const counts = (c: Filter) => (c === "All" ? blasts.length : blasts.filter((b) => b.category === c).length);

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-6xl space-y-6 p-4 md:p-8">
        <header>
          <h1 className="text-xl font-semibold text-white">Blast Repository</h1>
          <p className="mt-1 text-sm text-slate-400">Saved email blasts. Open one to tweak the HTML, export it, or render it in a new tab.</p>
        </header>

        <div className="flex flex-wrap gap-2" role="tablist" aria-label="Filter by category">
          {(["All", ...BLAST_CATEGORIES] as Filter[]).map((f) => (
            <button
              key={f}
              role="tab"
              aria-selected={filter === f}
              onClick={() => setFilter(f)}
              className={clsx(
                "rounded-full border px-3 py-1.5 text-sm transition",
                filter === f ? "border-blue-500/60 bg-blue-500/15 text-white" : "border-slate-800 bg-slate-900 text-slate-400 hover:text-slate-200",
              )}
            >
              {f} <span className="ml-1 text-xs text-slate-500">{counts(f)}</span>
            </button>
          ))}
        </div>

        {blasts.length === 0 ? (
          <EmptyState
            icon={<Archive className="h-5 w-5" />}
            title="No saved blasts yet"
            body="Generate a blast and press Save Blast to store it here with a category."
            action={<button className="btn-primary" onClick={() => setTab("generator")}>Go to Blast Generator</button>}
          />
        ) : filtered.length === 0 ? (
          <EmptyState icon={<Archive className="h-5 w-5" />} title={`No ${filter} blasts`} body="Save a blast with this category and it will show up here." />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {filtered.map((b) => (
              <BlastCard
                key={b.id}
                blast={b}
                onOpen={() => setOpenId(b.id)}
                onDelete={() => {
                  if (window.confirm(`Delete “${b.name}”?`)) deleteBlast(b.id);
                }}
              />
            ))}
          </div>
        )}
      </div>
      {opened && <InspectorModal blast={opened} onClose={() => setOpenId(null)} />}
    </div>
  );
}

function BlastCard({ blast, onOpen, onDelete }: { blast: SavedBlast; onOpen: () => void; onDelete: () => void }) {
  return (
    <article className="card group flex flex-col overflow-hidden transition hover:border-slate-700">
      <button onClick={onOpen} className="relative block h-48 overflow-hidden border-b border-slate-800 bg-slate-200 text-left" aria-label={`Open ${blast.name}`}>
        <iframe
          title={`${blast.name} thumbnail`}
          srcDoc={blast.html}
          sandbox=""
          tabIndex={-1}
          className="pointer-events-none absolute left-1/2 top-0 h-[800px] w-[640px] origin-top -translate-x-1/2 scale-[0.5] bg-white"
          loading="lazy"
        />
      </button>
      <div className="flex flex-1 flex-col gap-2 p-4">
        <div className="flex items-start justify-between gap-2">
          <h3 className="line-clamp-2 text-sm font-semibold text-white">{blast.name}</h3>
          <span className={clsx("shrink-0 rounded border px-1.5 py-px text-[10px] font-medium", CATEGORY_STYLES[blast.category])}>{blast.category}</span>
        </div>
        {blast.subject && <p className="line-clamp-1 text-xs text-slate-400">Subject: {blast.subject}</p>}
        <p className="text-xs text-slate-500">
          {blast.brandBookName} · updated {timeAgo(blast.updatedAt)}
        </p>
        <div className="mt-auto flex gap-2 pt-2">
          <button className="btn-ghost flex-1 py-1.5 text-xs" onClick={onOpen}>
            <Pencil className="h-3.5 w-3.5" /> Inspect
          </button>
          <button className="btn-danger px-2.5 py-1.5" aria-label={`Delete ${blast.name}`} onClick={onDelete}>
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </article>
  );
}

function InspectorModal({ blast, onClose }: { blast: SavedBlast; onClose: () => void }) {
  const updateBlast = useStore((s) => s.updateBlast);
  const toast = useToast();
  const [tab, setTab] = useState<"editor" | "render">("editor");
  const [draft, setDraft] = useState(blast.html);
  const [name, setName] = useState(blast.name);
  const [category, setCategory] = useState<BlastCategory>(blast.category);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [previewHtml, setPreviewHtml] = useState(blast.html);
  const dirty = draft !== blast.html || name !== blast.name || category !== blast.category;

  useEffect(() => {
    const t = setTimeout(() => setPreviewHtml(draft), 400);
    return () => clearTimeout(t);
  }, [draft]);

  const base = slugify(name);

  return (
    <Modal
      size="xl"
      title={name || "Untitled blast"}
      description={`${blast.brandBookName} · saved ${new Date(blast.createdAt).toLocaleString()}`}
      onClose={onClose}
      footer={
        tab === "editor" ? (
          <>
            <button className="btn-ghost" onClick={() => { downloadFile(`${base}.txt`, draft, "text/plain"); }}>
              <FileText className="h-4 w-4" /> Save as .TXT
            </button>
            <button className="btn-ghost" onClick={() => { downloadFile(`${base}.html`, draft, "text/html"); }}>
              <Download className="h-4 w-4" /> Download .HTML
            </button>
            <button
              className="btn-success"
              disabled={!dirty}
              onClick={() => {
                updateBlast(blast.id, { html: draft, name: name.trim() || blast.name, category });
                toast("Saved blast updated.", "success");
              }}
            >
              <Save className="h-4 w-4" /> Update Saved Blast
            </button>
          </>
        ) : (
          <>
            <button className="btn-ghost" onClick={() => iframeRef.current?.contentWindow?.print()}>
              <Printer className="h-4 w-4" /> Print
            </button>
            <button className="btn-primary" onClick={() => !openHtmlInNewTab(draft) && toast("Pop-up blocked. Allow pop-ups to render in a new tab.", "error")}>
              <ExternalLink className="h-4 w-4" /> Render in New Tab / Print
            </button>
          </>
        )
      }
    >
      <div className="flex h-[68vh] flex-col gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="inline-flex rounded-md border border-slate-800 bg-slate-900 p-0.5">
            {([
              ["editor", "Live HTML Editor", Pencil],
              ["render", "Visual Render", Mail],
            ] as const).map(([id, label, Icon]) => (
              <button
                key={id}
                onClick={() => setTab(id)}
                className={clsx("inline-flex items-center gap-1.5 rounded px-3 py-1.5 text-xs font-medium", tab === id ? "bg-slate-800 text-white" : "text-slate-400 hover:text-slate-200")}
              >
                <Icon className="h-3.5 w-3.5" /> {label}
              </button>
            ))}
          </div>
          {tab === "editor" && (
            <>
              <input aria-label="Blast name" className="input max-w-xs py-1.5" value={name} onChange={(e) => setName(e.target.value)} />
              <select aria-label="Category" className="input w-auto py-1.5" value={category} onChange={(e) => setCategory(e.target.value as BlastCategory)}>
                {BLAST_CATEGORIES.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
              {draft !== blast.html && (
                <button className="inline-flex items-center gap-1 text-xs text-slate-400 hover:text-white" onClick={() => setDraft(blast.html)}>
                  <RefreshCw className="h-3 w-3" /> Revert edits
                </button>
              )}
            </>
          )}
        </div>
        {tab === "editor" ? (
          <textarea
            aria-label="HTML editor"
            spellCheck={false}
            className="input min-h-0 flex-1 resize-none font-mono text-[12.5px] leading-relaxed"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
          />
        ) : (
          <EmailPreview ref={iframeRef} html={previewHtml} title={`${name} render`} className="flex-1" />
        )}
      </div>
    </Modal>
  );
}
