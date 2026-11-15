// What the AI apps are doing — visible in K3PTA, live.
//
// Claude Desktop, Cursor & Co. start the MCP server as a process of their own;
// the app is another one. All they share is the encrypted database — so the
// activity lives there: a small table with the latest tool calls, who made
// them and on what. It stays in the same encrypted file, nothing leaves the
// computer, and only the latest 500 entries are kept. (The full, sealed record
// is the audit log in pruefprotokoll.ts.)
import type { KeptaStore } from "../core/store";
import type { McpEreignis } from "../core/mcp";

export const MAX_EINTRAEGE = 500;

export interface Aktivitaet {
  id: number;
  at: number;
  client: string;
  tool: string;
  text: string | null;
  memoryId: string | null;
  count: number | null;
}

function tabelle(store: KeptaStore): void {
  store.db.exec(
    "CREATE TABLE IF NOT EXISTS agent_activity (id INTEGER PRIMARY KEY AUTOINCREMENT, at INTEGER NOT NULL, client TEXT NOT NULL, tool TEXT NOT NULL, text TEXT, memory_id TEXT, count INTEGER)"
  );
}

/** The name a client gives when it connects — shortened, without control characters. */
export function clientName(info: unknown): string {
  const roh = info && typeof info === "object" ? (info as { title?: unknown; name?: unknown }) : {};
  const name = typeof roh.title === "string" && roh.title.trim() ? roh.title : typeof roh.name === "string" ? roh.name : "";
  return name.replace(/[\x00-\x1f\x7f]/g, "").trim().slice(0, 60) || "An MCP client";
}

const BEKANNT: [RegExp, string][] = [
  [/claude[\s_-]*code/i, "Claude Code"],
  [/claude/i, "Claude"],
  [/cursor/i, "Cursor"],
  [/windsurf|codeium/i, "Windsurf"],
  [/visual studio code|vs ?code|copilot/i, "VS Code"],
  [/\bzed\b/i, "Zed"],
  // Reihenfolge: „roo-cline“ enthält „cline“ — Roo muss vor Cline geprüft werden.
  [/roo/i, "Roo Code"],
  [/cline/i, "Cline"],
  [/gemini/i, "Gemini"],
  [/codex/i, "Codex CLI"],
  [/continue/i, "Continue"],
  [/raycast/i, "Raycast"],
  [/goose/i, "Goose"],
  [/lm ?studio/i, "LM Studio"],
  [/chatgpt|openai/i, "ChatGPT"],
];

/** „claude-ai“ → „Claude“, „cursor-vscode“ → „Cursor“; anything else stays as it came. */
export function anzeigeName(client: string): string {
  for (const [muster, name] of BEKANNT) if (muster.test(client)) return name;
  return client;
}

/** Writes one entry. The activity must never hold up the memory — errors stay quiet. */
export function protokolliere(
  store: KeptaStore,
  e: { client: string; tool: string; text?: string | null; memoryId?: string | null; count?: number | null; at?: number }
): void {
  try {
    tabelle(store);
    const r = store.db
      .prepare("INSERT INTO agent_activity (at, client, tool, text, memory_id, count) VALUES (?, ?, ?, ?, ?, ?)")
      .run(e.at ?? Date.now(), e.client.slice(0, 60), e.tool.slice(0, 40), e.text ? e.text.slice(0, 200) : null, e.memoryId ?? null, e.count ?? null);
    store.db.prepare("DELETE FROM agent_activity WHERE id <= ?").run(Number(r.lastInsertRowid) - MAX_EINTRAEGE);
  } catch {
    // the activity is a display, not part of the memory
  }
}

/** The newest entries after the id `nach`, newest first. */
export function letzteAktivitaet(store: KeptaStore, nach = 0, limit = 50): Aktivitaet[] {
  try {
    tabelle(store);
    const zeilen = store.db
      .prepare("SELECT id, at, client, tool, text, memory_id, count FROM agent_activity WHERE id > ? ORDER BY id DESC LIMIT ?")
      .all(nach, limit) as { id: number; at: number; client: string; tool: string; text: string | null; memory_id: string | null; count: number | null }[];
    return zeilen.map((z) => ({ id: z.id, at: z.at, client: z.client, tool: z.tool, text: z.text, memoryId: z.memory_id, count: z.count }));
  } catch {
    return [];
  }
}

/** Who was there: per app the latest entry and the number of calls — merged by the name K3PTA shows. */
export function agenten(store: KeptaStore): { who: string; lastSeen: number; calls: number }[] {
  let zeilen: { client: string; lastSeen: number; calls: number }[] = [];
  try {
    tabelle(store);
    zeilen = store.db
      .prepare("SELECT client, MAX(at) AS lastSeen, COUNT(*) AS calls FROM agent_activity GROUP BY client ORDER BY lastSeen DESC LIMIT 50")
      .all() as typeof zeilen;
  } catch {
    return [];
  }
  const nachName = new Map<string, { who: string; lastSeen: number; calls: number }>();
  for (const z of zeilen) {
    const who = anzeigeName(z.client);
    const da = nachName.get(who);
    if (da) {
      da.calls += z.calls;
      da.lastSeen = Math.max(da.lastSeen, z.lastSeen);
    } else nachName.set(who, { who, lastSeen: z.lastSeen, calls: z.calls });
  }
  return [...nachName.values()].sort((x, y) => y.lastSeen - x.lastSeen);
}

/** Turns an event of the MCP server into an entry. */
export function protokolliereEreignis(store: KeptaStore, e: McpEreignis): void {
  const client = clientName(e.client);
  if (e.art === "verbunden") return protokolliere(store, { client, tool: "connect" });
  if (e.ergebnis.isError) return;
  const s = e.ergebnis.structuredContent ?? {};
  const memory = (s.memory ?? null) as { id?: unknown; title?: unknown } | null;
  switch (e.name) {
    case "memory_search":
      return protokolliere(store, { client, tool: e.name, text: String(e.args.query ?? ""), count: Array.isArray(s.hits) ? s.hits.length : null });
    case "memory_save":
    case "memory_update": {
      if (!memory || typeof memory.id !== "string") return;
      const tool = e.name === "memory_save" && s.created === false ? "memory_update" : e.name;
      return protokolliere(store, { client, tool, text: typeof memory.title === "string" ? memory.title : null, memoryId: memory.id });
    }
    case "memory_delete":
    case "memory_forget": {
      const id = typeof e.args.id === "string" ? e.args.id : null;
      // In the trash the note can still be read — a permanently deleted one has no title any more.
      const titel = id ? (store.getMemory(id)?.title ?? null) : null;
      return protokolliere(store, { client, tool: e.name, text: titel, memoryId: id });
    }
    default:
      return protokolliere(store, { client, tool: e.name });
  }
}
