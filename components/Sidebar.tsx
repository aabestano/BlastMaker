"use client";

import { Boxes, Library, Mail, Moon, Settings2, Sparkles, Sun, Zap } from "lucide-react";
import clsx from "clsx";
import { useStore } from "@/lib/store";
import { modelLabel, type TabId } from "@/lib/types";
import type { ServerStatus } from "./AppShell";

const NAV: { id: TabId; label: string; hint: string; icon: typeof Boxes }[] = [
  { id: "brands", label: "Brand Books", hint: "Assets & CDN presets", icon: Library },
  { id: "generator", label: "Blast Generator", hint: "Blueprint to MJML", icon: Sparkles },
  { id: "repository", label: "Blast Repository", hint: "Saved blasts", icon: Boxes },
];

export function Sidebar({ status, onOpenSettings }: { status: ServerStatus | null; onOpenSettings: () => void }) {
  const activeTab = useStore((s) => s.activeTab);
  const setTab = useStore((s) => s.setTab);
  const settings = useStore((s) => s.settings);
  const blastCount = useStore((s) => s.blasts.length);
  const bookCount = useStore((s) => s.brandBooks.length);
  const theme = useStore((s) => s.theme);
  const toggleTheme = useStore((s) => s.toggleTheme);

  const geminiReady = !!settings.geminiApiKey || !!status?.gemini;
  const mailerReady = !!settings.mailerApiKey || !!status?.mailers[settings.mailerProvider];
  const model = settings.geminiModel || status?.geminiModel || "gemini-2.5-flash";

  return (
    <aside className="sidebar-scope flex w-full shrink-0 flex-col border-b border-slate-800 bg-slate-950 md:h-screen md:w-64 md:border-b-0 md:border-r">
      <div className="flex items-center gap-2.5 border-b border-slate-800 px-4 py-4">
        <div className="flex h-8 w-8 items-center justify-center rounded-md bg-gradient-to-br from-blue-500 to-emerald-500">
          <Mail className="h-4 w-4 text-white" />
        </div>
        <div className="min-w-0 flex-1 leading-tight">
          <div className="text-sm font-semibold text-slate-100">Brand Engine</div>
          <div className="text-[11px] text-slate-500">
            <span className="text-emerald-400">·</span> App 2
          </div>
        </div>
        <button
          onClick={toggleTheme}
          role="switch"
          aria-checked={theme === "light"}
          aria-label={theme === "light" ? "Switch to dark mode" : "Switch to light mode"}
          title={theme === "light" ? "Switch to dark mode" : "Switch to light mode"}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-slate-800 bg-slate-950 text-slate-300 transition hover:bg-slate-900 hover:text-white"
        >
          {theme === "light" ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
        </button>
      </div>

      <nav className="flex gap-1 overflow-x-auto p-2 md:flex-1 md:flex-col md:overflow-visible" aria-label="Primary">
        {NAV.map((item, i) => {
          const Icon = item.icon;
          const active = activeTab === item.id;
          const count = item.id === "brands" ? bookCount : item.id === "repository" ? blastCount : null;
          return (
            <button
              key={item.id}
              onClick={() => setTab(item.id)}
              aria-current={active ? "page" : undefined}
              className={clsx(
                "group flex min-w-fit items-center gap-3 rounded-md border px-3 py-2.5 text-left transition",
                active
                  ? "border-blue-500/40 bg-blue-500/10 text-white"
                  : "border-transparent text-slate-400 hover:bg-slate-900 hover:text-slate-200",
              )}
            >
              <Icon className={clsx("h-4 w-4 shrink-0", active ? "text-blue-400" : "text-slate-500 group-hover:text-slate-300")} />
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium">
                  <span className="mr-1.5 text-slate-600">{i + 1}.</span>
                  {item.label}
                </span>
                <span className="hidden text-[11px] text-slate-500 md:block">{item.hint}</span>
              </span>
              {count !== null && count > 0 && (
                <span className="rounded-full border border-slate-700 bg-slate-900 px-1.5 text-[11px] text-slate-300">{count}</span>
              )}
            </button>
          );
        })}
      </nav>

      <div className="border-t border-slate-800 p-3">
        <button
          onClick={onOpenSettings}
          className="w-full rounded-md border border-slate-800 bg-slate-900 p-3 text-left transition hover:border-slate-700 hover:bg-slate-800/70"
        >
          <div className="mb-2 flex items-center gap-2 text-sm font-medium text-slate-200">
            <Settings2 className="h-4 w-4 text-slate-400" /> API &amp; Mail Settings
          </div>
          <dl className="space-y-1.5 text-[11px]">
            <div className="flex items-center justify-between gap-2">
              <dt className="flex items-center gap-1 text-slate-500">
                <Zap className="h-3 w-3" /> Gemini
              </dt>
              <dd className="flex min-w-0 items-center gap-1.5 text-slate-300">
                <span className="truncate">{modelLabel(model)}</span>
                <span
                  title={geminiReady ? "API key configured" : "No API key — offline template mode"}
                  className={clsx("h-1.5 w-1.5 shrink-0 rounded-full", geminiReady ? "bg-emerald-400" : "bg-amber-400")}
                />
              </dd>
            </div>
            <div className="flex items-center justify-between gap-2">
              <dt className="flex items-center gap-1 text-slate-500">
                <Mail className="h-3 w-3" /> Mailer
              </dt>
              <dd className="flex items-center gap-1.5 text-slate-300">
                <span className="capitalize">{settings.mailerProvider}</span>
                <span className={clsx("rounded px-1 text-[10px] font-medium", mailerReady ? "bg-emerald-500/15 text-emerald-300" : "bg-amber-500/15 text-amber-300")}>
                  {mailerReady ? "Ready" : "Not set"}
                </span>
              </dd>
            </div>
          </dl>
        </button>
      </div>
    </aside>
  );
}
