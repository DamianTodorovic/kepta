// Everything around one MCP request in K3PTA Enterprise: the privacy shield
// before and after the tool, then the activity feed and the audit log — both
// with exactly what the AI app got to see.
//
// Before: private notes cannot be changed, and values the shield hid come back
// as the real ones when an app writes a note back. After: private notes vanish
// from searches, lists and the graph, and passwords, keys, card numbers and
// IBANs become placeholders. Used by the stdio server (src/mcp-server.ts) and
// the HTTP route /mcp alike.
import type { KeptaStore } from "../core/store";
import { handleRpc, type JsonRpcRequest, type JsonRpcResponse, type McpContext, type McpEreignis } from "../core/mcp";
import { ARTEN_FUER_APPS, Schild, SCHILD_SCHLUESSEL, leseSchildEinstellungen, stelleWiederHer } from "./schild";
import { protokolliereEreignis } from "./aktivitaet";
import { protokolliereMcp } from "./pruefprotokoll";

export interface McpSchutz {
  /** Hide passwords, keys, card numbers and IBANs from AI apps. */
  apps: boolean;
  privat: ReadonlySet<string>;
  /** Lower-case titles of private notes — the graph names notes by title. */
  privateTitel: ReadonlySet<string>;
}

export const PRIVAT_MELDUNG = "This note is private — its owner keeps it away from AI apps, so K3PTA cannot show or change it.";

/** Reads the settings and the private notes afresh for every call — a switch in the app counts at once. */
export function ladeSchutz(store: KeptaStore): McpSchutz {
  let apps = true;
  try {
    apps = leseSchildEinstellungen(store.einstellungen()[SCHILD_SCHLUESSEL]).apps;
  } catch {
    // unreadable settings: stay protected
  }
  const zeilen = store.db.prepare("SELECT id, title FROM memories WHERE scope = 'private' AND deleted_at IS NULL").all() as { id: string; title: string }[];
  return { apps, privat: new Set(zeilen.map((z) => z.id)), privateTitel: new Set(zeilen.map((z) => z.title.trim().toLowerCase())) };
}

/** Before a tool runs. */
export function vorWerkzeug(
  name: string,
  args: Record<string, unknown>,
  store: KeptaStore,
  schutz: McpSchutz
): { args: Record<string, unknown> } | { fehler: string } {
  const id = typeof args.id === "string" ? args.id : null;
  const aendert = name === "memory_update" || name === "memory_delete" || name === "memory_forget" || (name === "memory_save" && id !== null);
  if (aendert && id && schutz.privat.has(id)) return { fehler: PRIVAT_MELDUNG };
  if (typeof args.supersedeBy === "string" && schutz.privat.has(args.supersedeBy)) return { fehler: PRIVAT_MELDUNG };
  if (!schutz.apps || !id || (name !== "memory_update" && name !== "memory_save")) return { args };
  const original = store.getMemory(id);
  if (!original) return { args };
  const neu = { ...args };
  if (typeof neu.content === "string") neu.content = stelleWiederHer(original.content, neu.content);
  if (typeof neu.title === "string") neu.title = stelleWiederHer(original.title, neu.title);
  return { args: neu };
}

type Notiz = Record<string, unknown>;
const istNotiz = (x: unknown): x is Notiz => !!x && typeof x === "object" && !Array.isArray(x);

export interface Werkzeugergebnis {
  content?: unknown[];
  structuredContent?: Record<string, unknown>;
  isError?: boolean;
}

/** After a tool ran: what the app gets to see. */
export function nachWerkzeug(name: string, args: Record<string, unknown>, ergebnis: Werkzeugergebnis, schutz: McpSchutz): Werkzeugergebnis {
  const s = ergebnis.structuredContent;
  if (!s || ergebnis.isError) return ergebnis;
  const privat = (m: unknown) => istNotiz(m) && (m.scope === "private" || schutz.privat.has(String(m.id)));
  const verdecke = (m: unknown): unknown => {
    if (!schutz.apps || !istNotiz(m)) return m;
    const aus = { ...m };
    if (typeof aus.title === "string") aus.title = new Schild(ARTEN_FUER_APPS).schirme(aus.title);
    if (typeof aus.content === "string") aus.content = new Schild(ARTEN_FUER_APPS).schirme(aus.content);
    return aus;
  };
  const liste = (xs: unknown) => (Array.isArray(xs) ? xs : []).filter((m) => !privat(m)).map(verdecke);
  let neu: Record<string, unknown>;
  switch (name) {
    case "memory_search": {
      const hits = liste(s.hits);
      neu = { ...s, hits, count: hits.length };
      break;
    }
    case "memory_list": {
      const memories = liste(s.memories);
      const total = typeof s.total === "number" && args.trash !== true ? Math.max(0, s.total - schutz.privat.size) : s.total;
      neu = { ...s, memories, count: memories.length, total };
      break;
    }
    case "memory_save":
    case "memory_update":
      if (!istNotiz(s.memory)) return ergebnis;
      neu = { ...s, memory: privat(s.memory) ? null : verdecke(s.memory) };
      break;
    case "memory_graph": {
      const verborgen = (n: unknown) => typeof n === "string" && schutz.privateTitel.has(n.trim().toLowerCase());
      const entities = (Array.isArray(s.entities) ? s.entities : []).filter((e) => !(istNotiz(e) && verborgen(e.name)));
      const relations = (Array.isArray(s.relations) ? s.relations : []).filter((r) => !(istNotiz(r) && (verborgen(r.source) || verborgen(r.target))));
      neu = { ...s, entities, relations };
      break;
    }
    case "memory_consolidate": {
      const candidates = (Array.isArray(s.candidates) ? s.candidates : []).filter(
        (c) => !(istNotiz(c) && (schutz.privat.has(String(c.keepId)) || schutz.privat.has(String(c.duplicateId))))
      );
      neu = { ...s, candidates };
      break;
    }
    default:
      return ergebnis;
  }
  return { ...ergebnis, structuredContent: neu, content: [{ type: "text", text: JSON.stringify(neu, null, 2) }] };
}

/** Records one event in the activity feed and the audit log. */
export function melde(store: KeptaStore, e: McpEreignis): void {
  protokolliereEreignis(store, e);
  protokolliereMcp(store, e);
}

/** The listener for connecting clients — tool calls are reported by bearbeiteMcp, after the shield. */
export function beiVerbindung(store: KeptaStore): (e: McpEreignis) => void {
  return (e) => {
    if (e.art === "verbunden") melde(store, e);
  };
}

function leseClient(info: unknown): McpContext["client"] | undefined {
  if (!istNotiz(info)) return undefined;
  const aus: NonNullable<McpContext["client"]> = {};
  for (const k of ["name", "title", "version"] as const) if (typeof info[k] === "string") aus[k] = (info[k] as string).slice(0, 100);
  return Object.keys(aus).length ? aus : undefined;
}

/** One MCP request with the shield, the activity feed and the audit log around it. */
export async function bearbeiteMcp(ctx: McpContext, req: JsonRpcRequest): Promise<JsonRpcResponse | null> {
  if (req.method !== "tools/call") return handleRpc(ctx, req);
  if (!ctx.client) ctx.client = leseClient((req._meta as { clientInfo?: unknown } | undefined)?.clientInfo);
  const p = (req.params ?? {}) as { name?: unknown; arguments?: unknown };
  const name = String(p.name ?? "");
  const args = istNotiz(p.arguments) ? p.arguments : {};
  let schutz: McpSchutz;
  try {
    schutz = ladeSchutz(ctx.store);
  } catch {
    schutz = { apps: true, privat: new Set(), privateTitel: new Set() };
  }
  const vor = vorWerkzeug(name, args, ctx.store, schutz);
  if ("fehler" in vor) {
    return { jsonrpc: "2.0", id: req.id ?? null, result: { content: [{ type: "text", text: vor.fehler }], isError: true } } as JsonRpcResponse;
  }
  const antwort = await handleRpc({ ...ctx, melde: undefined }, { ...req, params: { ...(req.params ?? {}), arguments: vor.args } });
  if (!antwort || !("result" in antwort) || !antwort.result) return antwort;
  const geschuetzt = nachWerkzeug(name, vor.args, antwort.result as Werkzeugergebnis, schutz);
  melde(ctx.store, { art: "werkzeug", client: ctx.client, name, args: vor.args, ergebnis: geschuetzt });
  return { ...antwort, result: geschuetzt } as JsonRpcResponse;
}
