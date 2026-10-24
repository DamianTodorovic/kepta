// Suche: GET /api/memories/search (dokumentiert) und POST /api/search (altes
// Response-Shape für das Frontend) — beide über die Core-Engine, ein Pfad für
// UI, HTTP-API und MCP.
import express from "express";
import { searchMemories as engineSearch, MAX_SEARCH_LIMIT } from "../../src/core/engine";
import { SUCH_KAPPE } from "../helfer/limiter";
import { sanitizeText, sanitizeTags } from "../../src/core/sanitize";
import { toApi } from "../helfer/api-form";
import { bodyOf } from "../helfer/body";
import type { AppKontext } from "../kontext";

export function mountSearch(app: express.Express, ctx: AppKontext): void {
  const { store } = ctx;

  // Dokumentierte Suche: GET /api/memories/search?q=...&limit=...&offset=...&tags=tag1,tag2
  // Zelle #95 (24.10.): die Route seitet wie die Liste - offset, begrenzt, hinweis. Und sie haengt
  // nicht mehr am Chat-Limiter (Zelle #99): die Suche ist lesend und hat ihre eigne, groessere Kante,
  // die als X-Kepta-Suche-Kappe im Kopf jeder Antwort steht.
  app.get("/api/memories/search", ctx.limiter.suche, async (req, res) => {
    const rawQ = typeof req.query.q === "string" ? req.query.q : typeof req.query.query === "string" ? req.query.query : "";
    const q = sanitizeText(rawQ, 200);
    const limitRaw = req.query.limit ? parseInt(String(req.query.limit), 10) : 20;
    const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 500) : 20;
    const offsetRaw = req.query.offset ? parseInt(String(req.query.offset), 10) : 0;
    const offset = Number.isFinite(offsetRaw) ? Math.max(offsetRaw, 0) : 0;
    const tagsRaw = typeof req.query.tags === "string" ? req.query.tags : "";
    const tags = tagsRaw ? sanitizeTags(tagsRaw.split(",").map(s => s.trim()).filter(Boolean)) : [];
    const result = await engineSearch(store, { query: q, limit, offset, tags: tags.length > 0 ? tags : undefined });
    const begrenzt = offset + result.hits.length < result.total;
    const rest = result.total - offset - result.hits.length;
    const hinweis = result.total === 0
      ? "The query has no matches."
      : result.hits.length === 0
        ? `No matches at offset ${offset} - the last match is before this page (${result.total} in total).`
        : `This page holds ${result.hits.length} of ${result.total} matches${begrenzt ? `; ${rest} more follow at offset ${offset + result.hits.length}` : " - the whole result fits in this page"} (limit=<1..500>, offset= for the next page).`;
    res.setHeader("X-Kepta-Suche-Kappe", `${SUCH_KAPPE};w=60`);
    res.json({
      query: q,
      count: result.hits.length,
      total: result.total,
      limit,
      offset,
      begrenzt,
      hinweis,
      memories: result.hits.map(h => toApi(h.memory)),
    });
  });

  // POST /api/search -> Retrieval-Engine (BM25 + Vektoren + Graph → RRF)
  // Zelle #99: die Suche haengt nicht mehr an der Chat-Kante (20/min, gemessen 24.10. 13:41 an
  // limiter.ts:52). Sie hat ihre eigne, groessere Kante; die Zahl steht im Kopf der Antwort.
  app.post("/api/search", ctx.limiter.suche, async (req, res) => {
    const { query, topK = 5, offset: rohOffset, tags, type, scope, asOf, tracks } = bodyOf<{
      query?: string;
      topK?: number;
      offset?: number;
      tags?: string[];
      type?: string;
      scope?: string;
      asOf?: number;
      tracks?: { bm25?: boolean; vector?: boolean; entity?: boolean };
    }>(req);
    // "Alles zu diesem Thema" muss auch alles bedeuten duerfen.
    const limit = Math.min(Math.max(Number(topK) || 5, 1), MAX_SEARCH_LIMIT);
    const offset = Number.isFinite(Number(rohOffset)) ? Math.max(Math.floor(Number(rohOffset)), 0) : 0;
    // Die Spuren-Schalter der App (Paket 2, UI-Parität) kommen hier durch —
    // ohne Angabe laufen alle drei Beine (Engine-Verhalten unverändert).
    const beine = tracks && typeof tracks === "object"
      ? {
          bm25: tracks.bm25 !== false,
          vector: tracks.vector !== false,
          entity: tracks.entity !== false,
        }
      : undefined;
    const result = await engineSearch(store, {
      query: sanitizeText(query ?? "", 500),
      limit,
      offset,
      tags: Array.isArray(tags) && tags.length > 0 ? sanitizeTags(tags) : undefined,
      type: type === "semantic" || type === "episodic" || type === "procedural" || type === "reference" ? type : undefined,
      scope: typeof scope === "string" && scope ? scope : undefined,
      asOf: typeof asOf === "number" && Number.isFinite(asOf) ? asOf : undefined,
      tracks: beine,
    });
    ctx.publishActivity({ type: "search", source: "app", title: result.query }, { throttleSearchMs: 2500 });
    res.setHeader("X-Kepta-Suche-Kappe", `${SUCH_KAPPE};w=60`);
    // Altes Response-Shape für das Frontend (cosineScore/bm25Score sind die Einzelbeine).
    // Neu (Paket 2): je Treffer die Spuren-Herkunft — welcher Retrieval-Strang
    // (BM25/Vektor/Graph) den Treffer wo im Ranking sah. Die Ränge kommen aus
    // SearchHit.components; null heißt „dieses Bein hat den Treffer nicht gesehen“.
    return res.json({
      results: result.hits.map(h => ({
        memory: toApi(h.memory),
        score: h.score,
        cosineScore: h.components.vectorSimilarity ?? 0,
        bm25Score: h.components.bm25Rank !== null ? 1 / (h.components.bm25Rank + 1) : 0,
        rawBm25: 0,
        matchedTerms: h.matchedTerms,
        expired: h.expired,
        superseded: h.superseded,
        tracks: {
          bm25: h.components.bm25Rank,
          vektor: h.components.vectorRank,
          graph: h.components.entityRank,
          similarity: h.components.vectorSimilarity,
        },
      })),
      total: result.total,
      offset,
      begrenzt: offset + result.hits.length < result.total,
      query: result.query,
      hasMatch: result.hits.length > 0,
      usedVectors: result.usedVectors,
    });
  });
}
