// F4 — Praxis-Sync MVP: E2E-verschlüsselter Geräteabgleich (mandantentrennt)
// mit Paketmitschnitt (verkettete Hash-Kette als Beweis, was wann übertragen wurde).
import { describe, it, expect } from "vitest";
import { tmpdir } from "node:os";
import path from "node:path";
import fs from "node:fs";
import { KeptaStore } from "../src/core/store";
import { indexMemory } from "../src/core/engine";
import crypto from "node:crypto";
import {
  exportBundle,
  importBundle,
  PraxissyncJournal,
  verifyJournal,
  MIN_PASSPHRASE_LENGTH,
  PRAXISSYNC_FORMAT,
  PRAXISSYNC_VERSION,
  type SyncBundle,
} from "../src/core/praxissync";

/**
 * Baut ein Bundle so, wie 2.6.16 es geschrieben hat: scrypt mit N = 2^14 und
 * ohne kdf-Feld. Damit wird geprueft, dass bereits verschickte Pakete nach der
 * Anhebung des Kostenparameters lesbar bleiben.
 */
function exportBundleMitAltemKdf(store: KeptaStore, passphrase: string, scope = "local"): SyncBundle {
  const records = store.listMemories().filter((m) => m.scope === scope && !m.supersededBy && m.deletedAt === null);
  const payload = JSON.stringify({ memories: records });
  const salt = crypto.randomBytes(16);
  const iv = crypto.randomBytes(12);
  const key = crypto.scryptSync(passphrase, salt, 32, { N: 16384, r: 8, p: 1 });
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(payload, "utf-8"), cipher.final()]);
  return {
    format: PRAXISSYNC_FORMAT,
    version: PRAXISSYNC_VERSION,
    createdAt: new Date().toISOString(),
    scope,
    sender: "kepta-2.6.16",
    count: records.length,
    payloadHash: crypto.createHash("sha256").update(payload).digest("hex"),
    salt: salt.toString("base64"),
    iv: iv.toString("base64"),
    ciphertext: ciphertext.toString("base64"),
    authTag: cipher.getAuthTag().toString("base64"),
    // bewusst kein kdf-Feld
  };
}

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
    const bundle = exportBundle(a, { passphrase: "kanzlei-passwort-2026", scope: "mandant-x" });

    const raw = JSON.stringify(bundle);
    expect(raw).not.toContain("Diagnose-Schlüsselwort");
    expect(raw).not.toContain("Streng vertraulich");

    const b = freshStore();
    expect(() => importBundle(b, bundle, { passphrase: "falsch" })).toThrow(/entschlüsselt/);
    // Paketmitschnitt-Beweis: eine veränderte Nutzlast wird erkannt
    const manipuliert = { ...bundle, payloadHash: "0".repeat(64) };
    expect(() => importBundle(b, manipuliert, { passphrase: "kanzlei-passwort-2026" })).toThrow(/Mitschnitt|manipuliert/i);
    // unbekanntes Format wird abgewiesen
    expect(() => importBundle(b, { ...bundle, format: "andere-app" } as unknown as SyncBundle, { passphrase: "kanzlei-passwort-2026" })).toThrow(/Format/);
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
    const bundle = exportBundle(a, { passphrase: "kanzlei-passwort-2026", scope: "mandant-j", sender: "Gerät-A", journal });
    const b = freshStore();
    importBundle(b, bundle, { passphrase: "kanzlei-passwort-2026", peer: "Gerät-B", journal });

    const entries = journal.entries();
    expect(entries).toHaveLength(2);
    expect(entries[0]!.direction).toBe("export");
    expect(entries[0]!.peer).toBe("Gerät-A");
    expect(entries[1]!.direction).toBe("import");
    expect(entries[1]!.peer).toBe("Gerät-B");
    expect(entries[1]!.payloadHash).toBe(entries[0]!.payloadHash); // dasselbe Paket, beide Seiten im Mitschnitt
    expect(verifyJournal(entries)).toBe(true);
  });

  it("lehnt kurze Passphrasen beim Export ab — der KDF ist die einzige Verteidigung beim Versand", () => {
    const a = freshStore();
    const m = a.createMemory({ id: "kurz1", title: "T", content: "x", scope: "local" });
    indexMemory(a, m.id);
    expect(() => exportBundle(a, { passphrase: "kurz" })).toThrow(/mindestens 12 Zeichen/);
    expect(() => exportBundle(a, { passphrase: "x".repeat(MIN_PASSPHRASE_LENGTH - 1) })).toThrow(/zu kurz/);
    expect(() => exportBundle(a, { passphrase: "x".repeat(MIN_PASSPHRASE_LENGTH) })).not.toThrow();
  });

  it("schreibt die KDF-Parameter ins Bundle und liest Bundles ohne kdf-Feld weiter", () => {
    const a = freshStore();
    const m = a.createMemory({ id: "kdf1", title: "KDF", content: "geheim", scope: "local" });
    indexMemory(a, m.id);
    const bundle = exportBundle(a, { passphrase: "kanzlei-passwort-2026" });

    expect(bundle.kdf).toEqual({ name: "scrypt", N: 131072, r: 8, p: 1 });
    expect(bundle.kdf!.N).toBeGreaterThanOrEqual(131072); // 2^17, nicht Nodes altes 2^14

    // Ein Bundle aus 2.6.16 trägt kein kdf-Feld. Es muss lesbar bleiben, sonst
    // waeren nach dem Update alle bereits verschickten Pakete unbrauchbar.
    const altesBundle = exportBundleMitAltemKdf(a, "kanzlei-passwort-2026");
    expect(altesBundle.kdf).toBeUndefined();
    const b = freshStore();
    expect(() => importBundle(b, altesBundle, { passphrase: "kanzlei-passwort-2026" })).not.toThrow();
    expect(b.getMemory("kdf1")).toBeTruthy();
  });

  it("weigert sich, an eine gebrochene Kette anzuhaengen — sonst heilt sich die Manipulation weg", () => {
    const datei = freshJournalFile();
    const journal = new PraxissyncJournal(datei);
    journal.record({ direction: "export", peer: "A", scope: "local", count: 1, payloadHash: "aaa" });
    journal.record({ direction: "import", peer: "B", scope: "local", count: 1, payloadHash: "aaa" });
    expect(journal.verify()).toBe(true);

    // Jemand faelscht die erste Zeile.
    const zeilen = fs.readFileSync(datei, "utf-8").trim().split("\n");
    const erste = JSON.parse(zeilen[0]!) as Record<string, unknown>;
    erste.count = 999;
    fs.writeFileSync(datei, [JSON.stringify(erste), zeilen[1]!].join("\n") + "\n", "utf-8");

    const nachher = new PraxissyncJournal(datei);
    expect(nachher.verify()).toBe(false);
    // Ohne diese Sperre wuerde der naechste Eintrag an den kaputten Stand
    // anknuepfen und die Kette ab da wieder stimmig aussehen lassen.
    expect(() =>
      nachher.record({ direction: "export", peer: "C", scope: "local", count: 1, payloadHash: "bbb" })
    ).toThrow(/gebrochen/);
  });
});
