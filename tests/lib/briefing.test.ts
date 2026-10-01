// @vitest-environment node
//
// „Today“: was seit dem letzten Besuch neu ist und von wem, was sich geändert
// hat, was abläuft, welche To-dos offen sind und wo Notizen sich widersprechen.
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { KeptaStore } from "../../src/core/store";
import { briefing, offeneAufgaben, leseOk, merkeOk, OK_SCHLUESSEL, pruefnotizen } from "../../src/lib/briefing";
import { protokolliere } from "../../src/lib/aktivitaet";

let store: KeptaStore;
const TAG = 86_400_000;
const JETZT = Date.UTC(2026, 8, 14, 8);
const SEIT = JETZT - TAG;

beforeEach(() => {
  store = new KeptaStore(path.join(fs.mkdtempSync(path.join(os.tmpdir(), "kepta-briefing-")), "t.db"));
});
afterEach(() => store.close());

describe("Today", () => {
  it("zeigt, was seit dem letzten Besuch neu ist — und welche KI-App es gespeichert hat", () => {
    store.createMemory({ title: "Alt", content: "x", createdAt: SEIT - 5000, updatedAt: SEIT - 5000 });
    const vonClaude = store.createMemory({ title: "Prefers short answers", content: "y", createdAt: SEIT + 1000, updatedAt: SEIT + 1000 });
    store.createMemory({ title: "My note", content: "z", createdAt: SEIT + 2000, updatedAt: SEIT + 2000 });
    protokolliere(store, { client: "claude-ai", tool: "memory_save", memoryId: vonClaude.id, text: "Prefers short answers", at: SEIT + 1000 });
    protokolliere(store, { client: "cursor-vscode", tool: "memory_search", text: "deploy", at: SEIT + 3000 });
    const b = briefing(store, { seit: SEIT, jetzt: JETZT });
    expect(b.since).toBe(SEIT);
    expect(b.created.total).toBe(2);
    expect(b.created.bySource).toHaveLength(2);
    expect(b.created.bySource).toEqual(expect.arrayContaining([{ who: "Claude", count: 1 }, { who: "You & imports", count: 1 }]));
    expect(b.created.notes.map((x) => [x.title, x.by])).toEqual([["My note", undefined], ["Prefers short answers", "Claude"]]);
    expect(b.apps).toEqual([{ who: "Claude", calls: 1, saves: 1, searches: 0 }, { who: "Cursor", calls: 1, saves: 0, searches: 1 }]);
  });

  it("geändert, läuft bald ab, gerade abgelaufen", () => {
    store.createMemory({ title: "Changed", content: "x", createdAt: SEIT - TAG, updatedAt: SEIT + 10 });
    store.createMemory({ title: "Expires", content: "x", validTo: JETZT + 3 * TAG, createdAt: SEIT - TAG, updatedAt: SEIT - TAG });
    store.createMemory({ title: "Expired", content: "x", validTo: JETZT - 2 * TAG, createdAt: SEIT - 9 * TAG, updatedAt: SEIT - 9 * TAG });
    store.createMemory({ title: "Long ago", content: "x", validTo: JETZT - 30 * TAG, createdAt: SEIT - 60 * TAG, updatedAt: SEIT - 60 * TAG });
    const b = briefing(store, { seit: SEIT, jetzt: JETZT });
    expect(b.changed).toEqual({ total: 1, notes: [expect.objectContaining({ title: "Changed" })] });
    expect(b.expiring.map((x) => x.title)).toEqual(["Expires"]);
    expect(b.expired.map((x) => [x.title, x.validTo])).toEqual([["Expired", JETZT - 2 * TAG]]);
  });

  it("sammelt die offenen To-dos aus allen Notizen", () => {
    const plan = store.createMemory({ title: "Plan", content: "- [x] done\n- [ ] Call the bank about [[Lumen]]\n  - [ ] **send** the offer\n- [ ] " });
    expect(briefing(store, { seit: SEIT, jetzt: JETZT }).todos).toEqual({
      total: 2,
      items: [
        { id: plan.id, title: "Plan", text: "Call the bank about Lumen" },
        { id: plan.id, title: "Plan", text: "send the offer" },
      ],
    });
    expect(offeneAufgaben("* [ ] a\n+ [ ] b\n- [X] c\n- [ ] [[Ziel|Alias]]")).toEqual(["a", "b", "Alias"]);
  });

  it("zeigt Widersprüche — und merkt sich „beides stimmt“", () => {
    store.createMemory({ title: "Backup A", content: "Backups run nightly at 02:00.", type: "semantic", updatedAt: 1 });
    store.createMemory({ title: "Backup B", content: "Backups now run nightly at 03:00.", type: "semantic", updatedAt: 2 });
    const b = briefing(store, { seit: SEIT, jetzt: JETZT });
    expect(b.contradictions.map((w) => [w.newer.title, w.older.title])).toEqual([["Backup B", "Backup A"]]);
    merkeOk(store, b.contradictions[0]!.key);
    merkeOk(store, b.contradictions[0]!.key);
    expect(briefing(store, { seit: SEIT, jetzt: JETZT }).contradictions).toEqual([]);
    expect(leseOk(store.einstellungen()[OK_SCHLUESSEL]).size).toBe(1);
    expect(leseOk("kaputt").size).toBe(0);
    expect(leseOk('{"x":1}').size).toBe(0);
    expect(pruefnotizen(store).map((p) => p.title).sort()).toEqual(["Backup A", "Backup B"]);
  });

  it("ein leerer Bestand ergibt ein leeres Briefing — ohne dass je eine KI-App verbunden war", () => {
    expect(briefing(store, { seit: 0 })).toMatchObject({
      created: { total: 0, bySource: [], notes: [] },
      changed: { total: 0, notes: [] },
      expiring: [],
      expired: [],
      todos: { total: 0, items: [] },
      contradictions: [],
      apps: [],
    });
  });
});
