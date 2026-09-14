// Was die Agenten gerade tun — sichtbar in der Oberfläche von KEPTA Core.
//
// Claude Desktop, Cursor und Co. starten den MCP-Server als eigenen Prozess;
// die Oberfläche läuft als anderer. Gemeinsam haben beide nur die
// verschlüsselte Datenbank — also steht die Aktivität dort: eine kleine
// Tabelle mit den letzten Werkzeugaufrufen, wer sie gemacht hat und woran.
// Sie bleibt in derselben verschlüsselten Datei, nichts verlässt den Rechner,
// und mehr als die letzten 500 Einträge werden nicht aufbewahrt.
import type { KeptaStore } from "./core/store";
import type { McpEreignis } from "./core/mcp";

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

/** Der Name, den ein Client beim Verbinden nennt — gekürzt und ohne Steuerzeichen. */
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
  [/cline/i, "Cline"],
  [/goose/i, "Goose"],
  [/lm ?studio/i, "LM Studio"],
  [/chatgpt|openai/i, "ChatGPT"],
];

/** „claude-ai“ → „Claude“, „cursor-vscode“ → „Cursor“; Unbekanntes bleibt, wie es kam. */
export function anzeigeName(client: string): string {
  for (const [muster, name] of BEKANNT) if (muster.test(client)) return name;
  return client;
}

/** Schreibt einen Eintrag. Die Aktivität darf das Gedächtnis nie aufhalten — Fehler bleiben still. */
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
    // die Aktivität ist eine Anzeige, kein Teil des Gedächtnisses
  }
}

/** Die neuesten Einträge nach der id `nach`, neueste zuerst. */
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

/** Wer zuletzt da war: je Client der jüngste Eintrag und die Zahl der Aufrufe. */
export function agenten(store: KeptaStore): { client: string; lastSeen: number; calls: number }[] {
  try {
    tabelle(store);
    return store.db
      .prepare("SELECT client, MAX(at) AS lastSeen, COUNT(*) AS calls FROM agent_activity GROUP BY client ORDER BY lastSeen DESC LIMIT 20")
      .all() as { client: string; lastSeen: number; calls: number }[];
  } catch {
    return [];
  }
}

/** Macht aus einem Ereignis des MCP-Servers einen Eintrag. */
export function protokolliereEreignis(store: KeptaStore, e: McpEreignis): void {
  const client = clientName(e.client);
  if (e.art === "verbunden") return protokolliere(store, { client, tool: "connect" });
  if (e.ergebnis.isError) return;
  const s = e.ergebnis.structuredContent ?? {};
  const memory = (s.memory ?? null) as { id?: unknown; title?: unknown } | null;
  switch (e.name) {
    case "memory_search":
      return protokolliere(store, { client, tool: e.name, text: String(e.args.query ?? ""), count: typeof s.count === "number" ? s.count : null });
    case "memory_save":
    case "memory_update": {
      if (!memory || typeof memory.id !== "string") return;
      const tool = e.name === "memory_save" && s.created === false ? "memory_update" : e.name;
      return protokolliere(store, { client, tool, text: typeof memory.title === "string" ? memory.title : null, memoryId: memory.id });
    }
    case "memory_delete":
    case "memory_forget": {
      const id = typeof e.args.id === "string" ? e.args.id : null;
      // Im Papierkorb ist die Notiz noch lesbar — endgültig Gelöschtes hat keinen Titel mehr.
      const titel = id ? (store.getMemory(id)?.title ?? null) : null;
      return protokolliere(store, { client, tool: e.name, text: titel, memoryId: id });
    }
    default:
      return protokolliere(store, { client, tool: e.name });
  }
}
