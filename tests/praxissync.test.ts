// F4 — Praxis-Sync MVP: E2E-verschlüsselter Geräteabgleich (mandantentrennt)
// mit Paketmitschnitt (verkettete Hash-Kette als Beweis, was wann übertragen wurde).
import { describe, it, expect } from "vitest";
import { tmpdir } from "node:os";
import path from "node:path";
import fs from "node:fs";
import { KeptaStore } from "../src/core/store";
import { indexMemory } from "../src/core/engine";
import { exportBundle, importBundle, PraxissyncJournal, verifyJournal, type SyncBundle } from "../src/core/praxissync";

function freshStore(): KeptaStore {
  const dir = fs.mkdtempSync(path.join(tmpdir(), "kepta-sync-"));
  return new KeptaStore(path.join(dir, "t.db"));
}

function freshJournalFile(): string {
  return path.join(fs.mkdtempSync(path.join(tmpdir(), "kepta-syncj-")), "sync-journal.jsonl");
}

describe("F4 — Praxis-Sync MVP", () => {
  it("Export → Import rundet vollständig, mandantentrennt und idempotent ab", () => {
    const a = freshStore();
    const m1 = a.createMemory({ id: "m1", title: "Mandat Mueller", content: "Beratungsvertrag analysiert", scope: "mandant-mueller" });
    const m2 = a.createMemory({ id: "m2", title: "Mandat Mueller Fristen", content: "Frist notiert", scope: "mandant-mueller", tags: ["frist"] });
    a.createMemory({ id: "m3", title: "Privat", content: "anderer Mandant", scope: "user:damian" });
    indexMemory(a, m1.id);
    indexMemory(a, m2.id);

    const journal = new PraxissyncJournal(freshJournalFile());
    const bundle = exportBundle(a, { passphrase: "streng-geheim", scope: "mandant-mueller", sender: "Kanzlei-PC", journal });
    expect(bundle.format).toBe("kepta-praxissync");
    expect(bundle.version).toBe(1);
    expect(bundle.count).toBe(2); // m3 (anderer Scope) bleibt draußen

    const b = freshStore();
    const res = importBundle(b, bundle, { passphrase: "streng-geheim", peer: "Homeoffice-PC", journal });
    expect(res.imported).toBe(2);
    expect(res.skipped).toBe(0);
    expect(b.getMemory("m1")?.title).toBe("Mandat Mueller");
    expect(b.getMemory("m1")?.content).toBe("Beratungsvertrag analysiert");
    expect(b.getMemory("m2")?.tags).toEqual(["frist"]);
    expect(b.getMemory("m3")).toBeNull(); // Mandantentrennung überlebt die Reise
    expect(b.countMemories().active).toBe(2);

    const res2 = importBundle(b, bundle, { passphrase: "streng-geheim", peer: "Homeoffice-PC", journal });
    expect(res2.imported).toBe(0);
    expect(res2.skipped).toBe(2);
    expect(b.countMemories().active).toBe(2); // kein Duplikat beim Zweitimport
  });

  it("Bundle ist E2E-verschlüsselt: Klartext taucht nicht auf, falsche Passphrase und Manipulation fliegen auf", () => {
    const a = freshStore();
    const m = a.createMemory({ id: "s1", title: "Streng vertraulich", content: "Diagnose-Schlüsselwort", scope: "mandant-x" });
    indexMemory(a, m.id);
    const bundle = exportBundle(a, { passphrase: "pw", scope: "mandant-x" });

    const raw = JSON.stringify(bundle);
    expect(raw).not.toContain("Diagnose-Schlüsselwort");
    expect(raw).not.toContain("Streng vertraulich");

    const b = freshStore();
    expect(() => importBundle(b, bundle, { passphrase: "falsch" })).toThrow(/entschlüsselt/);
    // Paketmitschnitt-Beweis: eine veränderte Nutzlast wird erkannt
    const manipuliert = { ...bundle, payloadHash: "0".repeat(64) };
    expect(() => importBundle(b, manipuliert, { passphrase: "pw" })).toThrow(/Mitschnitt|manipuliert/i);
    // unbekanntes Format wird abgewiesen
    expect(() => importBundle(b, { ...bundle, format: "andere-app" } as unknown as SyncBundle, { passphrase: "pw" })).toThrow(/Format/);
  });

  it("Mitschnitt-Kette: jede Zeile verkettet den Vorgänger, Manipulation wird sichtbar", () => {
    const file = freshJournalFile();
    const journal = new PraxissyncJournal(file);
    const e1 = journal.record({ direction: "export", peer: "Kanzlei-PC", scope: "mandant-x", count: 3, payloadHash: "abc" });
    const e2 = journal.record({ direction: "import", peer: "Homeoffice-PC", scope: "mandant-x", count: 3, payloadHash: "abc" });

    expect(e2.seq).toBe(2);
    expect(e2.prevHash).toBe(e1.hash);
    expect(verifyJournal(journal.entries())).toBe(true);

    // Der Mitschnitt liest sich nach Neustart aus der Datei fort (Beweis ist lokal persistent)
    const wieder = new PraxissyncJournal(file);
    const e3 = wieder.record({ direction: "export", peer: "Kanzlei-PC", scope: "mandant-y", count: 1, payloadHash: "fff" });
    expect(e3.seq).toBe(3);
    expect(e3.prevHash).toBe(e2.hash);

    // Manipulation: ein nachträglicher Edit bricht die Kette sichtbar
    const entries = journal.entries();
    entries[1]!.at = "1999-01-01T00:00:00.000Z";
    expect(verifyJournal(entries)).toBe(false);
  });

  it("Mitschnitt dokumentiert Export und Import des echten Rundecks", () => {
    const journal = new PraxissyncJournal(freshJournalFile());
    const a = freshStore();
    const m = a.createMemory({ id: "j1", title: "Journal", content: "x", scope: "mandant-j" });
    indexMemory(a, m.id);
    const bundle = exportBundle(a, { passphrase: "pw", scope: "mandant-j", sender: "Gerät-A", journal });
    const b = freshStore();
    importBundle(b, bundle, { passphrase: "pw", peer: "Gerät-B", journal });

    const entries = journal.entries();
    expect(entries).toHaveLength(2);
    expect(entries[0]!.direction).toBe("export");
    expect(entries[0]!.peer).toBe("Gerät-A");
    expect(entries[1]!.direction).toBe("import");
    expect(entries[1]!.peer).toBe("Gerät-B");
    expect(entries[1]!.payloadHash).toBe(entries[0]!.payloadHash); // dasselbe Paket, beide Seiten im Mitschnitt
    expect(verifyJournal(entries)).toBe(true);
  });
});
