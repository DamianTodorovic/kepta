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
  VerschlussteAuditDatei,
} from "../src/core/nebendateien";

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
    // Der Marker ist eine Format-Kennung, kein sichtbares Wort: er steht in den
    // Dateien, die schon auf den Platten der Bestandsinstallationen liegen
    // (Damians eigene: ~/.kepta/profile.json beginnt mit genau diesen 13 Bytes).
    // Wer ihn umbiegt, verliert sie — `leseJsonDatei` gibt für eine fremde Magie
    // null, und `server/router/settings.ts:104` macht daraus still `{}`.
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

  it("der Umschlag ist eine Format-Kennung, kein Markenwort — eine fremde Magie wird nicht gelesen", () => {
    // Die Gegenprobe zu den beiden Marker-Erwartungen oben (`:34` und `:60`):
    // derselbe Geheimtext, nur die ersten 13
    // Bytes gegen die neu aussehende Schreibweise getauscht. Beide Dateien sind
    // gleich lang, damit der Beweis wirklich am Marker hängt und nicht an einer
    // kaputten Datei.
    // Die Lesart ist `null`, kein Fehler — und genau deshalb wäre ein umgebogener
    // Marker ein stiller Datenverlust: `server/router/settings.ts:104` macht aus
    // null ein leeres Profil und schreibt beim nächsten POST über die Datei hinweg.
    const dir = ordner();
    const pfad = path.join(dir, "profil.json");
    const s = schlüssel();
    schreibeJsonDatei(pfad, { displayName: "Cara" }, s);
    const roh = fs.readFileSync(pfad);
    expect(roh.subarray(0, 13).toString("utf8")).toBe("KEPTA-NEBEN1\n");
    const fremd = Buffer.concat([Buffer.from("K3PTA-NEBEN1\n", "utf8"), roh.subarray(13)]);
    expect(fremd.length).toBe(roh.length);
    fs.writeFileSync(pfad, fremd);
    expect(leseJsonDatei(pfad, s)).toBeNull();
    // Unter der echten Kennung geht derselbe Umschlag unverloren durch die Tür.
    fs.writeFileSync(pfad, roh);
    expect(leseJsonDatei<{ displayName?: string }>(pfad, s)).toEqual({ displayName: "Cara" });
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

describe("VerschlussteAuditDatei mit Schlüssel", () => {
  it("Schreibt keine Klartext-Ereignisse mehr auf die Platte", async () => {
    const dir = ordner();
    const pfad = path.join(dir, "audit.jsonl");
    const s = schlüssel();
    const sink = new VerschlussteAuditDatei(pfad, s);
    sink.emit({ at: Date.now(), actor: "lokal", action: "memory_save", target: "k-1", detail: "Streng geheim" } as never);
    await sink.flush();
    const roh = fs.readFileSync(pfad, "utf8").trim();
    expect(roh.startsWith("K1.")).toBe(true);
    expect(roh.includes("Streng geheim")).toBe(false);

    // Mehr Einträge nacheinander: flush() wartet die ganze Schlange ab, die
    // Reihenfolge bleibt die der Meldungen, und keine Zeile ist Klartext.
    sink.emit({ at: 2, actor: "lokal", action: "b", target: null, detail: "zweite" } as never);
    sink.emit({ at: 3, actor: "lokal", action: "c", target: null, detail: "dritte" } as never);
    await sink.flush();
    const zeilen = fs.readFileSync(pfad, "utf8").trim().split("\n");
    expect(zeilen).toHaveLength(3);
    expect(zeilen.every((z) => z.startsWith("K1."))).toBe(true);
    expect(journalLesen(pfad, s).map((e) => (e as { action: string }).action)).toEqual(["memory_save", "b", "c"]);

    // Klartext-Modus (null) bleibt für Werkzeuge verfügbar
    const pfad2 = path.join(dir, "audit2.jsonl");
    const klar = new VerschlussteAuditDatei(pfad2, null);
    klar.emit({ at: 1, actor: "a", action: "x", target: null, detail: null } as never);
    await klar.flush();
    expect(fs.readFileSync(pfad2, "utf8")).toContain('"action":"x"');
  });

  it("Ein kaputter Audit-Pfad wirft nicht — ein sink darf nie die Memory brechen", async () => {
    const dir = ordner();
    const pfad = path.join(dir, "audit.jsonl");
    const sink = new VerschlussteAuditDatei(pfad, schlüssel());
    sink.emit({ at: 1, actor: "a", action: "vorher", target: null, detail: null } as never);
    await sink.flush();

    // Ordner nach der Konstruktion entfernen: die nächsten Appends schlagen fehl.
    fs.rmSync(dir, { recursive: true, force: true });
    expect(() => sink.emit({ at: 2, actor: "b", action: "nachher", target: null, detail: null } as never)).not.toThrow();
    await expect(sink.flush()).resolves.toBeUndefined();
    expect(fs.existsSync(pfad)).toBe(false);
  });
});
