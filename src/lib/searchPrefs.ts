// Such-Präferenzen (Paket 2 — UI-Funktionssparität): Suchtiefe (topk der
// Engine), Spuren-Schalter (BM25/Vektoren/Graph) und die Treffer-Anzahl.
//
// Geteilt zwischen Dashboard und Einstellungen: beide Flächen lesen und
// schreiben dieselben Schlüssel, Änderungen laufen über ein Fenster-Event
// (storage-Events feuern nicht im selben Fenster). Persistiert wird im
// localStorage UND — wie alle Nutzer-Präferenzen — in die DB gespiegelt,
// weil der Random-Port-Origin das localStorage beim Neustart verliert.
import { useEffect, useState } from 'react';
import { spiegelePrefs } from './prefs';

/** Suchtiefe: wie tief die Engine ihre drei Beine fusioniert (Request-topk). */
export const SUCH_TIEFE_MIN = 5;
export const SUCH_TIEFE_MAX = 32;
export const SUCH_TIEFE_DEFAULT = 16;

/** Stufen des Ergebnisreglers; 0 heißt „alles“ (siehe ALL_RESULTS im Dashboard). */
export const RESULT_STOPS = [5, 10, 20, 50, 100, 250, 0] as const;

const KEY_TIEFE = 'ki_gehirn_such_tiefe';
const KEY_BM25 = 'ki_gehirn_spur_bm25';
const KEY_VEKTOR = 'ki_gehirn_spur_vektor';
const KEY_GRAPH = 'ki_gehirn_spur_graph';
const KEY_TREFFER = 'ki_gehirn_topK'; // historischer Schlüssel des Ergebnisreglers

/** Fenster-Event, mit dem Einstellungen das Dashboard (und umgekehrt) informieren. */
export const SUCH_PREFS_EVENT = 'kepta_such_prefs';

export interface SuchPrefs {
  /** Engine-Suchtiefe: der topk-Wert, der mit jedem Search-Call geht. */
  tiefe: number;
  spurBm25: boolean;
  spurVektor: boolean;
  spurGraph: boolean;
}

function normTiefe(v: number): number {
  return Math.min(SUCH_TIEFE_MAX, Math.max(SUCH_TIEFE_MIN, Math.round(v)));
}

export function leseSuchPrefs(): SuchPrefs {
  const bool = (k: string) => {
    try { const v = localStorage.getItem(k); return v === null ? true : v === '1'; } catch { return true; }
  };
  let roh = SUCH_TIEFE_DEFAULT;
  try { const v = parseInt(localStorage.getItem(KEY_TIEFE) || '', 10); if (Number.isFinite(v)) roh = v; } catch { /* kein Storage */ }
  return { tiefe: normTiefe(roh), spurBm25: bool(KEY_BM25), spurVektor: bool(KEY_VEKTOR), spurGraph: bool(KEY_GRAPH) };
}

export function schreibeSuchPrefs(p: SuchPrefs): void {
  try {
    localStorage.setItem(KEY_TIEFE, String(normTiefe(p.tiefe)));
    localStorage.setItem(KEY_BM25, p.spurBm25 ? '1' : '0');
    localStorage.setItem(KEY_VEKTOR, p.spurVektor ? '1' : '0');
    localStorage.setItem(KEY_GRAPH, p.spurGraph ? '1' : '0');
  } catch { /* kein Storage — die Session trägt weiter */ }
  spiegelePrefs();
  try { window.dispatchEvent(new CustomEvent(SUCH_PREFS_EVENT)); } catch { /* Umgebung ohne window (Tests) */ }
}

/** Ergebnisregler: nächsthöhere Stufe normalisieren (0 = „alles“ bleibt 0). */
export function normalisiereTreffer(v: number): number {
  if (!Number.isFinite(v)) return 5;
  if (v === 0) return 0;
  return RESULT_STOPS.find((s) => s !== 0 && s >= v) ?? 5;
}

export function leseTreffer(): number {
  try {
    const v = parseInt(localStorage.getItem(KEY_TREFFER) || '5', 10);
    return normalisiereTreffer(v);
  } catch { return 5; }
}

export function schreibeTreffer(v: number): void {
  try { localStorage.setItem(KEY_TREFFER, String(normalisiereTreffer(v))); } catch { /* kein Storage */ }
  spiegelePrefs();
  try { window.dispatchEvent(new CustomEvent(SUCH_PREFS_EVENT)); } catch { /* Umgebung ohne window (Tests) */ }
}

/**
 * Hook für alle Flächen, die die Such-Präferenzen live sehen sollen:
 * Einstellungen schreiben → Dashboard ändert die Requests, ohne neu geladen
 * zu werden. setze() schreibt und übernimmt sofort lokal.
 */
export function useSuchPrefs(): [SuchPrefs, (p: SuchPrefs) => void] {
  const [prefs, setPrefs] = useState<SuchPrefs>(leseSuchPrefs);
  useEffect(() => {
    const on = () => setPrefs(leseSuchPrefs());
    window.addEventListener(SUCH_PREFS_EVENT, on);
    window.addEventListener('storage', on);
    return () => {
      window.removeEventListener(SUCH_PREFS_EVENT, on);
      window.removeEventListener('storage', on);
    };
  }, []);
  const setze = (p: SuchPrefs) => {
    const norm = { ...p, tiefe: normTiefe(p.tiefe) };
    setPrefs(norm);
    schreibeSuchPrefs(norm);
  };
  return [prefs, setze];
}
