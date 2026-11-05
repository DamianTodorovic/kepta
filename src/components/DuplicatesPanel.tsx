import { useEffect, useMemo, useState } from "react";
import { motion } from "motion/react";
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
        transition={{ duration: 0.16 }}
        className="relative panel rounded-2xl w-full max-w-3xl max-h-[86vh] flex flex-col overflow-hidden"
      >
        <div className="flex items-start gap-3 px-5 py-4 shrink-0" style={{ borderBottom: "1px solid var(--border-subtle)" }}>
          <div className="flex-1 min-w-0">
            <div className="hud-label">Duplicates</div>
            <h2 className="fs-5 font-semibold mt-1" style={{ color: "var(--text-1)" }}>
              {groups.length === 0
                ? "Nothing to clean up"
                : `${groups.length} ${groups.length === 1 ? "group" : "groups"} · ${ueberzaehlig} redundant ${ueberzaehlig === 1 ? "note" : "notes"}`}
            </h2>
            <p className="fs-3 mt-1" style={{ color: "var(--text-2)" }}>
              Deleting moves a note to the trash — you can undo it. The suggested keeper is the richest copy.
            </p>
          </div>
          <button onClick={onClose} className="btn-ghost p-2 rounded-lg shrink-0" title="Close" aria-label="Close">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
          {groups.length === 0 && (
            <div className="flex flex-col items-center justify-center py-14 text-center">
              <CheckCircle2 className="w-7 h-7 mb-3" style={{ color: "var(--ok)" }} />
              <p className="text-sm" style={{ color: "var(--text-2)" }}>
                No duplicates found. Anything you marked as “not a duplicate” stays hidden.
              </p>
            </div>
          )}

          {groups.map((g) => (
            <div key={g.key} className="rounded-xl overflow-hidden" style={{ border: "1px solid var(--border-subtle)", background: "var(--bg-inset)" }}>
              <div className="flex items-center gap-2 px-4 py-3" style={{ borderBottom: "1px solid var(--border-subtle)" }}>
                <AlertCircle className="w-3.5 h-3.5 shrink-0" style={{ color: "var(--warn)" }} />
                <span className="fs-3 font-semibold" style={{ color: "var(--text-1)" }}>
                  {reasonLabel(g.reason, g.similarity)}
                </span>
                <span className="hud-label">{g.members.length} copies</span>
                <div className="ml-auto flex items-center gap-2">
                  <button
                    onClick={() => verwerfe(g)}
                    className="btn-ghost px-2 py-1 rounded-md fs-1 font-semibold"
                    title="Keep both — this pair will not be reported again"
                  >
                    Not a duplicate
                  </button>
                  <button
                    onClick={() => behalteNur(g, g.keepId)}
                    className="btn-primary px-3 py-1 rounded-md fs-1"
                    title="Delete every copy except the suggested one"
                  >
                    Keep suggested
                  </button>
                </div>
              </div>

              <div className="divide-y" style={{ borderColor: "var(--border-subtle)" }}>
                {g.members.map((m) => {
                  const istKeeper = m.id === g.keepId;
                  return (
                    <div key={m.id} className="flex items-start gap-3 px-4 py-3">
                      <div className="shrink-0 mt-1">
                        {istKeeper ? (
                          <span className="chip !px-2 !py-1" style={{ color: "var(--ok)" }} title="Suggested to keep — the richest copy">
                            <CheckCircle2 className="w-3 h-3" /> Keep
                          </span>
                        ) : (
                          <span className="chip !px-2 !py-1" style={{ color: "var(--text-3)" }}>Copy</span>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="fs-3 font-semibold truncate" style={{ color: "var(--text-1)" }}>
                          {m.title || "Untitled"}
                        </div>
                        <p className="fs-2 mt-1 line-clamp-2" style={{ color: "var(--text-2)" }}>
                          {m.content.slice(0, 220) || "—"}
                        </p>
                        <div className="flex items-center gap-2 mt-1 hud-label">
                          <span className="tnum">{m.content.length} chars</span>
                          <span className="tnum">{new Date(m.updatedAt).toLocaleDateString("en-GB")}</span>
                          {m.tags.slice(0, 3).map((t) => <span key={t}>#{t}</span>)}
                        </div>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          onClick={() => onOpenMemory(m)}
                          className="btn-ghost p-2 rounded-md"
                          title="Open this note"
                          aria-label={`Open ${m.title || "Untitled"}`}
                        >
                          <FileText className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => onDelete(m.id)}
                          className="btn-danger-ghost p-2 rounded-md"
                          title="Move this note to the trash"
                          aria-label={`Delete ${m.title || "Untitled"}`}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        {groups.length > 0 && (
          <div className="flex items-center gap-2 px-5 py-4 shrink-0" style={{ borderTop: "1px solid var(--border-subtle)" }}>
            <span className="fs-3" style={{ color: "var(--text-2)" }}>
              {bestaetigeAlle
                ? `This moves ${ueberzaehlig} ${ueberzaehlig === 1 ? "note" : "notes"} to the trash.`
                : "One click per group, or clean up everything at once."}
            </span>
            <div className="ml-auto flex items-center gap-2">
              {bestaetigeAlle ? (
                <>
                  <button onClick={() => setBestaetigeAlle(false)} className="btn-ghost px-3 py-2 rounded-lg fs-3">Cancel</button>
                  <button onClick={raeumeAlleAuf} className="btn-primary px-3 py-2 rounded-lg fs-3">
                    Yes, move {ueberzaehlig} to the trash
                  </button>
                </>
              ) : (
                <button onClick={() => setBestaetigeAlle(true)} className="btn-ghost px-3 py-2 rounded-lg fs-3">
                  Clean up all {groups.length} {groups.length === 1 ? 'group' : 'groups'}
                </button>
              )}
            </div>
          </div>
        )}
      </motion.div>
    </div>
  );
}
