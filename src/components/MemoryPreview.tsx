// Lesbare Vorschau einer Notiz — Klick auf eine Karte oeffnet dieses Panel
// statt direkt den Editor. Der komplette Text, sauber formatiert, mit der
// klickbaren Quelle zurueck zur Original-Datei bzw. zum Weblink. Bearbeiten
// uebergibt an den bestehenden Editor.
import { useEffect, useState } from "react";
import { motion } from "motion/react";
import { formatDistanceToNow } from "date-fns";
import { Memory } from "../types";
import { FileText, ExternalLink, EditPen, Copy, Check, Lock, Bot } from "../lib/icons";
import { useToast } from "./ui/Toast";
import { TYP_BESCHREIBUNG } from "../lib/graphHierarchy";
import { t } from "../lib/uiText";
import { inhaltOhneQuelle, oeffneQuelle, parseChunkTitel, parseQuelle } from "../lib/quelle";

interface MemoryPreviewProps {
  memory: Memory;
  onClose: () => void;
  onEdit: (m: Memory) => void;
}

// Die vier Rechen-Arten haben keinen Korb-Namen mehr in der Flaeche — was
// hier steht, ist dieselbe Beschreibung wie im Editor und in der Liste.
const TYPE_LABEL = TYP_BESCHREIBUNG;

export function MemoryPreview({ memory, onClose, onEdit }: MemoryPreviewProps) {
  const toast = useToast();
  const [kopiert, setKopiert] = useState(false);
  const quelle = parseQuelle(memory);
  const chunk = parseChunkTitel(memory.title);
  const text = inhaltOhneQuelle(memory.content) || memory.content;
  const artLabel = memory.type ? TYPE_LABEL[memory.type] ?? memory.type : "Note";
  const privat = memory.scope === "private";
  // Which AI apps read this note, how often, when last — from the audit log.
  const [leser, setLeser] = useState<{ who: string; times: number; last: number }[]>([]);
  useEffect(() => {
    let vorbei = false;
    fetch(`/api/memories/${encodeURIComponent(memory.id)}/readers`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { readers?: { who: string; times: number; last: number }[] } | null) => {
        if (!vorbei && d && Array.isArray(d.readers)) setLeser(d.readers);
      })
      .catch(() => undefined);
    return () => { vorbei = true; };
  }, [memory.id]);

  const texteKopieren = async () => {
    try {
      await navigator.clipboard.writeText(`${memory.title}\n\n${text}`);
      setKopiert(true);
      setTimeout(() => setKopiert(false), 1600);
    } catch { /* Clipboard verweigert — still halten */ }
  };

  const quelleOeffnen = async () => {
    if (!quelle) return;
    const ok = await oeffneQuelle(quelle);
    if (!ok) {
      toast.push({
        message: quelle.art === "url"
          ? "Link could not be opened."
          : "File could not be opened — it may have moved or been deleted.",
        kind: "warn",
      });
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="absolute inset-0 hud-backdrop"
        onClick={onClose}
      />

      <motion.div
        initial={{ x: "100%", opacity: 0.5 }}
        animate={{ x: 0, opacity: 1 }}
        exit={{ x: "100%", opacity: 0.5 }}
        transition={{ type: "spring", damping: 25, stiffness: 200 }}
        className="relative w-full max-w-2xl h-full flex flex-col z-10 glass-strong"
        style={{ borderLeft: "1px solid var(--border-subtle)" }}
        data-testid="memory-preview"
      >
        <header className="flex items-start justify-between gap-3 p-5 pb-4 shrink-0" style={{ borderBottom: "1px solid var(--border-subtle)" }}>
          <div className="min-w-0">
            <h2 className="text-[17px] font-semibold leading-snug break-words" style={{ color: "var(--text-1)" }}>
              {memory.title || "Untitled"}
            </h2>
            <div className="flex items-center flex-wrap gap-x-2.5 gap-y-1 mt-1.5 text-[11px]" style={{ color: "var(--text-3)" }}>
              <span>{artLabel}</span>
              <span>·</span>
              <span>{formatDistanceToNow(new Date(memory.updatedAt), { addSuffix: true })}</span>
              {chunk && (
                <>
                  <span>·</span>
                  <span className="tnum" title="This file was imported in chunks">{t("preview.part")} {chunk.nr}/{chunk.von}</span>
                </>
              )}
              {typeof memory.confidence === "number" && (
                <>
                  <span>·</span>
                  <span className="tnum">{t("preview.confidence")} {Math.round(memory.confidence * 100)}%</span>
                </>
              )}
              {privat && (
                <>
                  <span>·</span>
                  <span className="inline-flex items-center gap-1" style={{ color: "var(--accent)" }}><Lock className="w-3 h-3" /> Private</span>
                </>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            className="btn-ghost px-2 py-1 rounded-lg text-[11px] shrink-0"
            aria-label="Close preview"
          >
            {t("preview.close")}
          </button>
        </header>

        <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4">
          {(privat || leser.length > 0) && (
            <div data-testid="preview-readers" className="mb-4 text-[12px] flex items-start gap-2 rounded-xl px-3 py-2" style={{ background: "var(--bg-inset)", color: "var(--text-2)" }}>
              {privat ? <Lock className="w-3.5 h-3.5 mt-px shrink-0" style={{ color: "var(--accent)" }} /> : <Bot className="w-3.5 h-3.5 mt-px shrink-0" style={{ color: "var(--accent)" }} />}
              <span>
                {privat
                  ? "Private — AI apps and cloud AI never see this note."
                  : `Read by AI apps: ${leser.map((l) => `${l.who} ${l.times}× (last ${formatDistanceToNow(new Date(l.last), { addSuffix: true })})`).join(", ")}`}
              </span>
            </div>
          )}
          {/* Quelle zuerst — der Weg zurück zur Herkunft ist der häufigste Griff */}
          {quelle && (
            <div className="mb-4">
              <button
                onClick={() => void quelleOeffnen()}
                className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-left border hover:border-[var(--accent)] transition-colors group"
                style={{ background: "var(--bg-inset)", borderColor: "var(--border-subtle)" }}
                data-testid="preview-open-source"
                title={quelle.art === "datei"
                  ? `Open file: ${quelle.pfad}`
                  : quelle.art === "url"
                    ? `Open link: ${quelle.url}`
                    : `Imported from inbox: ${quelle.name}`}
              >
                <FileText className="w-4 h-4 shrink-0" style={{ color: "var(--accent)" }} />
                <span className="min-w-0 flex-1">
                  <span className="block text-[13px] font-medium truncate" style={{ color: "var(--text-1)" }}>
                    {quelle.name}
                  </span>
                  <span className="block text-[11px] truncate" style={{ color: "var(--text-3)" }}>
                    {quelle.art === "datei" ? quelle.pfad : quelle.art === "url" ? quelle.url : `Imported from inbox · ${quelle.name}`}
                  </span>
                </span>
                {quelle.art !== "inbox" && (
                  <span className="shrink-0 text-[11px] font-medium flex items-center gap-1 opacity-70 group-hover:opacity-100" style={{ color: "var(--accent)" }}>
                    {quelle.art === "url" ? <ExternalLink className="w-3.5 h-3.5" /> : <FileText className="w-3.5 h-3.5" />}
                    {t("preview.open")}
                  </span>
                )}
              </button>
            </div>
          )}

          {/* Der komplette Text, Absatz fuer Absatz — kein Formular, kein Markup-Zwang */}
          <article className="text-[14px] leading-[1.75] whitespace-pre-wrap break-words" style={{ color: "var(--text-1)" }}>
            {text}
          </article>
        </div>

        <footer className="flex items-center justify-between gap-3 p-5 pt-4 shrink-0" style={{ borderTop: "1px solid var(--border-subtle)" }}>
          <div className="flex flex-wrap gap-1.5 min-w-0 overflow-hidden">
            {memory.tags.map((tag) => (
              <span
                key={tag}
                className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] font-medium border"
                style={{ color: "var(--text-2)", background: "var(--bg-inset)", borderColor: "var(--border-subtle)" }}
              >
                {tag}
              </span>
            ))}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => void texteKopieren()}
              className="btn-ghost px-3 py-2 rounded-lg text-[12px] font-medium flex items-center gap-1.5"
              title="Copy the full text to the clipboard"
            >
              {kopiert ? <Check className="w-4 h-4" style={{ color: "var(--accent)" }} /> : <Copy className="w-4 h-4" />}
              {kopiert ? t("preview.copied") : t("preview.copyText")}
            </button>
            <button
              onClick={() => onEdit(memory)}
              className="btn-ghost px-3 py-2 rounded-lg text-[12px] font-medium flex items-center gap-1.5"
              style={{ border: "1px solid var(--border-subtle)", color: "var(--accent)" }}
            >
              <EditPen className="w-4 h-4" />
              {t("preview.edit")}
            </button>
          </div>
        </footer>
      </motion.div>
    </div>
  );
}
