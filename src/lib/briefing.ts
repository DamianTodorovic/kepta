// „Today“: what happened since your last visit, what needs a look, what is due.
//
// Everything here is read straight from the local database — no AI involved,
// nothing leaves the computer, and it is ready the moment the app opens.
import type { KeptaStore } from "../core/store";
import { findeWidersprueche, type Pruefnotiz, type Widerspruch } from "./widersprueche";
import { anzeigeName } from "./aktivitaet";

export interface Kurz {
  id: string;
  title: string;
  type: string;
  at: number;
  /** The AI app that saved it — missing for notes you wrote or imported. */
  by?: string;
}

export interface Aufgabe {
  id: string;
  title: string;
  text: string;
}

export interface Briefing {
  since: number;
  created: { total: number; bySource: { who: string; count: number }[]; notes: Kurz[] };
  changed: { total: number; notes: Kurz[] };
  expiring: (Kurz & { validTo: number })[];
  expired: (Kurz & { validTo: number })[];
  todos: { total: number; items: Aufgabe[] };
  contradictions: Widerspruch[];
  apps: { who: string; calls: number; saves: number; searches: number }[];
}

/** Pairs marked „both are right“ — they never come back. */
// Server-owned: no „kepta_“ prefix, so the browser-storage mirror never touches it.
export const OK_SCHLUESSEL = "contradictions_ok";

export function leseOk(roh: string | null | undefined): Set<string> {
  try {
    const j = roh ? (JSON.parse(roh) as unknown) : [];
    return new Set(Array.isArray(j) ? j.filter((x): x is string => typeof x === "string") : []);
  } catch {
    return new Set();
  }
}

export function merkeOk(store: KeptaStore, key: string): void {
  const alle = leseOk(store.einstellungen()[OK_SCHLUESSEL]);
  alle.add(key);
  store.setzeEinstellungen({ [OK_SCHLUESSEL]: JSON.stringify([...alle].slice(-2000)) });
}

/** Unchecked task-list items („- [ ] call the bank“) — the note's open to-dos. */
export function offeneAufgaben(content: string): string[] {
  const aus: string[] = [];
  for (const m of content.matchAll(/^[ \t]*[-*+][ \t]+\[ \][ \t]+(.+?)[ \t]*$/gm)) {
    const text = m[1]!.replace(/\[\[([^\]|]+)(?:\|([^\]]*))?\]\]/g, (_, ziel: string, alias?: string) => alias || ziel).replace(/[*_`]+/g, "").trim();
    if (text) aus.push(text.slice(0, 200));
  }
  return aus;
}

/** Facts and how-tos that are still current — what contradictions are looked for in. */
export function pruefnotizen(store: KeptaStore, limit = 20_000): Pruefnotiz[] {
  const zeilen = store.db
    .prepare(
      "SELECT id, title, content, type, updated_at AS updatedAt FROM memories WHERE deleted_at IS NULL AND superseded_by IS NULL AND type IN ('semantic', 'procedural') ORDER BY updated_at DESC LIMIT ?"
    )
    .all(limit) as Pruefnotiz[];
  return zeilen;
}

type Zeile = { id: string; title: string; type: string; at: number };
const kurz = (z: Zeile, by?: string): Kurz => ({ id: z.id, title: z.title, type: z.type, at: z.at, ...(by ? { by } : {}) });

function aktivitaetSeit(store: KeptaStore, seit: number): { client: string; tool: string; memory_id: string | null }[] {
  try {
    return store.db.prepare("SELECT client, tool, memory_id FROM agent_activity WHERE at > ?").all(seit) as { client: string; tool: string; memory_id: string | null }[];
  } catch {
    return []; // no AI app has ever connected
  }
}

export function briefing(store: KeptaStore, opts: { seit: number; jetzt?: number; widersprueche?: Widerspruch[] }): Briefing {
  const jetzt = opts.jetzt ?? Date.now();
  const seit = opts.seit;
  const db = store.db;
  const aktivitaet = aktivitaetSeit(store, seit - 60_000);

  const vonApp = new Map<string, string>();
  for (const a of aktivitaet) if (a.tool === "memory_save" && a.memory_id) vonApp.set(a.memory_id, anzeigeName(a.client));
  const neu = db.prepare("SELECT id, title, type, created_at AS at FROM memories WHERE deleted_at IS NULL AND created_at > ? ORDER BY created_at DESC").all(seit) as Zeile[];
  const quellen = new Map<string, number>();
  for (const z of neu) {
    const wer = vonApp.get(z.id) ?? "You & imports";
    quellen.set(wer, (quellen.get(wer) ?? 0) + 1);
  }

  const geaendertZahl = (db.prepare("SELECT COUNT(*) AS n FROM memories WHERE deleted_at IS NULL AND created_at <= ? AND updated_at > ?").get(seit, seit) as { n: number }).n;
  const geaendert = db
    .prepare("SELECT id, title, type, updated_at AS at FROM memories WHERE deleted_at IS NULL AND created_at <= ? AND updated_at > ? ORDER BY updated_at DESC LIMIT 12")
    .all(seit, seit) as Zeile[];

  const TAG = 86_400_000;
  const gueltig = (von: number, bis: number) =>
    (db
      .prepare("SELECT id, title, type, updated_at AS at, valid_to AS validTo FROM memories WHERE deleted_at IS NULL AND superseded_by IS NULL AND valid_to > ? AND valid_to <= ? ORDER BY valid_to LIMIT 20")
      .all(von, bis) as (Zeile & { validTo: number })[]).map((z) => ({ ...kurz(z), validTo: z.validTo }));

  const mitAufgaben = db
    .prepare("SELECT id, title, content FROM memories WHERE deleted_at IS NULL AND superseded_by IS NULL AND content LIKE '%[ ]%' ORDER BY updated_at DESC LIMIT 500")
    .all() as { id: string; title: string; content: string }[];
  const aufgaben: Aufgabe[] = [];
  let aufgabenGesamt = 0;
  for (const n of mitAufgaben) {
    for (const text of offeneAufgaben(n.content)) {
      aufgabenGesamt++;
      if (aufgaben.length < 30) aufgaben.push({ id: n.id, title: n.title, text });
    }
  }

  const apps = new Map<string, { who: string; calls: number; saves: number; searches: number }>();
  for (const a of aktivitaet) {
    const who = anzeigeName(a.client);
    const s = apps.get(who) ?? { who, calls: 0, saves: 0, searches: 0 };
    s.calls++;
    if (a.tool === "memory_save" || a.tool === "memory_update") s.saves++;
    if (a.tool === "memory_search") s.searches++;
    apps.set(who, s);
  }

  return {
    since: seit,
    created: {
      total: neu.length,
      bySource: [...quellen].map(([who, count]) => ({ who, count })).sort((a, b) => b.count - a.count),
      notes: neu.slice(0, 12).map((z) => kurz(z, vonApp.get(z.id))),
    },
    changed: { total: geaendertZahl, notes: geaendert.map((z) => kurz(z)) },
    expiring: gueltig(jetzt, jetzt + 14 * TAG),
    expired: gueltig(jetzt - 7 * TAG, jetzt),
    todos: { total: aufgabenGesamt, items: aufgaben },
    contradictions:
      opts.widersprueche ?? findeWidersprueche(pruefnotizen(store), { ok: leseOk(store.einstellungen()[OK_SCHLUESSEL]), limit: 10 }),
    apps: [...apps.values()].sort((a, b) => b.calls - a.calls),
  };
}
