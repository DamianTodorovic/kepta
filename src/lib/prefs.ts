import { coalescedJson, invalidateApiCache } from "./api";

// Die Nutzer-Präferenzen leben im localStorage — und der hängt am
// Random-Port-Origin der App: jeder Neustart war leer (26.9.-Audit: zehn
// verwaiste Origins im Chromium-Profil). Der Spiegel in die verschlüsselte
// DB (/api/settings, Schlüssel „ui_prefs") überlebt den Neustart; beim Start
// füllt die Hydration FEHLENDE Keys aus der Spiegelung — vorhandene bleiben
// unangetastet, frischere lokale Entscheidungen gewinnen.
// Welche der beiden Spiegelungen zuerst fuellt, ist eine Reihenfolge, keine Laune:
// main.tsx:11 holt die Einzelzeilen aus settings.json vor dem ersten Rendern, diese hier
// spaeter (Dashboard.tsx:210). Was beide kennen, entscheidet die erste; die zweite kann
// nur noch Luecken fuellen — und das ist gewollt, denn beide zusammen ueberleben auch
// eine Umgebung, in der die Huelle um localStorage nicht installiert werden konnte.
export const PREF_KEYS = [
  'kepta_scan_wunsch',
  'ki_gehirn_adaptive_profile',
  'ki_gehirn_autolearn',
  'ki_gehirn_gruppierung',
  'ki_gehirn_semantic',
  'ki_gehirn_topK',
  'ki_gehirn_wizard_dismissed',
  // Paket 2 — Such-Parität: Suchtiefe + Spuren-Schalter wandern mit in die DB.
  'ki_gehirn_such_tiefe',
  'ki_gehirn_spur_bm25',
  'ki_gehirn_spur_vektor',
  'ki_gehirn_spur_graph',
] as const;

export function prefsObjekt(): Record<string, string> {
  const aus: Record<string, string> = {};
  for (const k of PREF_KEYS) {
    let v: string | null = null;
    try { v = localStorage.getItem(k); } catch { /* kein Storage */ }
    if (v !== null) aus[k] = v;
  }
  return aus;
}

let spiegelTimer: ReturnType<typeof setTimeout> | null = null;
let gelesen = false;
let lauf: Promise<void> | null = null;

/**
 * Alle bekannten Präferenzen in die DB spiegeln — entprellt (1,5 s).
 *
 * (b) aus dem A1-Nachtrag: gespiegelt wird erst, NACHDEM die Spiegelung gelesen
 * ist. Der Rahmen schreibt beim Mount `ki_gehirn_gruppierung` und
 * `ki_gehirn_semantic` in den lokalen Speicher, und der entprellte Lauf landete
 * bisher vor der Antwort von `/api/settings` — dann stand in der Datenbank eine
 * Spiegelung ohne den Assistenten-Merker, und die Entscheidung des Nutzers war
 * weg. Also: Lesen zuerst, Schreiben danach.
 */
export function spiegelePrefs(): void {
  const bereit = gelesen ? Promise.resolve() : hydratePrefs();
  void bereit.then(() => {
    if (spiegelTimer) return;
    spiegelTimer = setTimeout(() => {
      spiegelTimer = null;
      try {
        invalidateApiCache("/api/settings");
        fetch('/api/settings', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ui_prefs: JSON.stringify(prefsObjekt()) }),
        }).catch(() => { /* offline: localStorage trägt weiter */ });
      } catch { /* Umgebung ohne fetch (Tests) */ }
    }, 1500);
  });
}

/** Die Spiegelung lesen und fehlende Keys eintragen — laufende Aufträge werden geteilt. */
export function hydratePrefs(): Promise<void> {
  if (lauf) return lauf;
  lauf = liesSpiegelung()
    .then(() => { gelesen = true; })
    .finally(() => { lauf = null; });
  return lauf;
}

async function liesSpiegelung(): Promise<void> {
  try {
    const r = await coalescedJson<Record<string, unknown>>('/api/settings', { ttlMs: 500 });
    if (!r.ok || !r.data) return;
    const d = r.data;
    // Die Settings-Maske auf der Server-Seite haelt `ui_prefs` als Zeichenkette
    // (der Speicher nimmt nur Strings an). Solange beide Seiten committet werden,
    // ist das eine Form, die wechseln kann — und ein stummer Ausfall dieser
    // Hydration setzt jedem Nutzer alle Schalter zurueck, weil der
    // Zufalls-Port-Origin ohne Spiegelung leer startet. Also beide Formen lesen.
    const roh = d.ui_prefs;
    let gespiegelt: Record<string, string> = {};
    if (typeof roh === "string" && roh) {
      gespiegelt = JSON.parse(roh) as Record<string, string>;
    } else if (roh && typeof roh === "object") {
      gespiegelt = roh as Record<string, string>;
    } else {
      return;
    }
    for (const k of PREF_KEYS) {
      try {
        if (localStorage.getItem(k) === null && typeof gespiegelt[k] === "string") {
          localStorage.setItem(k, gespiegelt[k]);
        }
      } catch { /* kein Storage */ }
    }
  } catch { /* offline: nichts zu holen */ }
}
