export type AssetKind = "pdf" | "image" | "template" | "cdn-url";

export interface BrandBook {
  id: string;
  name: string;
  createdAt: number;
}

export interface BrandAsset {
  id: string;
  bookId: string;
  kind: AssetKind;
  name: string;
  mime?: string;
  size?: number;
  /** base64 data URL for PDFs and (downscaled) images */
  dataUrl?: string;
  /** text content for TXT / HTML templates */
  text?: string;
  /** CDN URL for cdn-url assets */
  url?: string;
  /** e.g. Logo, Hero Banner */
  role?: string;
  /** free-form usage directive */
  directive?: string;
  createdAt: number;
}

export type BlastCategory = "Promotional" | "Educational" | "Seasonal";

export const BLAST_CATEGORIES: BlastCategory[] = ["Promotional", "Educational", "Seasonal"];

export interface SavedBlast {
  id: string;
  name: string;
  subject: string;
  category: BlastCategory;
  brandBookId: string | null;
  brandBookName: string;
  mjml: string;
  html: string;
  blueprint: string;
  createdAt: number;
  updatedAt: number;
}

export type MailerProvider = "resend" | "sendgrid" | "mandrill";

export interface Settings {
  geminiApiKey: string;
  geminiModel: string;
  mailerProvider: MailerProvider;
  mailerApiKey: string;
  fromName: string;
  fromEmail: string;
  testRecipient: string;
}

export type ViewMode = "preview" | "mjml" | "html";
export type TabId = "brands" | "generator" | "repository";

export interface Workspace {
  blueprint: string;
  brandBookId: string | null;
  directives: string;
  mjml: string;
  html: string;
  viewMode: ViewMode;
  source: "gemini" | "fallback" | "manual" | null;
  warnings: string[];
}

export const BLAST_SECTIONS = ["Header", "Hero", "Value Grid", "CTA", "Footer"] as const;
export type BlastSection = (typeof BLAST_SECTIONS)[number];

export interface SectionRevision {
  section: BlastSection;
  instruction: string;
}

export interface GenerateBlastRequest {
  blueprint: string;
  brandName?: string;
  assets?: BrandAsset[];
  directives?: string;
  model?: string;
  apiKey?: string;
  revision?: {
    previousMjml: string;
    sections: SectionRevision[];
  };
}

export interface BlastResponse {
  mjml: string;
  html: string;
  warnings: string[];
  source: "gemini" | "fallback";
  model?: string;
}

export const GEMINI_MODELS = [
  { id: "gemini-2.5-flash", label: "Gemini 2.5 Flash" },
  { id: "gemini-3-flash-preview", label: "Gemini 3 Flash" },
  { id: "gemini-2.5-pro", label: "Gemini 2.5 Pro" },
];

export function modelLabel(id: string): string {
  return GEMINI_MODELS.find((m) => m.id === id)?.label ?? id;
}
