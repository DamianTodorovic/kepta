// Chat-Proxy (Streaming + blockierend) und Modelle-Liste.
// Der Chat läuft als SSE-Proxy zum gewählten Provider; der Client-Abbruch
// bricht den Upstream-Request ab (kein weiterlaufender Token-Stream).
import express from "express";
import { trimSlash, chatFehler, starteUpstreamStream, streamUpstreamDeltas, readFullAnswer, type ChatRequest } from "../helfer/upstream";
import { Schild, beschreibe, istLokaleAdresse, ohnePrivateBloecke } from "../../src/lib/schild";
import { normalizeIpv4, ipv6Groups, eingebettetesIpv4 } from "../helfer/ssrf";
import { liesVerwaltet, richtlinie, istLokalerHost } from "../../src/lib/richtlinien";
import { schreibe as protokolliere } from "../../src/lib/pruefprotokoll";
import { schildEinstellungen, privateIds } from "./schild";
import { bodyOf } from "../helfer/body";
import { aktivesSuchModell, einbettModell, ollamaBaseUrl } from "../../src/core/embeddings";
import type { AppKontext } from "../kontext";

function istBlockierteAnbieterIp4(ip: string): boolean {
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4 || parts.some((n) => Number.isNaN(n) || n < 0 || n > 255)) return true;
  const [a, b] = parts as [number, number, number, number];
  // Block unspecified (0.0.0.0/8), link-local/cloud metadata (169.254.0.0/16), multicast/reserved (224.0.0.0+)
  return a === 0 || (a === 169 && b === 254) || a >= 224;
}

function istBlockierteAnbieterHost(rawHost: string): boolean {
  const h = rawHost.replace(/^\[|\]$/g, "").split("%")[0]!.trim().toLowerCase();
  if (!h) return true;
  if (
    h === "metadata" ||
    h === "metadata.google.internal" ||
    h === "metadata.google" ||
    h === "metadata.goog" ||
    h === "instance-data" ||
    h.includes("169.254.")
  ) {
    return true;
  }
  const ip4 = normalizeIpv4(h);
  if (ip4 && istBlockierteAnbieterIp4(ip4)) return true;
  const g = ipv6Groups(h);
  if (g) {
    if (g.every((x) => x === 0)) return true; // ::
    if (g[0]! >= 0xfe80 && g[0]! <= 0xfebf) return true; // fe80::/10 link-local
    if (g[0]! >= 0xff00) return true; // ff00::/8 multicast
    if (g[0] === 0xfd00 && g[1] === 0x0ec2) return true; // fd00:ec2::/32 AWS metadata IPv6
    for (const emb of eingebettetesIpv4(g)) {
      if (istBlockierteAnbieterIp4(emb)) return true;
    }
  }
  return false;
}

export function mountChat(app: express.Express, ctx: AppKontext): void {
  const { store } = ctx;

  /**
   * Zentrale Richtlinie chat_cloud=deny: nur lokale Modelle (Ollama & Co.).
   * Die Organisation verbietet den Weg nach draußen — der Zielhost zählt,
   * nicht die Einstellungen des Nutzers. Gilt für BEIDE Chat-Routen (blockierend
   * UND Stream — 26.9.-Audit: der Stream war die Umgehungslücke).
   */
  function cloudVerboten(body: { protocol?: string; baseUrl?: string }): string | null {
    if (richtlinie("chat_cloud") !== "deny") return null;
    const ziel = body.baseUrl || (body.protocol === "anthropic" ? "https://api.anthropic.com" : "https://api.openai.com/v1");
    return istLokalerHost(ziel)
      ? null
      : "Cloud models are disabled by your organization's policy. Local models (e.g. Ollama) remain available.";
  }
  /**
   * Die Wand von #61, vor jedem Aufbruch: keine Route ruft eine Adresse, die
   * niemand gewaehlt hat, und keine Adresse ausserhalb dieses Rechners ohne
   * Schluessel (`body.baseUrl || "https://api.openai.com/v1"` war frueher offen).
   * Zusaetzlich werden Schema, Credentials und Cloud-Metadata-Ziele
   * (169.254.0.0/16, fe80::/10, 0.0.0.0) vor jedem Socket-Aufbau abgewiesen.
   */
  function anbieterSperre(body: { baseUrl?: string; apiKey?: string }): { status: number; error: string; grund: string } | null {
    const basis = trimSlash(body.baseUrl || "");
    if (!basis) {
      return {
        status: 400,
        error: "kein Anbieter gewaehlt — die Route rueft keine Adresse, die niemand genannt hat",
        grund: "kein-anbieter",
      };
    }
    let parsed: URL;
    try {
      parsed = new URL(basis);
    } catch {
      return { status: 400, error: "invalid provider address", grund: "ungueltige-adresse" };
    }
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return { status: 400, error: "only http and https provider URLs are supported", grund: "ungueltige-adresse" };
    }
    if (parsed.username || parsed.password) {
      return { status: 400, error: "provider URL must not contain embedded credentials", grund: "ungueltige-adresse" };
    }
    if (istBlockierteAnbieterHost(parsed.hostname)) {
      return { status: 400, error: "metadata and link-local addresses are blocked", grund: "adresse-blockiert" };
    }
    if (!istLokaleAdresse(basis) && !(body.apiKey || "").trim()) {
      return {
        status: 400,
        error: `der Anbieter ${basis} braucht einen Schluessel — ohne ihn geht kein Paket aus dem Rechner`,
        grund: "kein-schluessel",
      };
    }
    return null;
  }

  /**
   * The privacy shield for the chat: nothing personal reaches a cloud model.
   * A model on this computer (Ollama, LM Studio) sees everything — the data
   * never leaves the machine. Every request to a cloud model lands in the audit
   * log with what was sent and what was hidden; private notes never go out.
   */
  function chatSchutz(body: ChatRequest): {
    body: ChatRequest;
    schild: Schild | null;
    hinweis: { hidden: Record<string, number>; text: string; privateNotes: number; provider: string } | null;
  } {
    const ziel = body.baseUrl || (body.protocol === "anthropic" ? "https://api.anthropic.com" : "https://api.openai.com/v1");
    if (istLokaleAdresse(ziel)) return { body, schild: null, hinweis: null };
    let anbieter = ziel;
    try {
      anbieter = new URL(ziel).host;
    } catch {
      // keep the raw address
    }
    const ohne = ohnePrivateBloecke(typeof body.system === "string" ? body.system : "", privateIds(store));
    const notizen = (ohne.text.match(/\[ID: /g) ?? []).length;
    const aktiv = schildEinstellungen(store).chat;
    const schild = aktiv ? new Schild() : null;
    let system = schild ? schild.schirme(ohne.text) : ohne.text;
    const messages = schild ? body.messages.map((m) => ({ ...m, content: schild.schirme(String(m.content ?? "")) })) : body.messages;
    if (schild && !schild.leer) {
      system += "\n\n(Privacy note from K3PTA: some personal values were replaced with placeholders such as [EMAIL-1]. Keep every placeholder exactly as written — K3PTA puts the real values back before the user reads your answer.)";
    }
    const text = schild ? beschreibe(schild.zaehlung) : "";
    protokolliere(store, {
      actor: "You",
      action: "cloud chat",
      target: `${anbieter}${body.model ? ` · ${body.model}` : ""}`,
      detail: [
        `${notizen} ${notizen === 1 ? "note" : "notes"} sent`,
        text ? `hidden: ${text}` : aktiv ? "nothing to hide" : "privacy shield off",
        ohne.entfernt ? `${ohne.entfernt} private ${ohne.entfernt === 1 ? "note" : "notes"} left out` : "",
      ]
        .filter(Boolean)
        .join(" · "),
    });
    const hinweis = text || ohne.entfernt ? { hidden: schild?.zaehlung ?? {}, text, privateNotes: ohne.entfernt, provider: anbieter } : null;
    return { body: { ...body, system: system || undefined, messages }, schild, hinweis };
  }

  // Streaming: leitet die Antwort als SSE an den Client weiter
  app.post("/api/chat/stream", ctx.limiter.chat, async (req, res) => {
    const body = bodyOf<ChatRequest>(req);
    // Hardened: Validierung — messages ist Pflichtfeld (sonst TypeError im Upstream-Body)
    const fehler = chatFehler(body);
    if (fehler) return res.status(fehler === "System prompt too large" ? 413 : 400).json({ error: fehler });
    const cloudFehler = cloudVerboten(body);
    if (cloudFehler) return res.status(403).json({ error: cloudFehler });
    const sperre = anbieterSperre(body);
    if (sperre) return res.status(sperre.status).json({ error: sperre.error, grund: sperre.grund });

    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    });

    const controller = new AbortController();
    // Client-Disconnect bricht den Upstream-Request ab (kein weiterlaufender Token-Stream)
    req.on("close", () => controller.abort());

    // The privacy shield — before anything leaves for a cloud model.
    const schutz = chatSchutz(body);
    if (schutz.hinweis) res.write(`data: ${JSON.stringify({ shield: schutz.hinweis })}\n\n`);
    const strom = schutz.schild?.strom();

    try {
      const upstream = await starteUpstreamStream(schutz.body, controller.signal);

      if (!upstream.ok || !upstream.body) {
        const errText = await upstream.text();
        // Aufgabe #92 (24.10.): der Wortlaut des Anbieters bleibt im Protokoll. Nach aussen geht
        // ein Satz in Produktsprache plus eine benannte Kennung - nie ein Ausnahmename.
        console.error(`kepta: provider refused the stream (${upstream.status}):`, errText.slice(0, 400));
        res.write(`data: ${JSON.stringify({ error: "The provider refused this request. Check the key and the model name under Settings.", grund: "anbieter-lehnt-ab", status: upstream.status })}\n\n`);
        res.write("data: [DONE]\n\n");
        return res.end();
      }

      for await (const delta of streamUpstreamDeltas(upstream)) {
        if (res.destroyed) return; // Client weg — Upstream bricht via AbortController ab
        const text = strom ? strom.weiter(delta) : delta;
        if (text) res.write(`data: ${JSON.stringify({ text })}\n\n`);
      }
      const rest = strom?.ende();
      if (rest && !res.destroyed) res.write(`data: ${JSON.stringify({ text: rest })}\n\n`);
      if (!res.destroyed) res.write("data: [DONE]\n\n");
      res.end();
    } catch (error: unknown) {
      // Aufgabe #92: die Ausnahme bleibt im Protokoll; der Client bekommt Satz und Kennung.
      console.error("kepta: chat stream failed", error);
      if (!res.destroyed) {
        try {
          res.write(`data: ${JSON.stringify({ error: "The model service did not answer. The reason is in the server log, not in this answer.", grund: "anbieter-nicht-erreichbar" })}\n\n`);
          res.write("data: [DONE]\n\n");
          res.end();
        } catch { /* Socket bereits zu */ }
      }
    }
  });

  // Nicht-Streaming-Fallback
  app.post("/api/chat", ctx.limiter.chat, async (req, res) => {
    const body = bodyOf<ChatRequest>(req);
    const fehler = chatFehler(body);
    if (fehler) return res.status(fehler === "System prompt too large" ? 413 : 400).json({ error: fehler });
    const cloudFehler = cloudVerboten(body);
    if (cloudFehler) return res.status(403).json({ error: cloudFehler });
    const sperre = anbieterSperre(body);
    if (sperre) return res.status(sperre.status).json({ error: sperre.error, grund: sperre.grund });

    const controller = new AbortController();
    // Client-Disconnect bricht auch den blockierenden Upstream-Call ab
    req.on("close", () => controller.abort());
    try {
      const schutz = chatSchutz(body);
      const text = await readFullAnswer(schutz.body, controller.signal);
      res.json({ text: schutz.schild ? schutz.schild.entschirme(text) : text, ...(schutz.hinweis ? { shield: schutz.hinweis } : {}) });
    } catch (error: unknown) {
      if (res.destroyed) return;
      console.error("Chat API Error:", error);
      // Der Wortlaut der Ausnahme bleibt im Protokoll (Zeile 179). Nach aussen geht
      // ein fester Satz mit Kennung - derselbe Grund wie in server/app.ts:75-81, wo
      // eine 500 den internen Grund frueher beim Client zeigte.
      res.status(500).json({
        error: "K3PTA failed the answer; the server log keeps the reason.",
        grund: "chat-fehlgeschlagen",
      });
    }
  });

  // Verfügbare Modelle eines Anbieters abrufen.
  // Drei Antworten, drei Gründe. Die Zahl allein ist keine Auskunft, und ein
  // fehlender Anbieter ist kein Grund, api.openai.com zu ruehren: die Route
  // waehlt nichts, sie fragt die Einstellungen. Ein Anbieter, der nicht
  // antwortet, nennt Adresse und Ursache — damit die Flaeche einen Satz malen
  // kann statt "fetch failed".
  app.get("/api/models", (_req, res) => {
    res.setHeader("Allow", "POST");
    res.status(405).json({
      error: "Modelle abfragen braucht protocol, baseUrl und apiKey — diese Route antwortet nur auf POST",
      grund: "nur-post",
    });
  });

  app.post("/api/models", ctx.limiter.chat, async (req, res) => {
    const { protocol, baseUrl, apiKey } = bodyOf<{ protocol: string; baseUrl: string; apiKey: string }>(req);
    const cloudFehler = cloudVerboten({ protocol, baseUrl });
    if (cloudFehler) {
      return res.status(403).json({ error: cloudFehler, grund: "wolke-verboten" });
    }
    const sperre = anbieterSperre({ baseUrl, apiKey });
    if (sperre) {
      const error = sperre.grund === "kein-anbieter"
        ? "kein Modell-Anbieter gesetzt — die Route rueft keinen Anbieter, sie fragt die Einstellungen"
        : sperre.error;
      return res.status(sperre.status).json({ error, grund: sperre.grund });
    }
    const base = trimSlash(baseUrl || "");

    const headers: Record<string, string> = {};
    if (apiKey && protocol !== "anthropic") headers["Authorization"] = `Bearer ${apiKey}`;
    if (protocol === "anthropic") {
      headers["x-api-key"] = apiKey || "";
      headers["anthropic-version"] = "2023-06-01";
    }
    const url = protocol === "anthropic" ? `${base}/v1/models` : `${base}/models`;
    let r: Response;
    try {
      r = await fetch(url, { headers, signal: AbortSignal.timeout(15_000) });
    } catch (fehler: unknown) {
      const code = (fehler as { cause?: { code?: string }; name?: string })?.cause?.code
        || ((fehler as { name?: string })?.name === "TimeoutError" ? "ETIMEDOUT" : "unbekannt");
      return res.status(502).json({
        error: `der Anbieter antwortet nicht auf ${url} (${code})`,
        grund: "anbieter-nicht-erreichbar",
        url,
        hinweis: code,
      });
    }
    try {
      const data = await r.json() as { error?: { message?: string }; data?: unknown[]; models?: unknown[] };
      if (!r.ok) {
        // Die Abweisung des Anbieters bleibt eine 500, weil genau die Zahl gelieferte
        // Erwartung ist (tests/server.test.ts:883). Beugen hiesse still entfernen;
        // neu ist allein der Grund daneben.
        return res.status(500).json({
          error: data?.error?.message || `der Anbieter lehnt ab (${r.status})`,
          grund: "anbieter-lehnt-ab",
          status: r.status,
        });
      }
      let models = ((data?.data || data?.models || []) as unknown[])
        .map((m: unknown) => (m as { id?: string; name?: string }).id || (m as { name?: string }).name)
        .filter(Boolean) as string[];

      // Ollama: Modelle zusätzlich über die native API laden
      if (base.includes(":11434")) {
        try {
          // Der Hafen ist die Adresse, die der Nutzer gewaehlt hat und die gerade
          // /v1/models geantwortet hat — nicht die aus der Umgebung. Vor dem 3.11. stand
          // hier ein dritter Loeser (KEPTA_OLLAMA_URL || OLLAMA_HOST || localhost), der an
          // der settings-Adresse vorbeiging: eine Ollama auf einem andern Rechner wurde in
          // der Liste ignoriert, und die Liste kam vom localhost.
          const hafen = base.replace(/\/v1\/?$/, "").replace(/\/+$/, "");
          const tags = await fetch(`${hafen}/api/tags`, { signal: AbortSignal.timeout(5_000) });
          if (tags.ok) {
            const tagData = await tags.json() as { models?: { name?: string }[] };
            const ollamaModels = (tagData?.models || []).map((m) => m.name).filter(Boolean) as string[];
            models = Array.from(new Set([...models, ...ollamaModels]));
          }
        } catch { /* Ollama liefert /v1/models evtl. schon */ }
      }

      res.json({ models: models.sort() });
    } catch (error: unknown) {
      console.error("kepta: /api/models response parse failed:", error instanceof Error ? error.message : String(error));
      res.status(500).json({ error: "The model provider returned an unreadable response.", grund: "antwort-nicht-lesbar" });
    }
  });

  // POST /api/embed -> Ollama Proxy (lokaler Fallback, nie harter Fehler für Frontend)
  app.post("/api/embed", ctx.limiter.chat, async (req, res) => {
    const { input, inputs, prompt, model } = bodyOf<{
      input?: string | string[];
      inputs?: string[];
      prompt?: string;
      model?: string;
    }>(req);
    const rawInput = input ?? inputs ?? prompt;
    if (rawInput === undefined || (Array.isArray(rawInput) && rawInput.length === 0) || (typeof rawInput === "string" && !rawInput.trim())) {
      return res.status(400).json({ error: "The request carried no text, so there was nothing to embed." });
    }
    const texts: string[] = Array.isArray(rawInput) ? rawInput : [rawInput];
    // Ein Loeser fuer Adresse und Modell, damit die Tafel nicht einen Dienst meldet, den
    // der Einbett-Laeufer des Kerns nicht benutzt (Befund 3.11., Aufgabe #45): vorher las
    // diese Route ausschliesslich OLLAMA_HOST, waehrend src/core/embeddings.ts:8
    // KEPTA_OLLAMA_URL liest.
    const modelName = model || aktivesSuchModell(store);
    const base = ollamaBaseUrl();

    try {
      // Neuer Ollama Endpoint: /api/embed (batch-fähig)
      const r = await fetch(`${base}/api/embed`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: modelName, input: texts }),
      });
      if (r.ok) {
        const data = await r.json() as { embeddings?: unknown; embedding?: unknown };
        if (Array.isArray(data.embeddings)) {
          return res.json({ embeddings: data.embeddings, model: modelName });
        }
        if (Array.isArray(data.embedding)) {
          return res.json({ embeddings: [data.embedding], model: modelName });
        }
      }
      // Fallback: /api/embeddings sequentiell (ältere Ollama-Versionen)
      const embeddings: number[][] = [];
      for (const t of texts) {
        const rr = await fetch(`${base}/api/embeddings`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ model: modelName, prompt: t }),
        });
        if (!rr.ok) {
          const errText = await rr.text().catch(() => "");
          throw new Error(errText || `Ollama error ${rr.status}`);
        }
        const jd = await rr.json() as { embedding?: unknown };
        if (Array.isArray(jd.embedding)) embeddings.push(jd.embedding);
        else throw new Error("Invalid embedding response");
      }
      return res.json({ embeddings, model: modelName });
    } catch (e) {
      // Ollama nicht erreichbar -> dem Frontend signalisieren, damit es auf TF-IDF zurückfällt
      const msg = e instanceof Error ? e.message : "Ollama is unreachable";
      return res.status(502).json({ error: msg || "Ollama is unreachable", embeddings: null });
    }
  });
}
