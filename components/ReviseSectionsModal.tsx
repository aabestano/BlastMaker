"use client";

import { useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  Blocks,
  Check,
  EyeOff,
  MessageSquareText,
  Plus,
  Trash2,
  Wand2,
} from "lucide-react";
import clsx from "clsx";
import { Modal, Spinner } from "./ui";
import {
  BLAST_SECTIONS,
  BLOCK_TEMPLATES,
  applySlotEdit,
  createBlock,
  extractSlots,
  listSectionNames,
  parseBlocks,
  serializeBlocks,
  type Block,
  type BlockDocument,
  type BlockTemplateId,
} from "@/lib/blocks";
import type { ResolvedTokens } from "@/lib/brand-tokens";
import type { SectionRevision } from "@/lib/types";

type View = "prompt" | "builder";

interface Props {
  mjml: string;
  busy: boolean;
  error?: string | null;
  tokens: ResolvedTokens;
  bannerSrc?: string;
  onClose: () => void;
  onSubmitPrompt: (revisions: SectionRevision[]) => void;
  /** Resolves with an error message, or null when the compiled blast was updated. */
  onApplyBlocks: (mjml: string) => Promise<string | null>;
}

const labelFor = (name: string) => BLAST_SECTIONS.find((s) => s.marker === name)?.label ?? name;

export function ReviseSectionsModal({ mjml, busy, error, tokens, bannerSrc, onClose, onSubmitPrompt, onApplyBlocks }: Props) {
  const [view, setView] = useState<View>("prompt");

  return (
    <Modal
      title="Revise sections"
      description={
        view === "prompt"
          ? "Describe changes section by section and let Gemini regenerate them. Untouched sections are preserved."
          : "Reorder, hide and edit sections directly. Nothing is sent to the AI."
      }
      size="wide"
      onClose={onClose}
    >
      <div className="mb-4 inline-flex rounded-md border border-slate-800 bg-slate-900 p-0.5" role="tablist" aria-label="Revision mode">
        {(
          [
            ["prompt", "Prompt Description", MessageSquareText],
            ["builder", "Block Builder", Blocks],
          ] as const
        ).map(([id, label, Icon]) => (
          <button
            key={id}
            role="tab"
            aria-selected={view === id}
            onClick={() => setView(id)}
            className={clsx(
              "inline-flex items-center gap-1.5 rounded px-3 py-1.5 text-xs font-medium transition",
              view === id ? "bg-slate-800 text-slate-100 shadow" : "text-slate-400 hover:text-slate-200",
            )}
          >
            <Icon className="h-3.5 w-3.5" /> {label}
          </button>
        ))}
      </div>

      {view === "prompt" ? (
        <PromptView mjml={mjml} busy={busy} error={error} onClose={onClose} onSubmit={onSubmitPrompt} />
      ) : (
        <BuilderView mjml={mjml} tokens={tokens} bannerSrc={bannerSrc} onClose={onClose} onApply={onApplyBlocks} />
      )}
    </Modal>
  );
}

function Footer({ children }: { children: React.ReactNode }) {
  return <div className="sticky bottom-0 -mx-5 -mb-4 mt-5 flex items-center justify-end gap-2 border-t border-slate-800 bg-slate-950 px-5 py-3">{children}</div>;
}

/* ---------------------------- Prompt view ---------------------------- */

function PromptView({
  mjml,
  busy,
  error,
  onClose,
  onSubmit,
}: {
  mjml: string;
  busy: boolean;
  error?: string | null;
  onClose: () => void;
  onSubmit: (r: SectionRevision[]) => void;
}) {
  const names = useMemo(() => {
    const present = listSectionNames(mjml);
    return present.length ? present : BLAST_SECTIONS.map((s) => s.marker);
  }, [mjml]);
  const [values, setValues] = useState<Record<string, string>>({});
  const filled = names.filter((n) => values[n]?.trim());

  return (
    <>
      <div className="space-y-4">
        {names.map((name) => (
          <div key={name}>
            <label className="label" htmlFor={`rev-${name}`}>
              {labelFor(name)} <span className="ml-1 normal-case tracking-normal text-slate-600">{name}</span>
            </label>
            <textarea
              id={`rev-${name}`}
              rows={2}
              className="input resize-none"
              placeholder="e.g. Make this block shorter, switch the button to the accent color, or change the wording…"
              value={values[name] ?? ""}
              onChange={(e) => setValues((v) => ({ ...v, [name]: e.target.value }))}
            />
          </div>
        ))}
        {error && (
          <p role="alert" className="alert-error">
            {error}
          </p>
        )}
      </div>
      <Footer>
        <button className="btn-ghost" onClick={onClose} disabled={busy}>
          Cancel
        </button>
        <button
          className="btn-primary"
          disabled={!filled.length || busy}
          onClick={() => onSubmit(filled.map((section) => ({ section, instruction: values[section].trim() })))}
        >
          {busy ? <Spinner /> : <Wand2 className="h-4 w-4" />}
          Regenerate {filled.length ? `${filled.length} section${filled.length > 1 ? "s" : ""}` : ""}
        </button>
      </Footer>
    </>
  );
}

/* ---------------------------- Block builder -------------------------- */

function BuilderView({
  mjml,
  tokens,
  bannerSrc,
  onClose,
  onApply,
}: {
  mjml: string;
  tokens: ResolvedTokens;
  bannerSrc?: string;
  onClose: () => void;
  onApply: (mjml: string) => Promise<string | null>;
}) {
  const [doc, setDoc] = useState<BlockDocument>(() => parseBlocks(mjml));
  const [adding, setAdding] = useState(false);
  const [applying, setApplying] = useState(false);
  const [applyError, setApplyError] = useState<string | null>(null);

  const setBlocks = (fn: (blocks: Block[]) => Block[]) => setDoc((d) => ({ ...d, blocks: fn(d.blocks) }));
  const patch = (id: string, p: Partial<Block>) => setBlocks((bs) => bs.map((b) => (b.id === id ? { ...b, ...p } : b)));
  const move = (index: number, dir: -1 | 1) =>
    setBlocks((bs) => {
      const next = [...bs];
      const j = index + dir;
      if (j < 0 || j >= next.length) return bs;
      [next[index], next[j]] = [next[j], next[index]];
      return next;
    });

  const addBlock = (id: BlockTemplateId) => {
    setBlocks((bs) => {
      const block = createBlock(id, tokens, bs, bannerSrc);
      const last = bs[bs.length - 1];
      return last && last.key === "footer" ? [...bs.slice(0, -1), block, last] : [...bs, block];
    });
    setAdding(false);
  };

  const visibleCount = doc.blocks.filter((b) => b.visible).length;
  const hiddenCount = doc.blocks.length - visibleCount;

  const apply = async () => {
    setApplying(true);
    setApplyError(null);
    const err = await onApply(serializeBlocks(doc));
    setApplying(false);
    if (err) setApplyError(err);
  };

  if (!doc.parsed) {
    return (
      <>
        <div className="flex gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-200">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <p>There is no MJML to build from yet. Generate a blast first, or write MJML with an {"<mj-body>"} in the code editor.</p>
        </div>
        <Footer>
          <button className="btn-ghost" onClick={onClose}>
            Close
          </button>
        </Footer>
      </>
    );
  }

  return (
    <>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
        <span>
          {doc.blocks.length} block{doc.blocks.length === 1 ? "" : "s"} · {visibleCount} visible
          {hiddenCount ? ` · ${hiddenCount} hidden` : ""}
        </span>
        <span>Hidden blocks stay in the MJML as comments so you can show them again.</span>
      </div>

      <ol className="space-y-3">
        {doc.blocks.map((block, i) => (
          <BlockCard
            key={block.id}
            block={block}
            index={i}
            total={doc.blocks.length}
            onMove={(dir) => move(i, dir)}
            onPatch={(p) => patch(block.id, p)}
            onRemove={() => setBlocks((bs) => bs.filter((b) => b.id !== block.id))}
          />
        ))}
      </ol>

      <div className="mt-4">
        <button className="btn-ghost w-full border-dashed" onClick={() => setAdding((a) => !a)} aria-expanded={adding}>
          <Plus className="h-4 w-4" /> Add Content Block
        </button>
        {adding && (
          <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3" role="menu" aria-label="Block types">
            {BLOCK_TEMPLATES.map((t) => (
              <button
                key={t.id}
                role="menuitem"
                onClick={() => addBlock(t.id)}
                className="rounded-md border border-slate-800 bg-slate-900 p-3 text-left transition hover:border-blue-500/60 hover:bg-slate-800"
              >
                <div className="text-sm font-medium text-slate-100">{t.label}</div>
                <div className="mt-0.5 text-[11px] text-slate-500">{t.description}</div>
              </button>
            ))}
          </div>
        )}
      </div>

      {applyError && (
        <p role="alert" className="alert-error mt-4">
          {applyError}
        </p>
      )}

      <Footer>
        <button className="btn-ghost" onClick={onClose} disabled={applying}>
          Cancel
        </button>
        <button className="btn-success" onClick={apply} disabled={applying || visibleCount === 0}>
          {applying ? <Spinner /> : <Check className="h-4 w-4" />} Apply Changes
        </button>
      </Footer>
    </>
  );
}

function Switch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={clsx(
        "relative inline-flex h-5 w-9 shrink-0 items-center rounded-full border transition",
        checked ? "border-emerald-500 bg-emerald-500" : "border-slate-700 bg-slate-800",
      )}
    >
      <span className={clsx("inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform", checked ? "translate-x-[18px]" : "translate-x-[3px]")} />
    </button>
  );
}

const SLOT_PREVIEW_LIMIT = 8;

function BlockCard({
  block,
  index,
  total,
  onMove,
  onPatch,
  onRemove,
}: {
  block: Block;
  index: number;
  total: number;
  onMove: (dir: -1 | 1) => void;
  onPatch: (p: Partial<Block>) => void;
  onRemove: () => void;
}) {
  const [showAll, setShowAll] = useState(false);
  const slots = useMemo(() => extractSlots(block.raw), [block.raw]);
  const shown = showAll ? slots : slots.slice(0, SLOT_PREVIEW_LIMIT);
  const isCustom = block.key === "custom";
  const def = BLAST_SECTIONS.find((s) => s.key === block.key);

  return (
    <li className={clsx("card overflow-hidden transition", !block.visible && "opacity-60")}>
      <div className="flex items-center gap-2 border-b border-slate-800 px-3 py-2.5">
        <div className="flex flex-col">
          <button
            className="rounded p-0.5 text-slate-400 hover:bg-slate-800 hover:text-slate-100 disabled:opacity-30"
            aria-label={`Move ${block.name} up`}
            disabled={index === 0}
            onClick={() => onMove(-1)}
          >
            <ArrowUp className="h-3.5 w-3.5" />
          </button>
          <button
            className="rounded p-0.5 text-slate-400 hover:bg-slate-800 hover:text-slate-100 disabled:opacity-30"
            aria-label={`Move ${block.name} down`}
            disabled={index === total - 1}
            onClick={() => onMove(1)}
          >
            <ArrowDown className="h-3.5 w-3.5" />
          </button>
        </div>
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-slate-700 text-[11px] text-slate-400">{index + 1}</span>
        <div className="min-w-0 flex-1">
          {isCustom ? (
            <input
              aria-label="Section name"
              className="input py-1 text-sm font-semibold"
              value={block.name}
              onChange={(e) => onPatch({ name: e.target.value.toUpperCase().replace(/[^A-Z0-9 _-]/g, "") })}
              onBlur={(e) => !e.target.value.trim() && onPatch({ name: "CUSTOM BLOCK" })}
            />
          ) : (
            <div className="truncate text-sm font-semibold text-slate-100">{def?.label ?? block.name}</div>
          )}
          <div className="truncate text-[11px] text-slate-500">
            {isCustom ? "Generic content block" : def?.description}
          </div>
        </div>
        {!block.visible && (
          <span className="inline-flex items-center gap-1 rounded border border-slate-700 px-1.5 py-0.5 text-[10px] text-slate-400">
            <EyeOff className="h-3 w-3" /> Hidden
          </span>
        )}
        <span
          className={clsx(
            "hidden rounded border px-1.5 py-0.5 text-[10px] font-medium sm:inline",
            isCustom ? "border-indigo-500/40 bg-indigo-500/10 text-indigo-400" : "border-emerald-500/40 bg-emerald-500/10 text-emerald-400",
          )}
        >
          {isCustom ? "Custom" : "Standard"}
        </span>
        <Switch checked={block.visible} onChange={(v) => onPatch({ visible: v })} label={`${block.visible ? "Hide" : "Show"} ${block.name}`} />
        {block.added && (
          <button className="rounded p-1.5 text-slate-500 hover:bg-red-500/15 hover:text-red-400" aria-label={`Remove ${block.name}`} onClick={onRemove}>
            <Trash2 className="h-4 w-4" />
          </button>
        )}
      </div>

      {block.visible ? (
        <div className="space-y-3 px-3 py-3">
          {slots.length === 0 && <p className="text-xs text-slate-500">No editable text, buttons or images detected. Use the raw MJML editor below.</p>}
          {shown.map((slot, i) => {
            const id = `${block.id}-slot-${i}`;
            const onChange = (v: string) => onPatch({ raw: applySlotEdit(block.raw, i, v) });
            return (
              <div key={`${slot.kind}-${i}`}>
                <label htmlFor={id} className="mb-1 flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-slate-500">
                  {slot.label}
                  {slot.html && slot.kind !== "table-html" && <span className="rounded bg-slate-800 px-1 normal-case text-slate-400">HTML</span>}
                </label>
                {slot.multiline ? (
                  <textarea
                    id={id}
                    rows={slot.kind === "table-html" ? 6 : Math.min(5, Math.max(2, slot.value.split("\n").length + (slot.value.length > 70 ? 1 : 0)))}
                    spellCheck={slot.kind !== "table-html" && !slot.html}
                    className={clsx("input resize-y text-[13px]", (slot.html || slot.kind === "table-html") && "font-mono text-[12px]")}
                    value={slot.value}
                    onChange={(e) => onChange(e.target.value)}
                  />
                ) : (
                  <input
                    id={id}
                    className={clsx("input text-[13px]", (slot.kind === "button-href" || slot.kind === "image-src") && "font-mono text-[12px]")}
                    value={slot.value}
                    onChange={(e) => onChange(e.target.value)}
                  />
                )}
              </div>
            );
          })}
          {slots.length > SLOT_PREVIEW_LIMIT && (
            <button className="text-xs text-blue-400 hover:text-blue-300" onClick={() => setShowAll((s) => !s)}>
              {showAll ? "Show fewer fields" : `Show all ${slots.length} fields`}
            </button>
          )}
          <details open={isCustom && block.added} className="text-xs">
            <summary className="cursor-pointer select-none text-slate-500 hover:text-slate-300">Edit raw MJML</summary>
            <textarea
              aria-label={`${block.name} raw MJML`}
              spellCheck={false}
              rows={8}
              className="input mt-2 resize-y font-mono text-[12px]"
              value={block.raw}
              onChange={(e) => onPatch({ raw: e.target.value })}
            />
          </details>
        </div>
      ) : (
        <p className="px-3 py-3 text-xs text-slate-500">This section is omitted from the email. Turn the switch on to include it again.</p>
      )}
    </li>
  );
}
