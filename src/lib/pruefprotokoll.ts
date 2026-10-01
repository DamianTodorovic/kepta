// The audit log: who did what with your knowledge base — and proof that no
// entry was changed or removed afterwards.
//
// Every entry carries the SHA-256 of the entry before it, and a head row keeps
// count and last seal. Changing, deleting or cutting off entries breaks the
// chain, and „Check integrity“ says where. The log lives in the same encrypted
// file as the notes. The app, the MCP server of every AI app and the HTTP API
// all write to it — one after the other: an IMMEDIATE transaction holds the
// file for the moment of the append, across processes.
import crypto from "node:crypto";
import type { KeptaStore } from "../core/store";
import type { McpEreignis } from "../core/mcp";
import { anzeigeName, clientName } from "./aktivitaet";

export interface Pruefeintrag {
  id: number;
  at: number;
  actor: string;
  action: string;
  target: string | null;
  detail: string | null;
}

export const ANFANG = "0".repeat(64);

function tabelle(store: KeptaStore): void {
  store.db.exec(`
    CREATE TABLE IF NOT EXISTS audit_log (id INTEGER PRIMARY KEY AUTOINCREMENT, at INTEGER NOT NULL, actor TEXT NOT NULL, action TEXT NOT NULL, target TEXT, detail TEXT, prev TEXT NOT NULL, hash TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS audit_head (id INTEGER PRIMARY KEY CHECK (id = 1), entries INTEGER NOT NULL, hash TEXT NOT NULL);
  `);
}

function sauber(s: string, max: number): string {
  return s.replace(/[\x00-\x1f\x7f]+/g, " ").trim().slice(0, max);
}

/** The seal of one entry: the previous seal plus everything the entry says. */
export function siegel(prev: string, e: Omit<Pruefeintrag, "id">): string {
  return crypto.createHash("sha256").update(JSON.stringify([prev, e.at, e.actor, e.action, e.target, e.detail])).digest("hex");
}

/** Appends one entry. The audit log must never stop the memory — errors stay quiet. */
export function schreibe(store: KeptaStore, e: { actor: string; action: string; target?: string | null; detail?: string | null; at?: number }): void {
  try {
    tabelle(store);
    const zeile = {
      at: e.at ?? Date.now(),
      actor: sauber(e.actor, 80) || "Unknown",
      action: sauber(e.action, 40),
      target: e.target ? sauber(e.target, 300) : null,
      detail: e.detail ? sauber(e.detail, 2000) : null,
    };
    store.db
      .transaction(() => {
        const kopf = store.db.prepare("SELECT entries, hash FROM audit_head WHERE id = 1").get() as { entries: number; hash: string } | undefined;
        const prev = kopf?.hash ?? ANFANG;
        const hash = siegel(prev, zeile);
        store.db
          .prepare("INSERT INTO audit_log (at, actor, action, target, detail, prev, hash) VALUES (?, ?, ?, ?, ?, ?, ?)")
          .run(zeile.at, zeile.actor, zeile.action, zeile.target, zeile.detail, prev, hash);
        store.db
          .prepare("INSERT INTO audit_head (id, entries, hash) VALUES (1, ?, ?) ON CONFLICT(id) DO UPDATE SET entries = excluded.entries, hash = excluded.hash")
          .run((kopf?.entries ?? 0) + 1, hash);
      })
      .immediate();
  } catch {
    // nothing — see above
  }
}

export interface Filter {
  actor?: string;
  action?: string;
  /** Words in the subject or the details. */
  q?: string;
  /** Only entries older than this id — for „Load more“. */
  vor?: number;
  limit?: number;
}

function bedingung(f: Filter): { sql: string; werte: (string | number)[] } {
  const teile: string[] = [];
  const werte: (string | number)[] = [];
  if (f.actor) {
    teile.push("actor = ?");
    werte.push(f.actor);
  }
  if (f.action) {
    teile.push("action = ?");
    werte.push(f.action);
  }
  if (f.q && f.q.trim()) {
    const muster = `%${f.q.trim().slice(0, 100).replace(/[\\%_]/g, (z) => "\\" + z)}%`;
    teile.push("(target LIKE ? ESCAPE '\\' OR detail LIKE ? ESCAPE '\\')");
    werte.push(muster, muster);
  }
  if (f.vor) {
    teile.push("id < ?");
    werte.push(f.vor);
  }
  return { sql: teile.length ? `WHERE ${teile.join(" AND ")}` : "", werte };
}

/** Entries, newest first, with a flag whether older ones follow. */
export function liste(store: KeptaStore, f: Filter = {}): { entries: Pruefeintrag[]; more: boolean } {
  try {
    tabelle(store);
    const limit = Math.min(Math.max(f.limit ?? 100, 1), 500);
    const { sql, werte } = bedingung(f);
    const zeilen = store.db
      .prepare(`SELECT id, at, actor, action, target, detail FROM audit_log ${sql} ORDER BY id DESC LIMIT ?`)
      .all(...werte, limit + 1) as Pruefeintrag[];
    return { entries: zeilen.slice(0, limit), more: zeilen.length > limit };
  } catch {
    return { entries: [], more: false };
  }
}

/** Every name and every action that appears — for the filters. */
export function auswahl(store: KeptaStore): { actors: string[]; actions: string[] } {
  try {
    tabelle(store);
    const actors = (store.db.prepare("SELECT DISTINCT actor FROM audit_log ORDER BY actor").all() as { actor: string }[]).map((z) => z.actor);
    const actions = (store.db.prepare("SELECT DISTINCT action FROM audit_log ORDER BY action").all() as { action: string }[]).map((z) => z.action);
    return { actors, actions };
  } catch {
    return { actors: [], actions: [] };
  }
}

export interface Pruefung {
  ok: boolean;
  entries: number;
  /** The first entry whose seal does not fit — or null. */
  brokenAt: number | null;
  /** Entries were cut off at the end. */
  truncated: boolean;
}

/** Walks the whole chain and compares its end with the head row. */
export function pruefe(store: KeptaStore): Pruefung {
  tabelle(store);
  let prev = ANFANG;
  let n = 0;
  const zeilen = store.db.prepare("SELECT id, at, actor, action, target, detail, prev, hash FROM audit_log ORDER BY id").iterate() as Iterable<Pruefeintrag & { prev: string; hash: string }>;
  for (const z of zeilen) {
    n++;
    if (z.prev !== prev || z.hash !== siegel(z.prev, z)) return { ok: false, entries: n, brokenAt: z.id, truncated: false };
    prev = z.hash;
  }
  const kopf = store.db.prepare("SELECT entries, hash FROM audit_head WHERE id = 1").get() as { entries: number; hash: string } | undefined;
  const erwartet = kopf ?? { entries: 0, hash: ANFANG };
  if (erwartet.entries !== n || erwartet.hash !== prev) return { ok: false, entries: n, brokenAt: null, truncated: true };
  return { ok: true, entries: n, brokenAt: null, truncated: false };
}

function zelle(v: string | number | null): string {
  let s = v === null ? "" : String(v);
  // A cell that starts like a formula would run in a spreadsheet.
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** The log as CSV — oldest first, the way an auditor reads it. */
export function alsCsv(store: KeptaStore, f: Filter = {}): string {
  tabelle(store);
  const { sql, werte } = bedingung({ ...f, vor: undefined });
  const zeilen = store.db.prepare(`SELECT id, at, actor, action, target, detail, hash FROM audit_log ${sql} ORDER BY id LIMIT 200000`).all(...werte) as (Pruefeintrag & { hash: string })[];
  const kopf = "entry,time (UTC),who,action,subject,details,seal";
  return [kopf, ...zeilen.map((z) => [z.id, new Date(z.at).toISOString(), z.actor, z.action, z.target, z.detail, z.hash].map(zelle).join(","))].join("\n") + "\n";
}

/** Which AI apps read a note, how often and when last — from searches and lists. */
export function gelesenVon(store: KeptaStore, id: string): { who: string; times: number; last: number }[] {
  try {
    tabelle(store);
    return store.db
      .prepare("SELECT actor AS who, COUNT(*) AS times, MAX(at) AS last FROM audit_log WHERE action IN ('search', 'list') AND instr(detail, ?) > 0 GROUP BY actor ORDER BY last DESC")
      .all(`${id} `) as { who: string; times: number; last: number }[];
  } catch {
    return [];
  }
}

type Notiz = { id?: unknown; title?: unknown };
const istNotiz = (x: unknown): x is Notiz => !!x && typeof x === "object";

function notizListe(xs: unknown): { n: number; text: string } {
  if (!Array.isArray(xs)) return { n: 0, text: "" };
  const notizen = xs.filter(istNotiz);
  return { n: notizen.length, text: notizen.slice(0, 25).map((m) => `${String(m.id)} ${String(m.title ?? "")}`).join("; ") };
}

/** What an AI app did over MCP, as an audit entry — with exactly the notes it got to see. */
export function protokolliereMcp(store: KeptaStore, e: McpEreignis): void {
  const actor = anzeigeName(clientName(e.client));
  if (e.art === "verbunden") return schreibe(store, { actor, action: "connect" });
  if (e.ergebnis.isError) return;
  const s = e.ergebnis.structuredContent ?? {};
  switch (e.name) {
    case "memory_search": {
      const l = notizListe(s.hits);
      return schreibe(store, { actor, action: "search", target: String(e.args.query ?? ""), detail: `${l.n} ${l.n === 1 ? "note" : "notes"}${l.n ? `: ${l.text}` : ""}` });
    }
    case "memory_list": {
      const l = notizListe(s.memories);
      return schreibe(store, { actor, action: "list", target: `${l.n} ${l.n === 1 ? "note" : "notes"}`, detail: l.text || null });
    }
    case "memory_save":
    case "memory_update": {
      const m = s.memory;
      if (!istNotiz(m) || typeof m.id !== "string") return;
      const action = e.name === "memory_update" || s.created === false ? "update" : "save";
      return schreibe(store, { actor, action, target: String(m.title ?? ""), detail: m.id });
    }
    case "memory_delete":
    case "memory_forget": {
      const id = typeof e.args.id === "string" ? e.args.id : "";
      const titel = id ? store.getMemory(id)?.title : undefined;
      const action = e.name === "memory_forget" ? "forget" : s.purged ? "delete permanently" : "delete";
      return schreibe(store, { actor, action, target: titel ?? id, detail: id || null });
    }
    case "memory_graph":
      return schreibe(store, { actor, action: "graph", target: e.args.entity ? String(e.args.entity) : "everything" });
    case "memory_consolidate":
      return schreibe(store, { actor, action: "consolidate", detail: s.applied ? "applied" : "preview only" });
    default:
      return schreibe(store, { actor, action: e.name });
  }
}
