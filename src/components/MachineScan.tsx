import { useCallback, useEffect, useRef, useState } from "react";
import { motion } from "motion/react";
import { X, ShieldCheck, ShieldAlert, Loader2, FolderOpen, CheckCircle2, AlertTriangle, Bot } from "../lib/icons";

/**
 * Rechner-Scan mit ausdruecklicher Zustimmung.
 *
 * KEPTA darf auf Wunsch den ganzen Rechner durchsehen und Dokumente einsammeln.
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
  byFolder: { ordner: string; anzahl: number }[];
  sample: { path: string; bytes: number }[];
  totalBytes: number;
}

export interface ScanStatus {
  running: boolean;
  phase: "idle" | "preview" | "import" | "done" | "cancelled";
  seen: number;
  found: number;
  imported: number;
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
   * zugestimmt hat, dass KEPTA sich den Rechner ansehen darf: dann hat er die
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
        if (!r.ok) return;
        const d = (await r.json()) as Partial<Regelwerk>;
        // Erst pruefen, dann uebernehmen. Eine unerwartete Antwort darf den
        // Dialog nicht leeren — beim Testen hat genau das den ganzen Baum
        // abgeraeumt, weil das Rendern ueber ein fehlendes Feld stolperte.
        if (
          !d?.niemals?.ordner || !d?.uebersprungen?.ordner ||
          !Array.isArray(d?.lesbar?.endungen) || !d?.grenzen ||
          !Array.isArray(d?.ihreEinstellung?.endungen)
        ) return;
        const voll = d as Regelwerk;
        setRegelwerk(voll);
        setEndungen(voll.ihreEinstellung.endungen);
        setAusgelassen((voll.ihreEinstellung.zusaetzlichAusgelassen ?? []).join(", "));
      } catch { /* ohne Regelwerk bleibt der Dialog benutzbar */ }
    })();
  }, [open]);

  /** Auswahl sichern — sie gilt fuer Vorschau UND Durchlauf. */
  const sichereAuswahl = useCallback(async (neueEndungen: string[], neuAusgelassen: string) => {
    try {
      await fetch("/api/scan/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          endungen: neueEndungen,
          zusaetzlichAusgelassen: neuAusgelassen.split(",").map((x) => x.trim()).filter(Boolean),
        }),
      });
    } catch { /* nicht gesichert — die Vorgabe gilt weiter */ }
  }, []);

  const starteVorschau = useCallback(async () => {
    setLaeuftVorschau(true);
    setFehler(null);
    try {
      const r = await fetch("/api/scan/preview", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? "Preview failed");
      setVorschau((await r.json()) as ScanVorschau);
    } catch (e) {
      setFehler(e instanceof Error ? e.message : "Preview failed");
    } finally {
      setLaeuftVorschau(false);
    }
  }, []);

  // Vom Assistenten kommend: die Vorschau laeuft von selbst an.
  const vorschauAngestossen = useRef(false);
  useEffect(() => {
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
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? "Could not start");
      gemeldet.current = false;
      setStatus({ running: true, phase: "import", seen: 0, found: vorschau?.found ?? 0, imported: 0, skippedFolders: 0, truncated: false, error: null });
    } catch (e) {
      setFehler(e instanceof Error ? e.message : "Could not start");
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
        transition={{ duration: 0.16 }}
        className="relative panel rounded-2xl w-full max-w-2xl max-h-[88vh] flex flex-col overflow-hidden"
      >
        <div className="flex items-start gap-3 px-5 py-4 shrink-0" style={{ borderBottom: "1px solid var(--border-subtle)" }}>
          <div className="flex-1 min-w-0">
            <div className="hud-label">Scan this computer</div>
            <h2 className="text-[17px] font-semibold mt-0.5" style={{ color: "var(--text-1)" }}>
              Let KEPTA read your documents
            </h2>
            <p className="text-[12.5px] mt-1" style={{ color: "var(--text-2)" }}>
              Off by default. Nothing is read until you have seen what would be imported and agreed to both points below.
            </p>
          </div>
          <button onClick={onClose} disabled={!!status?.running} className="btn-ghost p-2 rounded-lg shrink-0 disabled:opacity-40" title="Close" aria-label="Close">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {/* Was nie gelesen wird — steht bewusst VOR dem Knopf. */}
          <div className="rounded-xl p-3.5 space-y-2" style={{ background: "var(--bg-inset)", border: "1px solid var(--border-subtle)" }}>
            <div className="flex items-center gap-2 text-[13px] font-medium" style={{ color: "var(--text-1)" }}>
              <ShieldCheck className="w-4 h-4" style={{ color: "var(--ok)" }} /> Never read — and you cannot switch this off
            </div>
            <ul className="text-[12.5px] space-y-1" style={{ color: "var(--text-2)" }}>
              <li>SSH and GPG keys, certificates, <code>.env</code> files, <code>credentials</code>, password stores, crypto wallets</li>
              <li>Browser profiles, cookies, saved logins, mail stores, keychains</li>
              <li>System, cache and build folders, <code>node_modules</code>, <code>.git</code>, hidden folders</li>
              <li>Anything outside your home folder, and KEPTA's own data folder</li>
            </ul>
          </div>

          {/* Der Punkt, den man ohne Aufforderung sagen muss. */}
          <div className="rounded-xl p-3.5 space-y-2" style={{ background: "var(--warn-soft)", border: "1px solid transparent" }}>
            <div className="flex items-center gap-2 text-[13px] font-medium" style={{ color: "var(--warn)" }}>
              <ShieldAlert className="w-4 h-4" /> What you should know before you agree
            </div>
            <p className="text-[12.5px] leading-relaxed" style={{ color: "var(--text-2)" }}>
              Everything stays on this computer — KEPTA has no cloud and no account. But an imported document becomes a
              normal note, and notes are readable by <strong style={{ color: "var(--text-1)" }}>every AI assistant you connect over MCP</strong>.
              If a document contains something you would not paste into a chat, do not import that folder.
            </p>
          </div>

          {regelwerk && !status && (
            <div className="rounded-xl p-3.5 space-y-3" style={{ background: "var(--bg-inset)", border: "1px solid var(--border-subtle)" }}>
              <div className="flex items-center gap-2">
                <div className="hud-label">What KEPTA may read</div>
                <button onClick={() => setZeigeRegeln((v) => !v)} className="btn-ghost px-2 py-0.5 rounded text-[11px] ml-auto">
                  {zeigeRegeln ? "Hide the full rules" : "Show the full rules"}
                </button>
              </div>

              <div>
                <div className="text-[12px] mb-1.5" style={{ color: "var(--text-2)" }}>File types — untick anything you do not want read:</div>
                <div className="flex flex-wrap gap-1.5">
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
                        className="px-2 py-0.5 rounded text-[11.5px] tnum"
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
                <label className="text-[12px] block mb-1" style={{ color: "var(--text-2)" }}>
                  Folder names to leave out (comma separated):
                </label>
                <input
                  value={ausgelassen}
                  onChange={(e) => setAusgelassen(e.target.value)}
                  onBlur={() => void sichereAuswahl(endungen, ausgelassen)}
                  placeholder="e.g. archive, private, old"
                  className="hud-input w-full px-2.5 py-1.5 rounded-lg text-[12.5px]"
                />
              </div>

              <div className="text-[12px]" style={{ color: "var(--text-2)" }}>
                Reading from: <strong style={{ color: "var(--text-1)" }}>{regelwerk.ihreEinstellung.wurzeln.join(", ")}</strong>
              </div>

              {zeigeRegeln && (
                <div className="space-y-2 pt-2 text-[11.5px]" style={{ borderTop: "1px solid var(--border-subtle)", color: "var(--text-2)" }}>
                  <div>
                    <strong style={{ color: "var(--warn)" }}>The exact list that is never read:</strong>
                    <div className="mt-0.5">{regelwerk.niemals.erklaerung}</div>
                    <div className="mt-1 font-mono text-[10.5px]" style={{ color: "var(--text-3)" }}>{regelwerk.niemals.ordner.join(" · ")}</div>
                    <div className="mt-1" style={{ color: "var(--text-3)" }}>{regelwerk.niemals.dateimuster.length} file patterns (keys, tokens, passwords, certificates)</div>
                  </div>
                  <div>
                    <strong style={{ color: "var(--text-1)" }}>Skipped:</strong> {regelwerk.uebersprungen.erklaerung}
                    <div className="mt-1 font-mono text-[10.5px]" style={{ color: "var(--text-3)" }}>{regelwerk.uebersprungen.ordner.slice(0, 24).join(" · ")} …</div>
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
              <button onClick={starteVorschau} disabled={laeuftVorschau} className="btn-ghost px-4 py-2.5 rounded-xl text-sm flex items-center gap-2">
                {laeuftVorschau ? <><Loader2 className="w-4 h-4 animate-spin" /> Looking through your folders…</> : <><FolderOpen className="w-4 h-4" /> Show me what would be imported</>}
              </button>
              <p className="text-[12px]" style={{ color: "var(--text-3)" }}>This step only looks. It writes nothing.</p>
            </div>
          )}

          {vorschau && !status && (
            <div className="space-y-3">
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="hud-inset rounded-lg p-2.5">
                  <div className="text-lg font-semibold tnum" style={{ color: "var(--text-1)" }}>{vorschau.found}</div>
                  <div className="hud-label">documents</div>
                </div>
                <div className="hud-inset rounded-lg p-2.5">
                  <div className="text-lg font-semibold tnum" style={{ color: "var(--text-1)" }}>{formatBytes(vorschau.totalBytes)}</div>
                  <div className="hud-label">of text</div>
                </div>
                <div className="hud-inset rounded-lg p-2.5">
                  <div className="text-lg font-semibold tnum" style={{ color: "var(--text-3)" }}>{vorschau.seen - vorschau.found}</div>
                  <div className="hud-label">left out</div>
                </div>
              </div>

              {vorschau.truncated && (
                <div className="flex items-start gap-2 text-[12.5px] rounded-lg p-2.5" style={{ background: "var(--warn-soft)", color: "var(--text-2)" }}>
                  <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" style={{ color: "var(--warn)" }} />
                  There is more than KEPTA imports in one pass. The first {vorschau.found} documents are taken; run it again afterwards.
                </div>
              )}

              {vorschau.byFolder.length > 0 && (
                <div>
                  <div className="hud-label mb-1.5">Where they come from</div>
                  <div className="flex flex-wrap gap-1.5">
                    {vorschau.byFolder.map((f) => (
                      <span key={f.ordner} className="chip tnum">{f.ordner} <span style={{ color: "var(--text-3)" }}>{f.anzahl}</span></span>
                    ))}
                  </div>
                </div>
              )}

              {vorschau.skipped.length > 0 && (
                <div>
                  <div className="hud-label mb-1.5">Left out</div>
                  <div className="flex flex-wrap gap-1.5">
                    {vorschau.skipped.map((s) => (
                      <span key={s.grund} className="chip tnum">{s.label} <span style={{ color: "var(--text-3)" }}>{s.anzahl}</span></span>
                    ))}
                  </div>
                </div>
              )}

              {vorschau.sample.length > 0 && (
                <details className="rounded-lg overflow-hidden" style={{ border: "1px solid var(--border-subtle)" }}>
                  <summary className="px-3 py-2 text-[12.5px] cursor-pointer" style={{ color: "var(--text-2)" }}>
                    See the first {vorschau.sample.length} files by name
                  </summary>
                  <ul className="px-3 pb-2 space-y-0.5">
                    {vorschau.sample.map((f) => (
                      <li key={f.path} className="text-[11.5px] font-mono truncate" style={{ color: "var(--text-3)" }} title={f.path}>{f.path}</li>
                    ))}
                  </ul>
                </details>
              )}

              <div className="space-y-2 pt-1">
                <label className="flex items-start gap-2.5 cursor-pointer">
                  <input type="checkbox" checked={verstandenLokal} onChange={(e) => setVerstandenLokal(e.target.checked)} className="mt-0.5" />
                  <span className="text-[12.5px]" style={{ color: "var(--text-2)" }}>
                    I want KEPTA to read these {vorschau.found} documents and save them as notes on this computer.
                  </span>
                </label>
                <label className="flex items-start gap-2.5 cursor-pointer">
                  <input type="checkbox" checked={verstandenAgenten} onChange={(e) => setVerstandenAgenten(e.target.checked)} className="mt-0.5" />
                  <span className="text-[12.5px]" style={{ color: "var(--text-2)" }}>
                    I understand that AI assistants connected over MCP can then read them.
                  </span>
                </label>
              </div>
            </div>
          )}

          {status && (
            <div className="space-y-3">
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="hud-inset rounded-lg p-2.5"><div className="text-lg font-semibold tnum" style={{ color: "var(--text-1)" }}>{status.seen}</div><div className="hud-label">files seen</div></div>
                <div className="hud-inset rounded-lg p-2.5"><div className="text-lg font-semibold tnum" style={{ color: "var(--text-1)" }}>{status.found}</div><div className="hud-label">documents</div></div>
                <div className="hud-inset rounded-lg p-2.5"><div className="text-lg font-semibold tnum" style={{ color: "var(--ok)" }}>{status.imported}</div><div className="hud-label">notes written</div></div>
              </div>
              {status.running ? (
                <div className="flex items-center gap-2 text-[12.5px]" style={{ color: "var(--text-2)" }}>
                  <Loader2 className="w-4 h-4 animate-spin" style={{ color: "var(--accent)" }} />
                  {status.phase === "import" && status.imported === 0 ? "Walking through your folders…" : "Writing notes…"}
                </div>
              ) : (
                <div className="flex items-center gap-2 text-[13px]" style={{ color: status.phase === "cancelled" ? "var(--warn)" : "var(--ok)" }}>
                  {status.phase === "cancelled" ? <AlertTriangle className="w-4 h-4" /> : <CheckCircle2 className="w-4 h-4" />}
                  {status.phase === "cancelled"
                    ? `Stopped — ${status.imported} notes were already written and are kept.`
                    : `Done — ${status.imported} notes added.`}
                </div>
              )}
              <div className="flex items-start gap-2 text-[12px] rounded-lg p-2.5" style={{ background: "var(--bg-inset)", color: "var(--text-3)" }}>
                <Bot className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                Everything landed under the tag <code>machine-scan</code> — filter by it to review or delete the lot.
              </div>
            </div>
          )}

          {fehler && (
            <div className="rounded-lg p-2.5 text-[12.5px]" style={{ background: "var(--warn-soft)", color: "var(--warn)" }}>{fehler}</div>
          )}
        </div>

        <div className="flex items-center gap-2 px-5 py-3.5 shrink-0" style={{ borderTop: "1px solid var(--border-subtle)" }}>
          <span className="text-[12px]" style={{ color: "var(--text-3)" }}>
            {status?.running ? "You can stop this at any time." : "Local only. No cloud, no account."}
          </span>
          <div className="ml-auto flex items-center gap-2">
            {status?.running ? (
              <button onClick={abbrechen} className="btn-ghost px-3 py-1.5 rounded-lg text-[12.5px]">Stop</button>
            ) : fertig ? (
              <button onClick={onClose} className="btn-primary px-4 py-1.5 rounded-lg text-[12.5px]">Close</button>
            ) : (
              <>
                <button onClick={onClose} className="btn-ghost px-3 py-1.5 rounded-lg text-[12.5px]">Not now</button>
                <button onClick={starteImport} disabled={!bereit} className="btn-primary px-4 py-1.5 rounded-lg text-[12.5px] disabled:opacity-40">
                  {vorschau ? `Import ${vorschau.found} documents` : "Import"}
                </button>
              </>
            )}
          </div>
        </div>
      </motion.div>
    </div>
  );
}
