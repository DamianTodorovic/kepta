// KEPTA MCP — Protokoll-Handling (stdio + Streamable HTTP teilen sich diese Logik).
// Unterstützt: 2026-07-28 (stateless core, server/discover) sowie Legacy-Clients
// (2025-06-18, 2024-11-05). Erfolgsantworten liefern structuredContent zur outputSchema,
// Fehlerantworten nur Text + isError — ein Strukturteil im Fehlerfall bricht konforme Clients.
import type { KeptaStore } from "./store";
import type { MemoryType, SearchParams } from "./types";
import { searchMemories, indexMemory, consolidateMemories, findDuplicateForNew, gateDecision, writeGateEnabled, MAX_CANDIDATES_PRO_AUFRUF } from "./engine";
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

/**
 * D2-31: das Terminal rät bei Tippfällen längst („rember" → „remember"). Die
 * Agentenfläche antwortete auf denselben Irrtum mit einem nackten Satz. Dieselbe
 * Maschine, dieselbe Höflichkeit: was scheiterte, und welche Tür als nächstes
 * trifft. Die drei Sätze bleiben so stehen, dass die bestehenden Wachen
 * (mcp-fehlerform, mcp-forget-supersede) dieselben Muster finden.
 */
function abstand(a: string, b: string): number {
  let vorher = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const jetzt = [i];
    for (let j = 1; j <= b.length; j++) {
      jetzt[j] = Math.min(jetzt[j - 1]! + 1, vorher[j]! + 1, vorher[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    vorher = jetzt;
  }
  return vorher[b.length]!;
}

function naechsterWerkzeug(wort: string): string | null {
  const namen = TOOLS.map((w) => w.name);
  const Kandidat = [...namen].sort((a, b) => abstand(wort.toLowerCase(), a) - abstand(wort.toLowerCase(), b))[0];
  return Kandidat && abstand(wort.toLowerCase(), Kandidat) <= Math.max(3, Math.floor(Kandidat.length / 3)) ? Kandidat : null;
}

function fehlertext(name: string, meldung: string): string {
  if (/^Unknown tool: /i.test(meldung)) {
    const erfunden = meldung.replace(/^Unknown tool: /i, "").trim();
    const naechster = naechsterWerkzeug(erfunden);
    return `Unknown tool: ${erfunden}${naechster ? `. Closest: ${naechster}` : ""}. Tools: ${TOOLS.map((w) => w.name).join(", ")}`;
  }
  const weg = /not found|already deleted/i.test(meldung)
    ? "memory_list (add trash:true for deleted ones) shows the ids that exist"
    : /is required|must be/i.test(meldung)
      ? `the inputSchema of ${name} names every field this call needs`
      : `retry ${name} with the fields its inputSchema requires`;
  return `${meldung} — next: ${weg}`;
}

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
//
// D2-27 bis D2-35: die acht Beschreibungen sind ein Interface, kein Log. Sie
// folgen einem Skelett — was es tut, was zurückkommt, Nebenwirkung und ihr Ausweg,
// wo ein Gegenstück existsiert, weist es darauf hin. Feldnamen in Prosa sind
// Verträge: nur in der Schreibweise des Schemas (D2-26 fand „valid_to" dort, wo
// das Schema „validTo" heisst — ein Agent folgte der Prosa). Ein Feld ohne Text
// ist ein Fehler im Build, geholt von tests/mcp-werkzeugtext.test.ts.
// Zahlenfelder nennen ein Beispiel, das man abschreiben kann; „default" steht
// nur im Schema.

const VIER_TYPEN = "semantic = fact, episodic = event, procedural = how-to, reference = imported document";
const EPOCH_BEISPIEL = "epoch milliseconds — 1762387000000 = 6 Oct 2026, 12:16 UTC";

export const TOOLS = [
  {
    name: "memory_search",
    title: "Search memory",
    description:
      "Searches by words, vectors and links. Returns hits with score and dates; private notes never appear. Count 0 can mean a just-saved note is still indexing - run it again. Read-only.",
    inputSchema: {
      type: "object",
      properties: {
        query: opt(stringSchema("Natural-language question or the words the note should contain")),
        limit: opt({ type: "integer", description: "Hits to return, 1-100", default: 10 }),
        tags: opt({ type: "array", items: { type: "string" }, description: "Only notes carrying all of these tags" }),
        type: opt({ type: "string", enum: ["semantic", "episodic", "procedural", "reference"], description: `Only notes of this kind: ${VIER_TYPEN}` }),
        scope: opt(stringSchema("Only notes in this scope, e.g. agent:coder or session:abc")),
        asOf: opt({ type: "integer", description: `Time travel: search as of a moment instead of now (${EPOCH_BEISPIEL})` }),
      },
      required: ["query"],
    },
    outputSchema: searchOutSchema,
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
  },
  {
    name: "memory_save",
    title: "Save memory",
    description:
      "Saves a note and returns its id; [[Wiki links]] become entities. With id it replaces the whole note - memory_update patches, memory_delete trashes. duplicateWarning names a twin.",
    inputSchema: {
      type: "object",
      properties: {
        id: opt(stringSchema("Existing id: the whole note is replaced by this call")),
        title: opt(stringSchema("Short name the note is retrieved by")),
        content: opt(stringSchema("The full text; [[Wiki links]] in it become entities")),
        tags: opt({ type: "array", items: { type: "string" }, description: "Labels for retrieval, e.g. weber, billing" }),
        type: opt({ type: "string", enum: ["semantic", "episodic", "procedural", "reference"], description: VIER_TYPEN }),
        scope: opt(stringSchema('Scope of the note. "private" keeps it out of every agent channel — search, list, graph, consolidate and id lookups — while the owner still reads it in the app.')),
        confidence: opt({ type: "number", description: "0 = a guess, 1 = confirmed" }),
        validFrom: opt({ type: "integer", description: `Moment the note starts to hold: ${EPOCH_BEISPIEL}` }),
        validTo: opt({ type: "integer", description: `Moment it stops holding, null = open: ${EPOCH_BEISPIEL}` }),
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
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
  },
  {
    name: "memory_update",
    title: "Update memory",
    description:
      "Patches one note and returns it; only the fields you send change - memory_save with an id replaces the whole note. supersededBy:null undoes a wrong memory_consolidate.",
    inputSchema: {
      type: "object",
      properties: {
        id: opt(stringSchema("Id of the note to change")),
        title: opt(stringSchema("New short name")),
        content: opt(stringSchema("New full text; [[Wiki links]] become entities")),
        tags: opt({ type: "array", items: { type: "string" }, description: "Replaces the label list" }),
        type: opt({ type: "string", enum: ["semantic", "episodic", "procedural", "reference"], description: VIER_TYPEN }),
        confidence: opt({ type: "number", description: "0 = a guess, 1 = confirmed" }),
        validFrom: opt({ type: ["integer", "null"], description: `Moment it starts to hold: ${EPOCH_BEISPIEL}` }),
        validTo: opt({ type: ["integer", "null"], description: `Moment it stops holding; null keeps it open: ${EPOCH_BEISPIEL}` }),
        supersededBy: opt({ type: ["string", "null"], description: "Id of the successor note, or null to undo a superseding" }),
      },
      required: ["id"],
    },
    outputSchema: { type: "object", properties: { updated: { type: "boolean" }, memory: memoryOutSchema }, required: ["updated"] },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
  },
  {
    name: "memory_delete",
    title: "Delete memory",
    description:
      "Moves a note to the trash and returns trashed:true; permanent:true deletes the row. Way back: memory_list with trash:true shows the id, then POST /api/memories/:id/restore.",
    inputSchema: {
      type: "object",
      properties: {
        id: opt(stringSchema("Id of the note to remove")),
        permanent: opt({ type: "boolean", description: "true deletes the row instead of trashing it", default: false }),
      },
      required: ["id"],
    },
    outputSchema: { type: "object", properties: { trashed: { type: "boolean" }, purged: { type: "boolean" } }, required: [] },
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true },
  },
  {
    name: "memory_list",
    title: "List memories",
    description:
      "Lists notes with count, total and pages, newest first. Private notes are never listed, even when scope asks for them. Read-only; use memory_search to find something by meaning.",
    inputSchema: {
      type: "object",
      properties: {
        limit: opt({ type: "integer", default: 20, description: "Notes to return, 1-200" }),
        offset: opt({ type: "integer", default: 0, description: "Notes to skip, for paging through total" }),
        type: opt({ type: "string", enum: ["semantic", "episodic", "procedural", "reference"], description: VIER_TYPEN }),
        tag: opt({ type: "string", description: "Only notes carrying this label" }),
        scope: opt({ type: "string", description: "Only notes in this scope, e.g. agent:coder" }),
        trash: opt({ type: "boolean", description: "List the trash instead of active notes - the way to find a deleted id", default: false }),
      },
    },
    outputSchema: {
      type: "object",
      properties: { count: { type: "integer" }, total: { type: "integer" }, memories: { type: "array", items: memoryOutSchema } },
      required: ["count", "memories"],
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
  },
  {
    name: "memory_graph",
    title: "Read graph",
    description:
      "Reads entities and the [[links]] between them, around one entity or the capped whole graph, and returns entities and relations. Read-only; memory_search finds the notes themselves.",
    inputSchema: {
      type: "object",
      properties: {
        entity: opt(stringSchema("Entity to start from; without it the whole graph, capped")),
        depth: opt({ type: "integer", description: "Hops to follow, 1-4", default: 2 }),
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
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
  },
  {
    name: "memory_consolidate",
    title: "Consolidate memories",
    description:
      'Finds duplicates and contradictions, returns candidate pairs. Nothing changes until dryRun:false with confirm:"supersede". Undo via memory_update supersededBy:null.',
    inputSchema: {
      type: "object",
      properties: {
        dryRun: opt({ type: "boolean", description: "true suggests only, false applies the supersede", default: true }),
        threshold: opt({ type: "number", description: "Similarity from which two notes count as one pair, 0..1", default: 0.92 }),
        confirm: opt({ type: "string", description: 'With dryRun:false must be exactly "supersede"; without it nothing is applied' }),
      },
    },
    outputSchema: {
      type: "object",
      properties: {
        dryRun: { type: "boolean" },
        applied: { type: "integer" },
        begrenzt: { type: "boolean" },
        hinweis: { type: "string" },
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
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
  },
  {
    name: "memory_forget",
    title: "Invalidate memory",
    description:
      "Invalidates one note and returns it: expire closes validTo at the current time, supersede re-points to supersedeBy, delete trashes it. Undo by clearing validTo or supersededBy.",
    inputSchema: {
      type: "object",
      properties: {
        id: opt(stringSchema("Id of the note to invalidate")),
        mode: opt({ type: "string", enum: ["expire", "supersede", "delete"], description: "expire closes validTo, supersede re-points to a successor, delete trashes", default: "expire" }),
        validTo: opt({ type: "integer", description: `expire mode: the moment validity ends (${EPOCH_BEISPIEL}); without it, now` }),
        supersedeBy: opt(stringSchema("supersede mode: id of the successor memory — required for that mode, supersede without it is rejected")),
      },
      required: ["id"],
    },
    outputSchema: { type: "object", properties: { forgotten: { type: "boolean" }, mode: { type: "string" } }, required: ["forgotten"] },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
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

/**
 * asOf ist epoch Millisekunden. Ein Wert, der keine ganze Zahl ist, wird abgewiesen:
 * Number("2020-01-01") ist NaN, NaN liest die Engine wie "heute" — der Agent hielt eine
 * Zeitreise für wirksam, die nie stattfand.
 */
function lieseAsOf(wert: unknown): number | undefined {
  if (wert === undefined || wert === null) return undefined;
  const roh = typeof wert === "string" ? wert.trim() : wert;
  const zahl = typeof roh === "number" ? roh : typeof roh === "string" && /^[+-]?\d+$/.test(roh) ? Number(roh) : Number.NaN;
  if (!Number.isFinite(zahl)) {
    throw new Error("memory_search: asOf must be epoch milliseconds (an integer), e.g. 1700000000000");
  }
  return Math.trunc(zahl);
}

/** Tags sind Zeichenketten. Ein Nicht-String endet sonst als "t.toLowerCase is not a function". */
function zeichenKetten(liste: unknown[], feld: string): string[] {
  liste.forEach((t, i) => {
    if (typeof t !== "string") throw new Error(`${feld}[${i}] must be a string`);
  });
  return liste as string[];
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
    tags: Array.isArray(args.tags) ? zeichenKetten(args.tags, "tags") : [],
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

export async function callTool(store: KeptaStore, name: string, args: Record<string, unknown>): Promise<{ content: unknown[]; structuredContent?: Record<string, unknown>; isError?: boolean }> {
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
          tags: Array.isArray(args.tags) ? zeichenKetten(args.tags, "tags") : undefined,
          type: (args.type as MemoryType | undefined) ?? undefined,
          scope: args.scope ? String(args.scope) : undefined,
          asOf: lieseAsOf(args.asOf),
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
        return { content: [{ type: "text", text: JSON.stringify(structured) }], structuredContent: structured };
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
          return { content: [{ type: "text", text: JSON.stringify(structured) }], structuredContent: structured };
        }
        if (gate && (gate.decision === "NOOP" || gate.decision === "DELETE")) {
          const structured = { created: false, gateOutcome: "rejected", memory: null, writeGate: gate };
          return { content: [{ type: "text", text: JSON.stringify(structured) }], structuredContent: structured };
        }
        const { created, record } = saveWithIndex(store, args);
        const structured = {
          created,
          memory: memoryToOut(store, record),
          duplicateWarning: await findDuplicateForNew(store, String(args.title ?? ""), String(args.content ?? "")),
          ...(writeGateEnabled() ? { gateOutcome: "created", writeGate: gate } : {}),
        };
        return {
          content: [{ type: "text", text: JSON.stringify(structured) }],
          structuredContent: structured,
        };
      }
      case "memory_update": {
        const id = String(args.id ?? "");
        const verweigert = aussenVor(store, id, `Memory not found: ${id}`);
        if (verweigert) throw verweigert;
        const patch: Record<string, unknown> = {};
        for (const k of ["title", "content", "tags", "type", "confidence", "validFrom", "validTo"] as const) {
          if (args[k] !== undefined) patch[k] = k === "tags" && Array.isArray(args[k]) ? zeichenKetten(args[k] as unknown[], "tags") : args[k];
        }
        // Der Rueckweg: supersededBy ist ein deklariertes Feld, damit eine falsch
        // angewandte Konsolidierung zurueckgenommen werden kann (null = offen).
        if (args.supersededBy !== undefined) {
          if (args.supersededBy === null) {
            patch.supersededBy = null;
          } else {
            const by = typeof args.supersededBy === "string" ? args.supersededBy.trim() : "";
            if (!by) throw new Error("memory_update: supersededBy must be the id of a successor memory, or null to undo a superseding");
            const meldung = `Memory not found: ${by}`;
            const verborgen = aussenVor(store, by, meldung);
            if (verborgen || !store.getMemory(by)) throw verborgen ?? new Error(meldung);
            patch.supersededBy = by;
          }
        }
        const updated = store.updateMemory(id, patch);
        if (!updated) throw new Error(`Memory not found: ${id}`);
        if (patch.content !== undefined) indexMemory(store, id);
        const structured = { updated: true, memory: memoryToOut(store, store.getMemory(id)) };
        return { content: [{ type: "text", text: JSON.stringify(structured) }], structuredContent: structured };
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
        // Ein Durchlauf durch den gefilterten Satz, dann die Seite daraus abgeschnitten:
        // total ist die Zahl, nach der der Agent paginiert — nicht die des Gesamtbestands,
        // und ohne private Notizen, deren Menge sonst als Aggregat nach aussen geht.
        // Grenze 5000 = die Seiten-Obergrenze des Speichers (store.listMemories).
        const vollen = ohnePrivate(store.listMemories({ ...opts, limit: 5000, offset: 0 }), (m) => m.scope);
        const memories = vollen.slice(opts.offset, opts.offset + opts.limit);
        const structured = {
          count: memories.length,
          total: vollen.length,
          memories: memories.map((m) => memoryToOut(store, m)),
        };
        return { content: [{ type: "text", text: JSON.stringify(structured) }], structuredContent: structured };
      }
      case "memory_graph": {
        const entity = args.entity ? String(args.entity) : undefined;
        const depth = toInt(args.depth, 2, 1, 4);
        const g = store.getGraph(entity, depth);
        const nameById = new Map(g.entities.map((e) => [e.id, e.name]));
        // Privatheits-Floor: Entitäten sind abgeleitete Daten — ein Knoten fällt, wenn
        // keine seiner Träger-Notizen offen ist. Nennt ihn zusätzlich eine offene Notiz,
        // gehört der Name der offenen Welt. Relationen gehen mit ihrer privaten
        // Träger-Notiz und mit jedem Knoten, den der Floor entfernt hat.
        const privaten = store.privateMemoryIds();
        const traeger = store.memoryIdsByEntity(g.entities.map((e) => e.id));
        // Trägerlose Knoten sind nicht per Definition offen, und relations.memory_id ist
        // ohne Fremdschlüssel: Löscht die Besitzerin eine Notiz endgültig, fallen ihre
        // Träger-Zeilen (ON DELETE CASCADE) — ihre Kanten und damit ihr Titel bleiben als
        // Geist zurück. Offen ist ein Knoten nur durch eine offene, lebende Träger-Notiz
        // oder eine Kante, die ebenfalls eine offene, lebende Notiz (oder gar keine) trägt.
        const lebendeOffene = new Set<string>();
        for (const ids of traeger.values()) {
          for (const id of ids) if (!privaten.has(id)) lebendeOffene.add(id);
        }
        const traegtOffen = (mid: string | null): boolean => {
          if (!mid) return true; // Kante ohne Notiz = Setzung der Besitzerin
          if (privaten.has(mid)) return false;
          return lebendeOffene.has(mid) || store.getMemory(mid) !== null;
        };
        const offeneRelations = g.relations.filter((r) => traegtOffen(r.memoryId));
        const offenBenannt = new Set<number>();
        for (const r of offeneRelations) {
          offenBenannt.add(r.sourceId);
          offenBenannt.add(r.targetId);
        }
        const gehalten = new Set<number>();
        for (const e of g.entities) {
          const ids = traeger.get(e.id) ?? [];
          if (ids.some((id) => !privaten.has(id)) || offenBenannt.has(e.id)) gehalten.add(e.id);
        }
        const structured = {
          entities: g.entities.filter((e) => gehalten.has(e.id)).map((e) => ({ name: e.name })),
          relations: offeneRelations
            .filter((r) => gehalten.has(r.sourceId) && gehalten.has(r.targetId))
            .map((r) => ({ source: nameById.get(r.sourceId)!, target: nameById.get(r.targetId)!, relation: r.relation })),
        };
        return { content: [{ type: "text", text: JSON.stringify(structured) }], structuredContent: structured };
      }
      case "memory_consolidate": {
        // Anwenden ist fuer den Agenten unumkehrbar, der die Ersetzung selbst nicht
        // rueckgaengig macht — memory_update mit supersededBy:null ist der Rueckweg, und
        // den gibt es erst seit dieser Aenderung. Deshalb verlangt dryRun:false ein
        // ausdrueckliches Bestaetigungsfeld.
        const dryRun = args.dryRun !== false;
        if (!dryRun && args.confirm !== "supersede") {
          throw new Error(
            'memory_consolidate: dryRun:false requires confirm:"supersede" — run with dryRun:true (the default) first to see the candidates'
          );
        }
        const res = await consolidateMemories(store, {
          dryRun,
          threshold: typeof args.threshold === "number" ? args.threshold : undefined,
          // Private Dupletten zu melden hieße, dem Agenten zwei private ids und ihre
          // Ähnlichkeit zu nennen; anzuwenden würde zudem eine private Notiz als
          // ersetzt markieren und sie damit aus der Suche des Besitzers nehmen.
          ausnehmen: store.privateMemoryIds(),
        });
        const structured: Record<string, unknown> = {
          dryRun: res.dryRun,
          applied: res.applied,
          // Die Engine kappt ihre Vorschlaege pro Aufruf. Sagt sie es und der Agentenkanal
          // verschluckt das Feld, liest der Agent 500 Kandidaten und hält sie für alle.
          begrenzt: res.begrenzt === true,
          candidates: res.candidates.map((c) => ({ keepId: c.keepId, duplicateId: c.duplicateId, similarity: c.similarity, reason: c.reason })),
        };
        if (structured.begrenzt) {
          structured.hinweis =
            `Candidate list is capped at ${MAX_CANDIDATES_PRO_AUFRUF} pairs per call: more duplicates exist than are shown. Raise threshold to narrow the set, or keep dryRun:true to read the overview before applying.`;
        }
        return { content: [{ type: "text", text: JSON.stringify(structured) }], structuredContent: structured };
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
          // Ein Zeiger ins Leere ist kein Ersetzen: die Such-Fahne "superseded" haengt an
          // einem nicht-null-Zeiger. Ohne Nachfolger würde die Notiz gueltig bleiben und
          // der Agent glauben, sie sei ersetzt — Erfolg ohne Wirkung.
          const by = typeof args.supersedeBy === "string" ? args.supersedeBy.trim() : "";
          if (!by) {
            throw new Error(
              'memory_forget: mode "supersede" requires supersedeBy (the id of the successor) — use mode "expire" to retire a memory without a successor'
            );
          }
          // Ein Zeiger auf eine private Notiz wandert mit jeder Ausgabe des
          // geöffneten Knotens hinaus (memoryToOut listet supersededBy) — also
          // existiert der Nachfolger für Agenten nicht.
          const nachfolger = aussenVor(store, by, `Memory not found: ${by}`);
          if (nachfolger) throw nachfolger;
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
    // Kein structuredContent im Fehlerfall: jedes Werkzeug deklariert eine outputSchema mit
    // Pflichtfeldern, und ein konformer Client validiert den Strukturteil dagegen, sobald er
    // da ist — er würde dann die Fehlermeldung werfen statt sie zu zeigen.
    return {
      content: [{ type: "text", text: `Error: ${fehlertext(name, msg)}` }],
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
