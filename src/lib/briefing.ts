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
  /** Notes a newer version has replaced in the window — the truth moved on. */
  superseded: { total: number; notes: (Kurz & { supersededBy: string; replacedBy?: string })[] };
  /** Notes deleted (now in the trash) inside the window. */
  deleted: { total: number; notes: Kurz[] };
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

const aufgabenCache = new WeakMap<KeptaStore, { stand: string; todos: { total: number; items: Aufgabe[] } }>();
const widerspruchCache = new WeakMap<KeptaStore, { stand: string; items: Widerspruch[] }>();

export function briefing(store: KeptaStore, opts: { seit: number; jetzt?: number; widersprueche?: Widerspruch[] }): Briefing {
  const jetzt = opts.jetzt ?? Date.now();
  const seit = opts.seit;
  const db = store.db;
  const aktivitaet = aktivitaetSeit(store, seit - 60_000);

  const vonApp = new Map<string, string>();
  for (const a of aktivitaet) if (a.tool === "memory_save" && a.memory_id) vonApp.set(a.memory_id, anzeigeName(a.client));
  const neuZahl = (db.prepare("SELECT COUNT(*) AS n FROM memories WHERE deleted_at IS NULL AND created_at > ?").get(seit) as { n: number }).n;
  const neu = db.prepare("SELECT id, title, type, created_at AS at FROM memories WHERE deleted_at IS NULL AND created_at > ? ORDER BY created_at DESC LIMIT 12").all(seit) as Zeile[];
  const quellen = new Map<string, number>();
  let appGesamt = 0;
  if (vonApp.size > 0 && neuZahl > 0) {
    const hatNotiz = db.prepare("SELECT 1 FROM memories WHERE id = ? AND deleted_at IS NULL AND created_at > ?");
    for (const [id, wer] of vonApp) {
      if (hatNotiz.get(id, seit)) {
        quellen.set(wer, (quellen.get(wer) ?? 0) + 1);
        appGesamt++;
      }
    }
  }
  const eigenZahl = Math.max(0, neuZahl - appGesamt);
  if (eigenZahl > 0) quellen.set("You & imports", eigenZahl);

  // Im „Alles“-Fenster ist jede Notiz „neu“ (created_at > 0) — eine Änderung
  // ist dort eine, die NACH der Erstellung kam, nicht eine nach dem Fensterstart.
  const alles = seit <= 0;
  const geaendertZahlFenster = alles
    ? (db.prepare("SELECT COUNT(*) AS n FROM memories WHERE deleted_at IS NULL AND superseded_by IS NULL AND updated_at > created_at + 999").get() as { n: number }).n
    : (db.prepare("SELECT COUNT(*) AS n FROM memories WHERE deleted_at IS NULL AND superseded_by IS NULL AND +created_at <= ? AND updated_at > ?").get(seit, seit) as { n: number }).n;
  const geaendertNotizen = alles
    ? (db.prepare("SELECT id, title, type, updated_at AS at FROM memories WHERE deleted_at IS NULL AND superseded_by IS NULL AND updated_at > created_at + 999 ORDER BY updated_at DESC LIMIT 12").all() as Zeile[])
    : (db
        .prepare("SELECT id, title, type, updated_at AS at FROM memories WHERE deleted_at IS NULL AND superseded_by IS NULL AND +created_at <= ? AND updated_at > ? ORDER BY updated_at DESC LIMIT 12")
        .all(seit, seit) as Zeile[]);

  // Abgeloeste: eine neuere Version hat diese Notiz ueberholt (superseded_by).
  // Geloeschte: im Fenster in den Papierkorb gewandert. „Alles“ (seit 0) ist
  // auch ein Fenster — die Filter laufen dann einfach ab dem Urknall.
  // Die Kategorien bleiben disjunkt: eine abgeloeste Notiz steht unter
  // „abgeloest“, nicht auch noch als „geaendert“ (der Abloesungs-Markierer
  // Toucht sie schliesslich).
  const fensterStart = Math.max(seit, 0);
  const abgeloestZahl = (db.prepare("SELECT COUNT(*) AS n FROM memories WHERE deleted_at IS NULL AND superseded_by IS NOT NULL AND updated_at > ?").get(fensterStart) as { n: number }).n;
  const abgeloest = db
    .prepare(
      "SELECT m.id, m.title, m.type, m.updated_at AS at, m.superseded_by AS supersededBy, s.title AS replacedBy FROM memories m LEFT JOIN memories s ON s.id = m.superseded_by WHERE m.deleted_at IS NULL AND m.superseded_by IS NOT NULL AND m.updated_at > ? ORDER BY m.updated_at DESC LIMIT 12"
    )
    .all(fensterStart) as (Zeile & { supersededBy: string; replacedBy?: string })[];
  const geloeschtZahl = (db.prepare("SELECT COUNT(*) AS n FROM memories WHERE deleted_at IS NOT NULL AND deleted_at > ?").get(fensterStart) as { n: number }).n;
  const geloescht = db
    .prepare("SELECT id, title, type, deleted_at AS at FROM memories WHERE deleted_at IS NOT NULL AND deleted_at > ? ORDER BY deleted_at DESC LIMIT 12")
    .all(fensterStart) as Zeile[];

  const TAG = 86_400_000;
  const gueltig = (von: number, bis: number) =>
    (db
      .prepare("SELECT id, title, type, updated_at AS at, valid_to AS validTo FROM memories WHERE deleted_at IS NULL AND superseded_by IS NULL AND valid_to IS NOT NULL AND valid_to > ? AND valid_to <= ? ORDER BY valid_to LIMIT 20")
      .all(von, bis) as (Zeile & { validTo: number })[]).map((z) => ({ ...kurz(z), validTo: z.validTo }));

  const todoStand = typeof store.memGeneration === "function"
    ? `gen:${store.memGeneration()}`
    : (() => {
        const todoStandZ = db
          .prepare("SELECT COUNT(*) AS n, COALESCE(MAX(updated_at), 0) AS u FROM memories WHERE deleted_at IS NULL AND superseded_by IS NULL")
          .get() as { n: number; u: number };
        return `${todoStandZ.n}:${todoStandZ.u}`;
      })();
  const gepuffert = aufgabenCache.get(store);
  let todos: { total: number; items: Aufgabe[] };
  if (gepuffert && gepuffert.stand === todoStand) {
    todos = gepuffert.todos;
  } else {
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
    todos = { total: aufgabenGesamt, items: aufgaben };
    aufgabenCache.set(store, { stand: todoStand, todos });
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

  let contradictions: Widerspruch[];
  if (opts.widersprueche !== undefined) {
    contradictions = opts.widersprueche;
  } else {
    const okRaw = store.einstellungen()[OK_SCHLUESSEL] ?? "";
    const widStand = `${todoStand}::${okRaw}`;
    const widCache = widerspruchCache.get(store);
    if (widCache && widCache.stand === widStand) {
      contradictions = widCache.items;
    } else {
      contradictions = findeWidersprueche(pruefnotizen(store), { ok: leseOk(okRaw || undefined), limit: 10 });
      widerspruchCache.set(store, { stand: widStand, items: contradictions });
    }
  }

  return {
    since: seit,
    created: {
      total: neuZahl,
      bySource: [...quellen].map(([who, count]) => ({ who, count })).sort((a, b) => b.count - a.count),
      notes: neu.map((z) => kurz(z, vonApp.get(z.id))),
    },
    changed: { total: geaendertZahlFenster, notes: geaendertNotizen.map((z) => kurz(z)) },
    superseded: { total: abgeloestZahl, notes: abgeloest.map((z) => ({ ...kurz(z), supersededBy: z.supersededBy, ...(z.replacedBy ? { replacedBy: z.replacedBy } : {}) })) },
    deleted: { total: geloeschtZahl, notes: geloescht.map((z) => kurz(z)) },
    expiring: gueltig(jetzt, jetzt + 14 * TAG),
    expired: gueltig(jetzt - 7 * TAG, jetzt),
    todos,
    contradictions,
    apps: [...apps.values()].sort((a, b) => b.calls - a.calls),
  };
}
