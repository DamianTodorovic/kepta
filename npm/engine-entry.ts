/**
 * Bibliothekseinstieg des npm-Pakets: exportiert die Engine, OHNE den
 * MCP-Server zu starten (der bin-Einstieg kep ta.js macht das — dieser Entry
 * hier macht nichts außer zu exportieren). KEPTA Enterprise bindet die
 * Engine über genau diese Fläche an — der Vertragstest dort erzwingt es.
 */
export { KeptaStore } from "../src/core/store.js";
export { searchMemories, consolidateMemories, indexMemory, MAX_SEARCH_LIMIT } from "../src/core/engine.js";
export { saveWithIndex, TOOLS } from "../src/core/mcp.js";
export { DEFAULT_EMBED_MODEL, cosineSimilarity } from "../src/core/embeddings.js";
export { APP_VERSION } from "../src/core/version.js";
