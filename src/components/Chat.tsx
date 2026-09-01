import { useState, useRef, useEffect, useMemo, useCallback, FormEvent } from "react";
import { motion } from "motion/react";
import {
  Send,
  Bot,
  User as UserIcon,
  Loader2,
  AlertTriangle,
  Database,
  Trash2,
  PanelLeftOpen,
  Square,
  Copy,
  Check,
  CheckCircle2,
  Coins,
  Hash,
  FileText,
  Sparkles,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import { ChatMessage, Memory } from "../types";
import { loadAISettings, providerById } from "../lib/ai";

/** Extrahiert Rohtext aus ReactMarkdown-Children (für Copy-Buttons). */
function extractCodeText(node: unknown): string {
  if (node === null || node === undefined || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(extractCodeText).join("");
  const el = node as { props?: { children?: unknown } };
  if (el.props && "children" in el.props) return extractCodeText(el.props.children);
  return "";
}
import { hybridSearch } from "../lib/semantic";

// Erweiterte Message mit Quellen / Token-Metadaten
type ExtendedChatMessage = ChatMessage & {
  sources?: { id: string; title: string }[];
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
  ollama: { input: 0, output: 0, label: "Ollama (lokal)" },
  lmstudio: { input: 0, output: 0, label: "LM Studio (lokal)" },
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
  if (p.input === 0 && p.output === 0) return "kostenlos (lokal)";
  const cost = (inputTok / 1000) * p.input + (outputTok / 1000) * p.output;
  if (cost < 0.01) return `$${cost.toFixed(4)}`;
  return `$${cost.toFixed(3)}`;
}

const MIN_BUDGET = 1000;
const MAX_BUDGET = 16000;
const DEFAULT_BUDGET = 4000;
const RETRIEVAL_TTL_MS = 30_000;

export function Chat({ activeMemories, onSaveToBrain, onSaveToBrainWithMeta, isFocusMode, onToggleFocus }: ChatProps) {
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

  const settings = loadAISettings();
  const provider = providerById(settings.providerId);
  const pricing = getPricing(provider.id);

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
    if (activeMemories.length === 0) return [];
    // Cache-aware Ranking: hybridSearch mit 30s TTL statt reiner Aktualität
    const sorted = getRankedMemories(input, activeMemories);
    const inputTokens = estimateTokens(input);
    const baseSystemTokens = 90;
    const reserve = 500;
    const availableForMemories = Math.max(600, tokenBudget - baseSystemTokens - inputTokens - reserve);

    let used = 0;
    const picked: Memory[] = [];
    for (const m of sorted) {
      const chunk = `[ID: ${m.id} | KATEGORIEN: ${m.tags.join(", ")} | TITEL: ${m.title}]\n${m.content}\n\n`;
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
        const chunk = `[ID: ${m.id} | KATEGORIEN: ${m.tags.join(", ")} | TITEL: ${m.title}]\n${m.content}\n\n`;
        const tok = estimateTokens(chunk);
        if (used + tok <= availableForMemories) {
          picked.push(m);
          used += tok;
        }
      }
    }
    return picked;
  }, [activeMemories, tokenBudget, input, getRankedMemories]);

  const budgetedIds = useMemo(() => new Set(budgetedMemories.map((m) => m.id)), [budgetedMemories]);

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

  const handleCopy = async (text: string, id: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 1800);
    } catch {
      // ignore
    }
  };

  const buildSystemPrompt = (mems: Memory[]) => {
    // Adaptiv: Profil in Prompt einweben wenn vorhanden
    let profileLine = "";
    try {
      const raw = localStorage.getItem('ki_gehirn_adaptive_profile');
      if (raw) {
        const p = JSON.parse(raw);
        const name = p.displayName ? `Name: ${p.displayName}. ` : "";
        const cases = Array.isArray(p.useCases) && p.useCases.length ? `Fokus: ${p.useCases.join(', ')}. ` : "";
        const goal = p.goal ? `Ziel: ${p.goal}. ` : "";
        const note = p.customNote ? `Hinweis: ${p.customNote}. ` : "";
        if (name || cases || goal || note) profileLine = `[Nutzerprofil] ${name}${cases}${goal}${note}Passe Antwort-Stil und Beispiele daran an.\n\n`;
      }
    } catch {}
    let prompt = profileLine + "Du bist der KI Assistant. Du hast Zugriff auf die persönliche Knowledge Base des Nutzers. Antworte basierend auf dem folgenden Kontext präzise und hilfreich. Zitiere wenn möglich die ID der genutzten Knoten.\n\n";
    // Date-aware prompting (arXiv:2605.08538): Zeitanker reduzieren Temporal-Fehler deutlich
    prompt += `[Heute: ${new Date().toLocaleDateString('de-DE', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}]\n\n`;
    if (mems.length === 0) {
      prompt += "(Aktuell sind keine Knoten geladen. Antworte allgemein.)\n";
    } else {
      prompt += `Kontext — ${mems.length} Knoten (Token-Budget ${tokenBudget}):\n\n`;
      mems.forEach((m) => {
        const validTo = m.validTo ? ` | GÜLTIG BIS: ${new Date(m.validTo).toLocaleDateString('de-DE')}${m.validTo < Date.now() ? ' (ABGELAUFEN)' : ''}` : "";
        const superseded = m.supersededBy ? " | ERSETZT" : "";
        prompt += `[ID: ${m.id} | KATEGORIEN: ${m.tags.join(", ")} | TITEL: ${m.title}${validTo}${superseded}]\n${m.content}\n\n`;
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
    if (provLive.needsKey && !settingsLive.apiKey) {
      setError(`Kein API Key für ${provLive.label} hinterlegt. Bitte unter System → Einstellungen eintragen.`);
      return;
    }
    if (!settingsLive.model) {
      setError("Kein Modell festgelegt. Bitte unter System → Einstellungen ein Modell wählen.");
      return;
    }

    const userMsg: ExtendedChatMessage = {
      id: Date.now().toString(),
      role: "user",
      content: trimmed,
      timestamp: Date.now(),
    };

    const systemPrompt = buildSystemPrompt(budgetedMemories);
    const apiMessages = [...messages, userMsg].map((m) => ({
      role: m.role,
      content: m.content,
    }));

    // placeholder für Streaming
    const assistantId = (Date.now() + 1).toString();
    const sourcesForTurn = budgetedMemories.map((m) => ({ id: m.id, title: m.title }));
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
          baseUrl: settingsLive.baseUrl || provLive.baseUrl,
          apiKey: settingsLive.apiKey,
          model: settingsLive.model,
          system: systemPrompt,
          messages: apiMessages,
        }),
      });

      if (!res.ok || !res.body) {
        // Versuche JSON-Fehler zu lesen bevor SSE
        let msg = `API-Fehler (${res.status})`;
        try {
          const txt = await res.text();
          const j = JSON.parse(txt);
          if (j.error) msg = j.error;
        } catch {
          // ignore
        }
        throw new Error(msg);
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
          let json: { text?: string; error?: string };
          try {
            json = JSON.parse(payload);
          } catch {
            continue;
          }
          if (json.error) {
            throw new Error(json.error);
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
        throw new Error("Keine Antwort erhalten (leerer Stream).");
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
          setMessages((prev) => prev.map((m) => (m.id === assistantId ? { ...m, content: accText + "\n\n— _abgebrochen_", outputTokens: outTok, costLabel: cost } : m)));
        } else {
          setMessages((prev) => prev.filter((m) => m.id !== assistantId));
        }
        setError(null);
      } else {
        // Stream-Fehler – platziere Fehler und entferne leeren placeholder ggf.
        const msg = err instanceof Error ? err.message : String(err);
        if (!accText) {
          setMessages((prev) => prev.filter((m) => m.id !== assistantId));
        } else {
          // behalte partiellen Text + Fehlerhinweis
          setMessages((prev) => prev.map((m) => (m.id === assistantId ? { ...m, content: accText } : m)));
        }
        setError(msg || "Unbekannter Fehler beim Streaming");
      }
    } finally {
      setIsStreaming(false);
      abortRef.current = null;
      // ── Selbst-Erweiterung: immer mitlesen & automatisch speichern ──
      const autoLearnEnabled = (()=>{ try{ return localStorage.getItem('ki_gehirn_autolearn') !== 'false'; }catch{ return true; }})();
      if (autoLearnEnabled && accText && accText.length > 40) {
        // Hintergrund-Extraktion: Titel/Tags via KI, dann auto-save (best effort, nicht blockierend)
        (async ()=>{
          try {
            const s = loadAISettings();
            const prov = providerById(s.providerId);
            // Nur wenn Modell konfiguriert und nicht zu kurz
            if (!s.model) return;
            if (accText.length < 60 && !accText.includes('\n')) return;
            // Extrahiere Kernaussage via kleinem Prompt (nutzt gleiches Modell, kurzer Call)
            const extractPrompt = `Extrahiere aus folgender KI-Antwort einen Wissens-Knoten. Antworte NUR als JSON {"title":"kurzer Titel max 60 Zeichen","tags":["tag1","tag2"],"summary":"kompakte Zusammenfassung 2-4 Sätze, kein Floskel"}.\n\nAntwort:\n${accText.slice(0,4000)}`;
            const r = await fetch('/api/chat', {
              method:'POST', headers:{'Content-Type':'application/json'},
              body: JSON.stringify({ providerId: prov.id, protocol: prov.protocol, baseUrl: s.baseUrl || prov.baseUrl, apiKey: s.apiKey, model: s.model, system:'Du extrahierst Wissen. Antworte nur JSON.', messages:[{role:'user', content: extractPrompt}] })
            });
            if (!r.ok) return;
            const j = await r.json();
            const txt = (j.text||'').trim();
            const jsonStr = txt.slice(txt.indexOf('{'), txt.lastIndexOf('}')+1);
            if (!jsonStr) return;
            const parsed = JSON.parse(jsonStr);
            const title = (parsed.title||'Auto-Knoten').slice(0,80);
            const tagsRaw = Array.isArray(parsed.tags) ? parsed.tags : [];
            const tags = [...new Set([...tagsRaw.map((t:string)=> String(t).toLowerCase().replace(/[^a-z0-9-]/g,'')).filter(Boolean).slice(0,5), 'auto-learn'])].slice(0,6);
            const summary = parsed.summary ? String(parsed.summary).slice(0,2000) : accText.slice(0,1600);
            // Verhindere Duplikate: nur speichern wenn nicht fast identisch vorhanden
            const existing = await fetch('/api/memories').then(r=>r.json()).then(d=>d.memories as any[]).catch(()=>[]);
            const isDup = existing.some((m:any)=> m.content.slice(0,120)===summary.slice(0,120) || (m.title===title && Math.abs(m.content.length-summary.length)<20));
            if (isDup) return;
            await fetch('/api/memory', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ title, content: summary + `\n\n— Quelle: Chat ${new Date().toLocaleString('de-DE')} — Modell ${prov.label}/${s.model}`, tags }) });
            // kleines visuelles Feedback im Chat (optional)
            // console.log('[auto-learn] gespeichert:', title);
          } catch {}
        })();
      }
    }
  };

  // Slider Prozent für Track-Füllung
  const budgetPercent = ((tokenBudget - MIN_BUDGET) / (MAX_BUDGET - MIN_BUDGET)) * 100;

  return (
    <div className="flex flex-col h-full w-full relative">
      {/* ---------- Header ---------- */}
      <div className="px-6 py-4 flex items-center justify-between z-10 border-gradient-b shrink-0" style={{ borderBottom: "1px solid var(--border-subtle)" }}>
        <div className="flex items-center gap-3">
          {isFocusMode && (
            <button onClick={onToggleFocus} className="btn-ghost p-1.5 -ml-2 rounded-lg" aria-label="Fokus verlassen">
              <PanelLeftOpen className="w-5 h-5" />
            </button>
          )}
          <div className="w-9 h-9 rounded-full flex items-center justify-center relative" style={{ background: "var(--accent-soft)", border: "1px solid var(--border-subtle)" }}>
            <Bot className="w-4 h-4" style={{ color: "var(--accent)" }} />
            <span className="absolute -bottom-0.5 -right-0.5 status-dot" />
          </div>
          <div>
            <h2 className="font-semibold text-sm flex items-center gap-1.5" style={{ color: "var(--text-1)" }}>
              Chat
              {isStreaming && <span className="inline-flex items-center gap-1 text-[10px] font-normal px-1.5 py-0.5 rounded hud-inset" style={{ color: "var(--accent)" }}><span className="w-1.5 h-1.5 rounded-full bg-[var(--accent)] animate-pulse" /> streamt…</span>}
            </h2>
            <div className="hud-label mt-0.5 flex items-center gap-1.5">
              {settings.model ? `${provider.label} · ${settings.model}` : "Kein Modell konfiguriert"}
              {pricing.input === 0 && <span className="px-1 py-0 rounded text-[9px] border" style={{ borderColor: "var(--border-subtle)", color: "var(--ok)" }}>lokal</span>}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 sm:gap-4 text-xs font-medium">
          <div className="flex items-center gap-1.5" style={{ color: "var(--text-2)" }}>
            <span className="hud-label hidden sm:inline">Kontext:</span>
            <span className="px-2 py-1 rounded hud-inset flex items-center gap-1" style={{ color: "var(--accent)" }}>
              <Hash className="w-3 h-3" />
              {budgetedMemories.length}/{activeMemories.length}
            </span>
          </div>
          <div className="hidden sm:flex items-center gap-1.5 px-2 py-1 rounded hud-inset hud-label">
            <FileText className="w-3 h-3" /> ~{totalInputTokensEstimate.toLocaleString("de-DE")} Tokens
          </div>
          <div className="hidden md:flex items-center gap-1.5 px-2 py-1 rounded hud-inset hud-label" title={`Input ${totalInputTokensEstimate} · Output ~${liveOutputTokens || 0} · ${estimatedCostNow}`}>
            <Coins className="w-3 h-3" /> {estimatedCostNow}
          </div>
          <button onClick={clearChat} className="btn-ghost p-1.5 rounded-lg hover:!border-red-500/40" title="Chat leeren" aria-label="Chat leeren">
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* ---------- Token-Budget Regler ---------- */}
      <div className="px-6 py-3 shrink-0 hud-inset border-b" style={{ borderColor: "var(--border-subtle)", background: "var(--bg-inset)" }}>
        <div className="flex items-center gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between mb-1.5">
              <span className="hud-label flex items-center gap-1.5">
                <Sparkles className="w-3 h-3" style={{ color: "var(--accent)" }} />
                Token-Budget
              </span>
              <span className="text-xs font-mono flex items-center gap-2" style={{ color: "var(--text-1)" }}>
                <span className="px-1.5 py-0.5 rounded text-[11px] font-semibold" style={{ background: "var(--accent-soft)", color: "var(--accent)", border: "1px solid var(--border-subtle)" }}>
                  {tokenBudget.toLocaleString("de-DE")}
                </span>
                <span className="hud-label normal-case tracking-normal text-[10px]">· {budgetedMemories.length} Knoten aktiv</span>
              </span>
            </div>
            <div className="relative h-6 flex items-center">
              <div className="absolute left-0 right-0 h-2 rounded-full hud-inset overflow-hidden" style={{ background: "var(--bg-inset-strong)" }}>
                <div className="h-full rounded-full transition-all" style={{ width: `${budgetPercent}%`, background: "linear-gradient(90deg, var(--accent), var(--accent-2))" }} />
              </div>
              <input
                type="range"
                min={MIN_BUDGET}
                max={MAX_BUDGET}
                step={500}
                value={tokenBudget}
                onChange={(e) => setTokenBudget(parseInt(e.target.value, 10))}
                className="relative w-full h-2 appearance-none bg-transparent accent-[var(--accent)] cursor-pointer
                  [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-[var(--accent)] [&::-webkit-slider-thumb]:shadow-md
                  [&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:bg-white [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-[var(--accent)]"
                aria-label="Token Budget"
              />
            </div>
            <div className="flex justify-between hud-label text-[9px] mt-1 opacity-70">
              <span>{MIN_BUDGET.toLocaleString("de-DE")}</span>
              <span>8k</span>
              <span>{MAX_BUDGET.toLocaleString("de-DE")}</span>
            </div>
            {budgetedMemories.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-2">
                {budgetedMemories.slice(0, 8).map((m) => (
                  <span
                    key={m.id}
                    className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium border truncate max-w-[140px]"
                    style={{ background: budgetedIds.has(m.id) ? "var(--accent-soft)" : "var(--bg-panel)", borderColor: "var(--border-subtle)", color: "var(--text-2)" }}
                    title={`${m.title} — ${m.id}`}
                  >
                    <Hash className="w-2.5 h-2.5 shrink-0" style={{ color: "var(--accent)" }} />
                    <span className="truncate">{m.title || m.id.slice(0, 8)}</span>
                  </span>
                ))}
                {budgetedMemories.length > 8 && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded hud-inset" style={{ color: "var(--text-3)" }}>
                    +{budgetedMemories.length - 8}
                  </span>
                )}
              </div>
            )}
          </div>
          <div className="hidden lg:flex flex-col items-end gap-1 text-xs min-w-[140px] shrink-0">
            <span className="hud-label">Kosten-Schätzung</span>
            <span className="font-mono text-sm" style={{ color: pricing.input === 0 ? "var(--ok)" : "var(--text-1)" }}>
              {estimatedCostNow}
            </span>
            <span className="text-[10px] font-mono" style={{ color: "var(--text-3)" }}>
              In ~{totalInputTokensEstimate} · Out ~{liveOutputTokens || "—"}
            </span>
            <span className="text-[10px]" style={{ color: "var(--text-3)" }}>
              {provider.label} · ~{(totalInputTokensEstimate + (liveOutputTokens || 0)).toLocaleString("de-DE")} total
            </span>
          </div>
        </div>
      </div>

      {/* ---------- Messages ---------- */}
      <div ref={scrollContainerRef} className="flex-1 overflow-y-auto p-6 space-y-6 min-h-0">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center py-8">
            <div className="w-40 h-40 opacity-70">
              <BrainOrb />
            </div>
            <div className="hud-label mb-2">Chat bereit</div>
            <p className="text-sm max-w-sm" style={{ color: "var(--text-2)" }}>
              Frag mich etwas zu deinen Einträgen — {budgetedMemories.length} von {activeMemories.length} Knoten sind im Budget ({tokenBudget.toLocaleString("de-DE")} Tokens) geladen.
            </p>
            <div className="mt-4 flex flex-wrap gap-2 justify-center max-w-md">
              {["Zusammenfassung", "Widersprüche finden", "Nächste Schritte", "Als Tabelle"].map((s) => (
                <button
                  key={s}
                  onClick={() => setInput(s)}
                  className="hud-inset px-3 py-1.5 rounded-full text-xs font-medium hover:!border-[var(--accent)] transition-colors"
                  style={{ color: "var(--text-2)" }}
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
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className={`flex gap-4 ${msg.role === "user" ? "flex-row-reverse" : ""}`}
          >
            <div
              className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${msg.role === "user" ? "btn-primary" : "hud-inset"}`}
            >
              {msg.role === "user" ? <UserIcon className="w-4 h-4" /> : <Bot className="w-4 h-4" style={{ color: "var(--accent)" }} />}
            </div>

            <div className={`max-w-[86%] sm:max-w-[80%] rounded-2xl p-4 text-sm leading-relaxed ${msg.role === "user" ? "btn-primary rounded-tr-sm" : "hud-panel rounded-tl-sm"}`}>
              {msg.role === "user" ? (
                <div className="whitespace-pre-wrap break-words">{msg.content}</div>
              ) : (
                <div className="prose prose-sm max-w-none break-words" style={{ color: "var(--text-1)" }}>
                  <ReactMarkdown
                    components={{
                      h1: ({ children }) => <h1 className="text-base font-bold mt-3 mb-2" style={{ color: "var(--text-1)" }}>{children}</h1>,
                      h2: ({ children }) => <h2 className="text-[15px] font-semibold mt-3 mb-1.5" style={{ color: "var(--text-1)" }}>{children}</h2>,
                      h3: ({ children }) => <h3 className="text-sm font-semibold mt-2.5 mb-1" style={{ color: "var(--text-1)" }}>{children}</h3>,
                      p: ({ children }) => <p className="my-2 leading-relaxed" style={{ color: "var(--text-1)" }}>{children}</p>,
                      a: ({ children, href }) => (
                        <a href={href} target="_blank" rel="noreferrer" className="underline decoration-[var(--accent)] underline-offset-2 hover:opacity-80" style={{ color: "var(--accent)" }}>
                          {children}
                        </a>
                      ),
                      ul: ({ children }) => <ul className="list-disc pl-5 my-2 space-y-1 marker:text-[var(--accent)]">{children}</ul>,
                      ol: ({ children }) => <ol className="list-decimal pl-5 my-2 space-y-1 marker:text-[var(--accent)]">{children}</ol>,
                      li: ({ children }) => <li className="leading-relaxed" style={{ color: "var(--text-1)" }}>{children}</li>,
                      blockquote: ({ children }) => (
                        <blockquote className="border-l-2 pl-3 my-2 italic" style={{ borderColor: "var(--accent)", color: "var(--text-2)", background: "var(--bg-inset)", borderRadius: "0 6px 6px 0" }}>
                          {children}
                        </blockquote>
                      ),
                      code: ({ children, className }) => {
                        const isBlock = !!className;
                        if (isBlock) {
                          return <code className="font-mono text-xs break-all" style={{ color: "var(--text-1)" }}>{children}</code>;
                        }
                        return <code className="px-1.5 py-0.5 rounded font-mono text-xs" style={{ background: "var(--bg-inset-strong)", border: "1px solid var(--border-subtle)", color: "var(--accent)" }}>{children}</code>;
                      },
                      pre: ({ children }) => {
                        const codeText = extractCodeText(children);
                        return (
                          <div className="relative group/code my-3">
                            <pre className="p-3 pr-10 rounded-xl overflow-x-auto text-xs leading-relaxed hud-inset" style={{ background: "var(--bg-inset)", border: "1px solid var(--border-subtle)" }}>
                              {children}
                            </pre>
                            <button
                              onClick={() => {
                                void navigator.clipboard?.writeText(codeText);
                                setCopiedCodeId(msg.id);
                                setTimeout(() => setCopiedCodeId((id) => (id === msg.id ? null : id)), 1600);
                              }}
                              className="absolute top-2 right-2 p-1.5 rounded-lg opacity-0 group-hover/code:opacity-100 transition-opacity"
                              style={{ background: "var(--bg-inset-strong)", border: "1px solid var(--border-subtle)", color: copiedCodeId === msg.id ? "var(--ok)" : "var(--text-3)" }}
                              title="Code kopieren"
                            >
                              {copiedCodeId === msg.id ? <CheckCircle2 className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                            </button>
                          </div>
                        );
                      },
                      hr: () => <hr className="my-3" style={{ borderColor: "var(--border-subtle)" }} />,
                      strong: ({ children }) => <strong className="font-semibold" style={{ color: "var(--text-1)" }}>{children}</strong>,
                      em: ({ children }) => <em className="italic" style={{ color: "var(--text-1)" }}>{children}</em>,
                      table: ({ children }) => <div className="overflow-x-auto my-3"><table className="w-full text-xs border-collapse hud-inset rounded-lg overflow-hidden">{children}</table></div>,
                      th: ({ children }) => <th className="text-left px-2 py-1.5 font-semibold hud-inset" style={{ background: "var(--bg-inset-strong)", color: "var(--text-1)" }}>{children}</th>,
                      td: ({ children }) => <td className="px-2 py-1.5 border-t" style={{ borderColor: "var(--border-subtle)", color: "var(--text-2)" }}>{children}</td>,
                    }}
                  >
                    {msg.content || (isStreaming && msg.id === messages[messages.length - 1]?.id ? "▌" : "")}
                  </ReactMarkdown>
                  {isStreaming && msg.id === messages[messages.length - 1]?.id && msg.role === "assistant" && (
                    <span className="inline-block w-2 h-4 ml-0.5 align-middle animate-pulse rounded-sm" style={{ background: "var(--accent)" }} />
                  )}
                </div>
              )}

              {/* Quellen-Chips + Metadaten nur für Assistant */}
              {msg.role === "assistant" && (
                <div className="mt-3 space-y-2">
                  {msg.sources && msg.sources.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 items-center">
                      <span className="hud-label text-[9px] flex items-center gap-1">
                        <Hash className="w-3 h-3" /> Quellen:
                      </span>
                      {msg.sources.slice(0, 6).map((s) => (
                        <span
                          key={s.id}
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium border"
                          style={{ background: "var(--accent-soft)", borderColor: "var(--border-subtle)", color: "var(--text-1)" }}
                          title={s.id}
                        >
                          <FileText className="w-3 h-3" style={{ color: "var(--accent)" }} />
                          {s.title.length > 18 ? s.title.slice(0, 18) + "…" : s.title}
                        </span>
                      ))}
                      {msg.sources.length > 6 && (
                        <span className="text-[10px] hud-label">+{msg.sources.length - 6}</span>
                      )}
                    </div>
                  )}
                  <div className="flex flex-wrap items-center gap-2 text-[10px] font-mono" style={{ color: "var(--text-3)" }}>
                    {typeof msg.inputTokens === "number" && <span className="inline-flex items-center gap-1"><Hash className="w-3 h-3" /> In {msg.inputTokens}</span>}
                    {typeof msg.outputTokens === "number" && <span className="inline-flex items-center gap-1">→ {msg.outputTokens} Tokens</span>}
                    {msg.costLabel && <span className="inline-flex items-center gap-1"><Coins className="w-3 h-3" /> {msg.costLabel}</span>}
                    <span>{new Date(msg.timestamp).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })}</span>
                  </div>
                  <div className="flex justify-end gap-1.5 pt-1">
                    <button
                      onClick={() => handleCopy(msg.content, msg.id)}
                      className="flex items-center gap-1.5 text-[11px] font-medium px-2 py-1 rounded hud-inset hover:!border-[color-mix(in_srgb,var(--accent)_45%,transparent)] transition-all"
                      style={{ color: "var(--text-2)" }}
                    >
                      {copiedId === msg.id ? <Check className="w-3 h-3" style={{ color: "var(--ok)" }} /> : <Copy className="w-3 h-3" />}
                      {copiedId === msg.id ? "Kopiert" : "Kopieren"}
                    </button>
                    <button
                      onClick={() => {
                        if (onSaveToBrainWithMeta) {
                          // Versuche Titel aus erster Zeile zu extrahieren
                          const firstLine = msg.content.split("\n").find((l) => l.trim().length > 6)?.slice(0, 80) || "KI-Antwort";
                          onSaveToBrainWithMeta({ title: firstLine.replace(/^#+\s*/, ""), content: msg.content, tags: ["ai-log", "chat"] });
                        } else {
                          onSaveToBrain?.(msg.content);
                        }
                      }}
                      className="flex items-center gap-1.5 text-[11px] font-medium px-2 py-1 rounded hud-inset hover:!border-[color-mix(in_srgb,var(--accent)_45%,transparent)] transition-all"
                      style={{ color: "var(--text-2)" }}
                    >
                      <Database className="w-3 h-3" style={{ color: "var(--accent)" }} /> Als Knoten speichern
                    </button>
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        ))}

        {isStreaming && messages[messages.length - 1]?.role !== "assistant" && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex gap-4">
            <div className="w-8 h-8 rounded-lg hud-inset flex items-center justify-center shrink-0">
              <Loader2 className="w-4 h-4 animate-spin" style={{ color: "var(--accent)" }} />
            </div>
            <div className="hud-panel rounded-2xl rounded-tl-sm p-4 flex items-center gap-2 text-sm" style={{ color: "var(--text-2)" }}>
              <span className="flex items-center gap-1">
                <span className="typing-dot" />
                <span className="typing-dot" />
                <span className="typing-dot" />
              </span>
              Synapsen feuern…
            </div>
          </motion.div>
        )}

        {error && (
          <div className="flex items-start gap-3 p-4 rounded-xl text-sm" style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.25)", color: "#f87171" }}>
            <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
            <div className="flex-1">
              <div className="font-medium">Fehler</div>
              <div className="opacity-90 break-words">{error}</div>
              <button onClick={() => setError(null)} className="mt-2 text-xs underline opacity-80 hover:opacity-100">Schließen</button>
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
            placeholder={isStreaming ? "Streamt… – Stop drücken zum Abbruch" : "Nachricht an das neuronale Netz…"}
            disabled={isStreaming}
            className="hud-input w-full rounded-xl py-3.5 pl-4 pr-[88px] text-sm disabled:opacity-60"
            aria-label="Chat Eingabe"
          />
          <div className="absolute right-2 top-2 bottom-2 flex items-center gap-1">
            {isStreaming ? (
              <button
                type="button"
                onClick={handleStop}
                className="h-full px-3 flex items-center gap-1.5 rounded-lg font-medium text-xs"
                style={{ background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.3)", color: "#f87171" }}
                title="Antwort stoppen (Abort)"
              >
                <Square className="w-3.5 h-3.5 fill-current" /> Stop
              </button>
            ) : null}
            <button
              type="submit"
              disabled={!input.trim() || isStreaming}
              className="btn-primary h-full w-10 flex items-center justify-center rounded-lg disabled:opacity-40"
              title="Senden (Enter)"
              aria-label="Senden"
            >
              <Send className="w-4 h-4" />
            </button>
          </div>
        </form>
        <div className="max-w-4xl mx-auto mt-2 flex justify-between text-[10px] font-mono" style={{ color: "var(--text-3)" }}>
          <span className="hud-label normal-case tracking-normal text-[10px] flex items-center gap-1">
            <FileText className="w-3 h-3" /> {budgetedMemories.length} Knoten im Prompt · ~{contextTokens.toLocaleString("de-DE")} Prompt-Tokens
          </span>
          <span className="hidden sm:inline">Enter senden · Shift+Enter Umbruch · Budget regelt Top-k</span>
        </div>
      </div>
    </div>
  );
}

function BrainOrb() {
  return (
    <div className="relative w-full h-full flex items-center justify-center">
      <motion.div
        animate={{ scale: [1, 1.1, 1], opacity: [0.3, 0.55, 0.3] }}
        transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" } as unknown as Record<string, unknown>}
        className="absolute inset-0 rounded-full blur-3xl"
        style={{ background: "radial-gradient(circle, var(--accent-glow), transparent 70%)" }}
      />
      <motion.div
        animate={{ rotate: 360 }}
        transition={{ duration: 24, repeat: Infinity, ease: "linear" } as unknown as Record<string, unknown>}
        className="absolute w-32 h-32 rounded-full"
        style={{ border: "1px dashed var(--border-strong)" }}
      />
      <motion.div
        animate={{ rotate: -360 }}
        transition={{ duration: 16, repeat: Infinity, ease: "linear" } as unknown as Record<string, unknown>}
        className="absolute w-24 h-24 rounded-full"
        style={{ border: "1px solid var(--accent-soft)" }}
      />
      <Bot className="w-8 h-8 relative z-10" style={{ color: "var(--accent)" }} />
    </div>
  );
}
