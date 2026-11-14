// Lesbare Vorschau einer Notiz — Klick auf eine Karte oeffnet dieses Panel
// statt direkt den Editor. Der komplette Text, sauber formatiert, mit der
// klickbaren Quelle zurueck zur Original-Datei bzw. zum Weblink. Bearbeiten
// uebergibt an den bestehenden Editor.
import { useEffect, useRef, useState } from "react";
import { motion } from "motion/react";
import { FEDER_SCHUBLADE } from "../lib/motionTokens";
import { formatDistanceToNow } from "date-fns";
import { Memory } from "../types";
import { EditPen, Copy, Check, Lock, Bot, Trash2 } from "../lib/icons";
import { useToast } from "./ui/Toast";
import { ApiFehler } from "../lib/api";
import { absage } from "../lib/absage";
import { t } from "../lib/uiText";
import { inhaltOhneQuelle, oeffneQuelle, parseChunkTitel, parseQuelle } from "../lib/quelle";
import { kurzeZeit } from "../lib/zeit";
import { QUITTUNG_MS } from "../lib/quittung";

interface MemoryPreviewProps {
  memory: Memory;
  onClose: () => void;
  onEdit: (m: Memory) => void;
  /** P202, Mockup-Grammatik (Bild 4: Copy · Edit · Trash): der Trash wohnt im
      Kopf der Detail-Spalte — die Fläche reicht ihren Löschweg durch. */
  onDelete?: (m: Memory) => void;
  /**
   * P202, App-Fenster-Übernahme: "ohneVorhang" stellt die Vorschau als PANEL
   * in das Knowledge-Fenster (Spalte rechts, kein Overlay, kein Vorhang) —
   * die App-Fenster-Grammatik zeigt die geöffnete Akte NEBEN der Liste, nicht
   * über ihr. Ohne das Prop bleibt alles wie vorher (Schublade über der Fläche).
   */
  ohneVorhang?: boolean;
}


/* P202, Mockup-Meta (k3pta-app-fenster .detail-korper .meta): die Zeile nennt
   die Art mit ihrem KIND-Wort („Fact · md · today 14:22 · saved from md file"),
   die Endung der Quelle als zweites Glied, die kurze Zeit als drittes. */
/** Die Endung der Quelle („md“ aus „md file“, „json“ aus „akten.json“) — das
    zweite Glied der Meta-Zeile. Ohne Quelle steht das Glied nicht. */
function quellEndung(q: { art: string; name: string; pfad?: string; url?: string } | null): string | null {
  if (!q) return null;
  const name = q.name || "";
  const punkt = name.lastIndexOf(".");
  if (punkt > 0 && punkt < name.length - 1) return name.slice(punkt + 1).toLowerCase();
  const wort = name.trim().split(/\s+/)[0] || "";
  return wort ? wort.toLowerCase() : null;
}
/* Die Tag-Pillen tragen im Mockup getönte Farben („#compliance“ blau, „#q3“
   bernstein, „#md“ rot) — deterministisch aus dem Tag-Namen, über die vier
   Art-Farben. Dieselbe Zuordnung überall (die Sidebar, die Zeilen, das Detail). */
const PILLE_FARBEN = [
  { ton: "var(--type-semantic)", flaeche: "color-mix(in srgb, var(--type-semantic) 12%, transparent)" },
  { ton: "var(--type-episodic)", flaeche: "color-mix(in srgb, var(--type-episodic) 12%, transparent)" },
  { ton: "var(--type-reference)", flaeche: "color-mix(in srgb, var(--type-reference) 12%, transparent)" },
  { ton: "var(--type-procedural)", flaeche: "color-mix(in srgb, var(--type-procedural) 12%, transparent)" },
];

interface Stand {
  id: number;
  memoryId: string;
  title: string;
  content: string;
  createdAt: number;
}

export function MemoryPreview({ memory, onClose, onEdit, onDelete, ohneVorhang = false }: MemoryPreviewProps) {
  const toast = useToast();
  const [kopiert, setKopiert] = useState(false);
  const kopierTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const quelle = parseQuelle(memory);
  const endung = quellEndung(quelle);
  const chunk = parseChunkTitel(memory.title);
  const text = inhaltOhneQuelle(memory.content) || memory.content;
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
    <div className={ohneVorhang ? "relative h-full flex justify-end" : "fixed inset-0 z-50 flex justify-end"}>
      {!ohneVorhang && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="absolute inset-0 hud-backdrop"
          onClick={onClose}
        />
      )}

      <motion.div
        initial={ohneVorhang ? { x: 24, opacity: 0 } : { x: "100%", opacity: 0.5 }}
        animate={{ x: 0, opacity: 1 }}
        exit={ohneVorhang ? { x: 24, opacity: 0 } : { x: "100%", opacity: 0.5 }}
        transition={FEDER_SCHUBLADE}
        className={`relative ${ohneVorhang ? "w-full max-w-none" : "w-full max-w-2xl"} h-full flex flex-col z-10 glass-strong`}
        style={{ borderLeft: ohneVorhang ? "1px solid var(--kante-flaeche)" : "1px solid var(--border-subtle)" }}
        data-testid="memory-preview"
      >
        {/* P202, Mockup-Grammatik (detail-kopf): oben stehen Ort und Handlungen —
            der Titel und die Zeile stehen im Körper (wie im Mockup h1 + meta). */}
        <header className="detail-kopf">
          <span className="wo">Private</span>
          <div className="kopf-handlungen">
            {kopiert && <span className="fs-1 shrink-0" style={{ color: 'var(--ok)' }}>{t("preview.copied")}</span>}
            <button
              onClick={() => void texteKopieren()}
              className="btn-ghost p-1.5 rounded-lg"
              aria-label="Copy text"
              title="Copy the full text to the clipboard"
            >
              {kopiert ? <Check className="w-4 h-4" style={{ color: 'var(--ok)' }} /> : <Copy className="w-4 h-4" />}
            </button>
            <button
              onClick={() => onEdit(memory)}
              className="btn-ghost p-1.5 rounded-lg"
              aria-label="Edit"
              title="Edit this note"
            >
              <EditPen className="w-4 h-4" />
            </button>
            {onDelete && (
              <button
                onClick={() => onDelete(memory)}
                className="btn-ghost p-1.5 rounded-lg"
                aria-label="Move to trash"
                title="Move to trash — restore it from the trash any time"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}
          </div>
        </header>

        <div className="detail-korper" style={{ padding: "18px 22px" }}>
          <h1 className="lh-dicht break-words" style={{ color: "var(--text-1)", fontWeight: 700, letterSpacing: "-0.01em", margin: 0 }}>
            {memory.title || "Untitled"}
          </h1>
          {/* P202, Mockup-Meta (.detail-korper .meta): der Art-Punkt, die Art mit
              ihrem KIND-Wort, die Endung der Quelle, die kurze Zeit, die Herkunft —
              die getönten Tag-Pillen stehen in derselben Zeile. */}
          <div className="detail-meta" style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 10, marginTop: 6, fontSize: "var(--fs-2)", color: "var(--text-3)" }}>
            <span aria-hidden style={{ width: 7, height: 7, borderRadius: 3, background: memory.type ? `var(--type-${memory.type})` : "var(--text-3)", flex: "none" }} />
            {endung && <><span>{endung}</span><span>·</span></>}
            <span>·</span>
            <span className="tnum">{kurzeZeit(memory.updatedAt)}</span>
            {quelle && (
              <>
                <span>·</span>
                <span>saved from</span>
                <button
                  onClick={() => void quelleOeffnen()}
                  data-testid="preview-open-source"
                  className="font-semibold hover:underline underline-offset-2"
                  style={{ color: 'var(--accent)' }}
                  title={quelle.art === "datei"
                    ? `Open file: ${quelle.pfad}`
                    : quelle.art === "url"
                      ? `Open link: ${quelle.url}`
                      : `Imported from inbox: ${quelle.name}`}
                >
                  {quelle.name}
                </button>
              </>
            )}
            {memory.tags.map((tag, i) => {
              const farbe = PILLE_FARBEN[i % PILLE_FARBEN.length];
              return (
                <span
                  key={tag}
                  className="inline-flex items-center px-2 py-px rounded"
                  style={{ color: farbe.ton, background: farbe.flaeche, fontSize: "var(--fs-2)", fontWeight: 550, height: 19, lineHeight: "17px", padding: "1px 7px" }}
                >
                  #{tag}
                </span>
              );
            })}
          </div>
          {/* Der komplette Text, Absatz fuer Absatz — kein Formular, kein Markup-Zwang */}
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
                  className="mb-2 rounded-xl px-3 py-2 fs-2 klappe-auf"
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
          {staendeGrund && (
            <p role="status" data-testid="preview-staende-grund" className="fs-2 mb-3" style={{ color: 'var(--warn)' }}>{staendeGrund}</p>
          )}
          {/* P202, Mockup-Grammatik (.detail-gruppe): die Tische stehen unter dem
              Text — Gelesen und Stände als zustandszeilen-Tische. */}
          <div className="detail-gruppe" data-testid="preview-readers-gruppe">
            <div className="detail-gruppe-name">Read by</div>
            <div className="gruppen-tisch">
              <div className="zustandszeile" style={{ borderBottom: "none" }} data-testid="preview-readers">
                <span className="art">{privat ? "Private" : leser.length === 0 ? (leserStand === "da" ? "Noch nie" : "Gelesen") : "Gelesen"}</span>
                <div className="inhalt">
                  {privat
                    ? "AI apps and cloud AI never see this note."
                    : leserGrund
                      ? leserGrund
                      : leser.length === 0
                        ? "No AI app has read this note."
                        : `Read by AI apps: ${leser.map((l) => `${l.who} ${l.times}× (last ${formatDistanceToNow(new Date(l.last), { addSuffix: true })})`).join(", ")}`}
                </div>
              </div>
            </div>
          </div>
          <div className="detail-gruppe" data-testid="preview-stands-gruppe">
            <div className="detail-gruppe-name">Stands</div>
            <div className="gruppen-tisch">
              {staende !== null && staende.length > 0 ? (
                <div className="zustandszeile" style={{ borderBottom: "none" }}>
                  <span className="art tnum">{staende.length + 1} {staende.length + 1 === 1 ? "Stand" : "Stände"}</span>
                  <div className="inhalt">
                    <button
                      onClick={() => setStaendeOffen((v) => !v)}
                      data-testid="preview-stands-open"
                      aria-expanded={staendeOffen}
                      className="hover:underline underline-offset-2"
                      style={{ color: "var(--accent)" }}
                    >
                      {staende.length} earlier {staende.length === 1 ? "stand" : "stands"} — click to read them
                    </button>
                  </div>
                </div>
              ) : (
                <div className="zustandszeile" style={{ borderBottom: "none" }} data-testid="preview-stands-none">
                  <div className="inhalt">No earlier stands — this note has not been edited yet.</div>
                </div>
              )}
            </div>
            {staendeOffen && staende !== null && staende.length > 0 && (
              <div className="gruppen-tisch mt-2" data-testid="preview-stands">
                {staende.map((st, i) => (
                  <div
                    key={st.id}
                    className="zustandszeile cursor-pointer"
                    style={i === staende.length - 1 ? { borderBottom: "none" } : undefined}
                    data-testid="preview-stand-row"
                    onClick={() => setGewaehlterStand(st)}
                  >
                    <span className="art tnum">{kurzeZeit(st.createdAt)}</span>
                    <div className="inhalt">
                      <span className="block truncate" style={{ color: "var(--text-2)" }}>{st.content.replace(/\s+/g, " ").slice(0, 90)}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

      </motion.div>
    </div>
  );
}
