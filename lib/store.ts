"use client";

import { create } from "zustand";
import { createJSONStorage, persist, type StateStorage } from "zustand/middleware";
import type {
  BlastCategory,
  BrandAsset,
  BrandBook,
  BrandTokens,
  ReferenceImage,
  SavedBlast,
  Settings,
  TabId,
  Theme,
  ViewMode,
  Workspace,
} from "./types";

export const uid = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2) + Date.now().toString(36);

export const STORAGE_ERROR_EVENT = "brand-engine:storage-error";

const safeStorage: StateStorage = {
  getItem: (name) => localStorage.getItem(name),
  setItem: (name, value) => {
    try {
      localStorage.setItem(name, value);
    } catch {
      window.dispatchEvent(
        new CustomEvent(STORAGE_ERROR_EVENT, {
          detail: "Browser storage is full. Delete large PDFs or screenshots from your brand books to keep saving.",
        }),
      );
    }
  },
  removeItem: (name) => localStorage.removeItem(name),
};

export const DEFAULT_SETTINGS: Settings = {
  geminiApiKey: "",
  geminiModel: "gemini-2.5-flash",
  mailerProvider: "resend",
  mailerApiKey: "",
  fromName: "",
  fromEmail: "",
  testRecipient: "",
};

const EMPTY_WORKSPACE: Workspace = {
  blueprint: "",
  brandBookId: null,
  directives: "",
  mjml: "",
  html: "",
  viewMode: "preview",
  source: null,
  warnings: [],
};

interface AppState {
  theme: Theme;
  referenceImages: ReferenceImage[];
  activeTab: TabId;
  brandBooks: BrandBook[];
  assets: BrandAsset[];
  blasts: SavedBlast[];
  settings: Settings;
  workspace: Workspace;

  setTab: (tab: TabId) => void;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
  updateBrandTokens: (bookId: string, tokens: BrandTokens) => void;
  addReferenceImage: (image: Omit<ReferenceImage, "id">) => ReferenceImage;
  removeReferenceImage: (id: string) => void;
  clearReferenceImages: () => void;
  createBrandBook: (name: string) => BrandBook;
  deleteBrandBook: (id: string) => void;
  addAsset: (asset: Omit<BrandAsset, "id" | "createdAt">) => BrandAsset;
  updateAsset: (id: string, patch: Partial<BrandAsset>) => void;
  deleteAsset: (id: string) => void;
  saveBlast: (blast: Omit<SavedBlast, "id" | "createdAt" | "updatedAt">) => SavedBlast;
  updateBlast: (id: string, patch: Partial<Pick<SavedBlast, "html" | "mjml" | "name" | "subject" | "category">>) => void;
  deleteBlast: (id: string) => void;
  updateSettings: (patch: Partial<Settings>) => void;
  updateWorkspace: (patch: Partial<Workspace>) => void;
  setViewMode: (mode: ViewMode) => void;
  resetWorkspace: () => void;
}

export const useStore = create<AppState>()(
  persist(
    (set, get) => ({
      theme: "dark",
      referenceImages: [],
      activeTab: "brands",
      brandBooks: [],
      assets: [],
      blasts: [],
      settings: DEFAULT_SETTINGS,
      workspace: EMPTY_WORKSPACE,

      setTab: (activeTab) => set({ activeTab }),
      setTheme: (theme) => set({ theme }),
      toggleTheme: () => set((s) => ({ theme: s.theme === "dark" ? "light" : "dark" })),

      updateBrandTokens: (bookId, tokens) =>
        set((s) => ({
          brandBooks: s.brandBooks.map((b) => (b.id === bookId ? { ...b, tokens: { ...b.tokens, ...tokens } } : b)),
        })),

      addReferenceImage: (image) => {
        const full: ReferenceImage = { ...image, id: uid() };
        set((s) => ({ referenceImages: [...s.referenceImages.slice(-2), full] }));
        return full;
      },
      removeReferenceImage: (id) => set((s) => ({ referenceImages: s.referenceImages.filter((r) => r.id !== id) })),
      clearReferenceImages: () => set({ referenceImages: [] }),

      createBrandBook: (name) => {
        const trimmed = name.trim();
        const existing = get().brandBooks.find((b) => b.name.toLowerCase() === trimmed.toLowerCase());
        if (existing) return existing;
        const book: BrandBook = { id: uid(), name: trimmed, createdAt: Date.now() };
        set((s) => ({ brandBooks: [...s.brandBooks, book] }));
        return book;
      },

      deleteBrandBook: (id) =>
        set((s) => ({
          brandBooks: s.brandBooks.filter((b) => b.id !== id),
          assets: s.assets.filter((a) => a.bookId !== id),
          workspace: s.workspace.brandBookId === id ? { ...s.workspace, brandBookId: null } : s.workspace,
        })),

      addAsset: (asset) => {
        const full: BrandAsset = { ...asset, id: uid(), createdAt: Date.now() };
        set((s) => ({ assets: [...s.assets, full] }));
        return full;
      },

      updateAsset: (id, patch) =>
        set((s) => ({ assets: s.assets.map((a) => (a.id === id ? { ...a, ...patch } : a)) })),

      deleteAsset: (id) => set((s) => ({ assets: s.assets.filter((a) => a.id !== id) })),

      saveBlast: (blast) => {
        const now = Date.now();
        const full: SavedBlast = { ...blast, id: uid(), createdAt: now, updatedAt: now };
        set((s) => ({ blasts: [full, ...s.blasts] }));
        return full;
      },

      updateBlast: (id, patch) =>
        set((s) => ({
          blasts: s.blasts.map((b) => (b.id === id ? { ...b, ...patch, updatedAt: Date.now() } : b)),
        })),

      deleteBlast: (id) => set((s) => ({ blasts: s.blasts.filter((b) => b.id !== id) })),

      updateSettings: (patch) => set((s) => ({ settings: { ...s.settings, ...patch } })),
      updateWorkspace: (patch) => set((s) => ({ workspace: { ...s.workspace, ...patch } })),
      setViewMode: (viewMode) => set((s) => ({ workspace: { ...s.workspace, viewMode } })),
      resetWorkspace: () => set({ workspace: EMPTY_WORKSPACE }),
    }),
    {
      name: "brand-engine-app2-v1",
      version: 1,
      storage: createJSONStorage(() => safeStorage),
      skipHydration: true,
      partialize: (s) => ({
        theme: s.theme,
        activeTab: s.activeTab,
        brandBooks: s.brandBooks,
        assets: s.assets,
        blasts: s.blasts,
        settings: s.settings,
        workspace: s.workspace,
      }),
    },
  ),
);

/** Promo = emerald #10B981, Non-promo = purple #6366F1, Seasonal = amber #F59E0B. */
export const CATEGORY_STYLES: Record<BlastCategory, string> = {
  Promotional: "border-emerald-500/50 bg-emerald-500/10 text-emerald-400",
  Educational: "border-indigo-500/50 bg-indigo-500/10 text-indigo-400",
  Seasonal: "border-amber-500/50 bg-amber-500/10 text-amber-400",
};

export const CATEGORY_LABELS: Record<BlastCategory, string> = {
  Promotional: "Promotional",
  Educational: "Educational",
  Seasonal: "Seasonal",
};
