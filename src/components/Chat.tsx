import { absage } from "../lib/absage";
import { ApiFehler, tuerSatz } from "../lib/api";
import { useState, useRef, useEffect, useMemo, useCallback, FormEvent } from "react";
import { motion } from "motion/react";
import { Send, AlertTriangle, Database, Trash2, PanelLeftOpen, Square, Copy, Check, CheckCircle2, Coins, Hash, FileText, Sparkles, ShieldCheck } from "../lib/icons";
import { istLokaleAdresse } from "../lib/schild";
import ReactMarkdown, { defaultUrlTransform } from "react-markdown";
import { bildeinordnung } from "../lib/bild-politik";
import { ChatMessage, Memory } from "../types";
import { KeptaMark } from "./KeptaMark";
import { loadAISettings, saveAISettings, providerById, resolveAIConnection, disconnectAI } from "../lib/ai";
import { detectLocalAIs, LOKALE_HAFEN, type DetectedAI } from "../lib/profile";
import { shouldLearn, buildExtractPrompt, parseNode, AUTO_LEARN_TIMEOUT_MS, isAutoLearnEnabled, shouldShowHint, AUTOLEARN_KEY, AUTOLEARN_HINT_KEY } from "../lib/autolearn";
import { useToast } from "./ui/Toast";
import { QUITTUNG_MS } from "../lib/quittung";
import { grundText } from "../lib/tuergrund";

/** Extrahiert Rohtext aus ReactMarkdown-Children (für Copy-Buttons). */
function extractCodeText(node: unknown): string {
  if (node === null || node === undefined || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(extractCodeText).join("");
  const el = node as { props?: { children?: unknown } };
  if (el.props && "children" in el.props) return extractCodeText(el.props.children);
  return "";
}

/**
 * Url-Umwandlung der Antwort: die Bibliothek selbst, plus eingebettete Bilder.
 * Ihr `defaultUrlTransform` leert jede `data:`-Adresse — ein Bild in Base64
 * endete als `<img src="">`, und eine leere Quelle laedt im Chromium die Seite
 * selbst noch einmal. Nur Bild-Data-Uri werden zurueckgeholt; alles, was die
 * Bibliothek aus einem andern Grund leert (javascript: und Verwandte), bleibt
 * leer und faengt bei `img` eine benannte Zeile statt eines Bildes.
 */
function antwortUrlPfad(url: string): string {
  const erlaubt = defaultUrlTransform(url);
  if (erlaubt) return erlaubt;
  return /^data:image\/(png|jpe?g|gif|webp|avif);base64,[a-z0-9+/=]+$/i.test(url) ? url : "";
}
import { hybridSearch, type ScoredMemory } from "../lib/semantic";
import { useSuchPrefs } from "../lib/searchPrefs";

// Erweiterte Message mit Quellen / Token-Metadaten
type ExtendedChatMessage = ChatMessage & {
  sources?: { id: string; title: string; tracks?: ScoredMemory["tracks"] }[];
  /** What the privacy shield kept from a cloud model for this answer. */
  shield?: { text: string; privateNotes: number; provider: string };
  inputTokens?: number;
  outputTokens?: number;
  costLabel?: string;
};

interface ChatProps {
  activeMemories: Memory[];
  onSaveToBrain?: (content: string) => void;
  onSaveToBrainWithMeta?: (payload: { title: string; content: string; tags: string[] }) => void;
  isFocusMode?: boolean;
  onToggleFocus?: () => void;
}

// ---------- Pricing pro Provider (pro 1k Tokens, USD) ----------
const PRICING: Record<string, { input: number; output: number; label: string }> = {
  openai: { input: 0.00015, output: 0.0006, label: "OpenAI" },
  anthropic: { input: 0.003, output: 0.015, label: "Anthropic" },
  gemini: { input: 0.0001, output: 0.0004, label: "Gemini" },
  openrouter: { input: 0.0003, output: 0.0012, label: "OpenRouter" },
  mistral: { input: 0.0002, output: 0.0006, label: "Mistral" },
  groq: { input: 0.00005, output: 0.00008, label: "Groq" },
  deepseek: { input: 0.00014, output: 0.00028, label: "DeepSeek" },
  xai: { input: 0.005, output: 0.015, label: "xAI Grok" },
  ollama: { input: 0, output: 0, label: "Ollama (local)" },
  lmstudio: { input: 0, output: 0, label: "LM Studio (local)" },
  custom: { input: 0.0002, output: 0.0008, label: "Custom" },
};

function estimateTokens(text: string): number {
  if (!text) return 0;
  return Math.ceil(text.length / 3.5);
}

function getPricing(providerId: string) {
  return PRICING[providerId] ?? PRICING.custom;
}

function formatCost(inputTok: number, outputTok: number, providerId: string): string {
  const p = getPricing(providerId);
  if (p.input === 0 && p.output === 0) return "free (local)";
  const cost = (inputTok / 1000) * p.input + (outputTok / 1000) * p.output;
  if (cost < 0.01) return `$${cost.toFixed(4)}`;
  return `$${cost.toFixed(3)}`;
}

const MIN_BUDGET = 1000;
const MAX_BUDGET = 16000;
const DEFAULT_BUDGET = 4000;
const RETRIEVAL_TTL_MS = 30_000;
/** Kurzer Aufschub, damit die Engine nicht bei jedem Tastenschlag befragt wird. */
const SERVER_DEBOUNCE_MS = 300;

/** Hat eines der drei Beine den Treffer gesehen? Für die Herkunfts-Badges der Quellen. */
function spurenSichtbar(tracks: NonNullable<ScoredMemory["tracks"]> | undefined): boolean {
  return !!tracks && (tracks.bm25 !== null || tracks.vektor !== null || tracks.graph !== null);
}

export function Chat({ activeMemories, onSaveToBrain, onSaveToBrainWithMeta, isFocusMode, onToggleFocus }: ChatProps) {
  const toast = useToast();
  const [messages, setMessages] = useState<ExtendedChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tokenBudget, setTokenBudget] = useState<number>(DEFAULT_BUDGET);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [copiedCodeId, setCopiedCodeId] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  const [, stossVerbindungAn] = useState(0);
  const settings = loadAISettings();
  const provider = providerById(settings.providerId);
  const pricing = getPricing(provider.id);

  // ---------- Echter KI-Verbindungsstatus + lokale Erkennung ----------
  // localReachable: null = noch nicht geprobt, true/false nach Probe des lokalen Servers.
  const [localReachable, setLocalReachable] = useState<boolean | null>(null);
  // Warum die Verbindung nicht steht — in den Worten, die die Flaeche dem Nutzer
  // schuldig ist: eine Absage ohne Grund ist halbe Auskunft (3.2.123, 3.2.124).
  const [verbindungsGrund, setVerbindungsGrund] = useState<string | null>(null);
  const [detectedLocal, setDetectedLocal] = useState<DetectedAI | null>(null);
  const [connectHint, setConnectHint] = useState(0); // erzwingt Re-Render nach Provider-Wechsel

  const [suchLaeuft, setSuchLaeuft] = useState(false);

  useEffect(() => {
    let cancelled = false;
    // Der Schalter wird gefragt, BEVOR gerufen wird. Die beiden Hafen-Adressen stehen
    // in src/lib/profile.ts:127 (Ollama) und :128 (LM Studio) und werden von dort
    // direkt aus dem Fenster angeplopft — bis hierher geschah das bei jedem Aufbau
    // des Chats, auch wenn der sichtbare Anbieter ein Schluessel-Anbieter ist und
    // :121-127 die Antwort danach verwirft. Am Werksstandard (src/lib/ai.ts:17-22,
    // openai, needsKey true) klingelt die Flaeche also an zwei Ports, die niemand
    // bestellt hat; die Konsole meldet net::ERR_CONNECTION_REFUSED, und der Nachzug
    // durch die eigne Tuer (profile.ts:151) haengt an einer Anfrage, die ohne jede
    // Frage laeuft.
    const sitzung = loadAISettings();
    const cur = providerById(sitzung.providerId);
    if (cur.needsKey) {
      setLocalReachable(null);
      return () => { cancelled = true; };
    }
    // Aufgabe #43 (am ausgelieferten 3.2.124 gemessen): "Custom endpoint
    // (OpenAI-compatible)" — dessen eigener Hinweis vLLM, Jan und GPT4All verspricht —
    // konnte nie verbinden. Die Sonde darunter kennt genau zwei Haefen
    // (src/lib/profile.ts, LOKALE_HAFEN), und `found.find(d => d.id === cur.id)` war fuer
    // jeden andern Kein-Key-Anbieter immer undefined: "No AI connected", waehrend
    // dieselbe Adresse durch die eigne Tuer antwortete (POST /api/models) und die Tuer
    // sie laengst zulaesst (server/router/chat.ts:216). Also: die GESETZTE Adresse
    // fragen, nicht zwei feste Haefen. Erreichbar gilt nur, wenn sie Modelle nennt.
    const hafen = new Set(LOKALE_HAFEN.map((h) => h.id));
    const eigeneAdresse = !hafen.has(cur.id) && !!sitzung.baseUrl?.trim();
    (async () => {
      if (eigeneAdresse) {
        try {
          const r = await fetch("/api/models", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              protocol: cur.protocol,
              baseUrl: sitzung.baseUrl,
              apiKey: sitzung.apiKey === "local" ? "" : sitzung.apiKey,
            }),
          });
          const d = (await r.json().catch(() => ({}))) as { models?: unknown; grund?: string; status?: number };
          if (cancelled) return;
          const modelle = Array.isArray(d.models) ? d.models : [];
          setLocalReachable(r.ok && modelle.length > 0);
          setVerbindungsGrund(
            r.ok && modelle.length > 0 ? null
              : d.grund === "anbieter-nicht-erreichbar" ? "The model program is not answering — start it, or check its address under Settings."
              : d.grund === "antwort-nicht-lesbar" ? "The model program answered, but sent no list of models."
              : d.grund === "kein-schluessel" ? "This program needs a key — add it under Settings."
              : r.ok ? "The model program has no models loaded yet."
              : `The model program refused the request (it said ${d.status ?? r.status}).`
          );
        } catch {
          if (!cancelled) {
            setLocalReachable(false);
            setVerbindungsGrund("The model program is not answering — start it, or check its address under Settings.");
          }
        }
        return;
      }
      setVerbindungsGrund(null);
      const found = await detectLocalAIs().catch(() => [] as DetectedAI[]);
      if (cancelled) return;
      const match = found.find((d) => d.id === cur.id);
      setLocalReachable(!!match?.available);
    })();
    return () => { cancelled = true; };
  }, [connectHint]);

  // Ein-Klick-Verbinden: erkannte lokale KI als Provider setzen.
  const connectLocal = useCallback((d: DetectedAI) => {
    const prov = providerById(d.id);
    const s = loadAISettings();
    saveAISettings({
      ...s,
      providerId: prov.id,
      baseUrl: prov.baseUrl,
      model: d.models[0] || prov.defaultModel || s.model,
    });
    setConnectHint((n) => n + 1); // Re-Probe + Re-Render
  }, []);

  // Die Suche nach einer lokalen KI ist jetzt eine Bestellung der Flaeche, nicht mehr
  // ein Nebenbefund beim Aufbau: dieselbe Liste, derselbe Nachzug durch die Tuer — nur
  // dass ein Klick dahintersteht, den der Nutzer sieht (Hausform wie der „Scan again"-
  // Knopf in src/components/OnboardingWizard.tsx:268).
  const sucheLokaleKI = useCallback(async () => {
    setSuchLaeuft(true);
    const found = await detectLocalAIs().catch(() => [] as DetectedAI[]);
    const available = found.find((d) => d.available && d.models.length > 0) ?? found.find((d) => d.available) ?? null;
    setDetectedLocal(available);
    setSuchLaeuft(false);
  }, []);

  const connection = resolveAIConnection(settings, provider, localReachable);

  // ---------- Such-Präferenzen (Paket 3): Suchtiefe + Spuren gelten auch im Chat ----------
  const [suchPrefs] = useSuchPrefs();

  // ---------- Server-Engine: das GANZE Gehirn befragen, nicht nur das Dashboard-Vorfiltern ----------
  // Der Chat schickt die Eingabe an POST /api/search (BM25 + Vektoren + Graph → RRF) und
  // bekommt je Treffer die Spuren-Herkunft mit. Scheitert der Call oder findet nichts,
  // ordnet das lokale Ranking (hybridSearch über die aktiven Notizen) weiter — ehrlicher
  // Fallback statt stiller Behauptung.
  const [serverRanked, setServerRanked] = useState<ScoredMemory[] | null>(null);
  const [serverQuery, setServerQuery] = useState<string | null>(null);
  const [entprellt, setEntprellt] = useState("");
  const [gehirnWaermt, setGehirnWaermt] = useState(false);
  const [gehirnWarm, setGehirnWarm] = useState(false);
  const [suchDauerMs, setSuchDauerMs] = useState<number | null>(null);
  // Punkt 4, 2.11.: die Flaeche wechselte ihre Quelle, ohne es zu sagen. Scheitert der
  // Engine-Call, ordnet das lokale Ranking weiter (Chat.tsx:477, Kommentar seit Paket 3) —
  // der Nutzer hielt die Reihenfolge fuer die semantische Suche.
  const [suchWeg, setSuchWeg] = useState<"offen" | "engine" | "lokal">("offen");
  // P66: drei Gruende fuehren aufs lokale Ranking, und die Zeile nannte sie einen --
  // "the search index did not answer", auch wenn die Engine antwortete und ablehnte oder eine
  // Antwort ohne Liste brachte. Eine Behauptung ueber die eigne Tuer muss die Tuer treffen.
  const [suchGrund, setSuchGrund] = useState<"stumm" | "abgewiesen" | "ohne Liste" | null>(null);
  const [suchStatus, setSuchStatus] = useState<number | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setEntprellt(input.trim()), SERVER_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [input]);

  useEffect(() => {
    const q = entprellt;
    if (q.length < 2) {
      setServerRanked(null);
      setServerQuery(null);
      return;
    }
    let cancelled = false;
    if (!gehirnWarm) setGehirnWaermt(true);
    void (async () => {
      const start = performance.now();
      try {
        const res = await fetch("/api/search", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            query: q,
            topK: suchPrefs.tiefe,
            // Die Spuren-Schalter der Einstellungen reisen mit — was der Nutzer
            // im Dashboard abstellt, gilt auch, wenn der Chat das Gehirn fragt.
            tracks: { bm25: suchPrefs.spurBm25, vector: suchPrefs.spurVektor, entity: suchPrefs.spurGraph },
          }),
        });
        const data = await res.json();
        if (cancelled) return;
        const hits = Array.isArray(data?.results) ? (data.results as ScoredMemory[]) : null;
        setServerRanked(hits && hits.length > 0 ? hits : null);
        setServerQuery(hits && hits.length > 0 ? q : null);
        setSuchDauerMs(Math.round(performance.now() - start));
        setGehirnWarm(true);
        setGehirnWaermt(false);
      } catch {
        if (!cancelled) {
          setServerRanked(null);
          setServerQuery(null);
        }
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entprellt, suchPrefs.tiefe, suchPrefs.spurBm25, suchPrefs.spurVektor, suchPrefs.spurGraph]);

  /** Der Server-Rang zählt nur für die Eingabe, die ihn angefragt hat. */
  const serverReihenfolge = serverRanked && serverQuery !== null && serverQuery === entprellt ? serverRanked : null;

  // ---------- HybridSearch Retrieval Cache (30s TTL) ----------
  const retrievalCacheRef = useRef<Map<string, { ts: number; ranked: Memory[]; sig: string }>>(new Map());
  const getRankedMemories = useCallback(
    (query: string, source: Memory[]): Memory[] => {
      const normalized = query.trim().toLowerCase();
      const key = normalized || "__empty__";
      const now = Date.now();
      const sig = `${source.length}:${source.slice(0, 5).map((m) => m.id).join(",")}:${source.reduce((acc, m) => acc ^ m.updatedAt, 0)}`;
      const cached = retrievalCacheRef.current.get(key);
      if (cached && now - cached.ts < RETRIEVAL_TTL_MS && cached.sig === sig) {
        return cached.ranked;
      }
      let ranked: Memory[];
      if (!normalized || normalized.length < 2) {
        ranked = [...source].sort((a, b) => b.updatedAt - a.updatedAt);
      } else {
        try {
          const scored = hybridSearch(source, query, source.length, { ngram: 1 });
          if (scored.length > 0) {
            ranked = scored.map((s) => s.memory);
            const matchedIds = new Set(ranked.map((m) => m.id));
            const remainder = source.filter((m) => !matchedIds.has(m.id)).sort((a, b) => b.updatedAt - a.updatedAt);
            ranked = [...ranked, ...remainder];
          } else {
            ranked = [...source].sort((a, b) => b.updatedAt - a.updatedAt);
          }
        } catch {
          ranked = [...source].sort((a, b) => b.updatedAt - a.updatedAt);
        }
      }
      if (retrievalCacheRef.current.size >= 20) {
        const oldestKey = retrievalCacheRef.current.keys().next().value;
        if (oldestKey) retrievalCacheRef.current.delete(oldestKey);
      }
      for (const [k, v] of retrievalCacheRef.current) {
        if (now - v.ts > RETRIEVAL_TTL_MS) retrievalCacheRef.current.delete(k);
      }
      retrievalCacheRef.current.set(key, { ts: now, ranked, sig });
      return ranked;
    },
    []
  );

  // ---------- Token-Budget → welche Memories in den Prompt ----------
  const budgetedMemories = useMemo(() => {
    if (activeMemories.length === 0 && !serverReihenfolge) return [];
    // Reihenfolge: die Server-Engine (ganzes Gehirn, Paket 3) wenn vorhanden —
    // sonst das lokale hybridSearch-Ranking mit 30s TTL.
    let sorted: Memory[];
    if (serverReihenfolge) {
      const gesehen = new Set(serverReihenfolge.map((r) => r.memory.id));
      const rest = activeMemories.filter((m) => !gesehen.has(m.id)).sort((a, b) => b.updatedAt - a.updatedAt);
      sorted = [...serverReihenfolge.map((r) => r.memory), ...rest];
    } else {
      sorted = getRankedMemories(input, activeMemories);
    }
    const inputTokens = estimateTokens(input);
    const baseSystemTokens = 90;
    const reserve = 500;
    const availableForMemories = Math.max(600, tokenBudget - baseSystemTokens - inputTokens - reserve);

    let used = 0;
    const picked: Memory[] = [];
    for (const m of sorted) {
      const chunk = `[ID: ${m.id} | TAGS: ${m.tags.join(", ")} | TITEL: ${m.title}]\n${m.content}\n\n`;
      const tok = estimateTokens(chunk);
      if (picked.length === 0) {
        // immer mindestens 1 Knoten wenn vorhanden
        picked.push(m);
        used += tok;
        continue;
      }
      if (used + tok <= availableForMemories) {
        picked.push(m);
        used += tok;
      }
      if (picked.length >= 24) break;
    }
    // Falls Budget sehr groß und noch Platz, nimm restliche der Reihe nach
    if (used < availableForMemories) {
      for (const m of sorted) {
        if (picked.find((p) => p.id === m.id)) continue;
        const chunk = `[ID: ${m.id} | TAGS: ${m.tags.join(", ")} | TITEL: ${m.title}]\n${m.content}\n\n`;
        const tok = estimateTokens(chunk);
        if (used + tok <= availableForMemories) {
          picked.push(m);
          used += tok;
        }
      }
    }
    return picked;
  }, [activeMemories, tokenBudget, input, getRankedMemories, serverReihenfolge]);

  const budgetedIds = useMemo(() => new Set(budgetedMemories.map((m) => m.id)), [budgetedMemories]);

  /** Spuren-Herkunft je Knoten aus dem letzten Server-Ranking — für die Quellen-Badges. */
  const serverTracks = useMemo(() => {
    const map = new Map<string, NonNullable<ScoredMemory["tracks"]>>();
    if (serverRanked) for (const r of serverRanked) if (r.tracks) map.set(r.memory.id, r.tracks);
    return map;
  }, [serverRanked]);

  const contextTokens = useMemo(() => {
    const ctxText = budgetedMemories.map((m) => `${m.title}\n${m.content}`).join("\n\n");
    return estimateTokens(ctxText) + 90;
  }, [budgetedMemories]);

  const historyTokens = useMemo(() => {
    return messages.reduce((acc, m) => acc + estimateTokens(m.content), 0);
  }, [messages]);

  const currentInputTokens = estimateTokens(input);
  const totalInputTokensEstimate = contextTokens + historyTokens + currentInputTokens;

  // live output tokens während des Streamings = letztes assistant message
  const liveOutputTokens = useMemo(() => {
    if (messages.length === 0) return 0;
    const last = messages[messages.length - 1];
    if (last.role === "assistant") return estimateTokens(last.content);
    return 0;
  }, [messages]);

  const estimatedCostNow = formatCost(totalInputTokensEstimate, liveOutputTokens || 400, provider.id);

  // ---------- Auto-Scroll ----------
  const scrollToBottom = (smooth = true) => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: smooth ? "smooth" : "instant" as ScrollBehavior });
    } else if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTo({ top: scrollContainerRef.current.scrollHeight, behavior: smooth ? "smooth" : "instant" as ScrollBehavior });
    }
  };

  useEffect(() => {
    scrollToBottom(isStreaming ? false : true);
  }, [messages, isStreaming]);

  // Abort beim Unmount
  useEffect(() => {
    return () => abortRef.current?.abort();
  }, []);

  const clearChat = () => {
    abortRef.current?.abort();
    setMessages([]);
    setError(null);
    setIsStreaming(false);
  };

  const handleStop = () => {
    abortRef.current?.abort();
    setIsStreaming(false);
  };

  /**
   * Kopieren mit Rueckmeldung — auch im Fehlerfall.
   *
   * Vorher verschwand ein Fehlschlag stumm im catch: ohne Zwischenablage
   * (fehlende Berechtigung, unsicherer Kontext) passierte scheinbar nichts, und
   * der Nutzer klickte weiter, ohne zu erfahren, warum nichts ankam.
   */
  const handleCopy = async (text: string, id: string) => {
    try {
      if (!navigator.clipboard?.writeText) throw new Error("no clipboard");
      await navigator.clipboard.writeText(text);
      setCopiedId(id);
    } catch {
      toast.push({ message: "Copying failed — the window did not get the clipboard.", kind: "warn" });
      return;
    }
    setTimeout(() => setCopiedId((c) => (c === id ? null : c)), QUITTUNG_MS);
  };

  const buildSystemPrompt = (mems: Memory[]) => {
    // Adaptiv: Profil in Prompt einweben wenn vorhanden
    let profileLine = "";
    try {
      const raw = localStorage.getItem('ki_gehirn_adaptive_profile');
      if (raw) {
        const p = JSON.parse(raw);
        const name = p.displayName ? `Name: ${p.displayName}. ` : "";
        // Die eigenen Themen des Nutzers. Alte Profile tragen noch useCases —
        // loadProfile migriert das; hier wird beides gelesen, damit der
        // Systemprompt auch bei einem rohen localStorage-Zugriff stimmt.
        const eigene = Array.isArray(p.topics) && p.topics.length ? p.topics : (Array.isArray(p.useCases) ? p.useCases : []);
        const cases = eigene.length ? `Focus: ${eigene.join(', ')}. ` : "";
        const goal = p.goal ? `Goal: ${p.goal}. ` : "";
        const note = p.customNote ? `Note: ${p.customNote}. ` : "";
        if (name || cases || goal || note) profileLine = `[User profile] ${name}${cases}${goal}${note}Passe Antwort-Stil und Beispiele daran an.\n\n`;
      }
    } catch (e) {
      // Die Profilzeile ist Zusatz, kein Grund eine Antwort abzubrechen — aber ihr Fehlen
      // muss auffindbar sein: ohne diese Zeile lief der Fall "Antwort ignoriert mein Profil"
      // spurlos durch (Punkt 4, Fehler-Feger #31).
      console.warn("kepta: user profile did not reach the prompt", e);
    }
    let prompt = profileLine + "You are the AI assistant. You have access to the user's personal knowledge base. Answer precisely and helpfully, based on the context below. Cite the id of every note you use where you can.\n\n";
    // Date-aware prompting (arXiv:2605.08538): Zeitanker reduzieren Temporal-Fehler deutlich
    prompt += `[Today: ${new Date().toLocaleDateString('en-GB', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}]\n\n`;
    if (mems.length === 0) {
      prompt += "(No notes are loaded right now. Answer from general knowledge.)\n";
    } else {
      prompt += `Context — ${mems.length} notes (token budget ${tokenBudget}):\n\n`;
      mems.forEach((m) => {
        const validTo = m.validTo ? ` | VALID UNTIL: ${new Date(m.validTo).toLocaleDateString('en-GB')}${m.validTo < Date.now() ? ' (EXPIRED)' : ''}` : "";
        const superseded = m.supersededBy ? " | SUPERSEDED" : "";
        prompt += `[ID: ${m.id} | TAGS: ${m.tags.join(", ")} | TITEL: ${m.title}${validTo}${superseded}]\n${m.content}\n\n`;
      });
    }
    return prompt;
  };

  const handleSend = async (e: FormEvent) => {
    e.preventDefault();
    const trimmed = input.trim();
    if (!trimmed || isStreaming) return;

    const settingsLive = loadAISettings();
    const provLive = providerById(settingsLive.providerId);
    // Aufgabe #8 (24.10.): die Tuer fragt `istLokaleAdresse(baseUrl)` (server/router/chat.ts:46) -
    // ein lokaler Endpunkt braucht keinen Schluessel, auch wenn der Anbieter sonst einen verlangt.
    // Diese Sperre las nur `needsKey && !apiKey` und liess die Flaeche verweigern, was die Tuer
    // annimmt. Jetzt lesen beide dieselbe Bedingung.
    if (provLive.needsKey && !settingsLive.apiKey && !istLokaleAdresse(settingsLive.baseUrl)) {
      setError(`Quick setup (30 seconds): ① "System" on the left → Settings ② pick a provider ③ enter an API key ④ press "Test request" — the cockpit answers after that. No key? Starting Ollama locally is enough too (then pick a model named "ollama/…").`);
      return;
    }
    if (!settingsLive.model) {
      setError("No model set. Pick one under System → Settings.");
      return;
    }

    // Paket 3: die Frage geht zuerst ans GANZE Gehirn — die Engine (BM25 + Vektoren +
    // Graph) ordnet mit der Suchtiefe und den Spuren-Schaltern aus den Einstellungen.
    // Scheitert der Call, ordnet das lokale Ranking weiter (ehrlicher Fallback).
    const sucheStart = performance.now();
    let engineTreffer: ScoredMemory[] | null = null;
    let grund: "stumm" | "abgewiesen" | "ohne Liste" = "stumm";
    try {
      const suchRes = await fetch("/api/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: trimmed,
          topK: suchPrefs.tiefe,
          tracks: { bm25: suchPrefs.spurBm25, vector: suchPrefs.spurVektor, entity: suchPrefs.spurGraph },
        }),
      });
      // P66: Status zuerst, Koerper verzeihend. Ein HTML-Blatt bei 200 warf bisher beim Lesen
      // und landete bei "Server unerreichbar" -- dabei hatte die Engine geantwortet.
      const suchData = (await suchRes.json().catch(() => null)) as { results?: unknown; error?: unknown } | null;
      if (!suchRes.ok) { grund = "abgewiesen"; setSuchStatus(suchRes.status); }
      else if (!Array.isArray(suchData?.results) || suchData.results.length === 0) grund = "ohne Liste";
      else engineTreffer = suchData.results as ScoredMemory[];
    } catch (e: unknown) {
      // Echte Stille: nach der Tuer wurde gefragt, sie hat nicht geantwortet.
      grund = "stumm";
      console.warn("kepta: the search index did not answer, the local ranking takes over", e);
    }
    setSuchWeg(engineTreffer ? "engine" : "lokal");
    setSuchGrund(engineTreffer ? null : grund);
    if (engineTreffer) setSuchStatus(null);
    if (engineTreffer) {
      setSuchDauerMs(Math.round(performance.now() - sucheStart));
      setGehirnWarm(true);
      setGehirnWaermt(false);
    }
    const engineTracks = new Map<string, NonNullable<ScoredMemory["tracks"]>>();
    for (const r of engineTreffer ?? []) if (r.tracks) engineTracks.set(r.memory.id, r.tracks);

    const userMsg: ExtendedChatMessage = {
      id: Date.now().toString(),
      role: "user",
      content: trimmed,
      timestamp: Date.now(),
    };

    // Private notes stay home when the model runs in the cloud — the server
    // enforces it as well; leaving them out here keeps the sources honest.
    // Nur was genannt ist, zaehlt: ohne Basis entscheidet die Tuer (400), nicht die Katalogzeile.
    const lokal = istLokaleAdresse(settingsLive.baseUrl);
    // Die Engine-Treffer führen, der budgetierte Kontext füllt den Rest —
    // die Knotenanzahl bleibt auf dem budgetierten Stand.
    const engineIds = new Set((engineTreffer ?? []).map((r) => r.memory.id));
    const reihenfolge = engineTreffer
      ? [...engineTreffer.map((r) => r.memory), ...budgetedMemories.filter((m) => !engineIds.has(m.id))].slice(0, Math.max(budgetedMemories.length, engineIds.size))
      : budgetedMemories;
    const kontext = lokal ? reihenfolge : reihenfolge.filter((m) => m.scope !== "private");
    const systemPrompt = buildSystemPrompt(kontext);
    const apiMessages = [...messages, userMsg].map((m) => ({
      role: m.role,
      content: m.content,
    }));

    // placeholder für Streaming
    const assistantId = (Date.now() + 1).toString();
    const sourcesForTurn = kontext.map((m) => ({ id: m.id, title: m.title, tracks: engineTracks.get(m.id) ?? serverTracks.get(m.id) }));
    const placeholder: ExtendedChatMessage = {
      id: assistantId,
      role: "assistant",
      content: "",
      timestamp: Date.now(),
      sources: sourcesForTurn,
      inputTokens: estimateTokens(systemPrompt + apiMessages.map((m) => m.content).join("\n")),
      outputTokens: 0,
    };

    setMessages((prev) => [...prev, userMsg, placeholder]);
    setInput("");
    setIsStreaming(true);
    setError(null);

    const controller = new AbortController();
    abortRef.current = controller;

    // Halte lokale Referenz für inkrementellen Content (vermeidet stale closure)
    let accText = "";

    try {
      const res = await fetch("/api/chat/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          providerId: provLive.id,
          protocol: provLive.protocol,
          baseUrl: settingsLive.baseUrl,
          apiKey: settingsLive.apiKey,
          model: settingsLive.model,
          system: systemPrompt,
          messages: apiMessages,
        }),
      });

      if (!res.ok || !res.body) {
        // Versuche JSON-Fehler zu lesen bevor SSE
        let msg = `API error (${res.status})`;
        try {
          const txt = await res.text();
          const j = JSON.parse(txt);
          // Die Tuer nennt eine Kennung; der Mensch sieht ihren Satz, nicht ihren inneren Text.
          msg = grundText(j.grund) || tuerSatz(j.error, msg);
        } catch {
          // ignore
        }
        throw new ApiFehler(msg, res.status);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const rawLine of lines) {
          const line = rawLine.trim();
          if (!line.startsWith("data:")) continue;
          const payload = line.slice(5).trim();
          if (!payload) continue;
          if (payload === "[DONE]") {
            // Ende
            continue;
          }
          let json: { text?: string; error?: string; grund?: string; shield?: { text: string; privateNotes: number; provider: string } };
          try {
            json = JSON.parse(payload);
          } catch {
            continue;
          }
          if (json.error || json.grund) {
            // Aufgabe #92 (24.10.): die Kennung der Tuer wird uebersetzt - nie der Ausnahmename.
            throw new ApiFehler(grundText(json.grund) || tuerSatz(json.error, "The answer stopped partway."));
          }
          if (json.shield) {
            const shield = json.shield;
            setMessages((prev) => prev.map((m) => (m.id === assistantId ? { ...m, shield } : m)));
            continue;
          }
          if (typeof json.text === "string" && json.text) {
            accText += json.text;
            const currentOutTok = estimateTokens(accText);
            const cost = formatCost(placeholder.inputTokens || 0, currentOutTok, provLive.id);
            // live update
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantId ? { ...m, content: accText, outputTokens: currentOutTok, costLabel: cost } : m
              )
            );
          }
        }
        // auto-scroll während des Streamings (instant für flüssiges Gefühl)
        scrollToBottom(false);
      }

      // finalisieren – falls gar kein Text kam
      if (!accText) {
        setMessages((prev) => prev.filter((m) => m.id !== assistantId));
        throw new ApiFehler("No answer received (empty stream).");
      } else {
        const finalOut = estimateTokens(accText);
        const finalCost = formatCost(placeholder.inputTokens || 0, finalOut, provLive.id);
        setMessages((prev) => prev.map((m) => (m.id === assistantId ? { ...m, outputTokens: finalOut, costLabel: finalCost } : m)));
      }
    } catch (err: unknown) {
      const isAbort = err instanceof DOMException && err.name === "AbortError";
      if (isAbort) {
        // User hat gestoppt – halte partiellen Inhalt
        if (accText) {
          const outTok = estimateTokens(accText);
          const cost = formatCost(placeholder.inputTokens || 0, outTok, provLive.id);
          setMessages((prev) => prev.map((m) => (m.id === assistantId ? { ...m, content: accText + "\n\n— _aborted_", outputTokens: outTok, costLabel: cost } : m)));
        } else {
          setMessages((prev) => prev.filter((m) => m.id !== assistantId));
        }
        setError(null);
      } else {
        // Stream-Fehler – platziere Fehler und entferne leeren placeholder ggf.
        const msg = absage("The answer stopped partway. What you can already see stays — nothing was saved from it.", err);
        if (!accText) {
          setMessages((prev) => prev.filter((m) => m.id !== assistantId));
        } else {
          // behalte partiellen Text + Fehlerhinweis
          setMessages((prev) => prev.map((m) => (m.id === assistantId ? { ...m, content: accText } : m)));
        }
        setError(msg);
      }
    } finally {
      setIsStreaming(false);
      abortRef.current = null;
      // ── Selbst-Erweiterung: immer mitlesen & automatisch speichern ──
      const read = (k: string) => { try { return localStorage.getItem(k); } catch { return null; } };
      const autoLearnEnabled = isAutoLearnEnabled(read);

      // Opt-in, aber auffindbar: Einmal darauf hinweisen, wenn diese Antwort
      // lernbar gewesen waere — mit Knopf, der es direkt einschaltet.
      if (!autoLearnEnabled && shouldLearn(accText) && shouldShowHint(read)) {
        try { localStorage.setItem(AUTOLEARN_HINT_KEY, 'seen'); } catch { /* Speicher gesperrt — Hinweis kommt dann erneut */ }
        toast.push({
          message: 'K3PTA can save answers like this as knowledge automatically.',
          kind: 'info',
          duration: 9000,
          action: {
            label: 'Turn on',
            onClick: () => {
              try { localStorage.setItem(AUTOLEARN_KEY, 'true'); } catch { /* ignorieren */ }
              toast.push({ message: 'Auto-learn is on — from the next answer.', kind: 'success' });
            },
          },
        });
      }

      if (autoLearnEnabled && shouldLearn(accText)) {
        // Hintergrund-Extraktion, blockiert die Oberfläche nie. Scheitert sie, sagt
        // K3PTA das — stilles Verschlucken machte die Funktion früher unsichtbar wirkungslos.
        (async ()=>{
          const s = loadAISettings();
          const prov = providerById(s.providerId);
          if (!s.model) return;
          // Eigenes, kleines Extraktionsmodell bevorzugen: für Titel und drei Tags
          // braucht es kein grosses Reasoning-Modell, das Minuten pro Antwort kostet.
          const model = (s.extractModel || '').trim() || s.model;
          const ctl = new AbortController();
          const timer = setTimeout(() => ctl.abort(), AUTO_LEARN_TIMEOUT_MS);
          try {
            const r = await fetch('/api/chat', {
              method:'POST', headers:{'Content-Type':'application/json'}, signal: ctl.signal,
              body: JSON.stringify({ providerId: prov.id, protocol: prov.protocol, baseUrl: s.baseUrl || prov.baseUrl, apiKey: s.apiKey, model, system:'You extract knowledge. Reply with JSON only.', messages:[{role:'user', content: buildExtractPrompt(accText)}] })
            });
            if (!r.ok) throw new Error(`Extraction failed (HTTP ${r.status})`);
            const j = await r.json();
            const node = parseNode(String(j.text ?? ''), accText.slice(0, 1600));
            if (!node) throw new Error('The model returned no usable JSON');

            // Duplikate vermeiden — fast gleicher Inhalt oder gleicher Titel bei ähnlicher Länge
            const existing: any[] = await fetch('/api/memories')
              .then((r) => r.json())
              .then((d) => (Array.isArray(d) ? d : Array.isArray(d?.memories) ? d.memories : []))
              .catch(() => []);
            const isDup = existing.some((m: any) => m.content?.slice(0, 120) === node.summary.slice(0, 120) || (m.title === node.title && Math.abs((m.content?.length ?? 0) - node.summary.length) < 20));
            if (isDup) return;

            const save = await fetch('/api/memory', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: node.title, content: node.summary + `\n\n— Source: chat ${new Date().toLocaleString('en-GB')} — model ${prov.label}/${model}`, tags: node.tags }) });
            if (!save.ok) throw new Error(`Save failed (HTTP ${save.status})`);
            toast.push({ message: `Learned: ${node.title}`, kind: 'success' });
          } catch (e) {
            const aborted = e instanceof DOMException && e.name === 'AbortError';
            const grund = aborted
              ? `The model took longer than ${Math.round(AUTO_LEARN_TIMEOUT_MS / 1000)} s — pick a smaller extraction model in Settings`
              : absage("Auto-learn did not run this time. Your question and its answer are still here.", e);
            console.warn('[auto-learn] skipped:', e);
            toast.push({ message: grund, kind: 'warn', duration: 6000 });
          } finally {
            clearTimeout(timer);
          }
        })();
      }
    }
  };

  // Slider Prozent für Track-Füllung
  const budgetPercent = ((tokenBudget - MIN_BUDGET) / (MAX_BUDGET - MIN_BUDGET)) * 100;

  return (
    <div className="flex flex-col h-full w-full relative">
      {/* ---------- Header ---------- */}
      <div className="px-6 py-4 flex flex-wrap items-center justify-between gap-y-2 z-10 border-gradient-b shrink-0" style={{ borderBottom: "1px solid var(--border-subtle)" }}>
        <div className="flex items-center gap-3">
          {isFocusMode && (
            <button onClick={onToggleFocus} className="btn-ghost p-2 -ml-2 rounded-lg" aria-label="Leave focus mode">
              <PanelLeftOpen className="w-5 h-5" />
            </button>
          )}
          <div className="w-9 h-9 rounded-xl flex items-center justify-center relative" style={{ background: "var(--accent-soft)", border: "1px solid var(--border-subtle)", boxShadow: "inset 0 1px 0 var(--edge-light)" }}>
            <KeptaMark size={24} />
            {/* Aufgabe #94: derselbe Satz wie in der Zustands-Tafel fuer denselben Zustand.
                Die Ruhe ist seit 3.2.111 eine Klasse (`status-dot-leise`); diese Stelle malt sie
                nicht mehr von Hand. Ein Zustand, den zwei Stellen verschiedentlich zeichnen, war
                genau der Defekt, den #8 und #94 schon fuer die Worte heilen mussten. */}
            {connection.state === "connected" ? (
              <span
                className="absolute -bottom-0.5 -right-0.5 status-dot"
                title={connection.local ? "A local program on this machine - no key needed." : "AI connected"}
              />
            ) : (
              <span
                className="absolute -bottom-0.5 -right-0.5 status-dot status-dot-leise"
                title="No AI connected"
              />
            )}
          </div>
          <div>
            <h2 className="font-semibold fs-4 lh-lesbar flex items-center gap-2" style={{ color: "var(--text-1)" }}>
              Chat
              {isStreaming && <span className="inline-flex items-center gap-1 fs-1 font-normal px-2 py-1 rounded hud-inset" style={{ color: "var(--accent)" }}><span className="w-1.5 h-1.5 rounded-full bg-[var(--accent)] animate-pulse" /> streaming…</span>}
            </h2>
            <div className="hud-label mt-1 flex items-center gap-2">
              {connection.state === "connected" ? (
                <>
                  <span>{connection.label} — {connection.model}</span>
                  {connection.local && <span className="px-1 py-0 rounded fs-1 border" style={{ borderColor: "var(--border-subtle)", color: "var(--ok)" }}>local</span>}
                  <button
                    onClick={() => { disconnectAI(); stossVerbindungAn((n) => n + 1); }}
                    className="inline-flex items-center gap-1 min-h-6 px-2 rounded fs-1 border transition-colors hover:opacity-80"
                    style={{ borderColor: "var(--border-subtle)", color: "var(--text-2)" }}
                    title="Disconnect this AI — nothing is deleted, you can reconnect any time"
                  >
                    Disconnect
                  </button>
                </>
              ) : (
                <>
                  <span style={{ color: "var(--text-2)" }} data-testid="chat-verbindung">
                    {verbindungsGrund ?? "No AI connected"}
                  </span>
                  {!detectedLocal && (
                    <button
                      onClick={() => void sucheLokaleKI()}
                      className="inline-flex items-center gap-1 min-h-6 px-2 rounded fs-1 border transition-colors hover:opacity-80"
                      style={{ borderColor: "var(--border-subtle)", color: "var(--text-2)" }}
                      title="Ask this machine whether Ollama or LM Studio is running — nothing is contacted until you click"
                    >
                      <Sparkles className="w-3.5 h-3.5" />
                      {suchLaeuft ? "Looking…" : "Look for a local model"}
                    </button>
                  )}
                  {detectedLocal && (
                    <button
                      onClick={() => connectLocal(detectedLocal)}
                      className="inline-flex items-center gap-1 min-h-6 px-2 rounded fs-1 border transition-colors hover:opacity-80"
                      style={{ borderColor: "var(--border-subtle)", color: "var(--accent)", background: "var(--accent-soft)" }}
                      title={`${detectedLocal.label} detected locally — connect it`}
                    >
                      <Sparkles className="w-2.5 h-2.5" />
                      {detectedLocal.label.replace(/\s*\(.*\)$/, "")} — connect
                    </button>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 sm:gap-4 fs-2 lh-dicht font-semibold">
          {/* Such-Cache-Status (Paket 3): der Chat misst die eigene Engine-Anfrage —
              das Delta-Cache-Signal aus Paket 2 gilt hier genauso wie im Dashboard. */}
          {gehirnWaermt && (
            <span className="chip hidden sm:inline-flex" title="The search index is built once — from now on, every saved note only patches it.">
              <span className="agent-dot" /> Warming the search index…
            </span>
          )}
          {gehirnWarm && !gehirnWaermt && suchDauerMs !== null && (
            <span className="chip tnum hidden sm:inline-flex" title="The search index is ready — the time is this chat's last search, measured by this app.">
              <span className="status-dot" /> Search index warm — answer in {suchDauerMs} ms
            </span>
          )}
          {suchWeg === "lokal" && (
            <span
              className="chip"
              style={{ color: "var(--warn)" }}
              title={
                (suchGrund === "abgewiesen"
                  ? "The search index answered and refused this question — the order of the notes below comes from this app's own local ranking, not from the semantic search."
                  : suchGrund === "ohne Liste"
                    ? "The search index answered, but its list did not arrive — the order of the notes below comes from this app's own local ranking, not from the semantic search."
                    : "The search index did not answer — the order of the notes below comes from this app's own local ranking, not from the semantic search.") +
                (suchGrund === "abgewiesen" && suchStatus !== null ? ` (HTTP ${suchStatus})` : "")
              }
            >
              <span className="status-dot" style={{ background: "var(--warn)" }} />
              {suchGrund === "abgewiesen"
                ? `Local ranking — the search index refused (HTTP ${suchStatus ?? "?"})`
                : suchGrund === "ohne Liste"
                  ? "Local ranking — the search index answered without a list"
                  : "Local ranking — the search index did not answer"}
            </span>
          )}
          <div className="flex items-center gap-2" style={{ color: "var(--text-2)" }}>
            <span className="hud-label hidden sm:inline">Context:</span>
            <span className="px-2 py-1 rounded hud-inset flex items-center gap-1" style={{ color: "var(--accent)" }}>
              <Hash className="w-3 h-3" />
              {budgetedMemories.length}/{activeMemories.length}
            </span>
          </div>
          <div className="hidden sm:flex items-center gap-2 px-2 py-1 rounded hud-inset hud-label">
            <FileText className="w-3 h-3" /> ~{totalInputTokensEstimate.toLocaleString("en-GB")} tokens
          </div>
          <div className="hidden md:flex items-center gap-2 px-2 py-1 rounded hud-inset hud-label" title={`Input ${totalInputTokensEstimate} · Output ~${liveOutputTokens || 0} · ${estimatedCostNow}`}>
            <Coins className="w-3 h-3" /> {estimatedCostNow}
          </div>
          <button onClick={clearChat} className="btn-ghost treff p-2 rounded-lg hover:!border-gefahr" title="Clear chat" aria-label="Clear chat">
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* ---------- Kontext & Budget ---------- */}
      <div className="px-6 py-3 shrink-0 border-b" style={{ borderColor: "var(--border-subtle)", background: "var(--bg-inset)" }}>
        <div className="flex items-center gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between mb-1">
              <span className="hud-label flex items-center gap-2">
                <Sparkles className="w-3 h-3" style={{ color: "var(--accent)" }} />
                Context &amp; token budget
              </span>
              <span className="fs-1 flex items-center gap-2" style={{ color: "var(--text-2)" }}>
                <span className="px-2 py-1 rounded-md fs-1 font-semibold tnum" style={{ background: "var(--bg-panel)", border: "1px solid var(--border-subtle)", color: "var(--text-1)" }}>
                  {tokenBudget.toLocaleString("en-GB")}
                </span>
                <span>· {budgetedMemories.length} notes in play</span>
              </span>
            </div>
            <div className="relative h-7 flex items-center">
              <div className="absolute left-0 right-0 h-1.5 rounded-full overflow-hidden" style={{ background: "var(--bg-inset-strong)" }}>
                <div className="h-full rounded-full transition-[width]" style={{ width: `${budgetPercent}%`, background: "var(--accent)" }} />
              </div>
              {/* h-7 statt h-1.5: die Trefferfläche des Reglers war gemessen
                  6 px hoch (Z-08: mindestens 20, wiederholt 28). */}
              <input
                type="range"
                min={MIN_BUDGET}
                max={MAX_BUDGET}
                step={500}
                value={tokenBudget}
                onChange={(e) => setTokenBudget(parseInt(e.target.value, 10))}
                className="relative w-full h-7 appearance-none bg-transparent accent-[var(--accent)] cursor-pointer
                  [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3.5 [&::-webkit-slider-thumb]:h-3.5 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-knopf [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-[var(--accent)] [&::-webkit-slider-thumb]:shadow-sm
                  [&::-moz-range-thumb]:w-3.5 [&::-moz-range-thumb]:h-3.5 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:bg-knopf [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-[var(--accent)]"
                aria-label="Token Budget"
              />
            </div>
            {budgetedMemories.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-2">
                {budgetedMemories.slice(0, 8).map((m) => (
                  <span
                    key={m.id}
                    className="inline-flex items-center gap-1 px-2 py-1 rounded-md fs-1 font-semibold border truncate max-w-[140px]"
                    style={{ background: budgetedIds.has(m.id) ? "var(--accent-soft)" : "var(--bg-panel)", borderColor: "var(--border-subtle)", color: "var(--text-2)" }}
                    title={`${m.title} — ${m.id}`}
                  >
                    <Hash className="w-2.5 h-2.5 shrink-0" style={{ color: "var(--accent)" }} />
                    <span className="truncate">{m.title || m.id.slice(0, 8)}</span>
                  </span>
                ))}
                {budgetedMemories.length > 8 && (
                  <span className="fs-1 px-2 py-1 rounded-md" style={{ color: "var(--text-3)" }}>
                    +{budgetedMemories.length - 8}
                  </span>
                )}
              </div>
            )}
          </div>
          <div className="hidden lg:flex flex-col items-end gap-1 fs-2 lh-dicht min-w-[130px] shrink-0">
            <span className="hud-label">Cost estimate</span>
            <span className="mono fs-3" style={{ color: pricing.input === 0 ? "var(--ok)" : "var(--text-1)" }}>
              {estimatedCostNow}
            </span>
            <span className="fs-1 mono tnum" style={{ color: "var(--text-3)" }}>
              In ~{totalInputTokensEstimate} · Out ~{liveOutputTokens || "—"}
            </span>
          </div>
        </div>
      </div>

      {/* ---------- Messages ---------- */}
      <div ref={scrollContainerRef} className="flex-1 overflow-y-auto p-6 space-y-6 min-h-0">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center py-8">
            <div className="w-16 h-16 rounded-2xl flex items-center justify-center mb-4" style={{ background: 'var(--bg-inset)', border: '1px solid var(--border-subtle)', boxShadow: 'inset 0 1px 0 var(--edge-light)' }}>
              <KeptaMark size={34} />
            </div>
            <div className="hud-label mb-2">No questions yet</div>
            <p className="fs-3 max-w-sm lh-prosa" style={{ color: "var(--text-2)" }}>
              Ask something about your notes — {budgetedMemories.length} of {activeMemories.length} fit the budget ({tokenBudget.toLocaleString("en-GB")} tokens).
            </p>
            <div className="mt-5 flex flex-wrap gap-2 justify-center max-w-md">
              {["Summarise", "Find contradictions", "Next steps", "As a table"].map((s) => (
                <button
                  key={s}
                  onClick={() => setInput(s)}
                  // Der Knopf sendet nichts — er tippt die Frage in die Zeile. Ohne dieses Wort
                  // liest sich die Leiste wie vier fertige Befehle, und genau das haben beide
                  // Erstleser gefragt ("what happens if I click this?").
                  title={`Puts “${s}” in the box below — nothing is sent until you press Enter`}
                  className="suggestion-pill cursor-pointer"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg) => (
          <motion.div
            key={msg.id}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.18 }}
            className={`flex ${msg.role === "user" ? "justify-end" : ""}`}
          >
            {msg.role === "user" ? (
              <div className="msg-user whitespace-pre-wrap break-words">{msg.content}</div>
            ) : (
              <div className="msg-ai w-full">
                <div className="chat-prose max-w-none break-words" style={{ color: "var(--text-1)" }}>
                  <ReactMarkdown
                    urlTransform={antwortUrlPfad}
                    components={{
                      h1: ({ children }) => <h1 className="fs-5 lh-lesbar font-bold mt-3 mb-2" style={{ color: "var(--text-1)" }}>{children}</h1>,
                      h2: ({ children }) => <h2 className="fs-5 font-semibold mt-3 mb-2" style={{ color: "var(--text-1)" }}>{children}</h2>,
                      h3: ({ children }) => <h3 className="fs-4 lh-lesbar font-semibold mt-3 mb-1" style={{ color: "var(--text-1)" }}>{children}</h3>,
                      p: ({ children }) => <p className="my-2 lh-prosa" style={{ color: "var(--text-1)" }}>{children}</p>,
                      a: ({ children, href }) => (
                        <a href={href} target="_blank" rel="noreferrer" className="underline decoration-[var(--accent)] underline-offset-2 hover:opacity-80" style={{ color: "var(--accent)" }}>
                          {children}
                        </a>
                      ),
                      // Ein fernes Bild waere ein Abzug bei der Gegenstelle, bevor
                      // der Nutzer etwas sieht: die Adresse in der Antwort nennt ihn
                      // beim Host. Darum bleibt das Bild aus und die Zeile sagt es —
                      // mit Namen der Gegenstelle und dem Weg, den nur die Hand geht.
                      img: ({ src, alt }) => {
                        const beschluss = bildeinordnung(String(src ?? ""));
                        if (beschluss.art === "malen") {
                          return <img src={beschluss.src} alt={alt ?? ""} className="max-w-full rounded-lg my-2" />;
                        }
                        return (
                          <span
                            data-testid="bild-abgewiesen"
                            className="block my-2 rounded-lg px-3 py-2 fs-2 lh-prosa"
                            style={{ background: "var(--bg-inset)", border: "1px solid var(--border-subtle)", color: "var(--text-2)" }}
                          >
                            {"Remote image not loaded — K3PTA keeps this window local."}
                            {beschluss.weg && (
                              <>
                                {" Open in browser: "}
                                <a href={beschluss.weg} target="_blank" rel="noreferrer" className="underline underline-offset-2" style={{ color: "var(--accent)" }}>
                                  {beschluss.gegenstelle}
                                </a>
                              </>
                            )}
                          </span>
                        );
                      },
                      ul: ({ children }) => <ul className="list-disc pl-5 my-2 space-y-1 marker:text-[var(--accent)]">{children}</ul>,
                      ol: ({ children }) => <ol className="list-decimal pl-5 my-2 space-y-1 marker:text-[var(--accent)]">{children}</ol>,
                      li: ({ children }) => <li className="lh-prosa" style={{ color: "var(--text-1)" }}>{children}</li>,
                      blockquote: ({ children }) => (
                        <blockquote className="border-l-2 pl-3 my-2 italic" style={{ borderColor: "var(--accent)", color: "var(--text-2)", background: "var(--bg-inset)", borderRadius: "0 6px 6px 0" }}>
                          {children}
                        </blockquote>
                      ),
                      code: ({ children, className }) => {
                        const isBlock = !!className;
                        if (isBlock) {
                          return <code className="font-mono fs-2 lh-dicht break-all" style={{ color: "var(--text-1)" }}>{children}</code>;
                        }
                        return <code className="px-2 py-1 rounded font-mono fs-2 lh-dicht" style={{ background: "var(--bg-inset-strong)", border: "1px solid var(--border-subtle)", color: "var(--accent)" }}>{children}</code>;
                      },
                      pre: ({ children }) => {
                        const codeText = extractCodeText(children);
                        return (
                          <div className="relative group/code my-3">
                            <pre className="p-3 pr-10 rounded-xl overflow-x-auto fs-2 lh-prosa hud-inset" style={{ background: "var(--bg-inset)", border: "1px solid var(--border-subtle)" }}>
                              {children}
                            </pre>
                            <button
                              onClick={() => {
                                void navigator.clipboard?.writeText(codeText);
                                setCopiedCodeId(msg.id);
                                setTimeout(() => setCopiedCodeId((id) => (id === msg.id ? null : id)), QUITTUNG_MS);
                              }}
                              className="absolute top-2 right-2 flex items-center justify-center p-2 rounded-lg tap transition-opacity"
                              style={{ background: "var(--bg-inset-strong)", border: "1px solid var(--border-subtle)", color: copiedCodeId === msg.id ? "var(--ok)" : "var(--text-2)" }}
                              title="Copy code"
                              aria-label={copiedCodeId === msg.id ? "Code copied" : "Copy code"}
                            >
                              {copiedCodeId === msg.id ? <CheckCircle2 className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                            </button>
                          </div>
                        );
                      },
                      hr: () => <hr className="my-3" style={{ borderColor: "var(--border-subtle)" }} />,
                      strong: ({ children }) => <strong className="font-semibold" style={{ color: "var(--text-1)" }}>{children}</strong>,
                      em: ({ children }) => <em className="italic" style={{ color: "var(--text-1)" }}>{children}</em>,
                      table: ({ children }) => <div className="overflow-x-auto my-3"><table className="w-full fs-2 lh-dicht border-collapse hud-inset rounded-lg overflow-hidden">{children}</table></div>,
                      th: ({ children }) => <th className="text-left px-2 py-2 font-semibold hud-inset" style={{ background: "var(--bg-inset-strong)", color: "var(--text-1)" }}>{children}</th>,
                      td: ({ children }) => <td className="px-2 py-2 border-t" style={{ borderColor: "var(--border-subtle)", color: "var(--text-2)" }}>{children}</td>,
                    }}
                  >
                    {msg.content || (isStreaming && msg.id === messages[messages.length - 1]?.id ? "▌" : "")}
                  </ReactMarkdown>
                  {isStreaming && msg.id === messages[messages.length - 1]?.id && msg.role === "assistant" && (
                    <span className="inline-block w-2 h-4 ml-1 align-middle animate-pulse rounded-sm" style={{ background: "var(--accent)" }} />
                  )}
                </div>

                {/* Quellen-Chips + Metadaten nur für Assistant */}
                {msg.role === "assistant" && (
                <div className="mt-3 space-y-2">
                  {msg.sources && msg.sources.length > 0 && (
                    <div className="flex flex-wrap gap-2 items-center">
                      <span className="hud-label fs-1 flex items-center gap-1">
                        <Hash className="w-3 h-3" /> Sources:
                      </span>
                      {msg.sources.slice(0, 6).map((s) => (
                        <span
                          key={s.id}
                          className="inline-flex flex-col items-start px-2 py-1 rounded-lg fs-1 font-semibold border max-w-[180px]"
                          style={{ background: "var(--accent-soft)", borderColor: "var(--border-subtle)", color: "var(--text-1)" }}
                          title={s.id}
                        >
                          <span className="inline-flex items-center gap-1 max-w-full">
                            <FileText className="w-3 h-3 shrink-0" style={{ color: "var(--accent)" }} />
                            <span className="truncate">{s.title.length > 18 ? s.title.slice(0, 18) + "…" : s.title}</span>
                          </span>
                          {/* Herkunfts-Badge (Paket 3): welches Bein (BM25/Vektor/Graph) den
                              Knoten wo im Ranking sah — dieselbe Wahrheit wie auf der Karte. */}
                          {spurenSichtbar(s.tracks) && (
                            <span className="flex flex-wrap gap-1 font-mono fs-1 font-normal lh-marke">
                              {s.tracks!.bm25 !== null && <span style={{ color: "var(--accent)" }}>bm25 #{s.tracks!.bm25 + 1}</span>}
                              {s.tracks!.vektor !== null && <span style={{ color: "var(--accent)" }}>vector #{s.tracks!.vektor + 1}</span>}
                              {s.tracks!.graph !== null && <span style={{ color: "var(--accent)" }}>graph #{s.tracks!.graph + 1}</span>}
                            </span>
                          )}
                        </span>
                      ))}
                      {msg.sources.length > 6 && (
                        <span className="fs-1 hud-label">+{msg.sources.length - 6}</span>
                      )}
                    </div>
                  )}
                  {msg.shield && (
                    <div data-testid="chat-shield" className="flex items-center gap-2 fs-1" style={{ color: "var(--ok)" }}>
                      <ShieldCheck className="w-3.5 h-3.5 shrink-0" />
                      <span>
                        {[
                          msg.shield.text ? `${msg.shield.text} never left this computer` : "",
                          msg.shield.privateNotes ? `${msg.shield.privateNotes} private ${msg.shield.privateNotes === 1 ? "note" : "notes"} stayed home` : "",
                        ].filter(Boolean).join(" · ")}
                        {" — privacy shield, "}{msg.shield.provider}
                      </span>
                    </div>
                  )}
                  <div className="flex flex-wrap items-center gap-2 fs-1 font-mono" style={{ color: "var(--text-3)" }}>
                    {typeof msg.inputTokens === "number" && <span className="inline-flex items-center gap-1"><Hash className="w-3 h-3" /> In {msg.inputTokens}</span>}
                    {typeof msg.outputTokens === "number" && <span className="inline-flex items-center gap-1">→ {msg.outputTokens} tokens</span>}
                    {msg.costLabel && <span className="inline-flex items-center gap-1"><Coins className="w-3 h-3" /> {msg.costLabel}</span>}
                    <span>{new Date(msg.timestamp).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}</span>
                  </div>
                  <div className="flex justify-end gap-2 pt-1">
                    <button
                      onClick={() => handleCopy(msg.content, msg.id)}
                      className="flex items-center gap-2 fs-1 font-semibold px-2 py-1 rounded hud-inset tap-reihum hover:!border-[color-mix(in_srgb,var(--accent)_45%,transparent)] transition-colors"
                      style={{ color: "var(--text-2)" }}
                      aria-label={copiedId === msg.id ? "Answer copied" : "Copy answer"}
                    >
                      {copiedId === msg.id ? <Check className="w-3 h-3" style={{ color: "var(--ok)" }} /> : <Copy className="w-3 h-3" />}
                      {copiedId === msg.id ? "Copied" : "Copy"}
                    </button>
                    <button
                      onClick={() => {
                        if (onSaveToBrainWithMeta) {
                          // Versuche Titel aus erster Zeile zu extrahieren
                          const firstLine = msg.content.split("\n").find((l) => l.trim().length > 6)?.slice(0, 80) || "AI answer";
                          onSaveToBrainWithMeta({ title: firstLine.replace(/^#+\s*/, ""), content: msg.content, tags: ["ai-log", "chat"] });
                        } else {
                          onSaveToBrain?.(msg.content);
                        }
                      }}
                      className="flex items-center gap-2 fs-1 font-semibold px-2 py-1 rounded hud-inset hover:!border-[color-mix(in_srgb,var(--accent)_45%,transparent)] transition-colors"
                      style={{ color: "var(--text-2)" }}
                    >
                      <Database className="w-3 h-3" style={{ color: "var(--accent)" }} /> Save as a node
                    </button>
                  </div>
                </div>
                )}
              </div>
            )}
          </motion.div>
        ))}

        {isStreaming && messages[messages.length - 1]?.role !== "assistant" && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="msg-ai flex items-center gap-2 fs-4 lh-lesbar" style={{ color: "var(--text-2)" }}>
            <span className="flex items-center gap-1">
              <span className="typing-dot" />
              <span className="typing-dot" />
              <span className="typing-dot" />
            </span>
            Thinking…
          </motion.div>
        )}

        {error && (
          // Aufgabe #93 (24.10.): die Sperre lag unter dem Rand (top 721 / unten 859 bei 840 px,
          // Scroll-Kasten endet 721) - der Klick auf Senden tat sichtbar nichts. Sticky am Fuss
          // der Nachrichtenflaeche haelt sie in jeder Fensterbreite im Bild.
          <div role="alert" aria-live="polite" data-fix="sperre-sichtbar" className="sticky bottom-0 z-20 mt-3 flex items-start gap-3 p-4 rounded-xl fs-4 lh-lesbar shadow-lg" style={{ background: "rgba(38,16,16,0.97)", border: "1px solid rgba(239,68,68,0.35)", color: "#f87171" }}>
            <AlertTriangle className="w-5 h-5 shrink-0 mt-1" />
            <div className="flex-1">
              <div className="font-semibold">Error</div>
              <div className="opacity-90 break-words">{error}</div>
              <button onClick={() => setError(null)} className="mt-2 fs-2 lh-dicht underline opacity-80 hover:opacity-100">Close</button>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* ---------- Input ---------- */}
      <div className="p-4 z-10 shrink-0" style={{ borderTop: "1px solid var(--border-subtle)" }}>
        <form onSubmit={handleSend} className="relative max-w-4xl mx-auto">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={isStreaming ? "Generating an answer — Stop to cancel" : "Write a message…"}
            disabled={isStreaming}
            className="composer w-full py-3 pl-4 pr-[92px] fs-4 lh-lesbar disabled:opacity-60 bg-transparent"
            aria-label="Chat Eingabe"
          />
          <div className="absolute right-2 top-1.5 bottom-1.5 flex items-center gap-1">
            {isStreaming ? (
              <button
                type="button"
                onClick={handleStop}
                className="h-full px-3 flex items-center gap-2 rounded-lg font-semibold fs-2 lh-dicht"
                style={{ background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.3)", color: "#f87171" }}
                title="Stop answer (abort)"
              >
                <Square className="w-3.5 h-3.5 fill-current" /> Stop
              </button>
            ) : null}
            <button
              type="submit"
              disabled={!input.trim() || isStreaming}
              className="btn-primary treff h-9 w-10 flex items-center justify-center disabled:opacity-40"
              title="Send (Enter)"
              aria-label="Send"
            >
              <Send className="w-4 h-4" />
            </button>
          </div>
        </form>
        <div className="max-w-4xl mx-auto mt-2 flex justify-between items-center fs-1" style={{ color: "var(--text-3)" }}>
          <span className="hud-label normal-case tracking-normal fs-1 flex items-center gap-3">
            <span className="flex items-center gap-1">
              <FileText className="w-3 h-3" /> {budgetedMemories.length} notes in the prompt
            </span>
            <span className="tnum">~{contextTokens.toLocaleString("en-GB")} tokens</span>
          </span>
          <span className="hidden sm:inline-flex items-center gap-3">
            <span className="flex items-center gap-1"><span className="kbd !py-px">Enter</span> send</span>
            <span className="flex items-center gap-1"><span className="kbd !py-px">⇧ Enter</span> new line</span>
          </span>
        </div>
      </div>
    </div>
  );
}

