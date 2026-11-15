// @vitest-environment node
//
// Lizenzschlüssel: Lizenznummer + Ed25519-Signatur über Namen und Nummer,
// Base32 in 5er-Gruppen, offline geprüft — und gegen die Sperrliste. Die App
// kennt nur den öffentlichen Schlüssel — hier ein eigenes Testpaar.
import { describe, it, expect } from "vitest";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import {
  HOECHSTE_NUMMER,
  OEFFENTLICHER_SCHLUESSEL,
  alsGruppen,
  ausGruppen,
  formatiereNummer,
  leseSchluessel,
  normalisiere,
  pruefeSchluessel,
  signiere,
  validiereSchluessel,
} from "../../src/core/lizenz";
import { GESPERRTE_LIZENZEN } from "../../src/core/sperrliste";
import * as lizenz from "../../src/core/lizenz";

const { publicKey, privateKey } = crypto.generateKeyPairSync("ed25519");
const PRIVAT = privateKey.export({ type: "pkcs8", format: "der" }).toString("base64");
const OEFFENTLICH = publicKey.export({ type: "spki", format: "der" }).toString("base64");
const ANDERES = crypto.generateKeyPairSync("ed25519").publicKey.export({ type: "spki", format: "der" }).toString("base64");
const KEINE = new Set<number>();
const SKRIPT = path.join(process.cwd(), "scripts", "generate-license.mjs");

describe("signiere / pruefeSchluessel", () => {
  it("ein ausgestellter Schlüssel passt zum Namen, trägt seine Nummer — und gilt nur mit dem richtigen Prüfschlüssel", () => {
    const s = signiere("Sarah Mandel", 7, PRIVAT, "enterprise");
    expect(s).toMatch(/^[A-Z2-7]{5}(-[A-Z2-7]{1,5})+$/);
    expect(pruefeSchluessel("Sarah Mandel", s, OEFFENTLICH, KEINE)).toEqual({ gueltig: true, nummer: 7, gesperrt: false, edition: "enterprise", seats: 0 });
    expect(pruefeSchluessel("Sarah Mandel", s, ANDERES, KEINE).gueltig).toBe(false);
    expect(leseSchluessel(s)?.nummer).toBe(7);
  });

  it("eine gesperrte Nummer gilt nicht — auch wenn die Signatur echt ist", () => {
    const s = signiere("Sarah Mandel", 7, PRIVAT, "enterprise");
    expect(pruefeSchluessel("Sarah Mandel", s, OEFFENTLICH, new Set([7]))).toEqual({ gueltig: false, nummer: 7, gesperrt: true, edition: "enterprise", seats: 0 });
    expect(pruefeSchluessel("Sarah Mandel", signiere("Sarah Mandel", 8, PRIVAT, "enterprise"), OEFFENTLICH, new Set([7])).gueltig).toBe(true);
  });

  it("die Nummer lässt sich nicht umschreiben — sie ist mitsigniert", () => {
    const bytes = ausGruppen(signiere("Sarah Mandel", 7, PRIVAT, "enterprise"))!;
    bytes.writeUInt32BE(8, 0);
    expect(pruefeSchluessel("Sarah Mandel", alsGruppen(bytes), OEFFENTLICH, KEINE)).toEqual({ gueltig: false, nummer: null, gesperrt: false, edition: "alt", seats: 1 });
  });

  it("ein anderer Name, ein veränderter oder zu kurzer Schlüssel ist ungültig — ohne Nummer", () => {
    const s = signiere("Sarah Mandel", 7, PRIVAT, "enterprise");
    const ungueltig = { gueltig: false, nummer: null, gesperrt: false, edition: "alt" as const, seats: 1 };
    expect(pruefeSchluessel("Thomas Akt", s, OEFFENTLICH, KEINE)).toEqual(ungueltig);
    // Erstes Zeichen flippen — das trägt die Top-Bits des ersten Bytes und ist
    // immer signifikant. (Das LETZTE Zeichen war hier eine Falle: es kann ein
    // Base32-Padding-Zeichen sein; dessen Flip dekodiert zu denselben Bytes und
    // der "gekippte" Schlüssel blieb gültig — je nach Schlüsselpaar zufällig,
    // was den Test flaky machte.)
    const gekippt = (s.startsWith("A") ? "B" : "A") + s.slice(1);
    expect(pruefeSchluessel("Sarah Mandel", gekippt, OEFFENTLICH, KEINE)).toEqual(ungueltig);
    expect(pruefeSchluessel("Sarah Mandel", "AAAAA-BBBBB-CCCCC-DDDDD-EEEEE", OEFFENTLICH, KEINE)).toEqual(ungueltig);
    expect(pruefeSchluessel("Sarah Mandel", "kein schluessel!", OEFFENTLICH, KEINE)).toEqual(ungueltig);
    expect(pruefeSchluessel("   ", s, OEFFENTLICH, KEINE)).toEqual(ungueltig);
  });

  it("jeder Schlüssel hat genau eine Schreibweise — ein gesetztes Füllbit macht ihn ungültig", () => {
    // 71 Byte sind 568 Bit, der Schlüssel trägt 570: die letzten zwei Bits sind Füllung.
    // Früher galt ein Schlüssel, der sich nur in der Füllung unterschied, als derselbe.
    const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
    for (let nummer = 1; nummer <= 40; nummer++) {
      const s = signiere("Sarah Mandel", nummer, PRIVAT, "enterprise");
      const letztes = s[s.length - 1]!;
      const zweiteSchreibweise = s.slice(0, -1) + ALPHABET[ALPHABET.indexOf(letztes) ^ 1];
      expect(pruefeSchluessel("Sarah Mandel", s, OEFFENTLICH, KEINE).gueltig).toBe(true);
      expect(pruefeSchluessel("Sarah Mandel", zweiteSchreibweise, OEFFENTLICH, KEINE)).toEqual({ gueltig: false, nummer: null, gesperrt: false, edition: "alt", seats: 1 });
    }
    expect(ausGruppen("AB")).toBeNull();
    // „AE“ = 00000 00100: ein Byte (1), zwei Füllbits, beide null — gültig.
    expect(ausGruppen("AE")).toEqual(Buffer.from([1]));
  });

  it("Schlüssel der alten Form (nur der Name, 64 Byte, bis 2.11.0) gelten nicht mehr", () => {
    const alt = alsGruppen(crypto.sign(null, Buffer.from(normalisiere("Sarah Mandel")), privateKey));
    expect(leseSchluessel(alt)).toBeNull();
    expect(pruefeSchluessel("Sarah Mandel", alt, OEFFENTLICH, KEINE).gueltig).toBe(false);
  });

  it("Groß-/Kleinschreibung, Leerzeichen und Trennstriche sind egal", () => {
    const s = signiere("  Sarah   Mandel ", 7, PRIVAT, "enterprise");
    expect(pruefeSchluessel("sarah mandel", s.toLowerCase().replace(/-/g, " "), OEFFENTLICH, KEINE).gueltig).toBe(true);
    expect(normalisiere("  Sarah   MANDEL ")).toBe("sarah mandel");
  });

  it("„ü“ als ein Zeichen oder als u + Trema (aus PDFs): derselbe Name", () => {
    const nfc = "Jürgen Müller";
    const nfd = nfc.normalize("NFD");
    expect(nfd).not.toBe(nfc);
    expect(pruefeSchluessel(nfd, signiere(nfc, 3, PRIVAT, "enterprise"), OEFFENTLICH, KEINE).gueltig).toBe(true);
    expect(pruefeSchluessel(nfc, signiere(nfd, 3, PRIVAT, "enterprise"), OEFFENTLICH, KEINE).gueltig).toBe(true);
    expect(normalisiere(nfd)).toBe("jürgen müller");
  });

  it("ohne gültige Nummer oder Namen wird nichts ausgestellt", () => {
    expect(() => signiere("Sarah Mandel", 0, PRIVAT, "enterprise")).toThrow(/Lizenznummer/);
    expect(() => signiere("Sarah Mandel", 1.5, PRIVAT, "enterprise")).toThrow(/Lizenznummer/);
    expect(() => signiere("Sarah Mandel", HOECHSTE_NUMMER + 1, PRIVAT, "enterprise")).toThrow(/Lizenznummer/);
    expect(() => signiere("   ", 7, PRIVAT, "enterprise")).toThrow(/Name/);
    const groesste = signiere("Sarah Mandel", HOECHSTE_NUMMER, PRIVAT, "enterprise");
    expect(pruefeSchluessel("Sarah Mandel", groesste, OEFFENTLICH, KEINE).nummer).toBe(HOECHSTE_NUMMER);
  });

  it("eine Nummer 0 gibt es nicht", () => {
    expect(leseSchluessel(alsGruppen(Buffer.alloc(68)))).toBeNull();
  });

  it("mit dem Platzhalter oder einem kaputten Prüfschlüssel ist nichts gültig", () => {
    const s = signiere("Sarah Mandel", 7, PRIVAT, "enterprise");
    expect(pruefeSchluessel("Sarah Mandel", s, "NOCH-NICHT-EINGERICHTET", KEINE).gueltig).toBe(false);
    expect(pruefeSchluessel("Sarah Mandel", s, "", KEINE).gueltig).toBe(false);
  });

  it("validiereSchluessel ist die Kurzform — mit der Sperrliste der App", () => {
    const s = signiere("Sarah Mandel", 7, PRIVAT, "enterprise");
    expect(validiereSchluessel("Sarah Mandel", s, OEFFENTLICH)).toBe(!GESPERRTE_LIZENZEN.includes(7));
    expect(validiereSchluessel("Thomas Akt", s, OEFFENTLICH)).toBe(false);
  });

  it("Base32 hin und zurück ist verlustfrei; die Nummer wird vierstellig angezeigt", () => {
    const bytes = crypto.randomBytes(71);
    expect(ausGruppen(alsGruppen(bytes))!.equals(bytes)).toBe(true);
    expect(ausGruppen("")).toBeNull();
    expect(formatiereNummer(7)).toBe("0007");
    expect(formatiereNummer(12345)).toBe("12345");
  });
});

describe("Stufen — Business und Enterprise, plus was davor ausgeliefert wurde", () => {
  it.each(["business", "enterprise"] as const)("%s wird signiert, gelesen und als diese Stufe geprüft", (edition) => {
    const s = signiere("Sarah Mandel", 7, PRIVAT, edition, edition === "business" ? 5 : undefined);
    expect(leseSchluessel(s)?.edition).toBe(edition);
    expect(pruefeSchluessel("Sarah Mandel", s, OEFFENTLICH, KEINE)).toEqual({
      gueltig: true,
      nummer: 7,
      gesperrt: false,
      edition,
      seats: edition === "enterprise" ? 0 : 5,
    });
  });

  it("Business braucht Seats von 1 bis 9999 — Enterprise wird nach Absprache lizenziert (0)", () => {
    expect(() => signiere("Sarah Mandel", 7, PRIVAT, "business")).toThrow(/Seats/);
    expect(() => signiere("Sarah Mandel", 7, PRIVAT, "business", 0)).toThrow(/Seats/);
    expect(() => signiere("Sarah Mandel", 7, PRIVAT, "business", 10000)).toThrow(/Seats/);
    expect(leseSchluessel(signiere("Sarah Mandel", 7, PRIVAT, "business", 9999))?.seats).toBe(9999);
    expect(pruefeSchluessel("Sarah Mandel", signiere("Sarah Mandel", 7, PRIVAT, "enterprise"), OEFFENTLICH, KEINE).seats).toBe(0);
  });

  it("Stufe und Seats sind mitsigniert — Umschreiben macht den Schlüssel ungültig", () => {
    const seats = ausGruppen(signiere("Sarah Mandel", 7, PRIVAT, "business", 5))!;
    seats.writeUInt16BE(50, 5);
    expect(pruefeSchluessel("Sarah Mandel", alsGruppen(seats), OEFFENTLICH, KEINE).gueltig).toBe(false);
    const stufe = ausGruppen(signiere("Sarah Mandel", 7, PRIVAT, "business", 5))!;
    stufe.writeUInt8(3, 4);
    expect(pruefeSchluessel("Sarah Mandel", alsGruppen(stufe), OEFFENTLICH, KEINE).gueltig).toBe(false);
  });

  it("die Altstufe mit mehr als einem Seat wird abgelehnt, auch wenn die Signatur echt ist", () => {
    const sig = crypto.sign(null, Buffer.from(`kepta-lizenz-v3.1\nsarah mandel\n7\npro\n5`), privateKey);
    const kopf = Buffer.alloc(7);
    kopf.writeUInt32BE(7);
    kopf.writeUInt8(1, 4);
    kopf.writeUInt16BE(5, 5);
    expect(pruefeSchluessel("Sarah Mandel", alsGruppen(Buffer.concat([kopf, sig])), OEFFENTLICH, KEINE).gueltig).toBe(false);
  });

  it("ein unbekannter Stufen-Code ist ungültig", () => {
    const bytes = ausGruppen(signiere("Sarah Mandel", 7, PRIVAT, "enterprise"))!;
    bytes.writeUInt8(9, 4);
    expect(pruefeSchluessel("Sarah Mandel", alsGruppen(bytes), OEFFENTLICH, KEINE).gueltig).toBe(false);
  });

  it("Schlüssel ohne Stufen-Byte (68 Byte, die Form davor) bleiben gültig und heißen alt", () => {
    const kopf = Buffer.alloc(4);
    kopf.writeUInt32BE(7);
    const alt = alsGruppen(Buffer.concat([kopf, crypto.sign(null, Buffer.from(`kepta-lizenz-v3\nsarah mandel\n7`), privateKey)]));
    expect(pruefeSchluessel("Sarah Mandel", alt, OEFFENTLICH, KEINE)).toEqual({ gueltig: true, nummer: 7, gesperrt: false, edition: "alt", seats: 1 });
  });
});

describe("die Sperrliste", () => {
  it("enthält nur ganze Nummern ab 1, aufsteigend und ohne Doppel — so, wie das Studio sie schreibt", () => {
    for (const n of GESPERRTE_LIZENZEN) expect(Number.isInteger(n) && n >= 1).toBe(true);
    expect([...GESPERRTE_LIZENZEN].sort((a, b) => a - b)).toEqual([...GESPERRTE_LIZENZEN]);
    expect(new Set(GESPERRTE_LIZENZEN).size).toBe(GESPERRTE_LIZENZEN.length);
  });

  it("die Demo-Nummer 999999 der Screenshots ist nie gesperrt", () => {
    expect(GESPERRTE_LIZENZEN).not.toContain(999999);
  });
});

describe("scripts/generate-license.mjs", () => {
  const umgebung = { ...process.env, KEPTA_LICENSE_PRIVATE_KEY: PRIVAT };

  it("stellt Schlüssel im selben Format aus, das die App prüft — mit ihrer Nummer", () => {
    const s = execFileSync(process.execPath, [SKRIPT, "--name", "Jürgen Müller".normalize("NFD"), "--nummer", "42", "--nur-schluessel"], {
      env: umgebung,
      encoding: "utf8",
    });
    expect(pruefeSchluessel("Jürgen Müller", s, OEFFENTLICH, KEINE)).toEqual({ gueltig: true, nummer: 42, gesperrt: false, edition: "enterprise", seats: 0 });
  });

  it("stellt Business-Schlüssel mit Seats aus — und lehnt Business ohne Seats ab", () => {
    const s = execFileSync(process.execPath, [SKRIPT, "--name", "Mandels Kanzlei", "--nummer", "43", "--edition", "business", "--seats", "5", "--nur-schluessel"], {
      env: umgebung,
      encoding: "utf8",
    });
    expect(pruefeSchluessel("Mandels Kanzlei", s, OEFFENTLICH, KEINE)).toEqual({ gueltig: true, nummer: 43, gesperrt: false, edition: "business", seats: 5 });
    const ohne = spawnSync(process.execPath, [SKRIPT, "--name", "Mandels Kanzlei", "--nummer", "43", "--edition", "business", "--nur-schluessel"], { env: umgebung, encoding: "utf8" });
    expect(ohne.status).toBe(1);
    expect(ohne.stderr).toMatch(/--seats/);
  });

  it("ohne Namen oder ohne gültige Nummer: Abbruch mit Hinweis, kein Schlüssel", () => {
    for (const argumente of [["--name", "Sarah Mandel"], ["--name", "Sarah Mandel", "--nummer", "0"], ["--nummer", "7"], ["--name", "Sarah Mandel", "--nummer", "abc"]]) {
      const r = spawnSync(process.execPath, [SKRIPT, ...argumente, "--nur-schluessel"], { env: umgebung, encoding: "utf8" });
      expect(r.status, argumente.join(" ")).toBe(1);
      expect(r.stdout).toBe("");
      expect(r.stderr).toMatch(/--nummer/);
    }
  });
});

describe("die App", () => {
  it("trägt einen echten Ed25519-Prüfschlüssel — einmalig: node scripts/license-keypair.mjs", () => {
    // Mit dem Platzhalter ginge die App raus, ohne dass je ein Schlüssel gilt.
    const k = crypto.createPublicKey({ key: Buffer.from(OEFFENTLICHER_SCHLUESSEL, "base64"), format: "der", type: "spki" });
    expect(k.asymmetricKeyType).toBe("ed25519");
  });

  it("enthält kein Signaturgeheimnis mehr", () => {
    for (const datei of ["server.ts", "src/core/lizenz.ts", "scripts/generate-license.mjs"]) {
      const quelle = fs.readFileSync(path.join(process.cwd(), datei), "utf8");
      expect(quelle, datei).not.toMatch(/createHmac\(/);
      expect(quelle, datei).not.toMatch(/-----BEGIN PRIVATE KEY-----/);
    }
  });
});

describe("keine Testphase", () => {
  it("lizenz.ts kennt keine Testtage — ohne Schlüssel ist die App gesperrt", () => {
    expect(Object.keys(lizenz).filter((k) => /trial/i.test(k))).toEqual([]);
  });
});
