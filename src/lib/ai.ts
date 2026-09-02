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
    hint: 'Key von platform.openai.com — gpt-4o, gpt-4o-mini, o1, o3',
  },
  {
    id: 'anthropic',
    label: 'Anthropic (Claude)',
    protocol: 'anthropic',
    baseUrl: 'https://api.anthropic.com',
    defaultModel: 'claude-sonnet-4-20250514',
    needsKey: true,
    hint: 'Key von console.anthropic.com — Sonnet 4, Haiku 3.5, Opus 4',
  },
  {
    id: 'gemini',
    label: 'Google Gemini',
    protocol: 'openai',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    defaultModel: 'gemini-2.5-flash',
    needsKey: true,
    hint: 'Key von aistudio.google.com — 2.5 Flash/Pro, 2.0 Flash',
  },
  {
    id: 'openrouter',
    label: 'OpenRouter (alle Modelle)',
    protocol: 'openai',
    baseUrl: 'https://openrouter.ai/api/v1',
    defaultModel: 'openai/gpt-4o-mini',
    needsKey: true,
    hint: 'Ein Key für hunderte Modelle aller Anbieter — vielseitigste Wahl',
  },
  {
    id: 'mistral',
    label: 'Mistral',
    protocol: 'openai',
    baseUrl: 'https://api.mistral.ai/v1',
    defaultModel: 'mistral-large-latest',
    needsKey: true,
    hint: 'Key von console.mistral.ai — Large 2, Small, Codestral',
  },
  {
    id: 'groq',
    label: 'Groq',
    protocol: 'openai',
    baseUrl: 'https://api.groq.com/openai/v1',
    defaultModel: 'llama-3.3-70b-versatile',
    needsKey: true,
    hint: 'Sehr schnell — Llama 3.3, Mixtral, Gemma',
  },
  {
    id: 'deepseek',
    label: 'DeepSeek',
    protocol: 'openai',
    baseUrl: 'https://api.deepseek.com/v1',
    defaultModel: 'deepseek-chat',
    needsKey: true,
    hint: 'Key von platform.deepseek.com — V3, R1 Reasoner',
  },
  {
    id: 'xai',
    label: 'xAI (Grok)',
    protocol: 'openai',
    baseUrl: 'https://api.x.ai/v1',
    defaultModel: 'grok-3',
    needsKey: true,
    hint: 'Key von console.x.ai — Grok 3 / Grok 3 mini',
  },
  {
    id: 'perplexity',
    label: 'Perplexity (Sonar)',
    protocol: 'openai',
    baseUrl: 'https://api.perplexity.ai',
    defaultModel: 'sonar',
    needsKey: true,
    hint: 'Key von perplexity.ai — sonar, sonar-pro, mit Web-Suche',
  },
  {
    id: 'together',
    label: 'Together AI',
    protocol: 'openai',
    baseUrl: 'https://api.together.xyz/v1',
    defaultModel: 'meta-llama/Meta-Llama-3.1-70B-Instruct-Turbo',
    needsKey: true,
    hint: 'Key von api.together.ai — alle Open-Source-Modelle günstig',
  },
  {
    id: 'fireworks',
    label: 'Fireworks AI',
    protocol: 'openai',
    baseUrl: 'https://api.fireworks.ai/inference/v1',
    defaultModel: 'accounts/fireworks/models/llama-v3p1-405b-instruct',
    needsKey: true,
    hint: 'Key von fireworks.ai — Llama 405B, Qwen, DeepSeek schnell',
  },
  {
    id: 'cohere',
    label: 'Cohere',
    protocol: 'openai',
    baseUrl: 'https://api.cohere.com/compatibility/v1',
    defaultModel: 'command-r-plus',
    needsKey: true,
    hint: 'Key von dashboard.cohere.com — Command R+, Embed v4',
  },
  {
    id: 'cerebras',
    label: 'Cerebras',
    protocol: 'openai',
    baseUrl: 'https://api.cerebras.ai/v1',
    defaultModel: 'llama3.1-70b',
    needsKey: true,
    hint: 'Ultraschnell — Key von cerebras.ai, Llama 3.1 70B',
  },
  {
    id: 'huggingface',
    label: 'Hugging Face',
    protocol: 'openai',
    baseUrl: 'https://api-inference.huggingface.co/v1',
    defaultModel: 'meta-llama/Meta-Llama-3-8B-Instruct',
    needsKey: true,
    hint: 'Key von huggingface.co — tausende Open-Source-Modelle',
  },
  {
    id: 'novita',
    label: 'Novita AI',
    protocol: 'openai',
    baseUrl: 'https://api.novita.ai/v3/openai',
    defaultModel: 'meta-llama/llama-3.1-70b-instruct',
    needsKey: true,
    hint: 'Günstig — Key von novita.ai, alle Llama/Qwen',
  },
  {
    id: 'github',
    label: 'GitHub Models',
    protocol: 'openai',
    baseUrl: 'https://models.inference.ai.azure.com',
    defaultModel: 'gpt-4o-mini',
    needsKey: true,
    hint: 'Key von github.com/marketplace/models — gpt-4o, Llama, Phi',
  },
  {
    id: 'azure',
    label: 'Azure OpenAI',
    protocol: 'openai',
    baseUrl: '',
    defaultModel: 'gpt-4o',
    needsKey: true,
    hint: 'Deine Azure URL eintragen: https://{name}.openai.azure.com/openai/deployments/{id}',
  },
  {
    id: 'ollama',
    label: 'Ollama (lokal, kostenlos)',
    protocol: 'openai',
    baseUrl: 'http://localhost:11434/v1',
    defaultModel: 'llama3.2',
    needsKey: false,
    hint: 'Läuft komplett offline auf deinem Mac. Modell per "ollama pull llama3.2" laden.',
  },
  {
    id: 'lmstudio',
    label: 'LM Studio (lokal)',
    protocol: 'openai',
    baseUrl: 'http://localhost:1234/v1',
    defaultModel: '',
    needsKey: false,
    hint: 'LM Studio mit lokalem Server starten.',
  },
  {
    id: 'custom',
    label: 'Eigener Endpunkt (OpenAI-kompatibel)',
    protocol: 'openai',
    baseUrl: '',
    defaultModel: '',
    needsKey: false,
    hint: 'Jede API, die das OpenAI-Format spricht (vLLM, Jan, GPT4All, ...).',
  },
];

export interface AISettings {
  providerId: string;
  apiKey: string;
  baseUrl: string;
  model: string;
}

const SETTINGS_KEY = 'ki_gehirn_ai_settings';

export function loadAISettings(): AISettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* ignore */ }
  const p = PROVIDERS[0];
  return { providerId: p.id, apiKey: '', baseUrl: p.baseUrl, model: p.defaultModel };
}

export function saveAISettings(s: AISettings) {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
}

export function providerById(id: string): ProviderPreset {
  return PROVIDERS.find(p => p.id === id) || PROVIDERS[0];
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
