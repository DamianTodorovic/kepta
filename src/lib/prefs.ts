// Die Nutzer-Präferenzen leben im localStorage — und der hängt am
// Random-Port-Origin der App: jeder Neustart war leer (26.9.-Audit: zehn
// verwaiste Origins im Chromium-Profil). Der Spiegel in die verschlüsselte
// DB (/api/settings, Schlüssel „ui_prefs") überlebt den Neustart; beim Start
// füllt die Hydration FEHLENDE Keys aus der Spiegelung — vorhandene bleiben
// unangetastet, frischere lokale Entscheidungen gewinnen.
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

/** Alle bekannten Präferenzen in die DB spiegeln — entprellt (1,5 s). */
export function spiegelePrefs(): void {
  if (spiegelTimer) return;
  spiegelTimer = setTimeout(() => {
    spiegelTimer = null;
    try {
      fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ui_prefs: JSON.stringify(prefsObjekt()) }),
      }).catch(() => { /* offline: localStorage trägt weiter */ });
    } catch { /* Umgebung ohne fetch (Tests) */ }
  }, 1500);
}

export async function hydratePrefs(): Promise<void> {
  try {
    const r = await fetch('/api/settings');
    if (!r.ok) return;
    const d = (await r.json()) as Record<string, unknown>;
    const roh = typeof d.ui_prefs === 'string' ? d.ui_prefs : '';
    if (!roh) return;
    const gespiegelt = JSON.parse(roh) as Record<string, string>;
    for (const k of PREF_KEYS) {
      try {
        if (localStorage.getItem(k) === null && typeof gespiegelt[k] === 'string') {
          localStorage.setItem(k, gespiegelt[k]);
        }
      } catch { /* kein Storage */ }
    }
  } catch { /* offline: nichts zu holen */ }
}
