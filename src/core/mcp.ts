// KEPTA MCP — Protokoll-Handling (stdio + Streamable HTTP teilen sich diese Logik).
// Unterstützt: 2026-07-28 (stateless core, server/discover) sowie Legacy-Clients
// (2025-06-18, 2024-11-05). Alle Tools liefern structuredContent mit outputSchema.
import type { KeptaStore } from "./store";
import type { MemoryType, SearchParams } from "./types";
import { searchMemories, indexMemory, consolidateMemories, findDuplicateForNew, gateDecision, writeGateEnabled } from "./engine";
import { chunkText } from "./embeddings";
import { APP_VERSION } from "./version";

export const PROTOCOL_VERSIONS = ["2026-07-28", "2025-06-18", "2024-11-05"] as const;
export const LATEST_PROTOCOL_VERSION = "2026-07-28";
export const SERVER_INFO = { name: "kepta", title: "KEPTA — Agent Memory", version: APP_VERSION };

export interface JsonRpcRequest {
  jsonrpc?: string;
  id?: string | number | null;
  method?: string;
  params?: Record<string, unknown>;
  _meta?: { protocolVersion?: string };
}

interface JsonRpcResult {
  jsonrpc: "2.0";
  id: string | number | null;
  result: Record<string, unknown>;
}
interface JsonRpcError {
  jsonrpc: "2.0";
  id: string | number | null;
  error: { code: number; message: string; data?: unknown };
}
export type JsonRpcResponse = JsonRpcResult | JsonRpcError;

// ---------- Schema-Helfer ----------

const stringSchema = (description: string) => ({ type: "string", description });
const opt = (s: unknown) => s as { type: string; description?: string };

const memoryOutSchema = {
  type: "object",
  properties: {
    id: { type: "string" },
    title: { type: "string" },
    content: { type: "string" },
    tags: { type: "array", items: { type: "string" } },
    type: { type: "string", enum: ["semantic", "episodic", "procedural", "reference"] },
    scope: { type: "string" },
    confidence: { type: "number" },
    validFrom: { type: ["integer", "null"] },
    validTo: { type: ["integer", "null"] },
    supersededBy: { type: ["string", "null"] },
    createdAt: { type: "integer" },
    updatedAt: { type: "integer" },
  },
  required: ["id", "title", "content"],
} as const;

const searchOutSchema = {
  type: "object",
  properties: {
    query: { type: "string" },
    count: { type: "integer" },
    usedVectors: { type: "boolean" },
    hits: {
      type: "array",
      items: {
        type: "object",
        properties: {
          ...memoryOutSchema.properties,
          score: { type: "number" },
          expired: { type: "boolean" },
          superseded: { type: "boolean" },
          matchedTerms: { type: "array", items: { type: "string" } },
        },
        required: ["id", "title", "score"],
      },
    },
  },
  required: ["query", "count", "hits"],
} as const;

// ---------- 8 Tools (deterministische Reihenfolge) ----------

export const TOOLS = [
  {
    name: "memory_search",
    title: "Search memory",
    description:
      "Hybrid retrieval (BM25 + vectors + knowledge graph) over KEPTA memory. Expired and superseded memories are flagged as such; memories the owner marked private never appear here.",
    inputSchema: {
      type: "object",
      properties: {
        query: opt(stringSchema("Search query, in natural language")),
        limit: opt({ type: "integer", description: "Max hits (1-100, default 10)", default: 10 }),
        tags: opt({ type: "array", items: { type: "string" }, description: "Tag filter (AND)" }),
        type: opt({ type: "string", enum: ["semantic", "episodic", "procedural", "reference"] }),
        scope: opt(stringSchema("Scope filter, e.g. agent:coder or session:abc")),
      },
      required: ["query"],
    },
    outputSchema: searchOutSchema,
  },
  {
    name: "memory_save",
    title: "Save memory",
    description:
      "Saves a knowledge node, or updates one when id is given. [[Wiki links]] in the text become linked entities.",
    inputSchema: {
      type: "object",
      properties: {
        id: opt(stringSchema("Existing id, to update instead of create")),
        title: opt(stringSchema("Title")),
        content: opt(stringSchema("Content")),
        tags: opt({ type: "array", items: { type: "string" } }),
        type: opt({ type: "string", enum: ["semantic", "episodic", "procedural", "reference"], description: "semantic=fact, episodic=event, procedural=how-to, reference=imported document" }),
        scope: opt(stringSchema('Scope, default "local". "private" keeps the memory out of every agent channel — search, list, graph, consolidate, id lookups — while the owner still sees it in the app.')),
        confidence: opt({ type: "number", description: "0..1" }),
        validFrom: opt({ type: "integer", description: "epoch milliseconds" }),
        validTo: opt({ type: "integer", description: "epoch milliseconds" }),
      },
      required: ["title", "content"],
    },
    outputSchema: {
      type: "object",
      properties: {
        created: { type: "boolean" },
        memory: { ...memoryOutSchema, type: ["object", "null"] }, // rejected → null
        duplicateWarning: { type: ["object", "null"], properties: { existingId: { type: "string" }, similarity: { type: "number" } } },
        gateOutcome: { enum: ["created", "updated", "rejected", null] },
        writeGate: {
          type: ["object", "null"],
          properties: {
            decision: { type: "string", enum: ["ADD", "UPDATE", "DELETE", "NOOP"] },
            reason: { type: "string" },
            targetId: { type: "string" },
          },
        },
      },
      required: ["created", "memory"],
    },
  },
  {
    name: "memory_update",
    title: "Update memory",
    description: "Updates fields of an existing memory (patch).",
    inputSchema: {
      type: "object",
      properties: {
        id: opt(stringSchema("Id of the memory")),
        title: opt({ type: "string" }),
        content: opt({ type: "string" }),
        tags: opt({ type: "array", items: { type: "string" } }),
        type: opt({ type: "string", enum: ["semantic", "episodic", "procedural", "reference"] }),
        confidence: opt({ type: "number" }),
        validFrom: opt({ type: ["integer", "null"] }),
        validTo: opt({ type: ["integer", "null"] }),
      },
      required: ["id"],
    },
    outputSchema: { type: "object", properties: { updated: { type: "boolean" }, memory: memoryOutSchema }, required: ["updated"] },
  },
  {
    name: "memory_delete",
    title: "Delete memory",
    description: "Moves a memory to the trash (default), or deletes it for good (permanent).",
    inputSchema: {
      type: "object",
      properties: {
        id: opt(stringSchema("Id of the memory")),
        permanent: opt({ type: "boolean", description: "true = delete permanently", default: false }),
      },
      required: ["id"],
    },
    outputSchema: { type: "object", properties: { trashed: { type: "boolean" }, purged: { type: "boolean" } }, required: [] },
  },
  {
    name: "memory_list",
    title: "List memories",
    description: "Lists memories, paginated and filterable. Private ones are never listed, not even when scope is asked for explicitly.",
    inputSchema: {
      type: "object",
      properties: {
        limit: opt({ type: "integer", default: 20, description: "1-200" }),
        offset: opt({ type: "integer", default: 0 }),
        type: opt({ type: "string", enum: ["semantic", "episodic", "procedural", "reference"] }),
        tag: opt({ type: "string" }),
        scope: opt({ type: "string" }),
        trash: opt({ type: "boolean", description: "Trash instead of active memories", default: false }),
      },
    },
    outputSchema: {
      type: "object",
      properties: { count: { type: "integer" }, total: { type: "integer" }, memories: { type: "array", items: memoryOutSchema } },
      required: ["count", "memories"],
    },
  },
  {
    name: "memory_graph",
    title: "Knowledge graph",
    description: "Entities and relations around one entity, or the whole graph, capped.",
    inputSchema: {
      type: "object",
      properties: {
        entity: opt(stringSchema("Entity name (optional)")),
        depth: opt({ type: "integer", description: "Graph depth 1-4, default 2" }),
      },
    },
    outputSchema: {
      type: "object",
      properties: {
        entities: { type: "array", items: { type: "object", properties: { name: { type: "string" } }, required: ["name"] } },
        relations: {
          type: "array",
          items: {
            type: "object",
            properties: { source: { type: "string" }, target: { type: "string" }, relation: { type: "string" } },
            required: ["source", "target", "relation"],
          },
        },
      },
      required: ["entities", "relations"],
    },
  },
  {
    name: "memory_consolidate",
    title: "Consolidate memory",
    description: "Finds duplicates and contradictions by embedding similarity; without dryRun it marks the older copy as superseded.",
    inputSchema: {
      type: "object",
      properties: {
        dryRun: opt({ type: "boolean", description: "true = suggestions only (default)", default: true }),
        threshold: opt({ type: "number", description: "Similarity threshold 0..1, default 0.92" }),
      },
    },
    outputSchema: {
      type: "object",
      properties: {
        dryRun: { type: "boolean" },
        applied: { type: "integer" },
        candidates: {
          type: "array",
          items: {
            type: "object",
            properties: {
              keepId: { type: "string" },
              duplicateId: { type: "string" },
              similarity: { type: "number" },
              reason: { type: "string" },
            },
            required: ["keepId", "duplicateId", "similarity"],
          },
        },
      },
      required: ["dryRun", "candidates"],
    },
  },
  {
    name: "memory_forget",
    title: "Forget",
    description:
      "Temporal invalidation: expire sets valid_to to now, supersede marks the memory as replaced by supersedeBy, delete moves it to the trash.",
    inputSchema: {
      type: "object",
      properties: {
        id: opt(stringSchema("Id of the memory")),
        mode: opt({ type: "string", enum: ["expire", "supersede", "delete"], description: "default: expire" }),
        validTo: opt({ type: "integer", description: "mode=expire only, defaults to now" }),
        supersedeBy: opt(stringSchema("mode=supersede only: id of the successor memory")),
      },
      required: ["id"],
    },
    outputSchema: { type: "object", properties: { forgotten: { type: "boolean" }, mode: { type: "string" } }, required: ["forgotten"] },
  },
] as const;

// ---------- Wiki-Links → Entitäten ----------

const WIKI_LINK_RE = /\[\[([^[\]]{2,80})\]\]/g;

export function extractWikiLinks(text: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(WIKI_LINK_RE)) {
    const name = m[1]?.split("|")[0]?.trim().toLowerCase();
    if (name) out.push(name);
  }
  return [...new Set(out)];
}

// ---------- Tool-Ausführung ----------

/** Zahlen-Argument robust parsen: NaN/ungültige Strings → sauberer Default statt NaN-Propagation. */
function toInt(v: unknown, def: number, min: number, max: number): number {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return def;
  return Math.min(Math.max(Math.trunc(n), min), max);
}

function memoryToOut(store: KeptaStore, r: ReturnType<KeptaStore["getMemory"]>): Record<string, unknown> {
  if (!r) throw new Error("Memory not found");
  return {
    id: r.id,
    title: r.title,
    content: r.content,
    tags: r.tags,
    type: r.type,
    scope: r.scope,
    confidence: r.confidence,
    validFrom: r.validFrom,
    validTo: r.validTo,
    // Für Agenten gibt es nur offene Nachfolgerinnen, siehe zeigerFürAgenten().
    supersededBy: zeigerFürAgenten(store, r.supersededBy),
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  };
}

/** Legt eine Memory an/aktualisiert sie und indiziert Chunks + Wiki-Link-Entitäten. */
export function saveWithIndex(store: KeptaStore, args: Record<string, unknown>): { created: boolean; record: NonNullable<ReturnType<KeptaStore["getMemory"]>> } {
  const title = String(args.title ?? "");
  const content = String(args.content ?? "");
  if (!title.trim() || !content.trim()) throw new Error("title and content are required");
  const input = {
    id: args.id ? String(args.id) : undefined,
    title,
    content,
    tags: Array.isArray(args.tags) ? (args.tags as string[]) : [],
    type: args.type as MemoryType | undefined,
    scope: args.scope ? String(args.scope) : undefined,
    confidence: typeof args.confidence === "number" ? args.confidence : undefined,
    validFrom: typeof args.validFrom === "number" ? args.validFrom : undefined,
    validTo: typeof args.validTo === "number" ? args.validTo : undefined,
  };
  const { record, created } = store.upsertMemory(input);
  indexMemory(store, record.id);
  // Titel + Wiki-Links als Entitäten; Titel-Entität erhält mentions-Relationen zu den Links
  const links = extractWikiLinks(`${record.title} ${record.content}`);
  store.linkEntities(record.id, [record.title, ...links]);
  const titleEntity = record.title.trim().toLowerCase();
  for (const link of links) {
    if (link !== titleEntity) store.addRelation(titleEntity, link, "mentions", record.id);
  }
  return { created, record: store.getMemory(record.id)! };
}

/**
 * Privatheits-Floor: eine Notiz mit scope "private" verlässt KEPTA nie über den
 * **Agentenkanal** — also über die acht MCP-Werkzeuge (stdio), über `POST /mcp`
 * und über die vier HTTP-Spiegel `/api/mcp/search|save|consolidate|forget`, die laut
 * Changelog genau „MCP tool parity over HTTP" sind. Bis 3.1.2 galt der Floor nur
 * für memory_search und memory_list; Graph, Consolidate und die id-Wege lieferten
 * private Titel, IDs und Dupletten aus — das Versprechen war transportabhängig.
 *
 * Die **Besitzerkanäle** (`GET /api/memories`, `GET /api/memories/search`,
 * `POST /api/search`, `GET /api/graph`, Export und Geräte-Sync) filtern bewusst
 * nicht: dieselben Routen füttern die Desktop-App, in der der Besitzer seine
 * eigenen privaten Notizen sieht und durchsucht. Ein Filter in Store- oder
 * Engine-Schicht würde die App blind machen. „private" ist deshalb eine
 * Agenten-/Besitzer-Trennung, **kein** Zugriffsschutz gegen lokale Prozesse —
 * jeder Prozess auf diesem Rechner kann die Datenbank mit dem Systemschlüssel
 * öffnen. SECURITY.md hält das fest.
 */
export const PRIVATER_SCOPE = "private";

/** Trägt die scope-Regel auf eine beliebige Liste an (Treffer, Notizen, Kandidaten). */
export function ohnePrivate<T>(liste: T[], scopeVon: (m: T) => string | undefined): T[] {
  return liste.filter((m) => scopeVon(m) !== PRIVATER_SCOPE);
}

/**
 * Fehler für id-Wege auf eine private Notiz — oder null, wenn der Agent darf.
 * meldung ist wortgleich zu der, die das jeweilige Werkzeug für eine unbekannte id
 * selbst wirft: eine eigene "privat"-Meldung oder ein eigener Statuscode verriete
 * einem Agenten, der eine id anderweitig kennt, dass die Notiz existiert.
 * Die Listenwege (search/list/graph/consolidate) brauchen das nicht — sie nennen
 * private ids erst gar nicht.
 */
export function aussenVor(store: KeptaStore, id: string, meldung: string): Error | null {
  return store.istPrivat(id) ? new Error(meldung) : null;
}

/**
 * Der eine Zeiger, den eine offene Notiz auf eine private richten kann: supersededBy.
 * Die App consololidiert über den ganzen Bestand und darf eine offene Notiz auf eine
 * private Nachfolgerin zeigen lassen — für Agentenwege heißt der Nachfolger dann
 * nichtexistent. (`superseded: true` steht am Treffer, daran ändert sich nichts.)
 */
export function zeigerFürAgenten(store: KeptaStore, supersededBy: string | null): string | null {
  return supersededBy && store.istPrivat(supersededBy) ? null : supersededBy;
}

export async function callTool(store: KeptaStore, name: string, args: Record<string, unknown>): Promise<{ content: unknown[]; structuredContent: Record<string, unknown>; isError?: boolean }> {
  const audit = (action: Parameters<typeof store["audit"]>[0], target?: string) => store.audit(action, target);
  try {
    if (name === "memory_search") audit("search", String(args.query ?? ""));
    else if (name === "memory_save") audit("write", String(args.title ?? ""));
    else if (name === "memory_update") audit("update", String(args.id ?? ""));
    else if (name === "memory_delete" || name === "memory_forget") audit("delete", String(args.id ?? ""));
    else if (name === "memory_list" || name === "memory_graph") audit("read", name);
    switch (name) {
      case "memory_search": {
        if (!args.query || !String(args.query).trim()) throw new Error("a query is required");
        const params: SearchParams = {
          query: String(args.query ?? ""),
          // Nicht-numerisches limit → sauberer Default 10 statt NaN (NaN filtert alles weg)
          limit: toInt(args.limit, 10, 1, 100),
          tags: Array.isArray(args.tags) ? (args.tags as string[]) : undefined,
          type: (args.type as MemoryType | undefined) ?? undefined,
          scope: args.scope ? String(args.scope) : undefined,
          asOf: args.asOf !== undefined ? Number(args.asOf) : undefined,
        };
        const res = await searchMemories(store, params);
        const hits = ohnePrivate(res.hits, (h) => h.memory.scope);
        const structured = {
          query: res.query,
          count: hits.length,
          usedVectors: res.usedVectors,
          hits: hits.map((h) => ({
            ...memoryToOut(store, h.memory),
            score: h.score,
            expired: h.expired,
            superseded: h.superseded,
            matchedTerms: h.matchedTerms,
          })),
        };
        return { content: [{ type: "text", text: JSON.stringify(structured, null, 2) }], structuredContent: structured };
      }
      case "memory_save": {
        // F2: Write-Gate (Opt-in KEPTA_WRITE_GATE=on) — nur für NEUE Knoten;
        // ein explizites Update via id ist die Entscheidung des Agenten selbst —
        // außer über private Notizen: die sind für Agenten weder lesbar noch
        // überschreibbar, und ein Update würde den PRIVATEN Datensatz zurückgeben.
        if (args.id !== undefined) {
          // Bei save kann der Wortlaut nicht aufgehen: eine unbekannte id legt KEPTA
          // einfach an, eine private muss abgelehnt werden. Das ist das eine bleibende
          // Existenz-Oracle — inhaltlich bleibt die Notiz unangetastet.
          const verweigert = aussenVor(store, String(args.id), `Memory not found: ${String(args.id)}`);
          if (verweigert) throw verweigert;
        }
        // Das Gate läuft über findDuplicateForNew, und das ist private-blind: es kann
        // weder auf eine private Notiz zeigen noch deren Inhalt in seinen Begründungs-
        // text übernehmen. Deshalb hier keine Nachprüfung.
        const gate = args.id === undefined
          ? await gateDecision(store, String(args.title ?? ""), String(args.content ?? ""))
          : null;
        if (gate && gate.decision === "UPDATE" && gate.targetId) {
          // Als Update des bestehenden Knoten ausführen — upsert hält
          // Wiki-Links/Entities konsistent, created ist false.
          const viaGate = saveWithIndex(store, { ...args, id: gate.targetId });
          const structured = {
            created: viaGate.created,
            gateOutcome: "updated",
            memory: memoryToOut(store, viaGate.record),
            writeGate: gate,
          };
          return { content: [{ type: "text", text: JSON.stringify(structured, null, 2) }], structuredContent: structured };
        }
        if (gate && (gate.decision === "NOOP" || gate.decision === "DELETE")) {
          const structured = { created: false, gateOutcome: "rejected", memory: null, writeGate: gate };
          return { content: [{ type: "text", text: JSON.stringify(structured, null, 2) }], structuredContent: structured };
        }
        const { created, record } = saveWithIndex(store, args);
        const structured = {
          created,
          memory: memoryToOut(store, record),
          duplicateWarning: await findDuplicateForNew(store, String(args.title ?? ""), String(args.content ?? "")),
          ...(writeGateEnabled() ? { gateOutcome: "created", writeGate: gate } : {}),
        };
        return {
          content: [{ type: "text", text: JSON.stringify(structured, null, 2) }],
          structuredContent: structured,
        };
      }
      case "memory_update": {
        const id = String(args.id ?? "");
        const verweigert = aussenVor(store, id, `Memory not found: ${id}`);
        if (verweigert) throw verweigert;
        const patch: Record<string, unknown> = {};
        for (const k of ["title", "content", "tags", "type", "confidence", "validFrom", "validTo"] as const) {
          if (args[k] !== undefined) patch[k] = args[k];
        }
        const updated = store.updateMemory(id, patch);
        if (!updated) throw new Error(`Memory not found: ${id}`);
        if (patch.content !== undefined) indexMemory(store, id);
        const structured = { updated: true, memory: memoryToOut(store, store.getMemory(id)) };
        return { content: [{ type: "text", text: JSON.stringify(structured, null, 2) }], structuredContent: structured };
      }
      case "memory_delete": {
        const id = String(args.id ?? "");
        const permanent = args.permanent === true;
        // Wortlaut des Zweigs, den der Agent gerade ruft — derselbe wie bei einer
        // unbekannten id, sonst wäre die Antwort ein Existenznachweis.
        const verweigert = aussenVor(
          store,
          id,
          permanent ? `Memory not found: ${id}` : `Memory not found, or already deleted: ${id}`
        );
        if (verweigert) throw verweigert;
        if (permanent) {
          const purged = store.purgeMemory(id);
          if (!purged) throw new Error(`Memory not found: ${id}`);
          return { content: [{ type: "text", text: `Permanently deleted: ${id}` }], structuredContent: { purged: true, trashed: false } };
        }
        const trashed = store.trashMemory(id);
        if (!trashed) throw new Error(`Memory not found, or already deleted: ${id}`);
        return { content: [{ type: "text", text: `Moved to the trash: ${id}` }], structuredContent: { trashed: true, purged: false } };
      }
      case "memory_list": {
        const opts = {
          limit: toInt(args.limit, 20, 1, 200),
          offset: toInt(args.offset, 0, 0, Number.MAX_SAFE_INTEGER),
          type: (args.type as MemoryType | undefined) ?? undefined,
          // lower-case + LIKE-Escaping passiert im Store (tags LIKE mit ESCAPE-Klausel)
          tag: args.tag ? String(args.tag).toLowerCase() : undefined,
          scope: args.scope ? String(args.scope) : undefined,
          trash: args.trash === true,
        };
        // Privatheits-Floor: auch ein explizites scope:"private" liefert nichts zurück.
        const memories = ohnePrivate(store.listMemories(opts), (m) => m.scope);
        const total = store.countMemories();
        const structured = {
          count: memories.length,
          total: opts.trash ? total.trashed : total.active,
          memories: memories.map((m) => memoryToOut(store, m)),
        };
        return { content: [{ type: "text", text: JSON.stringify(structured, null, 2) }], structuredContent: structured };
      }
      case "memory_graph": {
        const entity = args.entity ? String(args.entity) : undefined;
        const depth = toInt(args.depth, 2, 1, 4);
        const g = store.getGraph(entity, depth);
        const nameById = new Map(g.entities.map((e) => [e.id, e.name]));
        // Privatheits-Floor: Entitäten sind abgeleitete Daten — ein Knoten fällt
        // erst, wenn ALLE seine Träger-Notizen privat sind. Nennt ihn zusätzlich eine
        // offene Notiz, gehört der Name der offenen Welt. Relationen gehen mit ihrer
        // privaten Träger-Notiz und mit jedem Knoten, den der Floor entfernt hat.
        const privaten = store.privateMemoryIds();
        const traeger = store.memoryIdsByEntity(g.entities.map((e) => e.id));
        const gehalten = new Set<number>();
        for (const e of g.entities) {
          const ids = traeger.get(e.id) ?? [];
          if (ids.length === 0 || ids.some((id) => !privaten.has(id))) gehalten.add(e.id);
        }
        const structured = {
          entities: g.entities.filter((e) => gehalten.has(e.id)).map((e) => ({ name: e.name })),
          relations: g.relations
            .filter((r) => !r.memoryId || !privaten.has(r.memoryId))
            .filter((r) => gehalten.has(r.sourceId) && gehalten.has(r.targetId))
            .map((r) => ({ source: nameById.get(r.sourceId)!, target: nameById.get(r.targetId)!, relation: r.relation })),
        };
        return { content: [{ type: "text", text: JSON.stringify(structured, null, 2) }], structuredContent: structured };
      }
      case "memory_consolidate": {
        const res = await consolidateMemories(store, {
          dryRun: args.dryRun !== false,
          threshold: typeof args.threshold === "number" ? args.threshold : undefined,
          // Private Dupletten zu melden hieße, dem Agenten zwei private ids und ihre
          // Ähnlichkeit zu nennen; anzuwenden würde zudem eine private Notiz als
          // ersetzt markieren und sie damit aus der Suche des Besitzers nehmen.
          ausnehmen: store.privateMemoryIds(),
        });
        const structured = {
          dryRun: res.dryRun,
          applied: res.applied,
          candidates: res.candidates.map((c) => ({ keepId: c.keepId, duplicateId: c.duplicateId, similarity: c.similarity, reason: c.reason })),
        };
        return { content: [{ type: "text", text: JSON.stringify(structured, null, 2) }], structuredContent: structured };
      }
      case "memory_forget": {
        const id = String(args.id ?? "");
        const mode = args.mode ? String(args.mode) : "expire";
        const verweigert = aussenVor(store, id, `Memory not found: ${id}`);
        if (verweigert) throw verweigert;
        if (!store.getMemory(id)) throw new Error(`Memory not found: ${id}`);
        if (mode === "expire") {
          store.updateMemory(id, { validTo: typeof args.validTo === "number" ? args.validTo : Date.now() });
          return { content: [{ type: "text", text: `Marked as expired: ${id}` }], structuredContent: { forgotten: true, mode } };
        }
        if (mode === "supersede") {
          const by = args.supersedeBy ? String(args.supersedeBy) : null;
          // Ein Zeiger auf eine private Notiz wandert mit jeder Ausgabe des
          // geöffneten Knotens hinaus (memoryToOut listet supersededBy) — also
          // existiert der Nachfolger für Agenten nicht.
          if (by) {
            const nachfolger = aussenVor(store, by, `Memory not found: ${by}`);
            if (nachfolger) throw nachfolger;
          }
          store.supersedeMemory(id, by);
          return { content: [{ type: "text", text: `Superseded marked: ${id}` }], structuredContent: { forgotten: true, mode } };
        }
        if (mode === "delete") {
          store.trashMemory(id);
          return { content: [{ type: "text", text: `Moved to the trash: ${id}` }], structuredContent: { forgotten: true, mode } };
        }
        throw new Error(`Unknown mode: ${mode}`);
      }
      default:
        throw Object.assign(new Error(`Unknown tool: ${name}`), { code: -32601 });
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return {
      content: [{ type: "text", text: `Error: ${msg}` }],
      structuredContent: { error: msg },
      isError: true,
    };
  }
}

// ---------- Protokoll-Handling ----------

// Absteigend sortiert, damit "die hoechste, die passt" ein find() ist. Die
// Versionen sind Datumsangaben in YYYY-MM-DD — lexikografisch vergleichen genuegt.
const VERSIONEN_ABSTEIGEND = [...PROTOCOL_VERSIONS].sort().reverse();
const AELTESTE_PROTOCOL_VERSION = VERSIONEN_ABSTEIGEND[VERSIONEN_ABSTEIGEND.length - 1];

/**
 * Waehlt die Protokollversion fuer die Antwort auf initialize.
 *
 * Frueher lief jede unbekannte Anfrage auf die neueste Version hinaus. Fuer einen
 * Client, der etwas Aelteres spricht, ist das die eine Antwort, mit der er nichts
 * anfangen kann: Claude Desktop bat um 2025-03-26, bekam 2026-07-28 und brach ab
 * mit "Server's protocol version is not supported". KEPTA war damit fuer den
 * verbreitetsten MCP-Client unbenutzbar.
 *
 * Richtig ist, nie ueber das hinauszugehen, wonach gefragt wurde: die hoechste
 * unterstuetzte Version, die nicht neuer ist als die erfragte. Nur wenn der Client
 * neuer ist als alles, was wir kennen, bieten wir unsere neueste an — herunter-
 * handeln kann er dann selbst.
 */
export function negotiateVersion(requested: unknown): string {
  if (typeof requested !== "string" || requested === "") {
    // Ohne Angabe ist der Client nicht regelkonform. Die aelteste unterstuetzte
    // Version versteht dann noch am ehesten jemand.
    return AELTESTE_PROTOCOL_VERSION;
  }
  if ((PROTOCOL_VERSIONS as readonly string[]).includes(requested)) return requested;
  // Ist der Client aelter als alles, was wir kennen, gibt es nichts, was er sicher
  // versteht. Dann ist unsere aelteste die naechstgelegene und beste Chance —
  // die neueste anzubieten hiesse, die Ablehnung zu garantieren.
  return VERSIONEN_ABSTEIGEND.find((v) => v <= requested) ?? AELTESTE_PROTOCOL_VERSION;
}

/** Was ein Zuhörer vom MCP-Server erfährt: wer sich verbindet und welches Werkzeug lief. */
export type McpEreignis =
  | { art: "verbunden"; client: McpContext["client"] }
  | {
      art: "werkzeug";
      client: McpContext["client"];
      name: string;
      args: Record<string, unknown>;
      ergebnis: { structuredContent?: Record<string, unknown>; isError?: boolean };
    };

export interface McpContext {
  store: KeptaStore;
  /** Server-Kontext für Status-Infos */
  transport: "stdio" | "http";
  /** Wer verbunden ist — aus initialize (clientInfo). Über stdio genau ein Client je Prozess. */
  client?: { name?: string; title?: string; version?: string };
  /**
   * Hört mit, was Agenten tun — die Oberfläche von KEPTA Core zeigt es live an.
   * Ohne Zuhörer ändert sich nichts; ein Fehler darin bricht keinen Aufruf.
   */
  melde?: (e: McpEreignis) => void;
}

function melde(ctx: McpContext, e: McpEreignis): void {
  if (!ctx.melde) return;
  try {
    ctx.melde(e);
  } catch {
    // ein Zuhörer darf den MCP-Server nie aufhalten
  }
}

/** Nur die drei Textfelder aus clientInfo — alles andere bleibt draußen. */
function leseClient(info: unknown): McpContext["client"] | undefined {
  if (!info || typeof info !== "object") return undefined;
  const aus: NonNullable<McpContext["client"]> = {};
  for (const k of ["name", "title", "version"] as const) {
    const v = (info as Record<string, unknown>)[k];
    if (typeof v === "string") aus[k] = v.slice(0, 100);
  }
  return Object.keys(aus).length ? aus : undefined;
}

export async function handleRpc(ctx: McpContext, req: JsonRpcRequest): Promise<JsonRpcResponse | null> {
  const id = req.id ?? null;
  const method = req.method ?? "";
  const metaVersion = (req._meta as { protocolVersion?: string } | undefined)?.protocolVersion;

  // Fehlendes jsonrpc-Feld tolerant als "2.0" behandeln (ältere Clients),
  // ein explizit falscher Wert ist ein Invalid Request (-32600).
  if (req.jsonrpc !== undefined && req.jsonrpc !== "2.0") {
    return {
      jsonrpc: "2.0",
      id,
      error: { code: -32600, message: `Invalid jsonrpc version: ${String(req.jsonrpc)} (expected "2.0")` },
    };
  }

  // Zustandslose Clients (2026-07-28) nennen sich in _meta statt in initialize.
  if (!ctx.client) ctx.client = leseClient((req._meta as { clientInfo?: unknown } | undefined)?.clientInfo);

  if (method === "initialize") {
    const requested = (req.params as { protocolVersion?: string } | undefined)?.protocolVersion ?? metaVersion;
    ctx.client = leseClient((req.params as { clientInfo?: unknown } | undefined)?.clientInfo) ?? ctx.client;
    melde(ctx, { art: "verbunden", client: ctx.client });
    return {
      jsonrpc: "2.0",
      id,
      result: {
        protocolVersion: negotiateVersion(requested),
        capabilities: { tools: { listChanged: false } },
        serverInfo: SERVER_INFO,
      },
    };
  }
  if (method === "notifications/initialized" || method === "initialized") {
    return id !== null && id !== undefined ? { jsonrpc: "2.0", id, result: {} } : null;
  }
  if (method === "server/discover") {
    // 2026-07-28 stateless core: alles Nötige in einer Antwort
    return {
      jsonrpc: "2.0",
      id,
      result: {
        protocolVersion: negotiateVersion(metaVersion),
        serverInfo: SERVER_INFO,
        tools: TOOLS,
      },
    };
  }
  if (method === "ping") return { jsonrpc: "2.0", id, result: {} };
  if (method === "tools/list") {
    return { jsonrpc: "2.0", id, result: { tools: TOOLS } };
  }
  if (method === "tools/call") {
    const p = (req.params ?? {}) as { name?: string; arguments?: Record<string, unknown> };
    const name = String(p.name ?? "");
    const args = (p.arguments ?? {}) as Record<string, unknown>;
    const result = await callTool(ctx.store, name, args);
    melde(ctx, { art: "werkzeug", client: ctx.client, name, args, ergebnis: result });
    return { jsonrpc: "2.0", id, result: result as unknown as Record<string, unknown> };
  }
  // Notifications (ohne id) für unbekannte Methoden: KEINE Response (JSON-RPC 2.0)
  if (id === null) return null;
  return {
    jsonrpc: "2.0",
    id,
    error: { code: -32601, message: `Unknown method: ${method}` },
  };
}
