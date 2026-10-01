// Suche: GET /api/memories/search (dokumentiert) und POST /api/search (altes
// Response-Shape für das Frontend) — beide über die Core-Engine, ein Pfad für
// UI, HTTP-API und MCP.
import express from "express";
import { searchMemories as engineSearch, MAX_SEARCH_LIMIT } from "../../src/core/engine";
import { sanitizeText, sanitizeTags } from "../../src/core/sanitize";
import { toApi } from "../helfer/api-form";
import { bodyOf } from "../helfer/body";
import type { AppKontext } from "../kontext";

export function mountSearch(app: express.Express, ctx: AppKontext): void {
  const { store } = ctx;

  // Dokumentierte Suche: GET /api/memories/search?q=...&limit=...&tags=tag1,tag2
  app.get("/api/memories/search", async (req, res) => {
    const rawQ = typeof req.query.q === "string" ? req.query.q : typeof req.query.query === "string" ? req.query.query : "";
    const q = sanitizeText(rawQ, 200);
    const limitRaw = req.query.limit ? parseInt(String(req.query.limit), 10) : 20;
    const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 500) : 20;
    const tagsRaw = typeof req.query.tags === "string" ? req.query.tags : "";
    const tags = tagsRaw ? sanitizeTags(tagsRaw.split(",").map(s => s.trim()).filter(Boolean)) : [];
    const result = await engineSearch(store, { query: q, limit, tags: tags.length > 0 ? tags : undefined });
    res.json({
      query: q,
      count: result.hits.length,
      total: result.total,
      memories: result.hits.map(h => toApi(h.memory)),
    });
  });

  // POST /api/search -> Retrieval-Engine (BM25 + Vektoren + Graph → RRF)
  app.post("/api/search", ctx.limiter.chat, async (req, res) => {
    const { query, topK = 5, tags, type, scope, asOf } = bodyOf<{
      query?: string;
      topK?: number;
      tags?: string[];
      type?: string;
      scope?: string;
      asOf?: number;
    }>(req);
    // "Alles zu diesem Thema" muss auch alles bedeuten duerfen.
    const limit = Math.min(Math.max(Number(topK) || 5, 1), MAX_SEARCH_LIMIT);
    const result = await engineSearch(store, {
      query: sanitizeText(query ?? "", 500),
      limit,
      tags: Array.isArray(tags) && tags.length > 0 ? sanitizeTags(tags) : undefined,
      type: type === "semantic" || type === "episodic" || type === "procedural" || type === "reference" ? type : undefined,
      scope: typeof scope === "string" && scope ? scope : undefined,
      asOf: typeof asOf === "number" && Number.isFinite(asOf) ? asOf : undefined,
    });
    ctx.publishActivity({ type: "search", source: "app", title: result.query }, { throttleSearchMs: 2500 });
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
      query: result.query,
      hasMatch: result.hits.length > 0,
      usedVectors: result.usedVectors,
    });
  });
}
