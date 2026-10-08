"use client";

import { forwardRef, useMemo, useState } from "react";
import { Monitor, Smartphone } from "lucide-react";
import clsx from "clsx";
import { applyPreviewMergeTags } from "@/lib/html";

export const EmailPreview = forwardRef<HTMLIFrameElement, { html: string; title?: string; showDeviceToggle?: boolean; className?: string }>(
  function EmailPreview({ html, title = "Email preview", showDeviceToggle = true, className }, ref) {
    const [device, setDevice] = useState<"desktop" | "mobile">("desktop");
    const doc = useMemo(() => applyPreviewMergeTags(html), [html]);

    return (
      <div className={clsx("flex min-h-0 flex-col", className)}>
        {showDeviceToggle && (
          <div className="mb-2 flex items-center justify-between text-xs text-slate-500">
            <span>Merge tags are shown with sample values.</span>
            <div className="inline-flex rounded-md border border-slate-800 bg-slate-900 p-0.5">
              {(
                [
                  ["desktop", Monitor],
                  ["mobile", Smartphone],
                ] as const
              ).map(([id, Icon]) => (
                <button
                  key={id}
                  onClick={() => setDevice(id)}
                  aria-label={`${id} preview`}
                  className={clsx("rounded p-1.5", device === id ? "bg-slate-800 text-white" : "text-slate-500 hover:text-slate-200")}
                >
                  <Icon className="h-3.5 w-3.5" />
                </button>
              ))}
            </div>
          </div>
        )}
        <div className="min-h-0 flex-1 overflow-auto rounded-md border border-slate-800 bg-slate-200">
          <iframe
            ref={ref}
            title={title}
            srcDoc={doc}
            sandbox="allow-same-origin allow-modals"
            className={clsx("mx-auto block h-full min-h-[480px] bg-white transition-all", device === "mobile" ? "w-[375px] max-w-full" : "w-full")}
          />
        </div>
      </div>
    );
  },
);
