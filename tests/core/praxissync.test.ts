// Der Praxis-Sync lebt im npm-Paket (AGPL) — und hatte bis 26.9. keine Tests
// in diesem Repo. Der Export kappte still bei 100 Notizen (22.9.-Fund,
// 2.13.4-Fix der App, hier portiert); dieser Wächter hält die Pagination fest.
import { describe, expect, it } from "vitest";
import { tmpdir } from "node:os";
import path from "node:path";
import fs from "node:fs";
import { KeptaStore } from "../../src/core/store";
import { indexMemory } from "../../src/core/engine";
import { exportBundle, importBundle } from "../../src/core/praxissync";

function freshStore(): KeptaStore {
  return new KeptaStore(path.join(fs.mkdtempSync(path.join(tmpdir(), "kepta-core-sync-")), "test.db"));
}

describe("Praxis-Sync: der Voll-Export ist wirklich VOLL", () => {
  it("paginiert: mehr als 100 Notizen kommen GANZ in das Bundle", () => {
    // 22.9. im Notfall-Rettungslauf gefunden: ein blindes listMemories() nahm
    // die Voreinstellung von 100 — ein „Voll-Export“ war still unvollständig.
    const a = freshStore();
    for (let i = 0; i < 137; i++) {
      indexMemory(a, a.createMemory({ title: `Notiz ${i}`, content: `Inhalt ${i}`, tags: ["rettung"], type: "semantic" }).id);
    }
    const bundle = exportBundle(a, { passphrase: "kanzlei-passwort-2026", scope: "local" });
    expect(bundle.count).toBe(137);
  });

  it("Export → Import rundet vollständig ab", () => {
    const a = freshStore();
    for (let i = 0; i < 137; i++) {
      indexMemory(a, a.createMemory({ title: `Notiz ${i}`, content: `Inhalt ${i}`, type: "semantic" }).id);
    }
    const bundle = exportBundle(a, { passphrase: "rundtrip-2026", scope: "local" });
    const b = freshStore();
    const ergebnis = importBundle(b, bundle, { passphrase: "rundtrip-2026" });
    expect(ergebnis.imported).toBe(137);
    expect(b.countMemories().active).toBe(137);
  });
});
