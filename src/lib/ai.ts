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

// Gemini, Ollama, Mistral, Groq, DeepSeek, OpenRouter, xAI usw. sprechen alle
// das OpenAI Chat-Protokoll – dadurch funktioniert jedes KI-Modell, das es gibt.
export const PROVIDERS: ProviderPreset[] = [
  {
    id: 'openai',
    label: 'OpenAI (GPT)',
    protocol: 'openai',
    baseUrl: 'https://api.openai.com/v1',
    defaultModel: 'gpt-4o-mini',
    needsKey: true,
    hint: 'Key von platform.openai.com',
  },
  {
    id: 'anthropic',
    label: 'Anthropic (Claude)',
    protocol: 'anthropic',
    baseUrl: 'https://api.anthropic.com',
    defaultModel: 'claude-sonnet-4-20250514',
    needsKey: true,
    hint: 'Key von console.anthropic.com',
  },
  {
    id: 'gemini',
    label: 'Google Gemini',
    protocol: 'openai',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    defaultModel: 'gemini-2.5-flash',
    needsKey: true,
    hint: 'Key von aistudio.google.com',
  },
  {
    id: 'openrouter',
    label: 'OpenRouter (alle Modelle)',
    protocol: 'openai',
    baseUrl: 'https://openrouter.ai/api/v1',
    defaultModel: 'openai/gpt-4o-mini',
    needsKey: true,
    hint: 'Ein Key für hunderte Modelle aller Anbieter',
  },
  {
    id: 'mistral',
    label: 'Mistral',
    protocol: 'openai',
    baseUrl: 'https://api.mistral.ai/v1',
    defaultModel: 'mistral-large-latest',
    needsKey: true,
    hint: 'Key von console.mistral.ai',
  },
  {
    id: 'groq',
    label: 'Groq',
    protocol: 'openai',
    baseUrl: 'https://api.groq.com/openai/v1',
    defaultModel: 'llama-3.3-70b-versatile',
    needsKey: true,
    hint: 'Sehr schnelle Open-Source-Modelle',
  },
  {
    id: 'deepseek',
    label: 'DeepSeek',
    protocol: 'openai',
    baseUrl: 'https://api.deepseek.com/v1',
    defaultModel: 'deepseek-chat',
    needsKey: true,
    hint: 'Key von platform.deepseek.com',
  },
  {
    id: 'xai',
    label: 'xAI (Grok)',
    protocol: 'openai',
    baseUrl: 'https://api.x.ai/v1',
    defaultModel: 'grok-3',
    needsKey: true,
    hint: 'Key von console.x.ai',
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
    hint: 'Jede API, die das OpenAI-Format spricht (Together, Fireworks, vLLM, ...).',
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
