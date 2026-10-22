// Upstream-Chat: der Proxy zu den KI-Providern (OpenAI-/Anthropic-Protokoll).
// Bewusst unverändert aus server.ts übernommen — der Wert liegt in den
// Protokolldetails (SSE-Zerlegung, Header-Konventionen), nicht in der Kürze.

export interface ChatRequest {
  providerId?: string;
  protocol?: "openai" | "anthropic";
  baseUrl?: string;
  apiKey?: string;
  model?: string;
  system?: string;
  messages: { role: "user" | "assistant"; content: string }[];
}

/** Gemeinsame Validierung von /api/chat und /api/chat/stream — früher zweimal kopiert. */
export function chatFehler(body: unknown): string | null {
  if (!body || typeof body !== "object" || !Array.isArray((body as ChatRequest).messages)) {
    return "a messages array is required";
  }
  const req = body as ChatRequest;
  if (req.messages.length > 40) return "Too many messages (max 40)";
  if (req.system && typeof req.system === "string" && req.system.length > 60000) return "System prompt too large";
  if (req.model && typeof req.model === "string" && req.model.length > 200) return "Model name too long";
  return null;
}

export function trimSlash(url: string) {
  return url.replace(/\/+$/, "");
}

function buildUpstreamBody(req: ChatRequest, stream: boolean) {
  if (req.protocol === "anthropic") {
    return {
      model: req.model || "claude-sonnet-4-20250514",
      max_tokens: 4096,
      system: req.system,
      messages: req.messages,
      stream,
    };
  }
  return {
    model: req.model || "gpt-4o-mini",
    max_tokens: 4096,
    messages: [
      ...(req.system ? [{ role: "system", content: req.system }] : []),
      ...req.messages,
    ],
    stream,
  };
}

function buildUpstreamHeaders(req: ChatRequest): Record<string, string> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (req.protocol === "anthropic") {
    headers["x-api-key"] = req.apiKey || "";
    headers["anthropic-version"] = "2023-06-01";
  } else {
    if (req.apiKey) headers["Authorization"] = `Bearer ${req.apiKey}`;
    if (req.providerId === "openrouter") {
      headers["HTTP-Referer"] = "kepta-local";
      headers["X-Title"] = "K3PTA";
    }
  }
  return headers;
}

/**
 * Ein Anbieter fehlt: kein Fehler im Sinn eines Absturzes, sondern eine Auskunft.
 * Die Routen fangen ihn und antworten mit 400 und grund; der Wurf bleibt als zweite
 * Schicht stehen, damit kein Aufrufer der Helfer-Datei blind raten kann.
 */
class KeinAnbieterFehler extends Error {
  readonly grund = "kein-anbieter";
  constructor() {
    super("kein Anbieter gewaehlt — die Route rueft keine Adresse, die niemand genannt hat");
    this.name = "KeinAnbieterFehler";
  }
}

function upstreamUrl(req: ChatRequest) {
  // Die Wand (#61): kein Default mehr. Bis hierhin riet die Route
  // https://api.openai.com/v1 (anthropisch: api.anthropic.com), wenn der Korper
  // keinen baseUrl nannte — ein Griff nach einer Adresse, die niemand gewaehlt hat,
  // und ohne Schluessel einer ohne Kopf. Die Routen sperren jetzt vorher; dieser
  // Wurf ist die zweite Schicht, damit kein kuenftiger Aufrufer blind raten kann.
  const base = trimSlash(req.baseUrl || "");
  if (!base) throw new KeinAnbieterFehler();
  return req.protocol === "anthropic" ? `${base}/v1/messages` : `${base}/chat/completions`;
}

// Zerlegt den Upstream-SSE-Stream in Textdeltas (OpenAI- und Anthropic-Format).
async function* streamUpstreamDeltas(res: Response): AsyncGenerator<string> {
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data:")) continue;
      const payload = trimmed.slice(5).trim();
      if (!payload || payload === "[DONE]") continue;
      try {
        const json = JSON.parse(payload);
        // OpenAI-Format
        const openAiDelta = json?.choices?.[0]?.delta?.content;
        if (typeof openAiDelta === "string" && openAiDelta) {
          yield openAiDelta;
          continue;
        }
        // Anthropic-Format
        if (json?.type === "content_block_delta" && json?.delta?.type === "text_delta") {
          yield json.delta.text || "";
        }
      } catch {
        // Unvollständige Zeile überspringen
      }
    }
  }
}

async function readFullAnswer(req: ChatRequest, signal?: AbortSignal) {
  const res = await fetch(upstreamUrl(req), {
    method: "POST",
    headers: buildUpstreamHeaders(req),
    body: JSON.stringify(buildUpstreamBody(req, false)),
    signal,
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data?.error?.message || `API error (${res.status})`);
  }
  if (req.protocol === "anthropic") {
    return (data?.content || [])
      .filter((b: unknown) => (b as { type: string }).type === "text")
      .map((b: unknown) => (b as { text: string }).text)
      .join("\n");
  }
  return data?.choices?.[0]?.message?.content ?? "";
}

/** Öffnet den Upstream-Stream (SSE) für /api/chat/stream. */
export function starteUpstreamStream(req: ChatRequest, signal: AbortSignal) {
  return fetch(upstreamUrl(req), {
    method: "POST",
    headers: buildUpstreamHeaders(req),
    body: JSON.stringify(buildUpstreamBody(req, true)),
    signal,
  });
}

export { streamUpstreamDeltas, readFullAnswer, upstreamUrl, buildUpstreamHeaders };
