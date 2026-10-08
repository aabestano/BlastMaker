"use client";

import { useEffect, useState } from "react";
import { Sidebar } from "./Sidebar";
import { SettingsModal } from "./SettingsModal";
import { BrandBooks } from "./BrandBooks";
import { BlastGenerator } from "./BlastGenerator";
import { BlastRepository } from "./BlastRepository";
import { ToastProvider } from "./ui";
import { useStore } from "@/lib/store";
import type { MailerProvider } from "@/lib/types";

export interface ServerStatus {
  gemini: boolean;
  geminiModel: string | null;
  mailers: Record<MailerProvider, boolean>;
}

export function AppShell() {
  const [hydrated, setHydrated] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [status, setStatus] = useState<ServerStatus | null>(null);
  const activeTab = useStore((s) => s.activeTab);
  const theme = useStore((s) => s.theme);

  useEffect(() => {
    document.documentElement.className = theme === "light" ? "light" : "dark";
  }, [theme]);

  useEffect(() => {
    Promise.resolve(useStore.persist.rehydrate()).finally(() => setHydrated(true));
    fetch("/api/status")
      .then((r) => r.json())
      .then(setStatus)
      .catch(() => setStatus(null));
  }, []);

  return (
    <ToastProvider>
      <div className="flex min-h-screen flex-col bg-slate-950 md:h-screen md:flex-row md:overflow-hidden">
        <Sidebar status={status} onOpenSettings={() => setSettingsOpen(true)} />
        <main className="min-w-0 flex-1 md:h-screen md:overflow-hidden">
          {!hydrated ? (
            <div className="flex h-full items-center justify-center p-10 text-sm text-slate-500">Loading workspace…</div>
          ) : (
            <>
              {activeTab === "brands" && <BrandBooks />}
              {activeTab === "generator" && <BlastGenerator status={status} onOpenSettings={() => setSettingsOpen(true)} />}
              {activeTab === "repository" && <BlastRepository />}
            </>
          )}
        </main>
      </div>
      {settingsOpen && <SettingsModal status={status} onClose={() => setSettingsOpen(false)} />}
    </ToastProvider>
  );
}
