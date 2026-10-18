export type Protocol = 'openai' | 'anthropic';

export interface ProviderPreset {
  id: string;
  label: string;
  protocol: Protocol;
  baseUrl: string;
  defaultModel: string;
  needsKey: boolean;
  hint: string;
}

// Alle sprechen OpenAI-Protokoll — ein Key, jedes Modell nutzbar.
// OpenRouter allein gibt Zugriff auf hunderte Modelle, die Direkt-Anbieter sind schneller/günstiger.
export const PROVIDERS: ProviderPreset[] = [
  {
    id: 'openai',
    label: 'OpenAI (GPT)',
    protocol: 'openai',
    baseUrl: 'https://api.openai.com/v1',
    defaultModel: 'gpt-4o-mini',
    needsKey: true,
    hint: 'Key from platform.openai.com — gpt-4o, gpt-4o-mini, o1, o3',
  },
  {
    id: 'anthropic',
    label: 'Anthropic (Claude)',
    protocol: 'anthropic',
    baseUrl: 'https://api.anthropic.com',
    defaultModel: 'claude-sonnet-4-20250514',
    needsKey: true,
    hint: 'Key from console.anthropic.com — Sonnet 4, Haiku 3.5, Opus 4',
  },
  {
    id: 'gemini',
    label: 'Google Gemini',
    protocol: 'openai',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    defaultModel: 'gemini-2.5-flash',
    needsKey: true,
    hint: 'Key from aistudio.google.com — 2.5 Flash/Pro, 2.0 Flash',
  },
  {
    id: 'openrouter',
    label: 'OpenRouter (every model)',
    protocol: 'openai',
    baseUrl: 'https://openrouter.ai/api/v1',
    defaultModel: 'openai/gpt-4o-mini',
    needsKey: true,
    hint: 'One key for hundreds of models from every provider — the most flexible choice',
  },
  {
    id: 'mistral',
    label: 'Mistral',
    protocol: 'openai',
    baseUrl: 'https://api.mistral.ai/v1',
    defaultModel: 'mistral-large-latest',
    needsKey: true,
    hint: 'Key from console.mistral.ai — Large 2, Small, Codestral',
  },
  {
    id: 'groq',
    label: 'Groq',
    protocol: 'openai',
    baseUrl: 'https://api.groq.com/openai/v1',
    defaultModel: 'llama-3.3-70b-versatile',
    needsKey: true,
    hint: 'Very fast — Llama 3.3, Mixtral, Gemma',
  },
  {
    id: 'deepseek',
    label: 'DeepSeek',
    protocol: 'openai',
    baseUrl: 'https://api.deepseek.com/v1',
    defaultModel: 'deepseek-chat',
    needsKey: true,
    hint: 'Key from platform.deepseek.com — V3, R1 reasoner',
  },
  {
    id: 'xai',
    label: 'xAI (Grok)',
    protocol: 'openai',
    baseUrl: 'https://api.x.ai/v1',
    defaultModel: 'grok-3',
    needsKey: true,
    hint: 'Key from console.x.ai — Grok 3 and Grok 3 mini',
  },
  {
    id: 'perplexity',
    label: 'Perplexity (Sonar)',
    protocol: 'openai',
    baseUrl: 'https://api.perplexity.ai',
    defaultModel: 'sonar',
    needsKey: true,
    hint: 'Key from perplexity.ai — sonar, sonar-pro, with web search',
  },
  {
    id: 'together',
    label: 'Together AI',
    protocol: 'openai',
    baseUrl: 'https://api.together.xyz/v1',
    defaultModel: 'meta-llama/Meta-Llama-3.1-70B-Instruct-Turbo',
    needsKey: true,
    hint: 'Key from api.together.ai — every open-source model, cheaply',
  },
  {
    id: 'fireworks',
    label: 'Fireworks AI',
    protocol: 'openai',
    baseUrl: 'https://api.fireworks.ai/inference/v1',
    defaultModel: 'accounts/fireworks/models/llama-v3p1-405b-instruct',
    needsKey: true,
    hint: 'Key from fireworks.ai — Llama 405B, Qwen, DeepSeek, fast',
  },
  {
    id: 'cohere',
    label: 'Cohere',
    protocol: 'openai',
    baseUrl: 'https://api.cohere.com/compatibility/v1',
    defaultModel: 'command-r-plus',
    needsKey: true,
    hint: 'Key from dashboard.cohere.com — Command R+, Embed v4',
  },
  {
    id: 'cerebras',
    label: 'Cerebras',
    protocol: 'openai',
    baseUrl: 'https://api.cerebras.ai/v1',
    defaultModel: 'llama3.1-70b',
    needsKey: true,
    hint: 'Extremely fast — key from cerebras.ai, Llama 3.1 70B',
  },
  {
    id: 'huggingface',
    label: 'Hugging Face',
    protocol: 'openai',
    baseUrl: 'https://api-inference.huggingface.co/v1',
    defaultModel: 'meta-llama/Meta-Llama-3-8B-Instruct',
    needsKey: true,
    hint: 'Key from huggingface.co — thousands of open-source models',
  },
  {
    id: 'novita',
    label: 'Novita AI',
    protocol: 'openai',
    baseUrl: 'https://api.novita.ai/v3/openai',
    defaultModel: 'meta-llama/llama-3.1-70b-instruct',
    needsKey: true,
    hint: 'Cheap — key from novita.ai, all the Llama and Qwen models',
  },
  {
    id: 'github',
    label: 'GitHub Models',
    protocol: 'openai',
    baseUrl: 'https://models.inference.ai.azure.com',
    defaultModel: 'gpt-4o-mini',
    needsKey: true,
    hint: 'Key from github.com/marketplace/models — gpt-4o, Llama, Phi',
  },
  {
    id: 'azure',
    label: 'Azure OpenAI',
    protocol: 'openai',
    baseUrl: '',
    defaultModel: 'gpt-4o',
    needsKey: true,
    hint: 'Enter your Azure URL: https://{name}.openai.azure.com/openai/deployments/{id}',
  },
  {
    id: 'ollama',
    label: 'Ollama (local, free)',
    protocol: 'openai',
    baseUrl: 'http://localhost:11434/v1',
    defaultModel: 'llama3.2',
    needsKey: false,
    hint: 'Runs entirely offline on your machine. Pull a model with "ollama pull llama3.2".',
  },
  {
    id: 'lmstudio',
    label: 'LM Studio (local)',
    protocol: 'openai',
    baseUrl: 'http://localhost:1234/v1',
    defaultModel: '',
    needsKey: false,
    hint: 'Start LM Studio with its local server enabled.',
  },
  {
    id: 'custom',
    label: 'Custom endpoint (OpenAI-compatible)',
    protocol: 'openai',
    baseUrl: '',
    defaultModel: '',
    needsKey: false,
    hint: 'Any API that speaks the OpenAI format (vLLM, Jan, GPT4All, …).',
  },
];

export interface AISettings {
  providerId: string;
  apiKey: string;
  baseUrl: string;
  model: string;
  /**
   * Optionales, kleines Modell nur für Auto-Learn. Leer = dasselbe wie `model`.
   * Grosse Reasoning-Modelle brauchen für Titel und drei Tags Minuten pro Antwort;
   * ein 3B-Modell erledigt das in Sekunden.
   */
  extractModel?: string;
}

// Der Sitzungsname darf nicht unter `kepta_` / `ki_gehirn_` liegen: src/lib/settings.ts
// huellt localStorage ein und spiegelt jeden Namen mit diesen Praefixen in
// /api/settings zurueck — gemessen am gebauten Buendel stand der Klartext des
// Schluessels nach dem Neustart wieder in der rohen Antwort (f13-evidence/klage-buendel.txt).
const SITZUNGS_NAME = 'aiVerbindung';
const ALTE_SITZUNGS_NAME = 'ki_gehirn_ai_settings';

// ---------- F13: der Schluessel bleibt lokal, die API sieht ihn nie ----------
//
// GET /api/settings maskiert seit A3-09 secretfoermige Namen und den
// ai_settings-Blob — und genau darin lag bisher der KI-Schluessel der App.
// Die App kann sich auf den Rueckweg nicht mehr verlassen, also holt sie sich
// den Schluessel nicht mehr von dort: die Verbindung liegt unter einem Namen,
// den die Maske durchlaesst (`ai_connection`), der Schluessel selbst nur als
// Umschlag, versiegelt mit dem Datenbankschluessel dieser Installation. Der
// wohnt im Schluesselbund des Betriebssystems und kommt über die
// Wiederherstellungs-Route heraus — die Antwort der Einstellungs-Route traegt
// ihn nie.
const SPIEGEL_NAME = 'ai_connection';
const ALTER_BLOB = 'ai_settings';
const UMSCHLAG_KENNUNG = 'v1.';
const HKDF_SALT = 'kepta-app/ai-connection';
const HKDF_INFO = 'ki-schluessel';

/** Der Wert des Schluesselfelds, das keinen Reim verdient: lokaler Provider. */
const LOKALER_WERT = 'local';

function hexZuBytes(hex: string): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(new ArrayBuffer(hex.length / 2));
  for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return bytes;
}

function bytesZuBase64(bytes: Uint8Array): string {
  let text = '';
  for (const b of bytes) text += String.fromCharCode(b);
  return btoa(text);
}

function base64ZuBytes(base64: string): Uint8Array<ArrayBuffer> {
  const roh = atob(base64);
  const bytes = new Uint8Array(new ArrayBuffer(roh.length));
  for (let i = 0; i < roh.length; i++) bytes[i] = roh.charCodeAt(i);
  return bytes;
}

/** Was im Spiegel steht: die Verbindung, der Schluessel nur als Umschlag. */
interface GespiegelteVerbindung {
  v?: number;
  providerId?: string;
  baseUrl?: string;
  model?: string;
  extractModel?: string;
  schluessel?: string;
}

interface Huelle {
  schluessel: CryptoKey;
  /** Wo der Datenbankschluessel liegt — macOS Keychain, DPAPI, Secret Service. */
  ablage: string | null;
}

/** Einmal geholt, fuer die Sitzung behalten. Scheitern wird nicht gepuffert. */
let gespeicherteHuelle: Huelle | null = null;

async function baueHuelle(): Promise<Huelle | null> {
  const r = await fetch('/api/recovery-key', { method: 'POST', headers: { 'x-kepta-recovery': '1' } });
  if (!r.ok) return null;
  const d = (await r.json()) as { key?: unknown; storedIn?: unknown };
  const hex = typeof d.key === 'string' ? d.key.trim() : '';
  if (!/^[0-9a-f]{64}$/i.test(hex)) return null;
  const basis = await crypto.subtle.importKey('raw', hexZuBytes(hex), 'HKDF', false, ['deriveKey']);
  const schluessel = await crypto.subtle.deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt: new TextEncoder().encode(HKDF_SALT), info: new TextEncoder().encode(HKDF_INFO) },
    basis,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
  return { schluessel, ablage: typeof d.storedIn === 'string' ? d.storedIn : null };
}

async function huelle(): Promise<Huelle | null> {
  if (gespeicherteHuelle) return gespeicherteHuelle;
  const versucht = await baueHuelle().catch(() => null);
  if (versucht) gespeicherteHuelle = versucht;
  return versucht;
}

/** Der Klartext als Umschlag, oder null, wenn diese Installation keinen Verschluss hat. */
async function versiegle(klartext: string): Promise<string | null> {
  const h = await huelle();
  if (!h) return null;
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const dicht = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, h.schluessel, new TextEncoder().encode(klartext)));
  const paket = new Uint8Array(iv.length + dicht.length);
  paket.set(iv, 0);
  paket.set(dicht, iv.length);
  return UMSCHLAG_KENNUNG + bytesZuBase64(paket);
}

/** Macht einen Umschlag auf. Anderer Datenbankschluessel → leer, nie ein Absturz. */
async function oeffne(wert: string): Promise<string> {
  if (!wert) return '';
  if (wert === LOKALER_WERT) return LOKALER_WERT;
  if (!wert.startsWith(UMSCHLAG_KENNUNG)) return '';
  const h = await huelle();
  if (!h) return '';
  const paket = base64ZuBytes(wert.slice(UMSCHLAG_KENNUNG.length));
  if (paket.length <= 12) return '';
  try {
    const klar = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: paket.slice(0, 12) },
      h.schluessel,
      paket.slice(12),
    );
    return new TextDecoder().decode(klar);
  } catch {
    return '';
  }
}

export interface AISchluesselStatus {
  /** true = der Schluessel ist versiegelt und hält einen Neustart aus. */
  verschlossen: boolean;
  /** Wo der Verschluss liegt — null, wenn diese Installation keinen hat. */
  ablage: string | null;
}

export async function kiSchluesselStatus(): Promise<AISchluesselStatus> {
  const h = await huelle();
  return { verschlossen: h !== null, ablage: h?.ablage ?? null };
}

export function loadAISettings(): AISettings {
  try {
    const roh = localStorage.getItem(SITZUNGS_NAME) ?? localStorage.getItem(ALTE_SITZUNGS_NAME);
    if (roh) return JSON.parse(roh);
  } catch { /* ignore */ }
  const p = PROVIDERS[0];
  return { providerId: p.id, apiKey: '', baseUrl: p.baseUrl, model: p.defaultModel };
}

/**
 * Spiegel in die verschluesselte Datenbank: das localStorage haengt am
 * Origin — und der Port der App ist bei jedem Start ein anderer
 * (26.9.-Audit: zehn verwaiste Origins im Chromium-Profil). Ohne diesen
 * Spiegel war die AI-Verbindung nach jedem Neustart weg.
 *
 * Der Spiegel traegt die Verbindung, nie den Schluessel im Klartext: der geht
 * als Umschlag mit hinein (`versiegle`). `haelt` sagt, ob der Spiegel auch den
 * Schluessel sicher verwahrt — nur dann darf die alte Klartext-Spiegelung
 * (`ai_settings`) geloescht werden. Sonst bliebe der Nutzer ohne Schluessel da
 * stehen, und genau das ist der Fall, an dem solche Aenderungen aussperren.
 */
async function spiegelbild(s: AISettings): Promise<{ text: string; haelt: boolean }> {
  let schluessel: string | undefined;
  let haelt = true;
  if (s.apiKey && s.apiKey !== LOKALER_WERT) {
    const umschlag = await versiegle(s.apiKey);
    if (umschlag) schluessel = umschlag;
    else haelt = false; // ohne Verschluss wird der Schluessel nirgends abgelegt
  } else if (s.apiKey === LOKALER_WERT) {
    schluessel = LOKALER_WERT;
  }
  const text = JSON.stringify({
    v: 1,
    providerId: s.providerId,
    baseUrl: s.baseUrl,
    model: s.model,
    ...(s.extractModel ? { extractModel: s.extractModel } : {}),
    ...(schluessel ? { schluessel } : {}),
  });
  return { text, haelt };
}

/** Die Reihen, in denen aeltere Versionen den Klartext ablegten. */
const ALTE_ABLAGEN = [ALTER_BLOB, ALTE_SITZUNGS_NAME];

async function spiegle(s: AISettings): Promise<void> {
  const { text, haelt } = await spiegelbild(s);
  const leib: Record<string, string | null> = { [SPIEGEL_NAME]: text };
  if (haelt) for (const alt of ALTE_ABLAGEN) leib[alt] = null;
  const antwort = await fetch('/api/settings', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(leib),
  });
  // P4-02: die Antwort war bisher ein blinder Wurf. 413 (Etat voll), 429 (Schreibkante)
  // und 500 (Datenbank) liefen als Erfolg weiter, weil die Kette sie schluckte.
  if (!antwort.ok) throw new Error(`HTTP ${antwort.status}`);
}

/** Die Spiegelung laeuft hinterher her und der Reihenfolge nach — nie durcheinander. */
let spiegelKette: Promise<void> = Promise.resolve();

/**
 * localStorage ist die sofortige Wahrheit der Sitzung, die Datenbank das
 * Gedaechtnis ueber den Neustart. Fire-and-forget wie zuvor, aber die
 * Rueckgabe der Kette laesst darauf warten (Tests, Wanderung).
 */
export function saveAISettings(s: AISettings): Promise<void> {
  localStorage.setItem(SITZUNGS_NAME, JSON.stringify(s));
  // nimmt die gespiegelte Reihe mit: removeItem laeuft durch die Huelle von
  // src/lib/settings.ts und loescht damit auch die Zeile in der Datenbank
  localStorage.removeItem(ALTE_SITZUNGS_NAME);
  const lauf = spiegelKette.then(() => spiegle(s));
  // P4-02: wer wartet, sieht den Fehlschlag; wer ignoriert, nicht. Die Kette haelt an
  // einem abgewiesenen Spiegel zusammen, aber der Rueckweg bleibt offen — der Handler
  // an `lauf` verhindert zugleich jede unbehandelte Ablehnung an den drei Aufrufstellen,
  // die nicht warten (Chat.tsx:135, OnboardingWizard.tsx:86, Settings.tsx:780).
  spiegelKette = lauf.catch(() => { /* offline: localStorage traegt weiter */ });
  return lauf;
}

function legeFest(s: AISettings): void {
  localStorage.setItem(SITZUNGS_NAME, JSON.stringify(s));
  localStorage.removeItem(ALTE_SITZUNGS_NAME);
}

/**
 * Beim App-Start die DB-Spiegelung zuruecklesen. Die Regel ist simpel und
 * ehrlich: JEDES saveAISettings spiegelt sofort in die DB — ist lokal also ein
 * Eintrag vorhanden, ist er mindestens so frisch wie die Spiegelung (gleicher
 * Port, laufende Sitzung) und bleibt unangetastet. Ist localStorage LEER (der
 * Normalfall nach einem Neustart — neuer Port, neuer Origin), uebernimmt die
 * Spiegelung komplett, und der Umschlag geht mit dem Schluessel dieser
 * Installation auf.
 *
 * Ein Bestand von VOR dieser Aenderung liegt noch als Klartext-Blob in der
 * Antwort: der wird gelesen, versiegelt und erst dann geloescht, wenn der
 * Umschlag wirklich haelt.
 */
export async function hydrateAISettings(): Promise<AISettings> {
  try {
    if (localStorage.getItem(SITZUNGS_NAME)) return loadAISettings();
    const r = await fetch('/api/settings');
    if (!r.ok) return loadAISettings();
    const d = (await r.json()) as Record<string, unknown>;

    const roh = typeof d[SPIEGEL_NAME] === 'string' ? (d[SPIEGEL_NAME] as string) : '';
    if (roh) {
      try {
        const gespiegelt = JSON.parse(roh) as GespiegelteVerbindung;
        if (gespiegelt?.model) {
          const s: AISettings = {
            providerId: gespiegelt.providerId ?? PROVIDERS[0].id,
            apiKey: await oeffne(gespiegelt.schluessel ?? ''),
            baseUrl: gespiegelt.baseUrl ?? '',
            model: gespiegelt.model,
            ...(gespiegelt.extractModel ? { extractModel: gespiegelt.extractModel } : {}),
          };
          legeFest(s);
          return s;
        }
      } catch { /* kaputter Spiegel: die Defaults tragen weiter */ }
    }

    const alt = ALTE_ABLAGEN.map((name) => (typeof d[name] === 'string' ? (d[name] as string) : '')).find((t) => t);
    if (alt) {
      try {
        const vorF13 = JSON.parse(alt) as Partial<AISettings>;
        if (vorF13?.model) {
          const p = providerById(vorF13.providerId ?? '');
          const s: AISettings = {
            providerId: p.id,
            apiKey: typeof vorF13.apiKey === 'string' ? vorF13.apiKey : '',
            baseUrl: vorF13.baseUrl ?? p.baseUrl,
            model: vorF13.model,
            ...(vorF13.extractModel ? { extractModel: vorF13.extractModel } : {}),
          };
          await saveAISettings(s);
          return s;
        }
      } catch { /* auch der alte Blob kann kaputt sein — Defaults, kein Absturz */ }
    }

    return loadAISettings();
  } catch {
    return loadAISettings();
  }
}

export function providerById(id: string): ProviderPreset {
  return PROVIDERS.find(p => p.id === id) || PROVIDERS[0];
}

/**
 * Entkoppelt die aktuelle KI: Modell und (bei Cloud-Providern) der Key werden
 * gelöscht, der Provider-Merker bleibt. Nach dem Aufruf meldet
 * `resolveAIConnection` ehrlich „disconnected" — bis neu verbunden wird.
 */
export function disconnectAI(): AISettings {
  const s = loadAISettings();
  const p = providerById(s.providerId);
  const getrennt: AISettings = {
    ...s,
    model: '',
    apiKey: p.needsKey ? '' : s.apiKey,
    extractModel: '',
  };
  // P4-03: der Trenner wartete nicht und wusste darum nicht, ob die Trennung in der
  // Datenbank landete. Jetzt: die Spiegelung traegt die Trennung, sonst sagt der
  // ruecklesende Pfad sie erneut an — und die Kette bricht nicht an ihr.
  void saveAISettings(getrennt).catch(() => { /* die Trennung sitzt im Browserspeicher */ });
  return getrennt;
}

// ---------- Verbindungsstatus (ehrlich: nur "connected", wenn wirklich nutzbar) ----------

export type AIConnection =
  | { state: 'connected'; label: string; model: string; local: boolean }
  | { state: 'disconnected' };

/**
 * Bestimmt den echten Verbindungsstatus aus Settings + Provider + optionalem
 * Local-Probe-Ergebnis. Cloud-Provider gelten nur mit API-Key als verbunden,
 * lokale Provider (needsKey=false) nur, wenn ihr Server erreichbar ist.
 * `localReachable`: true/false nach Probe, null = noch nicht geprobt.
 */
export function resolveAIConnection(
  settings: AISettings,
  provider: ProviderPreset,
  localReachable: boolean | null
): AIConnection {
  const model = settings.model?.trim();
  if (!model) return { state: 'disconnected' };

  if (provider.needsKey) {
    return settings.apiKey?.trim()
      ? { state: 'connected', label: provider.label, model, local: false }
      : { state: 'disconnected' };
  }
  // Lokaler / kein-Key-Provider: verbunden nur bei erreichbarem Server.
  return localReachable === true
    ? { state: 'connected', label: provider.label, model, local: true }
    : { state: 'disconnected' };
}
