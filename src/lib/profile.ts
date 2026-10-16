// Adaptives Profil — jeder Download wird zum Unikat
//
// Frueher standen hier acht feste Kategorien, zwei davon aus dem Umfeld des
// Autors ("Fishing", "Dropshipping"). Sie standen an erster Stelle, und jede
// schrieb fremde Fachnotizen in die Datenbank des Nutzers. Fuer ein Werkzeug,
// das mit "dein Wissen" wirbt, ist eine vorgegebene Themenliste die falsche
// Form: sie passt immer nur fuer manche. Jetzt tippt jeder seine eigenen
// Themen ein — eine Anwaeltin "Mandatsakten, Fristen", jemand anders eben
// etwas ganz anderes.
export type LegacyUseCase = 'angeln' | 'dropshipping' | 'ki' | 'coding' | 'studium' | 'forschung' | 'business' | 'kreativ';

/** Hoechstens so viele Themen — mehr schaerft den Systemprompt nicht, es verwaessert ihn. */
export const MAX_TOPICS = 8;
/** Ein Thema ist ein Stichwort, kein Aufsatz. */
export const MAX_TOPIC_LENGTH = 40;

/**
 * Nimmt entgegen, was der Nutzer getippt hat: trimmt, wirft Leeres weg,
 * entfernt Doppelte unabhaengig von Gross-/Kleinschreibung und begrenzt
 * Anzahl und Laenge. Alles, was kein brauchbarer Text ist, faellt still raus —
 * dieses Feld darf nie ein Grund sein, warum die Einrichtung abbricht.
 */
export function normalizeTopics(eingabe: unknown): string[] {
  if (!Array.isArray(eingabe)) return [];
  const gesehen = new Set<string>();
  const raus: string[] = [];
  for (const roh of eingabe) {
    if (typeof roh !== 'string') continue;
    const t = roh.trim().slice(0, MAX_TOPIC_LENGTH);
    if (!t) continue;
    const schluessel = t.toLocaleLowerCase();
    if (gesehen.has(schluessel)) continue;
    gesehen.add(schluessel);
    raus.push(t);
    if (raus.length >= MAX_TOPICS) break;
  }
  return raus;
}

/**
 * Nur fuer die Migration: wer frueher eine Kategorie angeklickt hat, soll seine
 * Auswahl nicht verlieren. Die Schluessel waren intern und teils deutsch, der
 * Nutzer sieht ab jetzt Klartext. Wird nirgends mehr zur Auswahl angeboten.
 */
const LEGACY_LABELS: Record<LegacyUseCase, string> = {
  angeln: 'Fishing',
  dropshipping: 'E-commerce',
  ki: 'AI & RAG',
  coding: 'Coding',
  studium: 'Study & learning',
  forschung: 'Research',
  business: 'Business & productivity',
  kreativ: 'Creative & writing',
};

export interface UserProfileAdaptive {
  displayName: string;
  /** Die eigenen Worte des Nutzers. Leer ist ausdruecklich erlaubt. */
  topics: string[];
  /** @deprecated Nur noch beim Laden alter Profile gelesen. */
  useCases?: LegacyUseCase[];
  goal: string;
  customNote: string;
  createdAt: number;
  updatedAt: number;
  detectedAIs: DetectedAI[];
  preferredProviderId?: string;
  hasCompletedOnboarding: boolean;
}

export interface DetectedAI {
  id: string;
  label: string;
  available: boolean;
  models: string[];
  latencyMs?: number;
}

const PROFILE_KEY = 'ki_gehirn_adaptive_profile';

export function loadProfile(): UserProfileAdaptive | null {
  try {
    const raw = localStorage.getItem(PROFILE_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw) as UserProfileAdaptive;
    if (!p || !p.displayName) return null;

    // Migration: Profile aus der Zeit der festen Kategorien tragen useCases
    // statt topics. Die Auswahl bleibt erhalten, nur als eigene Worte.
    let topics = normalizeTopics(p.topics);
    if (topics.length === 0 && Array.isArray(p.useCases)) {
      topics = normalizeTopics(p.useCases.map((uc) => LEGACY_LABELS[uc] ?? String(uc)));
    }
    return { ...p, topics };
  } catch { return null; }
}

export function saveProfile(p: UserProfileAdaptive) {
  localStorage.setItem(PROFILE_KEY, JSON.stringify(p));
  // auch an Server spiegeln für MCP / Backup
  fetch('/api/profile', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(p) }).catch(()=>{});
}

export function createDefaultProfile(): UserProfileAdaptive {
  return {
    displayName: '',
    topics: [],
    goal: '',
    customNote: '',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    detectedAIs: [],
    hasCompletedOnboarding: false,
  };
}

// Erkennt lokale KIs — clientseitig direkt, ohne Server-Roundtrip wo möglich
export async function detectLocalAIs(): Promise<DetectedAI[]> {
  const results: DetectedAI[] = [];
  const checks: { id: string; label: string; url: string; parse: (j:any)=>string[] }[] = [
    { id: 'ollama', label: 'Ollama (local, free)', url: 'http://localhost:11434/api/tags', parse: (j)=> (j.models||[]).map((m:any)=>m.name||m.model).filter(Boolean) },
    { id: 'lmstudio', label: 'LM Studio (local)', url: 'http://localhost:1234/v1/models', parse: (j)=> (j.data||j.models||[]).map((m:any)=>m.id||m.name).filter(Boolean) },
  ];
  for (const c of checks) {
    const t0 = Date.now();
    try {
      const r = await fetch(c.url, { signal: AbortSignal.timeout(1200) });
      if (!r.ok) throw new Error(String(r.status));
      const j = await r.json();
      const models = c.parse(j);
      results.push({ id: c.id, label: c.label, available: true, models, latencyMs: Date.now()-t0 });
    } catch {
      results.push({ id: c.id, label: c.label, available: false, models: [] });
    }
  }
  // CORS kann dem Fenster den Blick auf Ollama oder LM Studio versperren, obwohl
  // dieselben Adressen vom Server aus erreichbar sind. Der Nachzug geht durch die
  // eigne Tuer (`POST /api/models`) — bis zum 16.10. stand in diesem Zweig nur ein
  // Kommentar, und der Assistent meldete ein laufendes Ollama als „nicht da".
  for (const r of results) {
    if (r.available) continue;
    const ziel = checks.find((c) => c.id === r.id);
    if (!ziel) continue;
    try {
      const antwort = await fetch("/api/models", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ protocol: "openai", baseUrl: new URL(ziel.url).origin + "/v1", apiKey: "" }),
        signal: AbortSignal.timeout(2500),
      });
      if (!antwort.ok) continue;
      const d = (await antwort.json()) as { models?: unknown };
      const modelle = Array.isArray(d.models) ? d.models.filter((m): m is string => typeof m === "string" && m.length > 0) : [];
      if (modelle.length) { r.available = true; r.models = modelle; }
    } catch { /* der Server kann auch nicht — dann stimmt das „nicht da" */ }
  }
  return results;
}

export function suggestProvider(detected: DetectedAI[], fallback: string = 'ollama'): string {
  const ollama = detected.find(d=>d.id==='ollama' && d.available && d.models.length>0);
  if (ollama) return 'ollama';
  const lm = detected.find(d=>d.id==='lmstudio' && d.available);
  if (lm) return 'lmstudio';
  // sonst bester Cloud-Fallback
  return fallback;
}
