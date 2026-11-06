// Lesbare Vorschau einer Notiz — Klick auf eine Karte oeffnet dieses Panel
// statt direkt den Editor. Der komplette Text, sauber formatiert, mit der
// klickbaren Quelle zurueck zur Original-Datei bzw. zum Weblink. Bearbeiten
// uebergibt an den bestehenden Editor.
import { useEffect, useRef, useState } from "react";
import { motion } from "motion/react";
import { formatDistanceToNow } from "date-fns";
import { Memory } from "../types";
import { FileText, ExternalLink, EditPen, Copy, Check, Lock, Bot } from "../lib/icons";
import { useToast } from "./ui/Toast";
import { ApiFehler } from "../lib/api";
import { absage } from "../lib/absage";
import { TYP_BESCHREIBUNG } from "../lib/graphHierarchy";
import { t } from "../lib/uiText";
import { inhaltOhneQuelle, oeffneQuelle, parseChunkTitel, parseQuelle } from "../lib/quelle";
import { QUITTUNG_MS } from "../lib/quittung";

interface MemoryPreviewProps {
  memory: Memory;
  onClose: () => void;
  onEdit: (m: Memory) => void;
}

// Die vier Rechen-Arten haben keinen Korb-Namen mehr in der Flaeche — was
// hier steht, ist dieselbe Beschreibung wie im Editor und in der Liste.
const TYPE_LABEL = TYP_BESCHREIBUNG;

interface Stand {
  id: number;
  memoryId: string;
  title: string;
  content: string;
  createdAt: number;
}

export function MemoryPreview({ memory, onClose, onEdit }: MemoryPreviewProps) {
  const toast = useToast();
  const [kopiert, setKopiert] = useState(false);
  const kopierTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const quelle = parseQuelle(memory);
  const chunk = parseChunkTitel(memory.title);
  const text = inhaltOhneQuelle(memory.content) || memory.content;
  const artLabel = memory.type ? TYPE_LABEL[memory.type] ?? memory.type : "Note";
  const privat = memory.scope === "private";
  // Which AI apps read this note, how often, when last — from the audit log.
  const [leser, setLeser] = useState<{ who: string; times: number; last: number }[]>([]);
  const [leserGrund, setLeserGrund] = useState<string | null>(null);
  // "da" heisst: die Tuer hat geantwortet, auch wenn die Liste leer ist. Nur dann darf die
  // Reihe eine Aussage ueber die Leser machen — "offen" und "fort" tun sie nicht.
  const [leserStand, setLeserStand] = useState<"offen" | "da" | "fort">("offen");
  useEffect(() => {
    let vorbei = false;
    fetch(`/api/memories/${encodeURIComponent(memory.id)}/readers`)
      .then((r) => {
        // Punkt 7, 2.11.: die Reihe verschwand bei einer Absage genauso wie bei der Antwort
        // "niemand" — und "niemand hat das gelesen" ist genau die privacy-Antwort, die ein
        // Nutzer sehen will. Also: Antwort zeigt ihr Ergebnis, Absage zeigt ihren Grund.
        if (!r.ok) {
          if (!vorbei) { setLeserGrund(`Who has read this note — the audit log did not answer (it said ${r.status}).`); setLeserStand("fort"); }
          return null;
        }
        return r.json().catch(() => null);
      })
      .then((d: { readers?: { who: string; times: number; last: number }[] } | null) => {
        if (vorbei) return;
        if (d && Array.isArray(d.readers)) { setLeser(d.readers); setLeserGrund(null); setLeserStand("da"); }
        else { setLeserGrund('Who has read this note — the audit log gave no list.'); setLeserStand("fort"); }
      })
      .catch(() => { if (!vorbei) { setLeserGrund('Who has read this note — the audit log did not answer.'); setLeserStand("fort"); } });
    return () => { vorbei = true; };
  }, [memory.id]);

  // Staende (BAU-P3-11): die Texte VOR den Aenderungen. Ein Klick zeigt den alten Text vollstaendig,
  // "Back to current" geht zurueck. Seit 26.10. gibt es EINEN Schreibweg: "Restore this stand" -
  // zwei Schritte, mit Rueckfrage; der ersetzte Text wird dabei serverseitig als Stand gesichert.
  const [staende, setStaende] = useState<Stand[] | null>(null);
  const [staendeGrund, setStaendeGrund] = useState<string | null>(null);
  const [staendeOffen, setStaendeOffen] = useState(false);
  const [gewaehlterStand, setGewaehlterStand] = useState<Stand | null>(null);
  const [aktuellerInhalt, setAktuellerInhalt] = useState(text);
  const [wiederherstellenOffen, setWiederherstellenOffen] = useState(false);
  const [wiederherstellenLaeuft, setWiederherstellenLaeuft] = useState(false);
  useEffect(() => {
    let vorbei = false;
    setStaende(null);
    setStaendeOffen(false);
    setGewaehlterStand(null);
    setWiederherstellenOffen(false);
    setAktuellerInhalt(inhaltOhneQuelle(memory.content) || memory.content);
    fetch(`/api/memories/${encodeURIComponent(memory.id)}/stande`)
      .then((r) => {
        if (!r.ok) { if (!vorbei) setStaendeGrund(`Earlier versions could not be read — the store answered ${r.status}.`); return null; }
        return r.json().catch(() => null);
      })
      .then((d: { staende?: Stand[] } | null) => {
        if (!vorbei) {
          if (d && Array.isArray(d.staende)) { setStaende(d.staende); setStaendeGrund(null); }
          else setStaendeGrund('Earlier versions could not be read — the store gave no list.');
        }
      })
      .catch(() => { if (!vorbei) setStaendeGrund('Earlier versions could not be read — the store did not answer.'); });
    return () => { vorbei = true; };
  }, [memory.id]);

  // Der eine Schreibweg der Flaeche: erst die Rueckfrage, dann die Tuer. Antwortet sie nicht mit 200,
  // bleibt alles, wie es war - die Warnung sagt es, der Text wird nicht angefasst.
  const standWiederherstellen = async () => {
    if (!gewaehlterStand || wiederherstellenLaeuft) return;
    setWiederherstellenLaeuft(true);
    try {
      const r = await fetch(
        `/api/memories/${encodeURIComponent(memory.id)}/stande/${gewaehlterStand.id}/restore`,
        { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ confirm: "restore" }) },
      );
      // P61: die Antwort der Tuer verliert ihre Zahl nicht mehr in einem grundlosen Fang.
      if (!r.ok) throw new ApiFehler(`HTTP ${r.status}`, r.status);
      const d = (await r.json()) as { memory?: { content?: string } };
      if (typeof d.memory?.content === "string") setAktuellerInhalt(d.memory.content);
      setGewaehlterStand(null);
      setWiederherstellenOffen(false);
      const r2 = await fetch(`/api/memories/${encodeURIComponent(memory.id)}/stande`);
      if (r2.ok) {
        const d2 = (await r2.json()) as { staende?: Stand[] };
        if (Array.isArray(d2.staende)) setStaende(d2.staende);
      }
      toast.push({ message: "Restored. The replaced text is kept as an earlier stand.", kind: "success" });
    } catch (e: unknown) {
      // P61: derselbe Satz, aber mit dem Grund, den die Tuer gab — oder mit der Stille, wenn
      // niemand antwortete. Beides entscheidet src/lib/absage.ts, nicht diese Zeile.
      toast.push({ message: absage("Restore failed. Nothing was changed.", e), kind: "warn" });
    } finally {
      setWiederherstellenLaeuft(false);
    }
  };

  const texteKopieren = async () => {
    try {
      await navigator.clipboard.writeText(`${memory.title}\n\n${text}`);
      if (kopierTimer.current) clearTimeout(kopierTimer.current);
      setKopiert(true);
      kopierTimer.current = setTimeout(() => { setKopiert(false); kopierTimer.current = null; }, QUITTUNG_MS);
    } catch {
      // Dieselbe Kante wie der Chat in 3.2.129: eine verweigerte Zwischenablage ist ein
      // Ereignis, das der Nutzer sieht. "bleibt ruhig" war der Defekt, nicht der Entwurf.
      toast.push({ message: "Copying failed — the window did not get the clipboard.", kind: "warn" });
    }
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
            <h2 className="fs-5 font-semibold lh-dicht break-words" style={{ color: "var(--text-1)" }}>
              {memory.title || "Untitled"}
            </h2>
            <div className="flex items-center flex-wrap gap-x-3 gap-y-1 mt-2 fs-1" style={{ color: "var(--text-3)" }}>
              <span>{artLabel}</span>
              <span>·</span>
              <span>{formatDistanceToNow(new Date(memory.updatedAt), { addSuffix: true })}</span>
              {chunk && (
                <>
                  <span>·</span>
                  <span className="tnum" title="This file came in as separate pieces">{t("preview.part")} {chunk.nr}/{chunk.von}</span>
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
            className="btn-ghost px-2 py-1 rounded-lg fs-1 shrink-0"
            aria-label="Close preview"
          >
            {t("preview.close")}
          </button>
        </header>

        <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4">
          {(privat || leserStand !== "offen") && (
            <div data-testid="preview-readers" className="mb-4 fs-2 flex items-start gap-2 rounded-xl px-3 py-2" style={{ background: "var(--bg-inset)", color: "var(--text-2)" }}>
              {privat ? <Lock className="w-3.5 h-3.5 mt-px shrink-0" style={{ color: "var(--accent)" }} /> : <Bot className="w-3.5 h-3.5 mt-px shrink-0" style={{ color: "var(--accent)" }} />}
              <span>
                {privat
                  ? "Private — AI apps and cloud AI never see this note."
                  : leserGrund
                    ? leserGrund
                    : leser.length === 0
                      ? "No AI app has read this note."
                      : `Read by AI apps: ${leser.map((l) => `${l.who} ${l.times}× (last ${formatDistanceToNow(new Date(l.last), { addSuffix: true })})`).join(", ")}`}
              </span>
            </div>
          )}
          {/* Quelle zuerst — der Weg zurück zur Herkunft ist der häufigste Griff */}
          {quelle && (
            <div className="mb-4">
              <button
                onClick={() => void quelleOeffnen()}
                className="w-full flex items-center gap-3 px-3 py-3 rounded-xl text-left border hover:border-[var(--accent)] transition-colors group"
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
                  <span className="block fs-3 font-semibold truncate" style={{ color: "var(--text-1)" }}>
                    {quelle.name}
                  </span>
                  <span className="block fs-1 truncate" style={{ color: "var(--text-3)" }}>
                    {quelle.art === "datei" ? quelle.pfad : quelle.art === "url" ? quelle.url : `Imported from inbox · ${quelle.name}`}
                  </span>
                </span>
                {quelle.art !== "inbox" && (
                  <span className="shrink-0 fs-1 font-semibold flex items-center gap-1 opacity-70 group-hover:opacity-100" style={{ color: "var(--accent)" }}>
                    {quelle.art === "url" ? <ExternalLink className="w-3.5 h-3.5" /> : <FileText className="w-3.5 h-3.5" />}
                    {t("preview.open")}
                  </span>
                )}
              </button>
            </div>
          )}

          {/* Der komplette Text, Absatz fuer Absatz — kein Formular, kein Markup-Zwang */}
          {staendeGrund && (
            <p role="status" data-testid="preview-staende-grund" className="fs-2 mb-3" style={{ color: 'var(--warn)' }}>{staendeGrund}</p>
          )}
          {staende !== null && staende.length > 0 && (
            <div data-testid="preview-stands" className="mb-4">
              <button
                onClick={() => setStaendeOffen((v) => !v)}
                className="w-full flex items-center justify-between gap-2 px-3 py-2 rounded-xl fs-2"
                style={{ background: "var(--bg-inset)", color: "var(--text-2)", border: "1px solid var(--border-subtle)" }}
                data-testid="preview-stands-open"
                aria-expanded={staendeOffen}
              >
                <span>Earlier stands ({staende.length})</span>
                <span style={{ color: "var(--text-3)" }}>{staendeOffen ? "Hide" : "Show"}</span>
              </button>
              {staendeOffen && (
                <ul className="mt-2 space-y-1">
                  {staende.map((s) => (
                    <li key={s.id}>
                      <button
                        onClick={() => setGewaehlterStand(s)}
                        className="w-full text-left px-3 py-2 rounded-lg fs-2"
                        style={{ background: gewaehlterStand?.id === s.id ? "var(--bg-inset)" : "transparent", color: "var(--text-2)", border: "1px solid var(--border-subtle)" }}
                        data-testid="preview-stand-row"
                      >
                        <span className="tnum">{formatDistanceToNow(new Date(s.createdAt), { addSuffix: true })}</span>
                        <span className="block truncate" style={{ color: "var(--text-3)" }}>{s.content.replace(/\s+/g, " ").slice(0, 90)}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
          {staende !== null && staende.length === 0 && (
            <p data-testid="preview-stands-none" className="mb-4 fs-2" style={{ color: "var(--text-3)" }}>
              No earlier stands - this note has not been edited since it was written.
            </p>
          )}
          {gewaehlterStand ? (
            <>
              <div
                data-testid="preview-stand-flag"
                className="mb-2 flex flex-wrap items-center justify-between gap-2 rounded-xl px-3 py-2 fs-2"
                style={{ background: "var(--bg-inset)", color: "var(--text-2)" }}
              >
                <span className="min-w-0">
                  Earlier stand - <span className="tnum">{formatDistanceToNow(new Date(gewaehlterStand.createdAt), { addSuffix: true })}</span>
                </span>
                <span className="flex flex-wrap items-center gap-2">
                  <button
                    onClick={() => setWiederherstellenOffen((v) => !v)}
                    className="btn-ghost px-2 py-1 rounded-lg fs-1"
                    data-testid="preview-stand-restore"
                    aria-expanded={wiederherstellenOffen}
                  >
                    Restore this stand
                  </button>
                  <button
                    onClick={() => setGewaehlterStand(null)}
                    className="btn-ghost px-2 py-1 rounded-lg fs-1"
                    data-testid="preview-stand-back"
                  >
                    Back to current
                  </button>
                </span>
              </div>
              {wiederherstellenOffen && (
                <div
                  data-testid="preview-stand-restore-bestaetigung"
                  className="mb-2 rounded-xl px-3 py-2 fs-2"
                  style={{ background: "var(--bg-inset)", color: "var(--text-2)", border: "1px solid var(--border-subtle)" }}
                >
                  <p>Make this version current? The text it replaces stays in the history as an earlier stand.</p>
                  <div className="flex flex-wrap items-center gap-2 mt-2">
                    <button
                      onClick={() => void standWiederherstellen()}
                      className="btn-ghost px-2 py-1 rounded-lg fs-1"
                      style={{ border: "1px solid var(--border-subtle)", color: "var(--accent)" }}
                      data-testid="preview-stand-restore-confirm"
                      disabled={wiederherstellenLaeuft}
                    >
                      Restore to this version
                    </button>
                    <button
                      onClick={() => setWiederherstellenOffen(false)}
                      className="btn-ghost px-2 py-1 rounded-lg fs-1"
                      data-testid="preview-stand-restore-cancel"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
              <article data-testid="preview-stand-text" className="fs-4 lh-prosa whitespace-pre-wrap break-words" style={{ color: "var(--text-1)" }}>
                {gewaehlterStand.content}
              </article>
            </>
          ) : (
            <article data-testid="preview-text" className="fs-4 lh-prosa whitespace-pre-wrap break-words" style={{ color: "var(--text-1)" }}>
              {inhaltOhneQuelle(aktuellerInhalt) || aktuellerInhalt}
            </article>
          )}
        </div>

        <footer className="flex items-center justify-between gap-3 p-5 pt-4 shrink-0" style={{ borderTop: "1px solid var(--border-subtle)" }}>
          <div className="flex flex-wrap gap-2 min-w-0 overflow-hidden">
            {memory.tags.map((tag) => (
              <span
                key={tag}
                className="inline-flex items-center px-2 py-1 rounded-md fs-1 font-semibold border"
                style={{ color: "var(--text-2)", background: "var(--bg-inset)", borderColor: "var(--border-subtle)" }}
              >
                {tag}
              </span>
            ))}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => void texteKopieren()}
              className="btn-ghost px-3 py-2 rounded-lg fs-2 font-semibold flex items-center gap-2"
              title="Copy the full text to the clipboard"
            >
              {kopiert ? <Check className="w-4 h-4" style={{ color: "var(--accent)" }} /> : <Copy className="w-4 h-4" />}
              {kopiert ? t("preview.copied") : t("preview.copyText")}
            </button>
            <button
              onClick={() => onEdit(memory)}
              className="btn-ghost px-3 py-2 rounded-lg fs-2 font-semibold flex items-center gap-2"
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
