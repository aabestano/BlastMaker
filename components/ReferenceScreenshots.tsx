"use client";

import { useRef, useState, type ClipboardEvent, type DragEvent } from "react";
import { ImagePlus, X } from "lucide-react";
import clsx from "clsx";
import { useStore } from "@/lib/store";
import { downscaleImage } from "@/lib/client-utils";
import { Spinner, useToast } from "./ui";

const MAX_IMAGES = 3;
const MAX_FILE_BYTES = 8 * 1024 * 1024;

export function ReferenceScreenshots({
  hasBrandBook,
  brandBookName,
  saveToBook,
  onSaveToBookChange,
}: {
  hasBrandBook: boolean;
  brandBookName?: string;
  saveToBook: boolean;
  onSaveToBookChange: (v: boolean) => void;
}) {
  const images = useStore((s) => s.referenceImages);
  const add = useStore((s) => s.addReferenceImage);
  const remove = useStore((s) => s.removeReferenceImage);
  const toast = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);

  const ingest = async (files: File[]) => {
    const valid = files.filter((f) => /^image\/(png|jpe?g)$/.test(f.type));
    if (files.length && !valid.length) {
      toast("Reference screenshots must be PNG or JPG images.", "error");
      return;
    }
    if (!valid.length) return;
    setBusy(true);
    for (const file of valid) {
      if (file.size > MAX_FILE_BYTES) {
        toast(`${file.name} is over 8 MB.`, "error");
        continue;
      }
      try {
        const dataUrl = await downscaleImage(file, 1280, 0.8);
        add({ name: file.name || "screenshot.png", mime: "image/jpeg", dataUrl });
      } catch (err) {
        toast(`${file.name}: ${err instanceof Error ? err.message : "could not read image"}`, "error");
      }
    }
    if (valid.length + images.length > MAX_IMAGES) toast(`Only the latest ${MAX_IMAGES} screenshots are kept.`, "info");
    setBusy(false);
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragging(false);
    void ingest(Array.from(e.dataTransfer.files));
  };

  const onPaste = (e: ClipboardEvent) => {
    const files = Array.from(e.clipboardData.files);
    if (files.length) {
      e.preventDefault();
      void ingest(files);
    }
  };

  return (
    <div className="mt-3" onPaste={onPaste}>
      <span className="label">Attach Reference Screenshot</span>
      <div
        role="button"
        tabIndex={0}
        aria-label="Attach reference screenshot"
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={clsx(
          "flex cursor-pointer items-center gap-3 rounded-md border-2 border-dashed px-3 py-3 transition",
          dragging ? "border-blue-500 bg-blue-500/10" : "border-slate-700 bg-slate-900 hover:border-slate-600",
        )}
      >
        {busy ? <Spinner className="text-blue-400" /> : <ImagePlus className="h-5 w-5 shrink-0 text-slate-500" />}
        <p className="text-xs text-slate-400">
          <span className="font-medium text-slate-200">Drop, paste or browse</span> a PNG/JPG of a layout you want Gemini to emulate (up to {MAX_IMAGES}).
        </p>
        <input
          ref={inputRef}
          type="file"
          hidden
          multiple
          accept="image/png,image/jpeg"
          onChange={(e) => {
            if (e.target.files) void ingest(Array.from(e.target.files));
            e.target.value = "";
          }}
        />
      </div>

      {images.length > 0 && (
        <ul className="mt-2 flex flex-wrap gap-2">
          {images.map((img) => (
            <li key={img.id} className="group relative h-16 w-16 overflow-hidden rounded-md border border-slate-800 bg-slate-900">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={img.dataUrl} alt={img.name} title={img.name} className="h-full w-full object-cover" />
              <button
                onClick={() => remove(img.id)}
                aria-label={`Remove ${img.name}`}
                className="absolute right-0.5 top-0.5 rounded-full bg-slate-950/80 p-0.5 text-slate-200 opacity-90 hover:bg-red-600 hover:text-white"
              >
                <X className="h-3 w-3" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <label className={clsx("mt-2.5 flex items-start gap-2 text-xs", hasBrandBook ? "cursor-pointer text-slate-300" : "cursor-not-allowed text-slate-600")}>
        <input
          type="checkbox"
          className="mt-0.5 h-3.5 w-3.5 accent-emerald-500"
          checked={saveToBook && hasBrandBook}
          disabled={!hasBrandBook}
          onChange={(e) => onSaveToBookChange(e.target.checked)}
        />
        <span>
          Save reference image to active Brand Book assets
          <span className="block text-[11px] text-slate-500">
            {hasBrandBook ? `Stored in “${brandBookName}” when you generate, so future blasts reuse it.` : "Select a brand book above to enable."}
          </span>
        </span>
      </label>
    </div>
  );
}
