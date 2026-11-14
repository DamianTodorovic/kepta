import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { KURVE_APPLE, FEDER_OVERLAY } from "../lib/motionTokens";
import { Memory } from "../types";
import { X, Trash2, CheckCircle2, AlertCircle, FileText } from "../lib/icons";
import {
  findDuplicateGroups,
  pairKey,
  reasonLabel,
  redundantCount,
  type DuplicateGroup,
} from "../lib/duplicates";

const DISMISS_KEY = "kepta_duplicates_dismissed";

/** Vom Nutzer abgelehnte Paare — bleiben ueber Neustarts hinweg abgelehnt. */
export function loadDismissed(): Set<string> {
  try {
    const raw = JSON.parse(localStorage.getItem(DISMISS_KEY) || "[]");
    return new Set(Array.isArray(raw) ? raw.filter((x): x is string => typeof x === "string") : []);
  } catch {
    return new Set();
  }
}

function saveDismissed(s: ReadonlySet<string>): void {
  try { localStorage.setItem(DISMISS_KEY, JSON.stringify([...s])); } catch { /* ignore */ }
}

/** Alle Paare innerhalb einer Gruppe — eine Ablehnung loest die ganze Gruppe auf. */
export function groupPairKeys(g: DuplicateGroup): string[] {
  const out: string[] = [];
  for (let i = 0; i < g.members.length; i++) {
    for (let j = i + 1; j < g.members.length; j++) out.push(pairKey(g.members[i].id, g.members[j].id));
  }
  return out;
}

interface DuplicatesPanelProps {
  memories: Memory[];
  open: boolean;
  onClose: () => void;
  onDelete: (id: string) => void;
  /**
   * Sammel-Loeschen. Muss EIN Aufruf sein: einzeln lief das Aufraeumen in die
   * Schreibdrossel des Servers und brach nach sechzig Notizen lautlos ab.
   */
  onDeleteMany: (ids: string[]) => void;
  onOpenMemory: (m: Memory) => void;
}

/**
 * Duplikate ansehen und aufraeumen.
 *
 * Vorher stand im Dashboard nur eine Zahl ("9 duplicates") und ein Knopf, der
 * die erste betroffene Notiz im Editor oeffnete — welche Paare gemeint waren,
 * erfuhr man nie, und entfernen liess sich nichts. Hier steht jede Gruppe mit
 * beiden Seiten nebeneinander, samt Begruendung; geloescht wird in den
 * Papierkorb, also umkehrbar.
 */
export function DuplicatesPanel({ memories, open, onClose, onDelete, onDeleteMany, onOpenMemory }: DuplicatesPanelProps) {
  const [dismissed, setDismissed] = useState<Set<string>>(() => loadDismissed());
  const [bestaetigeAlle, setBestaetigeAlle] = useState(false);

  const groups = useMemo(
    () => (open ? findDuplicateGroups(memories, { dismissed }) : []),
    [memories, dismissed, open]
  );

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [open, onClose]);

  useEffect(() => { if (!open) setBestaetigeAlle(false); }, [open]);

  if (!open) return null;

  const verwerfe = (g: DuplicateGroup) => {
    setDismissed((prev) => {
      const next = new Set(prev);
      for (const k of groupPairKeys(g)) next.add(k);
      saveDismissed(next);
      return next;
    });
  };

  /** Die Ueberzaehligen einer Gruppe — der Behalter bleibt immer stehen. */
  const ueberzaehligeVon = (g: DuplicateGroup, keepId: string) =>
    g.members.filter((m) => m.id !== keepId).map((m) => m.id);

  const behalteNur = (g: DuplicateGroup, keepId: string) => {
    const weg = ueberzaehligeVon(g, keepId);
    if (weg.length === 1) onDelete(weg[0]); else if (weg.length > 1) onDeleteMany(weg);
  };

  const raeumeAlleAuf = () => {
    // ALLE Gruppen in EINEM Aufruf — nicht Gruppe fuer Gruppe und schon gar
    // nicht Notiz fuer Notiz.
    const weg: string[] = [];
    for (const g of groups) weg.push(...ueberzaehligeVon(g, g.keepId));
    if (weg.length > 0) onDeleteMany(weg);
    setBestaetigeAlle(false);
  };

  const ueberzaehlig = redundantCount(groups);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-label="Duplicates">
      <div className="absolute inset-0 hud-backdrop" onClick={onClose} />
      <motion.div
        initial={{ opacity: 0, scale: 0.98, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ ease: KURVE_APPLE, duration: 0.2 }}
        className="relative panel rounded-2xl w-full max-w-3xl max-h-[86vh] flex flex-col overflow-hidden"
      >
        {/* P202, Mockup-Grammatik (s-duplicates): der Kopf nennt das Wort und den
            Satz, die Liste steht als app-zeile-Zeilen (der Keeper mit Haken und
            „Open this note“, die Kopien mit dem Klick in den Papierkorb), die
            notiz schließt die Liste, der Fuß trägt die Gefahr-Kante und Done.
            Die Funktionen bleiben: Not a duplicate sitzt als leises Wort in der
            Keeper-Zeile, die Bestätigung erscheint erst nach dem Gefahr-Klick. */}
        <div className="flex items-start gap-3 px-4 py-3 shrink-0" style={{ borderBottom: "1px solid var(--border-subtle)" }}>
          <div className="flex-1 min-w-0">
            <h2 className="fs-5 font-semibold" style={{ color: "var(--text-1)" }}>Duplicates</h2>
            <p className="fs-2 mt-0.5" style={{ color: "var(--text-2)" }}>
              One click per group, or clean up everything at once.
            </p>
          </div>
          <button onClick={onClose} className="btn-ghost p-2 rounded-lg shrink-0" title="Close" aria-label="Close">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto py-3" style={{ paddingLeft: 16, paddingRight: 16 }}>
          {groups.length === 0 && (
            <div className="flex flex-col items-center justify-center py-14 text-center">
              <CheckCircle2 className="w-7 h-7 mb-3" style={{ color: "var(--ok)" }} />
              <p className="fs-4 lh-lesbar" style={{ color: "var(--text-2)" }}>
                No duplicates found. Anything you marked as “not a duplicate” stays hidden.
              </p>
            </div>
          )}

          {/* P199 (Emil-Audit §8): Aufräumen ist ein Stapelgang — die gelöschte
              Gruppe klappt weich zusammen, die übrigen gleiten nach (kleine
              Liste, gelegentliche Fläche: Layout-Feder erlaubt). */}
          <AnimatePresence initial={false}>
          {groups.map((g) => (
            <motion.div key={g.key} layout="position"
              exit={{ opacity: 0, scale: 0.98 }}
              transition={FEDER_OVERLAY}
              className="mb-2">
              {g.members.map((m) => {
                const istKeeper = m.id === g.keepId;
                return (
                  <div key={m.id}
                    className="app-zeile"
                    style={istKeeper ? { background: "var(--accent-soft)" } : { cursor: "pointer" }}
                    onClick={!istKeeper ? () => onDelete(m.id) : undefined}
                    onKeyDown={!istKeeper ? (e) => { if (e.key === "Enter") onDelete(m.id); } : undefined}
                    role={!istKeeper ? "button" : undefined}
                    tabIndex={!istKeeper ? 0 : undefined}
                    aria-label={!istKeeper ? `Delete ${m.title || "Untitled"}` : undefined}
                    title={!istKeeper ? "Move this note to the trash" : undefined}
                  >
                    {istKeeper ? (
                      <span className="app-icon ok" aria-hidden><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" style={{ width: 12, height: 12 }}><path d="m5.5 12.5 4 4L18.5 7.5"/></svg></span>
                    ) : (
                      <span className="app-icon" aria-hidden>{(m.title || "•").charAt(0).toUpperCase()}</span>
                    )}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div className="app-name">{m.title || "Untitled"}</div>
                      <div className="app-zustand">{istKeeper ? "Suggested keeper — the richest copy" : "Move this note to the trash"}</div>
                    </div>
                    {istKeeper && (
                      <>
                        <button
                          onClick={(e) => { e.stopPropagation(); verwerfe(g); }}
                          className="btn-ghost px-2 py-1 rounded-md fs-1 shrink-0"
                          title="Keep both — this pair will not be reported again"
                          aria-label={`Not a duplicate: ${m.title || "Untitled"}`}
                        >
                          Not a duplicate
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); onOpenMemory(m); }}
                          className="btn-ghost px-2 py-1 rounded-md fs-1 shrink-0"
                          style={{ color: "var(--accent)" }}
                          title="Open this note"
                          aria-label={`Open ${m.title || "Untitled"}`}
                        >
                          Open this note
                        </button>
                      </>
                    )}
                  </div>
                );
              })}
            </motion.div>
          ))}
          </AnimatePresence>

          {groups.length > 0 && (
            <p className="fs-2 mt-3 px-3" style={{ color: "var(--text-2)" }}>
              Deleting moves a note to the trash — you can undo it. The suggested keeper is the richest copy.
            </p>
          )}
        </div>

        {groups.length > 0 && (
          <div className="flex items-center gap-2 px-4 py-3 shrink-0" style={{ borderTop: "1px solid var(--border-subtle)" }}>
            {bestaetigeAlle ? (
              <>
                <span className="fs-2" style={{ color: "var(--text-2)" }}>
                  This moves {ueberzaehlig} {ueberzaehlig === 1 ? "note" : "notes"} to the trash.
                </span>
                <button onClick={() => setBestaetigeAlle(false)} className="btn-ghost px-3 py-2 rounded-lg fs-2" style={{ marginLeft: "auto" }}>Cancel</button>
                <button onClick={raeumeAlleAuf} className="btn-primary px-3 py-2 rounded-lg fs-2">
                  Yes, move {ueberzaehlig} to the trash
                </button>
              </>
            ) : (
              <>
                <button onClick={() => setBestaetigeAlle(true)} className="btn-ghost px-3 py-2 rounded-lg fs-2" style={{ color: "var(--warn)" }} title="Deletes every copy; the suggested keeper of each group stays">
                  Delete every copy except the suggested one
                </button>
                <div className="flex-1" />
                <button onClick={onClose} className="btn-primary px-4 py-2 rounded-lg fs-2">Done</button>
              </>
            )}
          </div>
        )}
      </motion.div>
    </div>
  );
}
