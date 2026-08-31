// Adaptives Profil — jeder Download wird zum Unikat
export type UseCase = 'angeln' | 'dropshipping' | 'ki' | 'coding' | 'studium' | 'forschung' | 'business' | 'kreativ';

export interface UserProfileAdaptive {
  displayName: string;
  useCases: UseCase[];
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

export const USECASE_LABELS: Record<UseCase, { label: string; icon: string; desc: string }> = {
  angeln: { label: 'Angeln & FangLotse', icon: '🎣', desc: 'Köder, Ruten, Spots, Shop-Wissen' },
  dropshipping: { label: 'Dropshipping / E-Commerce', icon: '🛒', desc: 'Shopify, Lieferanten, §19 UStG' },
  ki: { label: 'KI & RAG', icon: '🤖', desc: 'Prompts, Embeddings, Ollama, Agents' },
  coding: { label: 'Coding', icon: '💻', desc: 'Code-Snippets, Debugging, Stack' },
  studium: { label: 'Studium / Lernen', icon: '📚', desc: 'Zusammenfassungen, Prüfungen' },
  forschung: { label: 'Forschung', icon: '🔬', desc: 'Paper, Zitate, Quellen' },
  business: { label: 'Business & Produktivität', icon: '📈', desc: 'Meetings, Projekte, Tasks' },
  kreativ: { label: 'Kreativ & Schreiben', icon: '✨', desc: 'Ideen, Texte, Story' },
};

const PROFILE_KEY = 'ki_gehirn_adaptive_profile';

export function loadProfile(): UserProfileAdaptive | null {
  try {
    const raw = localStorage.getItem(PROFILE_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw) as UserProfileAdaptive;
    if (!p || !p.displayName) return null;
    return p;
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
    useCases: [],
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
    { id: 'ollama', label: 'Ollama (lokal, kostenlos)', url: 'http://localhost:11434/api/tags', parse: (j)=> (j.models||[]).map((m:any)=>m.name||m.model).filter(Boolean) },
    { id: 'lmstudio', label: 'LM Studio (lokal)', url: 'http://localhost:1234/v1/models', parse: (j)=> (j.data||j.models||[]).map((m:any)=>m.id||m.name).filter(Boolean) },
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
  // Server-Probe für Ollama via Proxy (falls CORS blockt, aber Server kann)
  try {
    const r = await fetch('/api/health', { signal: AbortSignal.timeout(1000) });
    if (r.ok) {
      // Server ist da — versuche zusätzlich /api/models via Ollama proxy
      // wird von adaptive UI separat genutzt
    }
  } catch {}
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
