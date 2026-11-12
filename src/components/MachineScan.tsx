import { absage } from "../lib/absage";
import { ApiFehler, tuerSatz } from "../lib/api";
import { useCallback, useEffect, useRef, useState } from "react";
import { motion } from "motion/react";
import { KURVE_APPLE } from "../lib/motionTokens";
import { X, ShieldCheck, ShieldAlert, Loader2, FolderOpen, CheckCircle2, AlertTriangle, Bot } from "../lib/icons";
import { TRAEGER_LABELS } from '../lib/graphHierarchy';
import { inForm } from "../lib/antwort";

/**
 * Rechner-Scan mit ausdruecklicher Zustimmung.
 *
 * K3PTA darf auf Wunsch den ganzen Rechner durchsehen und Dokumente einsammeln.
 * Alles bleibt dabei auf dem Geraet. Der Punkt, den man dem Nutzer trotzdem
 * sagen muss, ist ein anderer: was in der Wissensbasis steht, koennen
 * ANGESCHLOSSENE KI-AGENTEN ueber MCP lesen. Deshalb ist die Zustimmung hier
 * zweiteilig und der Ablauf immer: erst ansehen, dann entscheiden.
 */

export interface Regelwerk {
  niemals: { ordner: string[]; dateimuster: string[]; erklaerung: string };
  uebersprungen: { ordner: string[]; erklaerung: string };
  lesbar: { endungen: string[]; erklaerung: string };
  grenzen: { maxDateiBytes: number; maxDateien: number; maxTiefe: number };
  ihreEinstellung: { wurzeln: string[]; endungen: string[]; maxDateiBytes: number; zusaetzlichAusgelassen: string[] };
}

export interface ScanVorschau {
  roots: string[];
  seen: number;
  found: number;
  truncated: boolean;
  skippedFolders: number;
  skipped: { grund: string; label: string; anzahl: number }[];
  /** Die Ordner, die zu blieben — beim Namen, nicht nur gezaehlt. */
  leftOutFolders: { ordner: string; grund: string }[];
  byFolder: { ordner: string; anzahl: number }[];
  /** Wie viele oberste Ordner es ueberhaupt gibt — die Liste zeigt nur einen Teil. */
  ordnerGesamt: number;
  sample: { path: string; bytes: number }[];
  totalBytes: number;
}

// Die Form, die diese Fläche liest: `vorschau.byFolder.length`,
// `vorschau.skipped.map(...)`. Ein Feld, das der Server nicht liefert, warf
// bisher den ganzen Dialog raus.
const LEERE_VORSCHAU: ScanVorschau = {
  roots: [""], seen: 0, found: 0, truncated: false, skippedFolders: 0,
  skipped: [{ grund: "", label: "", anzahl: 0 }],
  leftOutFolders: [{ ordner: "", grund: "" }],
  byFolder: [{ ordner: "", anzahl: 0 }],
  ordnerGesamt: 0,
  sample: [{ path: "", bytes: 0 }],
  totalBytes: 0,
};

export interface ScanStatus {
  running: boolean;
  phase: "idle" | "preview" | "import" | "done" | "cancelled";
  seen: number;
  found: number;
  imported: number;
  /** Schluesselfoermige Stellen, die der Lauf vor der Notiz verdeckt hat (#76). */
  masked?: number;
  /** Was der Lauf dem Netz hinzufuegte — Begriffe und Kanten, ganze Tafel (#83). */
  graphNew?: { concepts: number; edges: number } | null;
  skippedFolders: number;
  truncated: boolean;
  error: string | null;
}

interface Props {
  open: boolean;
  onClose: () => void;
  /** Wird nach einem abgeschlossenen Durchlauf gerufen, damit die Liste nachlaedt. */
  onImported?: (anzahl: number) => void;
  /**
   * Beim Oeffnen sofort nachsehen, statt darauf zu warten, dass der Nutzer den
   * Knopf drueckt. Wird gesetzt, wenn er im Einrichtungs-Assistenten schon
   * zugestimmt hat, dass K3PTA sich den Rechner ansehen darf: dann hat er die
   * Frage bereits beantwortet und will Zahlen sehen, keinen zweiten Knopf.
   * Die eigentliche Zustimmung zum LESEN holt der Dialog trotzdem hier ein.
   */
  autoPreview?: boolean;
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} kB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

/** Warum ein Ordner zu blieb, in einem Wort, das der Nutzer lesen kann. */
function lassGrund(grund: string): string {
  switch (grund) {
    case "eigene-daten": return "K3PTA's own data";
    case "abgewaehlt": return "you left it out";
    case "ausgeschlossen": return "not part of this scan";
    case "zu-tief": return "deeper than 12 folders";
    case "versteckt": return "hidden folder";
    default: return "system, cache or build folder";
  }
}

export function MachineScan({ open, onClose, onImported, autoPreview = false }: Props) {
  const [vorschau, setVorschau] = useState<ScanVorschau | null>(null);
  const [laeuftVorschau, setLaeuftVorschau] = useState(false);
  const [status, setStatus] = useState<ScanStatus | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  const [verstandenLokal, setVerstandenLokal] = useState(false);
  const [verstandenAgenten, setVerstandenAgenten] = useState(false);
  /**
   * Was gelesen werden darf — und was nie. Beides kommt aus derselben Quelle
   * wie die Entscheidung selbst (/api/scan/policy), damit die Erklaerung nicht
   * von der Wirklichkeit abweichen kann.
   */
  const [regelwerk, setRegelwerk] = useState<Regelwerk | null>(null);
  /**
   * Warum kein Regelwerk da ist. Punkt 3 aus P4-UEBRIGE-VIER (gebaut 3.11.): das Holen
   * hatte drei stille Rueckwege (`!r.ok`, eine unbrauchbare Form, kein Netz) und der Dialog
   * stand jeweils ohne Regeln da, ohne dass jemand gesagt haette, warum.
   */
  const [regelGrund, setRegelGrund] = useState<string | null>(null);
  const [endungen, setEndungen] = useState<string[]>([]);
  const [ausgelassen, setAusgelassen] = useState("");
  const [zeigeRegeln, setZeigeRegeln] = useState(false);
  const gemeldet = useRef(false);

  useEffect(() => {
    if (open) return;
    setVorschau(null);
    setStatus(null);
    setFehler(null);
    setVerstandenLokal(false);
    setVerstandenAgenten(false);
    gemeldet.current = false;
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape" && !status?.running) onClose(); };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [open, onClose, status?.running]);

  // Solange importiert wird, den Fortschritt nachfragen.
  useEffect(() => {
    if (!open || !status?.running) return;
    const id = setInterval(() => {
      void fetch("/api/scan/status")
        .then((r) => r.json())
        .then((s: ScanStatus) => {
          setStatus(s);
          if (!s.running && !gemeldet.current) {
            gemeldet.current = true;
            onImported?.(s.imported);
          }
        })
        .catch(() => { /* Server kurz weg — beim naechsten Takt wieder */ });
    }, 900);
    return () => clearInterval(id);
  }, [open, status?.running, onImported]);

  useEffect(() => {
    if (!open) return;
    void (async () => {
      try {
        const r = await fetch("/api/scan/policy");
        if (!r.ok) {
          setRegelGrund(`The scan rules did not arrive — the store answered ${r.status}. The scan itself still works; tick file types only after this line is gone.`);
          return;
        }
        const d = (await r.json()) as Partial<Regelwerk>;
        // Erst pruefen, dann uebernehmen. Eine unerwartete Antwort darf den
        // Dialog nicht leeren — beim Testen hat genau das den ganzen Baum
        // abgeraeumt, weil das Rendern ueber ein fehlendes Feld stolperte.
        if (
          !d?.niemals?.ordner || !d?.uebersprungen?.ordner ||
          !Array.isArray(d?.lesbar?.endungen) || !d?.grenzen ||
          !Array.isArray(d?.ihreEinstellung?.endungen)
        ) {
          setRegelGrund('Unexpected rule shape, so none were read. Your scan works; fixed guards stay.');
          return;
        }
        const voll = d as Regelwerk;
        setRegelwerk(voll);
        setRegelGrund(null);
        setEndungen(voll.ihreEinstellung.endungen);
        setAusgelassen((voll.ihreEinstellung.zusaetzlichAusgelassen ?? []).join(", "));
      } catch {
        // Ohne Regelwerk bleibt der Dialog benutzbar — aber nicht ohne Auskunft.
        setRegelGrund('The scan rules did not arrive — the store did not answer. Close and reopen this panel, or check that K3PTA is running.');
      }
    })();
  }, [open]);

  /** Auswahl sichern — sie gilt fuer Vorschau UND Durchlauf. */
  const sichereAuswahl = useCallback(async (neueEndungen: string[], neuAusgelassen: string) => {
    try {
      const r = await fetch("/api/scan/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          endungen: neueEndungen,
          zusaetzlichAusgelassen: neuAusgelassen.split(",").map((x) => x.trim()).filter(Boolean),
        }),
      });
      // Punkt 4, 2.11.: vorher stand hier kein Status-Griff und der Wurf fiel in ein stummes
      // catch. Der Nutzer sah seinen umgeschalteten Knopf, im Regal galt die alte Auswahl.
      if (!r.ok) { setFehler(`Your choice did not stick — the scan answered ${r.status}. Tick it again, or close and reopen this panel.`); return; }
      setFehler(null);
    } catch { /* keine Antwort — dieselbe Meldung, damit die Flaeche nicht gespeichert aussieht */
      setFehler('Your choice did not stick — the scan did not answer. Tick it again, or close and reopen this panel.');
    }
  }, []);

  const starteVorschau = useCallback(async () => {
    setLaeuftVorschau(true);
    setFehler(null);
    try {
      const r = await fetch("/api/scan/preview", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
      if (!r.ok) throw new ApiFehler(tuerSatz((await r.json().catch(() => ({}))).error, "Preview failed"), r.status);
      setVorschau(inForm(await r.json(), LEERE_VORSCHAU));
    } catch (e) {
      setFehler(absage("The preview did not arrive. Nothing was copied.", e));
    } finally {
      setLaeuftVorschau(false);
    }
  }, []);

  /**
   * Einen Ordner aus der Vorschau heraus weglassen — und die Zahl neu sehen.
   *
   * Die Vorschau war bis hierhin eine Auskunft ohne Wirkung: wer sah, dass ein
   * Kunde-Shop-Theme die Haelfte fuellt, konnte erst nach dem Schliessen im
   * Regelfeld drei Worte eintippen. Der Klick auf den Chip tut genau das, was
   * das Feld tut — `zusaetzlichAusgelassen` — und laeuft der Vorschau hinterher,
   * damit die neue Zahl die Antwort ist, nicht ein Wunsch.
   */
  const ordnerAuslassen = useCallback(async (name: string) => {
    const bisher = ausgelassen.split(",").map((x) => x.trim()).filter(Boolean);
    if (bisher.some((x) => x.toLowerCase() === name.toLowerCase())) return;
    const neu = [...bisher, name].join(", ");
    setAusgelassen(neu);
    await sichereAuswahl(endungen, neu);
    await starteVorschau();
  }, [ausgelassen, endungen, sichereAuswahl, starteVorschau]);

  /** Dieselbe Bewegung rueckwaerts: ein eigener Ausschluss wird zurueckgenommen. */
  const ordnerZulassen = useCallback(async (name: string) => {
    const neu = ausgelassen.split(",").map((x) => x.trim()).filter(Boolean)
      .filter((x) => x.toLowerCase() !== name.toLowerCase()).join(", ");
    setAusgelassen(neu);
    await sichereAuswahl(endungen, neu);
    await starteVorschau();
  }, [ausgelassen, endungen, sichereAuswahl, starteVorschau]);

  // Vom Assistenten kommend: die Vorschau laeuft von selbst an.
  const vorschauAngestossen = useRef(false);  useEffect(() => {
    if (!open || !autoPreview) { if (!open) vorschauAngestossen.current = false; return; }
    if (vorschauAngestossen.current) return;
    vorschauAngestossen.current = true;
    void starteVorschau();
  }, [open, autoPreview, starteVorschau]);

  const starteImport = useCallback(async () => {
    setFehler(null);
    try {
      const r = await fetch("/api/scan/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmed: true, roots: vorschau?.roots }),
      });
      if (!r.ok) throw new ApiFehler(tuerSatz((await r.json().catch(() => ({}))).error, "Could not start"), r.status);
      gemeldet.current = false;
      setStatus({ running: true, phase: "import", seen: 0, found: vorschau?.found ?? 0, imported: 0, skippedFolders: 0, truncated: false, error: null });
    } catch (e) {
      setFehler(absage("The scan could not start. Nothing was copied yet.", e));
    }
  }, [vorschau]);

  const abbrechen = useCallback(() => {
    void fetch("/api/scan/cancel", { method: "POST" }).catch(() => {});
  }, []);

  if (!open) return null;

  const fertig = status !== null && !status.running && (status.phase === "done" || status.phase === "cancelled");
  const bereit = verstandenLokal && verstandenAgenten && vorschau !== null && vorschau.found > 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-label="Scan this computer">
      <div className="absolute inset-0 hud-backdrop" onClick={() => { if (!status?.running) onClose(); }} />
      <motion.div
        initial={{ opacity: 0, scale: 0.98, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ ease: KURVE_APPLE, duration: 0.2 }}
        className="relative panel rounded-2xl w-full max-w-2xl max-h-[88vh] flex flex-col overflow-hidden"
      >
        <div className="flex items-start gap-3 px-5 py-4 shrink-0" style={{ borderBottom: "1px solid var(--border-subtle)" }}>
          <div className="flex-1 min-w-0">
            <div className="hud-label">Scan this computer</div>
            <h2 className="fs-5 font-semibold mt-1" style={{ color: "var(--text-1)" }}>
              Let K3PTA read your documents
            </h2>
            <p className="fs-3 mt-1" style={{ color: "var(--text-2)" }}>
              Off by default. Nothing is read until you have seen what would be imported and agreed to both points below.
            </p>
          </div>
          <button onClick={onClose} disabled={!!status?.running} className="btn-ghost p-2 rounded-lg shrink-0 disabled:opacity-40" title="Close" aria-label="Close">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {/* Was nie gelesen wird — steht bewusst VOR dem Knopf. */}
          <div className="rounded-xl p-4 space-y-2" style={{ background: "var(--bg-inset)", border: "1px solid var(--border-subtle)" }}>
            <div className="flex items-center gap-2 fs-3 font-semibold" style={{ color: "var(--text-1)" }}>
              <ShieldCheck className="w-4 h-4" style={{ color: "var(--ok)" }} /> Never read — and you cannot switch this off
            </div>
            <ul className="fs-3 space-y-1" style={{ color: "var(--text-2)" }}>
              <li>SSH and GPG keys, certificates, <code>.env</code> files, <code>credentials</code>, password stores, crypto wallets</li>
              <li>Browser profiles, cookies, saved logins, mail stores, keychains</li>
              <li>System, cache and build folders, <code>node_modules</code>, <code>.git</code>, hidden folders</li>
              <li>Anything outside your home folder, and K3PTA's own data folder</li>
            </ul>
          </div>

          {/* Der Punkt, den man ohne Aufforderung sagen muss. */}
          <div className="rounded-xl p-4 space-y-2" style={{ background: "var(--warn-soft)", border: "1px solid transparent" }}>
            <div className="flex items-center gap-2 fs-3 font-semibold" style={{ color: "var(--warn)" }}>
              <ShieldAlert className="w-4 h-4" /> What you should know before you agree
            </div>
            <p className="fs-3 lh-prosa" style={{ color: "var(--text-2)" }}>
              Everything stays on this computer — K3PTA has no cloud and no account. But an imported document becomes a
              normal note, and notes are readable by <strong style={{ color: "var(--text-1)" }}>every AI assistant you connect over MCP</strong>.
              If a document contains something you would not paste into a chat, do not import that folder.
            </p>
          </div>

          {!regelwerk && regelGrund && (
            <div className="rounded-xl p-3 fs-3 lh-prosa" style={{ background: "var(--warn-soft)", color: "var(--warn)" }} data-testid="scan-regelgrund">
              {regelGrund}
            </div>
          )}

          {regelwerk && !status && (
            <div className="rounded-xl p-4 space-y-3" style={{ background: "var(--bg-inset)", border: "1px solid var(--border-subtle)" }}>
              <div className="flex items-center gap-2">
                <div className="hud-label">What K3PTA may read</div>
                <button onClick={() => setZeigeRegeln((v) => !v)} className="btn-ghost px-2 py-1 rounded fs-1 ml-auto">
                  {zeigeRegeln ? "Hide the full rules" : "Show the full rules"}
                </button>
              </div>

              <div>
                <div className="fs-2 mb-2" style={{ color: "var(--text-2)" }}>File types — untick anything you do not want read:</div>
                <div className="flex flex-wrap gap-2">
                  {regelwerk.lesbar.endungen.map((e) => {
                    const an = endungen.includes(e);
                    return (
                      <button
                        key={e}
                        onClick={() => {
                          const neu = an ? endungen.filter((x) => x !== e) : [...endungen, e];
                          setEndungen(neu);
                          void sichereAuswahl(neu, ausgelassen);
                        }}
                        className="px-2 py-1 rounded fs-3 tnum"
                        style={{
                          background: an ? "var(--accent-soft)" : "transparent",
                          color: an ? "var(--accent)" : "var(--text-3)",
                          border: `1px solid ${an ? "var(--accent)" : "var(--border-subtle)"}`,
                        }}
                      >{e}</button>
                    );
                  })}
                </div>
              </div>

              <div>
                <label htmlFor="scan-ausgelassen" className="fs-2 block mb-1" style={{ color: "var(--text-2)" }}>
                  Folder names to leave out (comma separated):
                </label>
                <input
                  id="scan-ausgelassen"
                  value={ausgelassen}
                  onChange={(e) => setAusgelassen(e.target.value)}
                  onBlur={() => void sichereAuswahl(endungen, ausgelassen)}
                  placeholder="e.g. archive, private, old"
                  className="hud-input w-full px-3 py-2 rounded-lg fs-3"
                />
              </div>

              <div className="fs-2" style={{ color: "var(--text-2)" }}>
                Reading from: <strong style={{ color: "var(--text-1)" }}>{regelwerk.ihreEinstellung.wurzeln.join(", ")}</strong>
              </div>

              {zeigeRegeln && (
                <div className="space-y-2 pt-2 fs-3" style={{ borderTop: "1px solid var(--border-subtle)", color: "var(--text-2)" }}>
                  <div>
                    <strong style={{ color: "var(--warn)" }}>The exact list that is never read:</strong>
                    <div className="mt-1">{regelwerk.niemals.erklaerung}</div>
                    <div className="mt-1 font-mono fs-1" style={{ color: "var(--text-3)" }}>{regelwerk.niemals.ordner.join(" · ")}</div>
                    <div className="mt-1" style={{ color: "var(--text-3)" }}>{regelwerk.niemals.dateimuster.length} file patterns (keys, tokens, passwords, certificates)</div>
                  </div>
                  <div>
                    <strong style={{ color: "var(--text-1)" }}>Skipped:</strong> {regelwerk.uebersprungen.erklaerung}
                    <div className="mt-1 font-mono fs-1" style={{ color: "var(--text-3)" }}>{regelwerk.uebersprungen.ordner.slice(0, 24).join(" · ")} …</div>
                  </div>
                  <div>
                    <strong style={{ color: "var(--text-1)" }}>Limits:</strong>{" "}
                    at most {(regelwerk.grenzen.maxDateiBytes / 1_000_000).toFixed(0)} MB per file,{" "}
                    {regelwerk.grenzen.maxDateien.toLocaleString()} files, {regelwerk.grenzen.maxTiefe} folder levels deep.
                  </div>
                </div>
              )}
            </div>
          )}

          {!vorschau && !status && (
            <div className="flex flex-col items-center py-6 gap-3">
              <p className="fs-2 text-center" style={{ color: "var(--text-3)" }}>
                This step only looks. It writes nothing — and it tells you which folders it would take.
              </p>
            </div>
          )}

          {vorschau && !status && (
            <div className="space-y-3">
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="hud-inset rounded-lg p-3">
                  <div className="fs-5 font-semibold tnum" style={{ color: "var(--text-1)" }}>{vorschau.found}</div>
                  <div className="hud-label">{TRAEGER_LABELS.files}</div>
                </div>
                <div className="hud-inset rounded-lg p-3">
                  <div className="fs-5 font-semibold tnum" style={{ color: "var(--text-1)" }}>{formatBytes(vorschau.totalBytes)}</div>
                  <div className="hud-label">of text</div>
                </div>
                <div className="hud-inset rounded-lg p-3">
                  {/* „left out" war die Zahl der Dateien, die im Lauf durchfielen.
                      Ein Ordner, den die Regel von vornherein nicht betritt, ist
                      nie „gesehen" worden — auf dem echten Schirm stand deshalb
                      „0 left out", während 52 Dateien in drei Ordnern lagen. */}
                  <div className="fs-5 font-semibold tnum" style={{ color: "var(--text-3)" }}>{vorschau.seen - vorschau.found}</div>
                  <div className="hud-label">not readable</div>
                </div>
              </div>

              {vorschau.truncated && (
                <div className="flex items-start gap-2 fs-3 rounded-lg p-3" style={{ background: "var(--warn-soft)", color: "var(--text-2)" }}>
                  <AlertTriangle className="w-3.5 h-3.5 mt-1 shrink-0" style={{ color: "var(--warn)" }} />
                  There is more than K3PTA imports in one pass. The first {vorschau.found} documents are taken; run it again afterwards.
                </div>
              )}

              {vorschau.byFolder.length > 0 && (
                <div>
                  <div className="hud-label mb-2">Where they come from</div>
                  <div className="flex flex-wrap gap-2">
                    {vorschau.byFolder.map((f) => {
                      // „(top level)" ist kein Ordnername, sondern der Korb fuer
                      // die Dateien nebenan — ein Ausschluss ins Leere waere ein
                      // Chip, der etwas zu tun scheint und nichts tut.
                      const echt = f.ordner && f.ordner !== "(top level)";
                      if (!echt) {
                        return (
                          <span key={f.ordner || "(leer)"} className="chip tnum" data-testid="vorschau-ordner-ohne-wirkung">
                            {f.ordner || "—"} <span style={{ color: "var(--text-3)" }}>{f.anzahl}</span>
                          </span>
                        );
                      }
                      return (
                        <button
                          key={f.ordner}
                          type="button"
                          onClick={() => void ordnerAuslassen(f.ordner)}
                          disabled={laeuftVorschau}
                          className="chip tnum min-h-7 disabled:opacity-40"
                          data-testid="vorschau-ordner"
                          title={`Leave ${f.ordner} out of the scan — the count updates`}
                          aria-label={`Leave ${f.ordner} out of the scan`}
                        >
                          {f.ordner} <span style={{ color: "var(--text-3)" }}>{f.anzahl}</span>
                        </button>
                      );
                    })}
                  </div>
                  {vorschau.ordnerGesamt > vorschau.byFolder.length && (
                    <div className="fs-3 mt-1" style={{ color: "var(--text-3)" }}>
                      {vorschau.byFolder.length} of {vorschau.ordnerGesamt} folders shown — the rest holds fewer documents.
                    </div>
                  )}
                  {ausgelassen.trim() !== "" && (
                    <div className="flex flex-wrap items-center gap-2 mt-2">
                      <span className="fs-3" style={{ color: "var(--text-3)" }}>left out by you:</span>
                      {ausgelassen.split(",").map((x) => x.trim()).filter(Boolean).map((x) => (
                        <button
                          key={x}
                          type="button"
                          onClick={() => void ordnerZulassen(x)}
                          disabled={laeuftVorschau}
                          className="chip tnum min-h-7 disabled:opacity-40"
                          data-testid="eigener-ausschluss"
                          title={`Include ${x} again`}
                          aria-label={`Include ${x} again`}
                        >
                          {x} ×
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {(vorschau.skipped.length > 0 || vorschau.skippedFolders > 0) && (
                <div>
                  <div className="hud-label mb-2">
                    Left out{vorschau.skippedFolders > 0 ? ` — ${vorschau.skippedFolders} folder${vorschau.skippedFolders === 1 ? "" : "s"} not entered` : ""}
                  </div>
                  {vorschau.skipped.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {vorschau.skipped.map((s) => (
                        <span key={s.grund} className="chip tnum">{s.label} <span style={{ color: "var(--text-3)" }}>{s.anzahl}</span></span>
                      ))}
                    </div>
                  )}
                  {/* Die Gruende zaehlen Dateien; was mit einem ORDNER geschah, war
                      bisher nur eine Zahl (skippedFolders). Der Name ist die
                      Auskunft — sonst sieht niemand, dass ein gesuchter Ordner
                      zufaellig auf einer Ausschlussliste steht. */}
                  {vorschau.leftOutFolders.some((f) => f.ordner) && (
                    <div className="mt-2 space-y-1" data-testid="links-out-ordner">
                      {vorschau.leftOutFolders.filter((f) => f.ordner).slice(0, 8).map((f, i) => (
                        <div key={`${f.ordner}-${i}`} className="fs-3 flex items-baseline gap-2 min-w-0">
                          <span className="font-mono truncate" style={{ color: "var(--text-2)" }} title={f.ordner}>{f.ordner}</span>
                          <span style={{ color: "var(--text-3)" }}>{lassGrund(f.grund)}</span>
                        </div>
                      ))}
                      {vorschau.skippedFolders > 8 && (
                        <div className="fs-3" style={{ color: "var(--text-3)" }}>
                          …and {vorschau.skippedFolders - 8} more folders left out.
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {vorschau.sample.length > 0 && (
                <details className="rounded-lg overflow-hidden" style={{ border: "1px solid var(--border-subtle)" }}>
                  <summary className="px-3 py-2 fs-3 cursor-pointer" style={{ color: "var(--text-2)" }}>
                    See the first {vorschau.sample.length} files by name
                  </summary>
                  <ul className="px-3 pb-2 space-y-1">
                    {vorschau.sample.map((f) => (
                      <li key={f.path} className="fs-3 font-mono truncate" style={{ color: "var(--text-3)" }} title={f.path}>{f.path}</li>
                    ))}
                  </ul>
                </details>
              )}

              <div className="space-y-2 pt-1">
                <label className="flex items-start gap-3 cursor-pointer">
                  <input type="checkbox" checked={verstandenLokal} onChange={(e) => setVerstandenLokal(e.target.checked)} className="mt-1" />
                  <span className="fs-3" style={{ color: "var(--text-2)" }}>
                    I want K3PTA to read these {vorschau.found} documents and save them as notes on this computer.
                  </span>
                </label>
                <label className="flex items-start gap-3 cursor-pointer">
                  <input type="checkbox" checked={verstandenAgenten} onChange={(e) => setVerstandenAgenten(e.target.checked)} className="mt-1" />
                  <span className="fs-3" style={{ color: "var(--text-2)" }}>
                    I understand that AI assistants connected over MCP can then read them.
                  </span>
                </label>
              </div>
            </div>
          )}

          {status && (
            <div className="space-y-3">
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="hud-inset rounded-lg p-3"><div className="fs-5 font-semibold tnum" style={{ color: "var(--text-1)" }}>{status.seen}</div><div className="hud-label">files seen</div></div>
                <div className="hud-inset rounded-lg p-3"><div className="fs-5 font-semibold tnum" style={{ color: "var(--text-1)" }}>{status.found}</div><div className="hud-label">{TRAEGER_LABELS.files}</div></div>
                <div className="hud-inset rounded-lg p-3"><div className="fs-5 font-semibold tnum" style={{ color: "var(--ok)" }}>{status.imported}</div><div className="hud-label">notes written</div></div>
              </div>
              {status.running ? (
                <div className="flex items-center gap-2 fs-3" style={{ color: "var(--text-2)" }}>
                  <Loader2 className="w-4 h-4 animate-spin" style={{ color: "var(--accent)" }} />
                  {status.phase === "import" && status.imported === 0 ? "Walking through your folders…" : "Writing notes…"}
                </div>
              ) : (
                <div className="flex items-center gap-2 fs-3" style={{ color: status.phase === "cancelled" ? "var(--warn)" : "var(--ok)" }}>
                  {status.phase === "cancelled" ? <AlertTriangle className="w-4 h-4" /> : <CheckCircle2 className="w-4 h-4" />}
                  {status.phase === "cancelled"
                    ? `Stopped — ${status.imported} notes were already written and are kept.`
                    : // #83 (5): Notizen zaehlen ist nicht Wissen zaehlen. Damians Befund
                      // vom 14.10. war „mein Graph waechst nicht", und die Flaeche hatte
                      // dafuer nur „412 notes added". Der Zuwachs am Netz steht jetzt
                      // daneben — gemessen am ganzen Bestand, nicht am Fenster.
                      `Done — ${status.imported} notes added` +
                      (status.graphNew
                        ? `, ${status.graphNew.concepts} concepts and ${status.graphNew.edges} links new.`
                        : ".")}
                </div>
              )}
              <div className="flex items-start gap-2 fs-2 rounded-lg p-3" style={{ background: "var(--bg-inset)", color: "var(--text-3)" }}>
                <Bot className="w-3.5 h-3.5 mt-1 shrink-0" />
                Everything landed under the tag <code>machine-scan</code> — filter by it to review or delete the lot.
              </div>
              {(status.masked ?? 0) > 0 && (
                // Eine Maske, ueber die nichts gesagt wird, ist eine stille
                // Aenderung am Text des Nutzers. Die Zahl gehoert auf den Schirm.
                // Das Beispiel steht fuer sich: inline zerriss der Satz bei
                // 1440 px (Bild scan-maske-1440px.png, 14.10. — die Monospace-
                // Insel brach mitten im Wort und warf „value" hinter die Klammer).
                <div className="fs-2 rounded-lg p-3" style={{ background: "var(--bg-inset)", color: "var(--text-2)" }} data-testid="maskiert-meldung">
                  <div className="flex items-start gap-2">
                    <ShieldCheck className="w-3.5 h-3.5 mt-1 shrink-0" style={{ color: "var(--ok)" }} />
                    <span>
                      {status.masked} key-shaped {status.masked === 1 ? "value was" : "values were"} masked before saving. The note keeps the kind and the length — never the value.
                    </span>
                  </div>
                  <div className="font-mono fs-1 mt-1 ml-[22px]" style={{ color: "var(--text-3)" }}>
                    it reads: sk-…MASKIERT(43)
                  </div>
                </div>
              )}
            </div>
          )}

          {fehler && (
            <div className="rounded-lg p-3 fs-3" style={{ background: "var(--warn-soft)", color: "var(--warn)" }}>{fehler}</div>
          )}
        </div>

        <div className="flex items-center gap-2 px-5 py-4 shrink-0" style={{ borderTop: "1px solid var(--border-subtle)" }}>
          <span className="fs-2" style={{ color: "var(--text-3)" }}>
            {status?.running
              ? "You can stop this at any time."
              : vorschau && !bereit
                // Die beiden Haken liegen in der Liste darunter — bei 1440×900
                // hinter der Faltkante (Bild scan-vorschau-1440px-ausgeschlossen.png,
                // 14.10.). Ein Knopf, der nichts darf, muss sagen, was fehlt.
                ? "Tick the two points in the list to enable the import."
                : "Local only. No cloud, no account."}
          </span>
          <div className="ml-auto flex items-center gap-2">
            {status?.running ? (
              <button onClick={abbrechen} className="btn-ghost px-3 py-2 rounded-lg fs-3">Stop</button>
            ) : fertig ? (
              <button onClick={onClose} className="btn-primary px-4 py-2 rounded-lg fs-3">Close</button>
            ) : (
              <>
                <button onClick={onClose} className="btn-ghost px-3 py-2 rounded-lg fs-3">Not now</button>
                {/* Vor der ersten Vorschau liegt der Knopf unten, nicht in der
                    Mitte des Inhalts: bei 1440×900 (gemessen 14.10., Bild
                    e3-bilder/scan-vorschau-1440px-vorher.png) stand er halb
                    hinter der Fußzeile, und ein Klick traf die Fußzeile. */}
                {!vorschau ? (
                  <button onClick={starteVorschau} disabled={laeuftVorschau} className="btn-primary px-4 py-2 rounded-lg fs-3 flex items-center gap-2 disabled:opacity-40">
                    {laeuftVorschau ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Looking through your folders…</> : <><FolderOpen className="w-3.5 h-3.5" /> Show me what would be imported</>}
                  </button>
                ) : (
                  <button onClick={starteImport} disabled={!bereit} className="btn-primary px-4 py-2 rounded-lg fs-3 disabled:opacity-40">
                    {vorschau ? `Import ${vorschau.found} documents` : "Import"}
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      </motion.div>
    </div>
  );
}
