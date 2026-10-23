// Chat-Proxy (Streaming + blockierend) und Modelle-Liste.
// Der Chat läuft als SSE-Proxy zum gewählten Provider; der Client-Abbruch
// bricht den Upstream-Request ab (kein weiterlaufender Token-Stream).
import express from "express";
import { trimSlash, chatFehler, starteUpstreamStream, streamUpstreamDeltas, readFullAnswer, type ChatRequest } from "../helfer/upstream";
import { Schild, beschreibe, istLokaleAdresse, ohnePrivateBloecke } from "../../src/lib/schild";
import { liesVerwaltet, richtlinie, istLokalerHost } from "../../src/lib/richtlinien";
import { schreibe as protokolliere } from "../../src/lib/pruefprotokoll";
import { schildEinstellungen, privateIds } from "./schild";
import { bodyOf } from "../helfer/body";
import type { AppKontext } from "../kontext";

export function mountChat(app: express.Express, ctx: AppKontext): void {
  const { store } = ctx;

  /**
   * Zentrale Richtlinie chat_cloud=deny: nur lokale Modelle (Ollama & Co.).
   * Die Organisation verbietet den Weg nach draußen — der Zielhost zählt,
   * nicht die Einstellungen des Nutzers. Gilt für BEIDE Chat-Routen (blockierend
   * UND Stream — 26.9.-Audit: der Stream war die Umgehungslücke).
   */
  function cloudVerboten(body: ChatRequest): string | null {
    if (richtlinie("chat_cloud") !== "deny") return null;
    const ziel = body.baseUrl || (body.protocol === "anthropic" ? "https://api.anthropic.com" : "https://api.openai.com/v1");
    return istLokalerHost(ziel)
      ? null
      : "Cloud models are disabled by your organization's policy. Local models (e.g. Ollama) remain available.";
  }
  /**
   * Die Wand von #61, vor jedem Aufbruch: keine Route ruft eine Adresse, die
   * niemand gewaehlt hat, und keine Adresse ausserhalb dieses Rechners ohne
   * Schluessel. Beides war vorher moeglich — `body.baseUrl || "https://api.openai.com/v1"`
   * (server/helfer/upstream.ts:68) und, am Werksstandard, `apiKey: ''`
   * (src/lib/ai.ts:351) mit weitergegebenem Grund (src/components/Settings.tsx:308).
   * Zurueckkommt ein Grund, den die Flaeche malen kann — 400, kein Socket.
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
        let message = `API error (${upstream.status})`;
        try { message = JSON.parse(errText)?.error?.message || message; } catch { /* keine JSON-Fehlermeldung vom Provider */ }
        res.write(`data: ${JSON.stringify({ error: message })}\n\n`);
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
      const msg = error instanceof Error ? error.message : "Verbindungsfehler";
      if (!res.destroyed) {
        try {
          res.write(`data: ${JSON.stringify({ error: msg })}\n\n`);
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
        error: "The answer failed inside K3PTA. The reason is in the server log, not in this answer.",
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
    const base = trimSlash(baseUrl || "");
    if (!base) {
      return res.status(400).json({
        error: "kein Modell-Anbieter gesetzt — die Route rueft keinen Anbieter, sie fragt die Einstellungen",
        grund: "kein-anbieter",
      });
    }
    if (!istLokaleAdresse(base) && !(apiKey || "").trim()) {
      return res.status(400).json({
        error: `der Anbieter ${base} braucht einen Schluessel — ohne ihn geht kein Paket aus dem Rechner`,
        grund: "kein-schluessel",
      });
    }

    const headers: Record<string, string> = {};
    if (apiKey && protocol !== "anthropic") headers["Authorization"] = `Bearer ${apiKey}`;
    if (protocol === "anthropic") {
      headers["x-api-key"] = apiKey || "";
      headers["anthropic-version"] = "2023-06-01";
    }
    const url = protocol === "anthropic" ? `${base}/v1/models` : `${base}/models`;
    let r: Response;
    try {
      r = await fetch(url, { headers });
    } catch (fehler: unknown) {
      const code = (fehler as { cause?: { code?: string } })?.cause?.code || "unbekannt";
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
          const tags = await fetch(`${(process.env.KEPTA_OLLAMA_URL || process.env.OLLAMA_HOST || "http://localhost:11434").replace(/\/+$/, "")}/api/tags`);
          if (tags.ok) {
            const tagData = await tags.json() as { models?: { name?: string }[] };
            const ollamaModels = (tagData?.models || []).map((m) => m.name).filter(Boolean) as string[];
            models = Array.from(new Set([...models, ...ollamaModels]));
          }
        } catch { /* Ollama liefert /v1/models evtl. schon */ }
      }

      res.json({ models: models.sort() });
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : "Interner Serverfehler";
      res.status(500).json({ error: msg, grund: "antwort-nicht-lesbar" });
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
      return res.status(400).json({ error: "No input given for embedding" });
    }
    const texts: string[] = Array.isArray(rawInput) ? rawInput : [rawInput];
    const modelName = model || process.env.OLLAMA_EMBED_MODEL || "nomic-embed-text";
    const base = trimSlash(process.env.OLLAMA_HOST || "http://localhost:11434");

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
