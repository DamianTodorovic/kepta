// @vitest-environment node
//
// Das Prüfprotokoll: wer was mit der Wissensbasis gemacht hat — versiegelt.
// Jede Änderung, jedes Löschen und jedes Abschneiden fällt auf; zwei Prozesse
// schreiben in dieselbe Kette, ohne sie zu zerbrechen.
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { KeptaStore } from "../../src/core/store";
import { schreibe, liste, pruefe, alsCsv, auswahl, gelesenVon, protokolliereMcp } from "../../src/lib/pruefprotokoll";

let store: KeptaStore;
const neu = () => new KeptaStore(path.join(fs.mkdtempSync(path.join(os.tmpdir(), "kepta-audit-")), "t.db"));
beforeEach(() => {
  store = neu();
});
afterEach(() => store.close());

describe("Prüfprotokoll", () => {
  it("hängt Einträge versiegelt an und listet sie neueste zuerst, mit Filtern", () => {
    schreibe(store, { actor: "You", action: "save", target: "Backup plan", detail: "k-1", at: 1000 });
    schreibe(store, { actor: "Claude", action: "search", target: "backup", detail: "1 note: k-1 Backup plan", at: 2000 });
    schreibe(store, { actor: "Cursor", action: "search", target: "deploy", detail: "0 notes", at: 3000 });
    const alle = liste(store);
    expect(alle.entries.map((e) => e.actor)).toEqual(["Cursor", "Claude", "You"]);
    expect(alle.more).toBe(false);
    expect(liste(store, { actor: "Claude" }).entries).toHaveLength(1);
    expect(liste(store, { action: "search" }).entries).toHaveLength(2);
    expect(liste(store, { q: "backup" }).entries.map((e) => e.actor)).toEqual(["Claude", "You"]);
    expect(liste(store, { q: "50%_" }).entries).toEqual([]);
    const seite = liste(store, { limit: 2 });
    expect(seite.more).toBe(true);
    expect(liste(store, { vor: seite.entries[1]!.id }).entries.map((e) => e.actor)).toEqual(["You"]);
    expect(auswahl(store)).toEqual({ actors: ["Claude", "Cursor", "You"], actions: ["save", "search"] });
    expect(pruefe(store)).toEqual({ ok: true, entries: 3, brokenAt: null, truncated: false });
  });

  it("merkt jede Änderung und jedes Löschen — und zeigt, wo", () => {
    for (let i = 0; i < 5; i++) schreibe(store, { actor: "You", action: "save", target: `N${i}`, at: i });
    store.db.prepare("UPDATE audit_log SET target = 'gefälscht' WHERE id = 3").run();
    expect(pruefe(store)).toMatchObject({ ok: false, brokenAt: 3 });
    store.db.prepare("UPDATE audit_log SET target = 'N2' WHERE id = 3").run();
    expect(pruefe(store).ok).toBe(true);
    store.db.prepare("DELETE FROM audit_log WHERE id = 2").run();
    expect(pruefe(store)).toMatchObject({ ok: false, brokenAt: 3 });
  });

  it("merkt auch, wenn am Ende Einträge fehlen", () => {
    for (let i = 0; i < 3; i++) schreibe(store, { actor: "You", action: "save", at: i });
    store.db.prepare("DELETE FROM audit_log WHERE id = 3").run();
    expect(pruefe(store)).toEqual({ ok: false, entries: 2, brokenAt: null, truncated: true });
  });

  it("ein leeres Protokoll ist intakt", () => {
    expect(pruefe(store)).toEqual({ ok: true, entries: 0, brokenAt: null, truncated: false });
    expect(liste(store)).toEqual({ entries: [], more: false });
  });

  it("zwei Prozesse schreiben abwechselnd in dieselbe Kette", () => {
    const zweiter = new KeptaStore(store.dbPath);
    try {
      for (let i = 0; i < 20; i++) schreibe(i % 2 ? zweiter : store, { actor: i % 2 ? "Claude" : "You", action: "save", at: i });
      expect(pruefe(store)).toMatchObject({ ok: true, entries: 20 });
    } finally {
      zweiter.close();
    }
  });

  it("CSV: älteste zuerst, sicher gegen Formeln in Tabellenprogrammen", () => {
    schreibe(store, { actor: "You", action: "save", target: '=HYPERLINK("x")', detail: "a, b", at: Date.UTC(2026, 8, 14, 8, 0) });
    schreibe(store, { actor: "Claude", action: "search", target: "tax\nreturn", at: Date.UTC(2026, 8, 14, 9, 0) });
    const csv = alsCsv(store).split("\n");
    expect(csv[0]).toBe("entry,time (UTC),who,action,subject,details,seal");
    expect(csv[1]).toMatch(/^1,2026-09-14T08:00:00\.000Z,You,save,"'=HYPERLINK\(""x""\)","a, b",[0-9a-f]{64}$/);
    expect(csv[2]).toMatch(/^2,2026-09-14T09:00:00\.000Z,Claude,search,tax return,,[0-9a-f]{64}$/);
    expect(alsCsv(store, { actor: "Claude" }).trim().split("\n")).toHaveLength(2);
  });

  it("weiß, welche KI-App eine Notiz gelesen hat", () => {
    schreibe(store, { actor: "Claude", action: "search", target: "x", detail: "2 notes: k-1 A; k-10 B", at: 1 });
    schreibe(store, { actor: "Claude", action: "list", target: "1 note", detail: "k-1 A", at: 5 });
    schreibe(store, { actor: "Cursor", action: "search", target: "y", detail: "1 note: k-10 B", at: 3 });
    expect(gelesenVon(store, "k-1")).toEqual([{ who: "Claude", times: 2, last: 5 }]);
    expect(gelesenVon(store, "k-10").map((z) => z.who).sort()).toEqual(["Claude", "Cursor"]);
  });

  it("MCP: was die App gesehen hat, unter ihrem lesbaren Namen", () => {
    protokolliereMcp(store, { art: "verbunden", client: { name: "claude-ai" } });
    protokolliereMcp(store, { art: "werkzeug", client: { name: "claude-ai" }, name: "memory_search", args: { query: "backup" }, ergebnis: { structuredContent: { hits: [{ id: "k-1", title: "Backup plan" }] } } });
    protokolliereMcp(store, { art: "werkzeug", client: { name: "cursor-vscode" }, name: "memory_save", args: {}, ergebnis: { structuredContent: { created: true, memory: { id: "k-2", title: "Deploy" } } } });
    protokolliereMcp(store, { art: "werkzeug", client: undefined, name: "memory_delete", args: { id: "k-9" }, ergebnis: { structuredContent: { purged: true } } });
    protokolliereMcp(store, { art: "werkzeug", client: { name: "x" }, name: "memory_save", args: {}, ergebnis: { isError: true } });
    protokolliereMcp(store, { art: "werkzeug", client: { name: "x" }, name: "memory_save", args: {}, ergebnis: { structuredContent: { memory: null } } });
    protokolliereMcp(store, { art: "werkzeug", client: { name: "x" }, name: "memory_graph", args: {}, ergebnis: { structuredContent: {} } });
    protokolliereMcp(store, { art: "werkzeug", client: { name: "x" }, name: "memory_list", args: {}, ergebnis: { structuredContent: { memories: [] } } });
    protokolliereMcp(store, { art: "werkzeug", client: { name: "x" }, name: "memory_consolidate", args: {}, ergebnis: { structuredContent: { applied: 0 } } });
    protokolliereMcp(store, { art: "werkzeug", client: { name: "x" }, name: "memory_forget", args: { id: "k-2" }, ergebnis: { structuredContent: {} } });
    protokolliereMcp(store, { art: "werkzeug", client: { name: "x" }, name: "tools_other", args: {}, ergebnis: { structuredContent: {} } });
    expect(
      liste(store)
        .entries.reverse()
        .map((e) => [e.actor, e.action, e.target, e.detail])
    ).toEqual([
      ["Claude", "connect", null, null],
      ["Claude", "search", "backup", "1 note: k-1 Backup plan"],
      ["Cursor", "save", "Deploy", "k-2"],
      ["An MCP client", "delete permanently", "k-9", "k-9"],
      ["x", "graph", "everything", null],
      ["x", "list", "0 notes", null],
      ["x", "consolidate", null, "preview only"],
      ["x", "forget", "k-2", "k-2"],
      ["x", "tools_other", null, null],
    ]);
  });

  it("bleibt still, wenn die Datenbank nicht mehr offen ist", () => {
    store.close();
    expect(() => schreibe(store, { actor: "You", action: "save" })).not.toThrow();
    expect(liste(store)).toEqual({ entries: [], more: false });
    expect(auswahl(store)).toEqual({ actors: [], actions: [] });
    expect(gelesenVon(store, "k-1")).toEqual([]);
    store = neu();
  });
});
