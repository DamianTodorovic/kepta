// @vitest-environment node
//
// KEPTA License Studio (tools/license-studio): was das Studio ausstellt, muss
// die App annehmen — mit Name und Lizenznummer, offline. Gesperrte Nummern
// gelten nicht. Geprüft mit src/core/lizenz.ts und einem eigenen Testpaar;
// den privaten Schlüssel der echten App gibt es nur in Damians Schlüsselbund.
import { describe, it, expect } from "vitest";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pruefeSchluessel } from "../src/core/lizenz";
import {
  DOWNLOAD, anzeigeName, gesperrteNummern, hinweise, ladeListe, leseSperrliste, nachricht, naechsteNummer,
  passtZurApp, pruefe, sperre, sperrlisteQuelle, stelleAus, trageEin, vorname,
} from "../tools/license-studio/kern";

function paar() {
  const { publicKey, privateKey } = crypto.generateKeyPairSync("ed25519");
  return {
    privat: privateKey.export({ type: "pkcs8", format: "der" }).toString("base64"),
    oeffentlich: publicKey.export({ type: "spki", format: "der" }).toString("base64"),
  };
}
const { privat, oeffentlich } = paar();
const fremd = paar();
const KEINE = new Set<number>();
const neueDatei = () => path.join(fs.mkdtempSync(path.join(os.tmpdir(), "kepta-studio-")), "unterordner", "licenses.json");
const eintrag = (nummer: number, name: string, extra: object = {}) => ({ nummer, name, key: stelleAus(name, nummer, privat, oeffentlich), notiz: "", ausgestelltAm: "2026-09-13T12:00:00.000Z", ...extra });

describe("ausstellen", () => {
  it("ein ausgestellter Schlüssel besteht die Prüfung der App — mit seiner Nummer", () => {
    const key = stelleAus("Sarah Mandel", 7, privat, oeffentlich);
    expect(pruefeSchluessel("  sarah  MANDEL ", key, oeffentlich, KEINE)).toEqual({ gueltig: true, nummer: 7, gesperrt: false, edition: "pro", seats: 1 });
    expect(pruefeSchluessel("Sara Mandel", key, oeffentlich, KEINE).gueltig).toBe(false);
  });

  it("derselbe Name mit derselben Nummer ergibt immer denselben Schlüssel — eine andere Nummer einen anderen", () => {
    expect(stelleAus("Sarah Mandel", 7, privat, oeffentlich)).toBe(stelleAus("  sarah   MANDEL ", 7, privat, oeffentlich));
    expect(stelleAus("Sarah Mandel", 8, privat, oeffentlich)).not.toBe(stelleAus("Sarah Mandel", 7, privat, oeffentlich));
  });

  it("passt der Signaturschlüssel nicht zur App, wird nichts ausgestellt", () => {
    expect(() => stelleAus("Sarah Mandel", 7, fremd.privat, oeffentlich)).toThrow(/passt nicht zur App/);
    expect(passtZurApp(privat, oeffentlich)).toBe(true);
    expect(passtZurApp(fremd.privat, oeffentlich)).toBe(false);
    expect(passtZurApp("kein schluessel", oeffentlich)).toBe(false);
  });

  it("ohne Namen oder mit überlangem Namen: eine klare Meldung", () => {
    expect(() => stelleAus("   ", 7, privat, oeffentlich)).toThrow(/Namen/);
    expect(() => stelleAus("x".repeat(201), 7, privat, oeffentlich)).toThrow(/zu lang/);
  });

  it("„ü“ als ein Zeichen oder als u + Trema: derselbe Name, derselbe Schlüssel", () => {
    const nfd = "Jürgen Müller".normalize("NFD");
    expect(anzeigeName(`  ${nfd} `)).toBe("Jürgen Müller");
    expect(stelleAus(nfd, 3, privat, oeffentlich)).toBe(stelleAus("Jürgen Müller", 3, privat, oeffentlich));
  });
});

describe("hinweise zum Namen", () => {
  it("ein gewöhnlicher Name braucht keinen", () => {
    expect(hinweise("Sarah Mandel")).toEqual([]);
    expect(hinweise("   ")).toEqual([]);
  });

  it("Umlaute, Ziffern und ein einzelnes Wort werden angesprochen", () => {
    expect(hinweise("Jürgen Müller").join(" ")).toMatch(/Umlaute/);
    expect(hinweise("Studio 42 GmbH").join(" ")).toMatch(/Ziffern/);
    expect(hinweise("Madonna").join(" ")).toMatch(/Nur ein Wort/);
  });
});

describe("die Nachricht an den Kunden", () => {
  it.each(["de", "en"] as const)("%s: Name, Nummer, Schlüssel, Download, ‚nur einmal‘ und ‚offline‘ — keine Testphase, kein Mac-Code", (sprache) => {
    const key = stelleAus("Sarah Mandel", 7, privat, oeffentlich);
    const t = nachricht("  Sarah   Mandel ", 7, key, sprache);
    expect(t).toContain("Sarah Mandel");
    expect(t).toContain(key);
    expect(t).toContain("0007");
    expect(t).toContain(DOWNLOAD);
    expect(t).toMatch(sprache === "de" ? /^Hallo Sarah,/ : /^Hi Sarah,/);
    expect(t).toMatch(sprache === "de" ? /nur einmal/ : /only once/);
    expect(t).toMatch(sprache === "de" ? /nichts verlässt deinen Mac/ : /nothing leaves your Mac/);
    expect(t).not.toMatch(/trial|Testphase|@kepta\.app|Mac's code|Mac-Code/i);
  });

  it("der Vorname ist das erste Wort", () => {
    expect(vorname("  Sarah Mandel")).toBe("Sarah");
    expect(vorname("")).toBe("");
  });

  it("die Stufe steht in der Nachricht — Pro persönlich, Business mit Seats, Enterprise nach Absprache", () => {
    const key = stelleAus("Sarah Mandel", 7, privat, oeffentlich);
    expect(nachricht("Sarah Mandel", 7, key, "de")).toContain("Das ist eine KEPTA-Pro-Lizenz, persönlich für dich.");
    expect(nachricht("Sarah Mandel", 7, key, "en")).toContain("This is a KEPTA Pro license for you personally.");
    const business = stelleAus("Mandels Kanzlei", 8, privat, oeffentlich, "business", 5);
    expect(nachricht("Mandels Kanzlei", 8, business, "de", "business", 5)).toContain("für 5 Seats");
    expect(nachricht("Mandels Kanzlei", 8, business, "en", "business", 5)).toContain("covering 5 seats");
    const enterprise = stelleAus("Big Corp", 9, privat, oeffentlich, "enterprise");
    expect(nachricht("Big Corp", 9, enterprise, "de", "enterprise")).toContain("individuell vereinbart");
    expect(nachricht("Big Corp", 9, enterprise, "en", "enterprise")).toContain("agreed with your organization");
  });
});

describe("prüfen (Support)", () => {
  it("gültig mit Nummer — gesperrt — oder: für wen der Schlüssel eigentlich ausgestellt wurde", () => {
    const e = eintrag(7, "Sarah Mandel");
    const liste = [e];
    expect(pruefe("sarah mandel", e.key, liste, oeffentlich)).toEqual({ gueltig: true, nummer: 7, gesperrt: false, edition: "pro", seats: 1, gehoertZu: null });
    expect(pruefe("Sara Mandel", e.key.toLowerCase().replace(/-/g, " "), liste, oeffentlich)).toEqual({ gueltig: false, nummer: null, gesperrt: false, edition: "pro", seats: 1, gehoertZu: { name: "Sarah Mandel", nummer: 7 } });
    expect(pruefe("Sara Mandel", "AAAAA-BBBBB", liste, oeffentlich)).toEqual({ gueltig: false, nummer: null, gesperrt: false, edition: "pro", seats: 1, gehoertZu: null });
    expect(pruefe("Sara Mandel", "!!", liste, oeffentlich).gehoertZu).toBeNull();
    const gesperrt = [{ ...e, gesperrt: true }];
    expect(pruefe("Sarah Mandel", e.key, gesperrt, oeffentlich)).toEqual({ gueltig: false, nummer: 7, gesperrt: true, edition: "pro", seats: 1, gehoertZu: null });
  });
});

describe("Nummern und Sperrliste", () => {
  it("die nächste Nummer ist eins über der höchsten — die erste ist 1", () => {
    expect(naechsteNummer([])).toBe(1);
    expect(naechsteNummer([eintrag(3, "A B"), eintrag(9, "C D")])).toBe(10);
  });

  it("die gesperrten Nummern, aufsteigend und ohne Doppel", () => {
    expect(gesperrteNummern([eintrag(9, "A B", { gesperrt: true }), eintrag(2, "C D", { gesperrt: true }), eintrag(5, "E F")])).toEqual([2, 9]);
  });

  it("die Sperrliste als Quelltext: hin und zurück verlustfrei — leer genau so wie src/core/sperrliste.ts im Repo", () => {
    expect(leseSperrliste(sperrlisteQuelle([9, 2, 9, 0, 1.5]))).toEqual([2, 9]);
    expect(sperrlisteQuelle([])).toBe(fs.readFileSync(path.join(process.cwd(), "src", "core", "sperrliste.ts"), "utf8"));
    expect(leseSperrliste("kein Quelltext")).toEqual([]);
  });
});

describe("die Liste der ausgestellten Lizenzen", () => {
  it("fehlt die Datei, ist sie leer; die erste Lizenz bekommt Nr. 1 — nur für den eigenen Benutzer lesbar", () => {
    const datei = neueDatei();
    expect(ladeListe(datei)).toEqual([]);
    const r = trageEin(datei, " Sarah  Mandel ", "  Harbor Advisory ", privat, oeffentlich, new Date("2026-09-13T12:00:00Z"));
    expect(r.neu).toBe(true);
    expect(r.eintrag).toEqual({ nummer: 1, name: "Sarah Mandel", key: stelleAus("Sarah Mandel", 1, privat, oeffentlich), notiz: "Harbor Advisory", ausgestelltAm: "2026-09-13T12:00:00.000Z", edition: "pro" });
    expect(ladeListe(datei)).toEqual([r.eintrag]);
    expect(fs.statSync(datei).mode & 0o777).toBe(0o600);
    expect(fs.readdirSync(path.dirname(datei))).toEqual(["licenses.json"]);
  });

  it("dieselbe Stufe: dieselbe Lizenz; eine andere Stufe ist ein neuer Vertrag mit neuer Nummer", () => {
    const datei = neueDatei();
    trageEin(datei, "Sarah Mandel", "", privat, oeffentlich);
    const wieder = trageEin(datei, "SARAH mandel", "anders", privat, oeffentlich, new Date(), "pro");
    expect(wieder.neu).toBe(false);
    expect(wieder.eintrag.nummer).toBe(1);
    const business = trageEin(datei, "Sarah Mandel", "Teamvertrag", privat, oeffentlich, new Date(), "business", 5);
    expect(business.neu).toBe(true);
    expect(business.eintrag.nummer).toBe(2);
    expect(business.eintrag.edition).toBe("business");
    expect(business.eintrag.seats).toBe(5);
    const nochmal = trageEin(datei, "Sarah Mandel", "", privat, oeffentlich, new Date(), "business", 5);
    expect(nochmal.neu).toBe(false);
    expect(nochmal.eintrag.nummer).toBe(2);
  });

  it("derselbe Name: dieselbe Lizenz; ein neuer Name: die nächste Nummer — die neueste oben", () => {
    const datei = neueDatei();
    trageEin(datei, "Sarah Mandel", "", privat, oeffentlich);
    const wieder = trageEin(datei, "SARAH mandel", "anders", privat, oeffentlich);
    expect(wieder.neu).toBe(false);
    expect(wieder.eintrag.nummer).toBe(1);
    trageEin(datei, "Thomas Akt", "", privat, oeffentlich);
    expect(ladeListe(datei).map((e) => [e.nummer, e.name])).toEqual([[2, "Thomas Akt"], [1, "Sarah Mandel"]]);
  });

  it("sperren und entsperren — ist die Lizenz eines Namens gesperrt, bekommt er beim nächsten Mal eine neue Nummer", () => {
    const datei = neueDatei();
    trageEin(datei, "Sarah Mandel", "", privat, oeffentlich);
    expect(gesperrteNummern(sperre(datei, 1, true))).toEqual([1]);
    const neu = trageEin(datei, "Sarah Mandel", "", privat, oeffentlich);
    expect(neu.neu).toBe(true);
    expect(neu.eintrag.nummer).toBe(2);
    expect(gesperrteNummern(sperre(datei, 1, false))).toEqual([]);
    expect(ladeListe(datei).find((e) => e.nummer === 1)).not.toHaveProperty("gesperrt");
    expect(() => sperre(datei, 99, true)).toThrow(/Nr\. 0099/);
  });

  it("ohne Namen wird nichts eingetragen", () => {
    const datei = neueDatei();
    expect(() => trageEin(datei, "  ", "", privat, oeffentlich)).toThrow(/Namen/);
    expect(fs.existsSync(datei)).toBe(false);
  });

  it("eine beschädigte Liste wird nie überschrieben", () => {
    const datei = neueDatei();
    fs.mkdirSync(path.dirname(datei), { recursive: true });
    fs.writeFileSync(datei, "{kaputt");
    expect(() => ladeListe(datei)).toThrow(/beschädigt/);
    expect(() => trageEin(datei, "Sarah Mandel", "", privat, oeffentlich)).toThrow(/beschädigt/);
    expect(fs.readFileSync(datei, "utf8")).toBe("{kaputt");
    fs.writeFileSync(datei, '{"kein":"array"}');
    expect(() => ladeListe(datei)).toThrow(/beschädigt/);
  });

  it("Einträge in falscher Form — ohne Nummer, mit falschem Sperr-Feld — werden beim Lesen übergangen", () => {
    const datei = neueDatei();
    fs.mkdirSync(path.dirname(datei), { recursive: true });
    const gut = { nummer: 4, name: "Sarah Mandel", key: "K", notiz: "", ausgestelltAm: "2026-09-13T12:00:00.000Z" };
    fs.writeFileSync(datei, JSON.stringify([{ name: 1 }, null, { ...gut, nummer: 0 }, { ...gut, gesperrt: "ja" }, gut]));
    expect(ladeListe(datei)).toEqual([gut]);
  });
});

describe("das Studio kommt nie in die KEPTA-App", () => {
  it("das Kundenpaket enthält nur dist/, electron.js und package.json", () => {
    const cfg = JSON.parse(fs.readFileSync(path.join(process.cwd(), "electron-builder.json"), "utf8")) as { files: string[] };
    expect(cfg.files.filter((f) => !f.startsWith("!"))).toEqual(["dist/**/*", "electron.js", "package.json"]);
  });
});
