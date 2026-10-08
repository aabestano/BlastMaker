"use client";

import { useState } from "react";
import { Save, Send } from "lucide-react";
import clsx from "clsx";
import { Modal, Spinner, useToast } from "./ui";
import { useStore } from "@/lib/store";
import { postJson } from "@/lib/client-utils";
import { BLAST_CATEGORIES, type BlastCategory } from "@/lib/types";
import { extractSubject } from "@/lib/html";

export function SendTestModal({ html, mjml, onClose }: { html: string; mjml: string; onClose: () => void }) {
  const settings = useStore((s) => s.settings);
  const toast = useToast();
  const [to, setTo] = useState(settings.testRecipient);
  const [subject, setSubject] = useState(extractSubject(mjml || html) || "Test email");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const send = async () => {
    setSending(true);
    setError(null);
    try {
      const res = await postJson<{ recipients: string[]; provider: string }>("/api/send-test-email", {
        html,
        subject,
        to,
        provider: settings.mailerProvider,
        apiKey: settings.mailerApiKey,
        fromName: settings.fromName,
        fromEmail: settings.fromEmail,
      });
      toast(`Test sent via ${res.provider} to ${res.recipients.join(", ")}.`, "success");
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sending failed.");
    } finally {
      setSending(false);
    }
  };

  return (
    <Modal
      title="Send test email"
      description={`Sent from the server via ${settings.mailerProvider}. Merge tags are replaced with sample values.`}
      onClose={onClose}
      footer={
        <>
          <button className="btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn-primary" onClick={send} disabled={sending || !to.trim()}>
            {sending ? <Spinner /> : <Send className="h-4 w-4" />} Send test
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <div>
          <label className="label" htmlFor="test-to">Recipient(s)</label>
          <input id="test-to" className="input" type="text" placeholder="you@company.com, teammate@company.com" value={to} onChange={(e) => setTo(e.target.value)} />
          <p className="mt-1 text-xs text-slate-500">Separate multiple addresses with commas (max 10).</p>
        </div>
        <div>
          <label className="label" htmlFor="test-subject">Subject</label>
          <input id="test-subject" className="input" value={subject} onChange={(e) => setSubject(e.target.value)} />
        </div>
        {error && <p role="alert" className="alert-error">{error}</p>}
      </div>
    </Modal>
  );
}

export function SaveBlastModal({
  mjml,
  html,
  blueprint,
  brandBookId,
  onClose,
}: {
  mjml: string;
  html: string;
  blueprint: string;
  brandBookId: string | null;
  onClose: () => void;
}) {
  const saveBlast = useStore((s) => s.saveBlast);
  const books = useStore((s) => s.brandBooks);
  const setTab = useStore((s) => s.setTab);
  const toast = useToast();
  const initialSubject = extractSubject(mjml || html);
  const [name, setName] = useState(initialSubject || "Untitled blast");
  const [subject, setSubject] = useState(initialSubject);
  const [category, setCategory] = useState<BlastCategory>("Promotional");

  const save = () => {
    const book = books.find((b) => b.id === brandBookId);
    saveBlast({
      name: name.trim() || "Untitled blast",
      subject: subject.trim(),
      category,
      brandBookId: book?.id ?? null,
      brandBookName: book?.name ?? "No brand book",
      mjml,
      html,
      blueprint,
    });
    toast("Blast saved to the repository.", "success");
    onClose();
  };

  return (
    <Modal
      title="Save blast"
      description="Store this blast in the repository so you can edit, download, or reuse it later."
      onClose={onClose}
      footer={
        <>
          <button className="btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn-success" onClick={save}>
            <Save className="h-4 w-4" /> Save blast
          </button>
          <button
            className="btn-ghost"
            onClick={() => {
              save();
              setTab("repository");
            }}
          >
            Save &amp; open repository
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <div>
          <label className="label" htmlFor="save-name">Blast name</label>
          <input id="save-name" className="input" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div>
          <label className="label" htmlFor="save-subject">Subject line</label>
          <input id="save-subject" className="input" value={subject} onChange={(e) => setSubject(e.target.value)} />
        </div>
        <div>
          <span className="label">Category</span>
          <div className="grid grid-cols-3 gap-2">
            {BLAST_CATEGORIES.map((c) => (
              <button
                key={c}
                onClick={() => setCategory(c)}
                className={clsx(
                  "rounded-md border px-3 py-2 text-sm transition",
                  category === c ? "border-emerald-500/60 bg-emerald-500/10 text-emerald-200" : "border-slate-800 bg-slate-900 text-slate-300 hover:border-slate-700",
                )}
              >
                {c}
              </button>
            ))}
          </div>
        </div>
      </div>
    </Modal>
  );
}
