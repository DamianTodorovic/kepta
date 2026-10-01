// URL-Clipper: holt URL und extrahiert Titel + reinen Text.
// Jeder Redirect-Hop wird erneut voll geprüft (Protokoll, Credentials,
// IP-Literal, DNS) — die SSRF-Kette lebt in server/helfer/ssrf.ts.
import express from "express";
import { parseSafeUrl, assertPublicDnsHost, ClipClientError } from "../helfer/ssrf";
import { sanitizeTitle, sanitizeHtmlText } from "../../src/core/sanitize";
import { bodyOf } from "../helfer/body";
import type { AppKontext } from "../kontext";

export function mountClip(app: express.Express, ctx: AppKontext): void {
  app.post("/api/clip", ctx.limiter.clip, async (req, res) => {
    const { url } = bodyOf<{ url?: string }>(req);
    if (!url || typeof url !== "string" || url.length > 2048) {
      return res.status(400).json({ error: "URL missing or too long" });
    }
    const safe = parseSafeUrl(url);
    if (!safe.ok) return res.status(400).json({ error: safe.reason });
    try {
      // Redirects MANUELL folgen: jeder Hop wird erneut voll geprüft
      // (Protokoll, Credentials, IP-Literal, DNS) — max. 5 Hops.
      const MAX_REDIRECTS = 5;
      let current = safe.url!;
      let response: Response | null = null;
      for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
        await assertPublicDnsHost(current);
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 10000);
        try {
          response = await fetch(current.toString(), {
            headers: {
              "User-Agent": "KEPTA-Clipper/1.0 (+https://kepta.local)",
              Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            },
            signal: controller.signal,
            redirect: "manual",
          });
        } finally {
          clearTimeout(timeout); // auch bei Fehlern/Abort aufräumen
        }
        if ([301, 302, 303, 307, 308].includes(response.status)) {
          if (hop === MAX_REDIRECTS) return res.status(508).json({ error: "Too many redirects (max 5)" });
          const loc = response.headers.get("location");
          if (!loc) return res.status(502).json({ error: "Redirect without a target" });
          const next = parseSafeUrl(new URL(loc, current).toString());
          if (!next.ok) return res.status(400).json({ error: next.reason });
          current = next.url!;
          continue;
        }
        break;
      }
      if (!response) return res.status(502).json({ error: "Fetch failed" });
      if (!response.ok) return res.status(502).json({ error: `Fetch failed (${response.status})` });
      const rawHtml = await response.text();
      if (rawHtml.length > 600000) return res.status(413).json({ error: "Page too large (max 600k)" });
      const html = rawHtml;

      const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
      const rawTitle = titleMatch ? titleMatch[1]!.trim() : current.hostname;

      let text = html
        .replace(/<script[\s\S]*?<\/script>/gi, " ")
        .replace(/<style[\s\S]*?<\/style>/gi, " ")
        .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
        .replace(/<head[\s\S]*?<\/head>/gi, " ")
        .replace(/<!--[\s\S]*?-->/g, " ")
        .replace(/<\/(p|div|h[1-6]|li|tr|br|section|article|header|footer)[^>]*>/gi, "\n")
        .replace(/<[^>]+>/g, " ");

      const entities: Record<string, string> = {
        "&amp;": "&",
        "&lt;": "<",
        "&gt;": ">",
        "&quot;": '"',
        "&#39;": "'",
        "&apos;": "'",
        "&nbsp;": " ",
        "&copy;": "©",
        "&reg;": "®",
        "&hellip;": "…",
        "&mdash;": "—",
        "&ndash;": "–",
      };
      text = text.replace(/&[a-zA-Z0-9#]+;/g, (m) => {
        if (entities[m]) return entities[m]!;
        const num = m.match(/^&#(\d+);$/);
        if (num) return String.fromCharCode(parseInt(num[1]!, 10));
        const hex = m.match(/^&#x([0-9a-fA-F]+);$/);
        if (hex) return String.fromCharCode(parseInt(hex[1]!, 16));
        return m;
      });

      text = text
        .replace(/\r/g, "")
        .split("\n")
        .map((l: string) => l.replace(/\s+/g, " ").trim())
        .filter(Boolean)
        .join("\n\n")
        .replace(/\n{3,}/g, "\n\n")
        .trim()
        .slice(0, 50000);

      const title = sanitizeTitle(rawTitle.replace(/\s+/g, " ").replace(/&[a-zA-Z0-9#]+;/g, (m) => entities[m] || m).trim().slice(0, 300)) || sanitizeTitle(current.hostname).slice(0,80) || "Import";
      if (!text) return res.status(422).json({ error: "No extractable text" });
      const safeTitle = sanitizeTitle(title);
      // Roh-HTML-Ingest: zusätzlich Event-Handler-/javascript:-Reste entfernen
      const safeText = sanitizeHtmlText(text, 50000);
      res.json({ title: safeTitle, content: safeText, url: current.toString() });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("abort")) return res.status(504).json({ error: "Timed out while loading the URL" });
      // SSRF-Blockaden und DNS-Fehlschlaege sind Client-Fehler (400), keine 500
      if (err instanceof ClipClientError) return res.status(400).json({ error: msg });
      res.status(500).json({ error: msg || "Clip failed" });
    }
  });
}
