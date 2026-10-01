import { describe, it, expect } from "vitest";
import { tmpdir } from "node:os";
import path from "node:path";
import fs from "node:fs";
import crypto from "node:crypto";
import {
  schreibeJsonDatei,
  leseJsonDatei,
  journalZeile,
  journalLesen,
  nebendateiSchluessel,
} from "../src/core/nebendateien";
import { FileAuditSink } from "../src/core/extensions";

const schlüssel = () => crypto.randomBytes(32);

function ordner(): string {
  return fs.mkdtempSync(path.join(tmpdir(), "kepta-neben-"));
}

describe("Verschlüsselte Nebendateien", () => {
  it("JSON-Roundtrip: verschlüsselt abgelegt, ohne Klartext auf der Platte", () => {
    const dir = ordner();
    const pfad = path.join(dir, "profile.json");
    const daten = { displayName: "Damian", topics: ["Mandanten", "Steuerrecht"] };
    const s = schlüssel();
    schreibeJsonDatei(pfad, daten, s);
    const roh = fs.readFileSync(pfad, "utf8");
    expect(roh.startsWith("KEPTA-NEBEN1")).toBe(true);
    // Der Klartext darf nirgends in der Datei stehen — auch nicht als Fragment.
    expect(roh.includes("Damian")).toBe(false);
    expect(roh.includes("Steuerrecht")).toBe(false);
    expect(leseJsonDatei<typeof daten>(pfad, s)).toEqual(daten);
  });

  it("Falscher Schlüssel (GCM-Authentizität) liest nichts — Manipulation fliegt auf", () => {
    const dir = ordner();
    const pfad = path.join(dir, "profile.json");
    schreibeJsonDatei(pfad, { geheim: "ja" }, schlüssel());
    expect(leseJsonDatei(pfad, crypto.randomBytes(32))).toBeNull();
    // Ein umgedrehtes Byte im Geheimtext muss die Authentizität brechen.
    const roh = fs.readFileSync(pfad);
    roh[roh.length - 5] ^= 0xff;
    fs.writeFileSync(pfad, roh);
    expect(leseJsonDatei(pfad, schlüssel())).toBeNull();
  });

  it("Legacy-Klartext wird verstanden und beim nächsten Schreiben überführt", () => {
    const dir = ordner();
    const pfad = path.join(dir, "scan-config.json");
    const s = schlüssel();
    fs.writeFileSync(pfad, JSON.stringify({ roots: ["/home/user/kanzlei"] }, null, 2), "utf-8");
    expect(leseJsonDatei<{ roots?: string[] }>(pfad, s)).toEqual({ roots: ["/home/user/kanzlei"] });
    schreibeJsonDatei(pfad, { roots: ["/home/user/kanzlei"] }, s);
    expect(fs.readFileSync(pfad, "utf8").startsWith("KEPTA-NEBEN1")).toBe(true);
  });

  it("KEPTA_ENCRYPTION=off → Klartext, deterministisch wie der Store", () => {
    const dir = ordner();
    const pfad = path.join(dir, "x.json");
    schreibeJsonDatei(pfad, { a: 1 }, null);
    expect(fs.readFileSync(pfad, "utf8")).toBe('{\n  "a": 1\n}');
    expect(leseJsonDatei(pfad, null)).toEqual({ a: 1 });
  });

  it("nebendateiSchluessel: KEPTA_ENCRYPTION=off → null, sonst derselbe wie der DB-Schlüssel", () => {
    expect(nebendateiSchluessel("/tmp/egal", "darwin", undefined, { KEPTA_ENCRYPTION: "off" })).toBeNull();
    // Ohne Schlüsselbund und ohne KEPTA_DB_KEY bleibt Klartext die ehrliche Ausnahme.
    expect(nebendateiSchluessel("/tmp/egal", "linux", undefined, {})).toBeNull();
    const env = { KEPTA_DB_KEY: "ab".repeat(32) };
    const s = nebendateiSchluessel("/tmp/egal", "linux", undefined, env);
    expect(s).not.toBeNull();
    expect(s!.toString("hex")).toBe("ab".repeat(32));
  });
});

describe("Verschlüsselte Journalzeilen", () => {
  it("Zeilen verschlüsseln, lesen, gemischte Legacy-Zeilen verstehen", () => {
    const dir = ordner();
    const pfad = path.join(dir, "sync-journal.jsonl");
    const s = schlüssel();
    const zeilen = [
      { seq: 1, at: "2026-09-20T10:00:00Z", direction: "export", peer: "Kanzlei-PC", count: 12, payloadHash: "a".repeat(64), prevHash: null, hash: "b".repeat(64) },
      { seq: 2, at: "2026-09-21T10:00:00Z", direction: "import", peer: "Kanzlei-PC", count: 3, payloadHash: "c".repeat(64), prevHash: "b".repeat(64), hash: "d".repeat(64) },
    ];
    fs.writeFileSync(pfad, zeilen.map((z) => journalZeile(z, s)).join("\n") + "\n", "utf-8");
    // Klartext-Fragmente dürfen nicht auf der Platte stehen.
    const roh = fs.readFileSync(pfad, "utf8");
    expect(roh.includes("Kanzlei-PC")).toBe(false);
    expect(journalLesen<typeof zeilen[number]>(pfad, s)).toEqual(zeilen);
    // Legacy-Klartextzeile dazwischen (Übergang von älteren Versionen) — verstanden.
    fs.writeFileSync(
      pfad,
      [journalZeile(zeilen[0], s), JSON.stringify(zeilen[1]), journalZeile({ seq: 3, alt: true }, s)].join("\n") + "\n",
      "utf-8",
    );
    expect(journalLesen(pfad, s)).toHaveLength(3);
    expect(journalLesen(pfad, s)[2]).toEqual({ seq: 3, alt: true });
  });

  it("Kaputte verschlüsselte Zeile wirft — Manipulationsverdacht heilt sich nicht still weg", () => {
    const dir = ordner();
    const pfad = path.join(dir, "j.jsonl");
    const s = schlüssel();
    fs.writeFileSync(pfad, journalZeile({ seq: 1 }, s) + "\n" + journalZeile({ seq: 2 }, s) + "\n", "utf-8");
    // Eine Zeile anfressen
    const zeilen = fs.readFileSync(pfad, "utf8").trim().split("\n");
    zeilen[1] = zeilen[1].slice(0, -8);
    fs.writeFileSync(pfad, zeilen.join("\n") + "\n", "utf-8");
    expect(() => journalLesen(pfad, s)).toThrow();
    // Falscher Schlüssel ebenso
    expect(() => journalLesen(pfad, schlüssel())).toThrow();
  });

  it("Fehlende Datei → leeres Journal; ohne Schlüssel Klartext", () => {
    const dir = ordner();
    expect(journalLesen(path.join(dir, "fehlt.jsonl"), schlüssel())).toEqual([]);
    const pfad = path.join(dir, "klar.jsonl");
    fs.writeFileSync(pfad, JSON.stringify({ seq: 1 }) + "\n", "utf-8");
    expect(journalLesen(pfad, null)).toEqual([{ seq: 1 }]);
  });
});

describe("FileAuditSink mit Schlüssel", () => {
  it("Schreibt keine Klartext-Ereignisse mehr auf die Platte", async () => {
    const dir = ordner();
    const pfad = path.join(dir, "audit.jsonl");
    const sink = new FileAuditSink(pfad, schlüssel());
    sink.emit({ at: Date.now(), actor: "lokal", action: "memory_save", target: "k-1", detail: "Streng geheim" } as never);
    await new Promise((r) => setTimeout(r, 120));
    const roh = fs.readFileSync(pfad, "utf8").trim();
    expect(roh.startsWith("K1.")).toBe(true);
    expect(roh.includes("Streng geheim")).toBe(false);
    // Klartext-Modus (null) bleibt für Werkzeuge verfügbar
    const pfad2 = path.join(dir, "audit2.jsonl");
    new FileAuditSink(pfad2, null).emit({ at: 1, actor: "a", action: "x", target: null, detail: null } as never);
    await new Promise((r) => setTimeout(r, 120));
    expect(fs.readFileSync(pfad2, "utf8")).toContain('"action":"x"');
  });
});
