export type AssetKind = "pdf" | "image" | "template" | "cdn-url";

export interface BrandTokens {
  primary?: string;
  secondary?: string;
  accent?: string;
  canvasBg?: string;
  containerBg?: string;
  fontFamily?: string;
}

export interface BrandBook {
  id: string;
  name: string;
  createdAt: number;
  tokens?: BrandTokens;
}

export type Theme = "light" | "dark";

export interface ReferenceImage {
  id: string;
  name: string;
  mime: "image/png" | "image/jpeg";
  /** base64 data URL (downscaled) */
  dataUrl: string;
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

export interface SectionRevision {
  /** Marker name, e.g. "HERO BANNER" */
  section: string;
  instruction: string;
}

export interface GenerateBlastRequest {
  blueprint: string;
  brandName?: string;
  assets?: BrandAsset[];
  directives?: string;
  /** Brand book colour / font tokens used to resolve {{BRAND_*}} placeholders */
  brandTokens?: BrandTokens;
  /** Reference screenshots passed to Gemini as inline multimodal image parts */
  referenceImages?: { name?: string; mime: string; dataUrl: string }[];
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
