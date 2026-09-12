// @vitest-environment node
//
// Die Wissensbasis verschluesselt: neue Datei, Umwandlung eines Klartext-Bestands,
// falscher und fehlender Schluessel, andere Programme an derselben Datei,
// abgestuerzte Umwandlungen — und die Einstellungen, die jetzt mit darin liegen.
import { describe, it, expect, afterEach, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { spawn, spawnSync } from "node:child_process";
import {
  KeptaStore,
  istKlartextDatenbank,
  warteAufUmwandlung,
  verschluessleFallsKlartext,
  verschluessleKlartextDatenbank,
  ersetzeUnterWindows,
} from "../../src/core/store";
import { defaultExtensions, type KeptaExtensions } from "../../src/core/extensions";

const SCHLUESSEL = Buffer.alloc(32, 0x3c);
const ANDERER = Buffer.alloc(32, 0x7e);
const MARKER = "vertraulicher-befund-4711";

function mit(schluessel: Uint8Array | null | (() => Uint8Array | null), ablage?: string): KeptaExtensions {
  const keyFor = typeof schluessel === "function" ? schluessel : () => schluessel;
  return { ...defaultExtensions(), keys: { keyFor, ...(ablage ? { ablage } : {}) } };
}
function neuerOrdner(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "kepta-crypt-"));
}
function neuerPfad(): string {
  return path.join(neuerOrdner(), "kepta.db");
}
/** Hauptdatei + WAL, als Bytes gelesen: frische Seiten liegen im WAL-Modus zuerst in -wal. */
function aufPlatte(dbPath: string): string {
  let out = "";
  for (const f of [dbPath, dbPath + "-wal"]) {
    try { out += fs.readFileSync(f, "latin1"); } catch { /* fehlt */ }
  }
  return out;
}
function hash(p: string): string {
  return crypto.createHash("sha256").update(fs.readFileSync(p)).digest("hex");
}
function klartextBestand(n: number): string {
  const p = neuerPfad();
  const s = new KeptaStore(p);
  for (let i = 0; i < n; i++) s.createMemory({ title: `Notiz ${i}`, content: `${MARKER} Nummer ${i}` });
  s.setzeEinstellungen({ ai_key: "sk-geheim-123" });
  s.close();
  return p;
}
function treffer(store: KeptaStore, wort: string): number {
  return (store.db.prepare("SELECT count(*) AS n FROM memories_fts WHERE memories_fts MATCH ?").get(wort) as { n: number }).n;
}
/** openSync, das fuer die Sperrdatei einen Fehler wirft — alles andere geht durch. */
function sperreWirft(code: string, nurEinmal = false) {
  const echt = fs.openSync;
  let aktiv = true;
  return vi.spyOn(fs, "openSync").mockImplementation(((f: fs.PathLike, flags?: fs.OpenMode, mode?: fs.Mode | null) => {
    if (aktiv && String(f).endsWith(".encrypting-lock")) {
      if (nurEinmal) aktiv = false;
      throw Object.assign(new Error(code === "EEXIST" ? "exists" : "read-only file system"), { code });
    }
    return echt(f, flags ?? "r", mode);
  }) as typeof fs.openSync);
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("neue Wissensbasis mit Schluessel", () => {
  it("ist ab der ersten Seite verschluesselt — auch im WAL — und findet nach dem Wiederoeffnen alles", () => {
    const p = neuerPfad();
    const s = new KeptaStore(p, mit(SCHLUESSEL, "Test-Bund"));
    expect(s.verschluesselung).toEqual({ aktiv: true, ablage: "Test-Bund" });
    s.createMemory({ title: "Befund", content: MARKER });
    expect(aufPlatte(p)).not.toContain(MARKER);
    s.close();
    expect(istKlartextDatenbank(p)).toBe(false);
    expect(aufPlatte(p)).not.toContain(MARKER);
    const wieder = new KeptaStore(p, mit(SCHLUESSEL));
    expect(wieder.verschluesselung).toEqual({ aktiv: true });
    expect(treffer(wieder, "befund")).toBe(1);
    wieder.close();
  });

  it("verlangt genau 256 Bit — ein kuerzerer Schluessel oeffnet nichts", () => {
    expect(() => new KeptaStore(neuerPfad(), mit(Buffer.alloc(16, 1)))).toThrow("256 bits");
  });
});

describe("falscher oder fehlender Schluessel", () => {
  it("ein falscher Schluessel oeffnet nichts und veraendert nichts", () => {
    const p = neuerPfad();
    new KeptaStore(p, mit(SCHLUESSEL)).close();
    const vorher = hash(p);
    expect(() => new KeptaStore(p, mit(ANDERER))).toThrow("does not belong to this database");
    expect(hash(p)).toBe(vorher);
  });

  it("ohne Schluessel startet kein leeres Gehirn ueber einer verschluesselten Datei", () => {
    const p = neuerPfad();
    new KeptaStore(p, mit(SCHLUESSEL)).close();
    expect(() => new KeptaStore(p)).toThrow("encrypted, but its key is not available.");
    const gesperrt = mit(() => { throw new Error("Keychain locked"); });
    expect(() => new KeptaStore(p, gesperrt)).toThrow("encrypted, but its key is not available: Keychain locked");
  });
});

describe("Umwandlung eines Klartext-Bestands", () => {
  it("verschluesselt beim ersten Oeffnen mit Schluessel — Notizen, Suche und Einstellungen bleiben", () => {
    const p = klartextBestand(50);
    expect(aufPlatte(p)).toContain(MARKER);
    const s = new KeptaStore(p, mit(SCHLUESSEL, "Test-Bund"));
    expect(s.verschluesselung).toEqual({ aktiv: true, ablage: "Test-Bund", umgewandelt: true });
    expect(s.countMemories().active).toBe(50);
    expect(treffer(s, "befund")).toBe(50);
    expect(s.einstellungen()).toEqual({ ai_key: "sk-geheim-123" });
    s.close();
    expect(aufPlatte(p)).not.toContain(MARKER);
    expect(aufPlatte(p)).not.toContain("sk-geheim-123");
    expect(fs.readdirSync(path.dirname(p)).filter((f) => f.includes("encrypting"))).toEqual([]);
    const wieder = new KeptaStore(p, mit(SCHLUESSEL));
    expect(wieder.verschluesselung.umgewandelt).toBeUndefined();
    wieder.close();
  });

  it("hat ein anderes Programm die Datei offen, bleibt sie Klartext — bis KEPTA sie allein hat", () => {
    const p = klartextBestand(3);
    const fremd = new KeptaStore(p); // etwa ein aelterer MCP-Server
    const s = new KeptaStore(p, mit(SCHLUESSEL));
    expect(s.verschluesselung.aktiv).toBe(false);
    expect(s.verschluesselung.hinweis).toMatch(/open in another program/);
    fremd.createMemory({ title: "waehrenddessen", content: "geht weiter" });
    expect(s.countMemories().active).toBe(4);
    s.close();
    fremd.close();
    const allein = new KeptaStore(p, mit(SCHLUESSEL));
    expect(allein.verschluesselung.umgewandelt).toBe(true);
    expect(allein.countMemories().active).toBe(4);
    allein.close();
  });

  it.skipIf(process.platform === "win32")("wer die alte Datei in dem Moment offen hielt, findet danach nur Nullen", () => {
    const p = klartextBestand(5);
    const fd = fs.openSync(p, "r");
    try {
      new KeptaStore(p, mit(SCHLUESSEL)).close();
      const alt = Buffer.alloc(4096, 1);
      fs.readSync(fd, alt, 0, 4096, 0);
      expect(alt.every((b) => b === 0)).toBe(true);
    } finally {
      fs.closeSync(fd);
    }
    expect(aufPlatte(p)).not.toContain(MARKER);
  });

  it("scheitert das Ersetzen, bleibt das Original unberuehrt und die Kopie verschwindet", () => {
    const p = klartextBestand(2);
    vi.spyOn(fs, "renameSync").mockImplementation(() => { throw Object.assign(new Error("no space left"), { code: "ENOSPC" }); });
    expect(() => verschluessleKlartextDatenbank(p, SCHLUESSEL, "darwin")).toThrow("could not be encrypted, it stays as it was: no space left");
    vi.restoreAllMocks();
    expect(istKlartextDatenbank(p)).toBe(true);
    expect(fs.existsSync(p + ".encrypting")).toBe(false);
    const s = new KeptaStore(p);
    expect(s.countMemories().active).toBe(2);
    s.close();
  });

  it("Windows-Weg: das Original wird vor dem Ersetzen geschlossen", () => {
    const p = klartextBestand(4);
    verschluessleKlartextDatenbank(p, SCHLUESSEL, "win32");
    const s = new KeptaStore(p, mit(SCHLUESSEL));
    expect(s.countMemories().active).toBe(4);
    s.close();
  });

  it("Windows: haelt jemand die Datei fest, bleibt das Original — nach ein paar Versuchen", () => {
    const p = klartextBestand(2);
    const rename = vi.spyOn(fs, "renameSync").mockImplementation(() => { throw Object.assign(new Error("busy"), { code: "EBUSY" }); });
    expect(() => verschluessleKlartextDatenbank(p, SCHLUESSEL, "win32")).toThrow("open in another program");
    expect(rename).toHaveBeenCalledTimes(5);
    vi.restoreAllMocks();
    expect(istKlartextDatenbank(p)).toBe(true);
    expect(fs.existsSync(p + ".encrypting")).toBe(false);
  });

  it("ersetzeUnterWindows reicht fremde Fehler sofort weiter", () => {
    const d = neuerOrdner();
    expect(() => ersetzeUnterWindows(path.join(d, "gibt-es-nicht"), path.join(d, "ziel"))).toThrow(/ENOENT/);
  });
});

describe("mehrere KEPTA-Prozesse", () => {
  it("wartet, solange ein lebender Prozess umwandelt", async () => {
    const p = neuerPfad();
    const sperre = JSON.stringify(p + ".encrypting-lock");
    const kind = spawn(process.execPath, ["-e", `
      const fs = require("node:fs");
      fs.writeFileSync(${sperre}, JSON.stringify({ pid: process.pid, seit: Date.now() }));
      process.stdout.write("bereit\\n");
      setTimeout(() => { fs.rmSync(${sperre}); process.exit(0); }, 400);
    `], { stdio: ["ignore", "pipe", "inherit"] });
    await new Promise<void>((res) => kind.stdout!.on("data", (b) => { if (String(b).includes("bereit")) res(); }));
    const start = Date.now();
    warteAufUmwandlung(p);
    expect(Date.now() - start).toBeGreaterThan(200);
    expect(fs.existsSync(p + ".encrypting-lock")).toBe(false);
  });

  it("raeumt die Sperre eines abgestuerzten Prozesses samt halber Kopie weg", () => {
    const p = neuerPfad();
    const tot = spawnSync(process.execPath, ["-e", "process.stdout.write(String(process.pid))"], { encoding: "utf8" });
    fs.writeFileSync(p + ".encrypting-lock", JSON.stringify({ pid: Number(tot.stdout), seit: Date.now() }));
    fs.writeFileSync(p + ".encrypting", "halbe Kopie");
    warteAufUmwandlung(p);
    expect(fs.existsSync(p + ".encrypting-lock")).toBe(false);
    expect(fs.existsSync(p + ".encrypting")).toBe(false);
  });

  it("eine uralte Sperre gilt als verwaist, auch bei lebender Prozessnummer — die eigene ebenso", () => {
    const p = neuerPfad();
    fs.writeFileSync(p + ".encrypting-lock", JSON.stringify({ pid: process.ppid, seit: Date.now() - 11 * 60_000 }));
    warteAufUmwandlung(p);
    expect(fs.existsSync(p + ".encrypting-lock")).toBe(false);
    fs.writeFileSync(p + ".encrypting-lock", JSON.stringify({ pid: process.pid, seit: Date.now() }));
    warteAufUmwandlung(p);
    expect(fs.existsSync(p + ".encrypting-lock")).toBe(false);
  });

  it("eine frische Sperre wird abgewartet — und nach der Frist klar gemeldet, nicht weggeraeumt", () => {
    const p = neuerPfad();
    fs.writeFileSync(p + ".encrypting-lock", "");
    expect(() => warteAufUmwandlung(p, 250)).toThrow("being encrypted by another KEPTA process");
    // Prozess 1 gibt es immer; fragen darf man ihn meist nicht (EPERM) — er lebt trotzdem.
    fs.writeFileSync(p + ".encrypting-lock", JSON.stringify({ pid: 1, seit: Date.now() }));
    expect(() => warteAufUmwandlung(p, 250)).toThrow("being encrypted by another KEPTA process");
    expect(fs.existsSync(p + ".encrypting-lock")).toBe(true);
  });

  it("war ein anderer Prozess schneller, wird auf ihn gewartet und danach umgewandelt", () => {
    const p = klartextBestand(2);
    sperreWirft("EEXIST", true);
    expect(verschluessleFallsKlartext(p, SCHLUESSEL)).toBe(true);
    vi.restoreAllMocks();
    expect(istKlartextDatenbank(p)).toBe(false);
  });

  it("kommt eine fremde Umwandlung nie zum Ende, oeffnet der Store im Klartext — mit Grund", () => {
    const p = klartextBestand(1);
    sperreWirft("EEXIST");
    const s = new KeptaStore(p, mit(SCHLUESSEL));
    expect(s.verschluesselung).toEqual({ aktiv: false, hinweis: expect.stringContaining("being encrypted by another KEPTA process") });
    s.close();
  });

  it("andere Fehler beim Anlegen der Sperre werden nicht als 'belegt' missverstanden", () => {
    const p = klartextBestand(1);
    sperreWirft("EROFS");
    expect(() => verschluessleFallsKlartext(p, SCHLUESSEL)).toThrow("read-only file system");
  });
});

describe("Einstellungen in der Datenbank", () => {
  it("setzt, ueberschreibt und loescht — und liegen verschluesselt", () => {
    const p = neuerPfad();
    const s = new KeptaStore(p, mit(SCHLUESSEL));
    expect(s.einstellungen()).toEqual({});
    expect(s.setzeEinstellungen({ theme: "dark", ai_key: "sk-sehr-geheim-9" })).toBe(2);
    expect(s.setzeEinstellungen({ theme: "light", ai_key: null })).toBe(1);
    expect(s.einstellungen()).toEqual({ theme: "light" });
    s.setzeEinstellungen({ ai_key: "sk-sehr-geheim-9" });
    s.close();
    expect(aufPlatte(p)).not.toContain("sk-sehr-geheim-9");
  });

  it("alles oder nichts: scheitert ein Eintrag, bleibt keiner", () => {
    const s = new KeptaStore(neuerPfad());
    expect(() => s.setzeEinstellungen({ gut: "ja", kaputt: Symbol("x") as unknown as string })).toThrow();
    expect(s.einstellungen()).toEqual({});
    s.close();
  });
});

describe("Wiederherstellungsschluessel", () => {
  it("ist der Schluessel der Datei als Hex — und fehlt bei einer Klartext-Datei", () => {
    const s = new KeptaStore(neuerPfad(), mit(SCHLUESSEL));
    expect(s.wiederherstellungsSchluessel()).toBe(SCHLUESSEL.toString("hex"));
    s.close();
    const klar = new KeptaStore(neuerPfad());
    expect(klar.wiederherstellungsSchluessel()).toBeNull();
    klar.close();
  });
});

describe("istKlartextDatenbank", () => {
  it("erkennt den SQLite-Kopf — fehlende, leere und kurze Dateien sind es nicht", () => {
    const d = neuerOrdner();
    expect(istKlartextDatenbank(path.join(d, "fehlt.db"))).toBe(false);
    fs.writeFileSync(path.join(d, "leer.db"), "");
    expect(istKlartextDatenbank(path.join(d, "leer.db"))).toBe(false);
    fs.writeFileSync(path.join(d, "kurz.db"), "SQLite");
    expect(istKlartextDatenbank(path.join(d, "kurz.db"))).toBe(false);
    expect(istKlartextDatenbank(klartextBestand(1))).toBe(true);
  });
});
