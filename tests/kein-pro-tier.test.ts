// @vitest-environment node
//
// „Pro“ ist keine Stufe mehr — auch nicht dort, wo K3PTA-Enterprise-Schlüssel
// erzeugt werden (Damian, 9.10.2026: „Pro gibt es nicht mehr nirgends“). Ein
// Schlüssel aus der Zeit davor bleibt prüfbar: sein Stufenname steht in der
// Signatur und liesse sich nicht ändern, ohne ihn ungültig zu machen. Was sich
// ändern muss, ist der Name, den Menschen lesen — er ist immer K3PTA Enterprise.
//
// Ausnahmen von der Text-Wache: diese Datei und tests/doku-zahlen.test.ts (eine
// Wache muss benennen, was sie verbietet), CHANGELOG.md und docs/ (datierte
// Protokolle — die werden annotiert, nicht umgeschrieben) und tools/longmemeval
// (dort ist „pro“ Deutsch für „je“)..
import { describe, it, expect } from "vitest";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { EDITIONEN, EDITIONS_LABEL, HOECHSTE_NUMMER, alsGruppen, pruefeSchluessel, signiere } from "../src/core/lizenz";
import { editionVon, ladeListe, nachricht, speichereListe, stelleAus, trageEin } from "../tools/license-studio/kern";

const { publicKey, privateKey } = crypto.generateKeyPairSync("ed25519");
const PRIVAT = privateKey.export({ type: "pkcs8", format: "der" }).toString("base64");
const OEFFENTLICH = publicKey.export({ type: "spki", format: "der" }).toString("base64");
const KEINE = new Set<number>();

/** Einen Schlüssel so bauen, wie er vor der Neuausrichtung ausgeliefert wurde. */
function altschluessel(name: string, nummer: number, seats: number, stufenCode: number, drahtname: string): string {
  const kopf = Buffer.alloc(7);
  kopf.writeUInt32BE(nummer);
  kopf.writeUInt8(stufenCode, 4);
  kopf.writeUInt16BE(seats, 5);
  const text = `kepta-lizenz-v3.1\n${name.toLowerCase().normalize("NFC")}\n${nummer}\n${drahtname}\n${seats}`;
  return alsGruppen(Buffer.concat([kopf, crypto.sign(null, Buffer.from(text), privateKey)]));
}

describe("die Stufen, die es gibt", () => {
  it("ausstellen lässt sich nur Business und Enterprise — beide heißen K3PTA Enterprise", () => {
    expect(EDITIONEN).toEqual(["business", "enterprise"]);
    for (const stufe of EDITIONEN) expect(EDITIONS_LABEL[stufe]).toBe("K3PTA Enterprise");
    expect(Object.values(EDITIONS_LABEL).join(" ")).not.toMatch(/Pro\b/);
  });

  it("die frühere Einzelstufe lässt sich nicht mehr ausstellen", () => {
    const signiereFremd = signiere as unknown as (n: string, nr: number, k: string, e?: unknown, s?: number) => string;
    expect(() => signiereFremd("Sarah Mandel", 7, PRIVAT, "pro")).toThrow(/Stufe/);
    expect(() => signiereFremd("Sarah Mandel", 7, PRIVAT, undefined)).toThrow(/Stufe/);
  });
});

describe("Schlüssel aus der Zeit davor bleiben prüfbar", () => {
  it("ein Stufen-Byte 1 prüft weiter — und heißt in der Anzeige K3PTA Enterprise", () => {
    const p = pruefeSchluessel("Sarah Mandel", altschluessel("Sarah Mandel", 7, 1, 1, "pro"), OEFFENTLICH, KEINE);
    expect(p).toEqual({ gueltig: true, nummer: 7, gesperrt: false, edition: "alt", seats: 1 });
    expect(EDITIONS_LABEL[p.edition]).toBe("K3PTA Enterprise");
  });

  it("ein Schlüssel ganz ohne Stufen-Byte (68 Byte) prüft weiter", () => {
    const kopf = Buffer.alloc(4);
    kopf.writeUInt32BE(HOECHSTE_NUMMER);
    const text = `kepta-lizenz-v3\nsarah mandel\n${HOECHSTE_NUMMER}`;
    const alt = alsGruppen(Buffer.concat([kopf, crypto.sign(null, Buffer.from(text), privateKey)]));
    expect(pruefeSchluessel("Sarah Mandel", alt, OEFFENTLICH, KEINE)).toEqual({
      gueltig: true, nummer: HOECHSTE_NUMMER, gesperrt: false, edition: "alt", seats: 1,
    });
  });

  it("die Altstufe bleibt in ihren Seats streng — fünf Sitze für eine Einzel-Lizenz sind gefälscht", () => {
    expect(pruefeSchluessel("Sarah Mandel", altschluessel("Sarah Mandel", 7, 5, 1, "pro"), OEFFENTLICH, KEINE).gueltig).toBe(false);
  });
});

describe("das Ledger des Studios", () => {
  const datei = () => path.join(fs.mkdtempSync(path.join(os.tmpdir(), "kepta-pro-stufe-")), "licenses.json");

  it("Einträge mit der alten Stufenangabe bleiben stehen und heißen „alt“ — kein Schlüssel geht beim Lesen verloren", () => {
    const p = datei();
    fs.writeFileSync(p, JSON.stringify([
      { nummer: 7, name: "K3PTA Demo", key: "AAAAA-BBBBB", notiz: "", ausgestelltAm: "2026-09-17T15:53:46.367Z", edition: "pro" },
      { nummer: 1, name: "Damian Todorovic", key: "CCCCC-DDDDD", notiz: "", ausgestelltAm: "2026-09-13T21:41:56.596Z" },
      { nummer: 5, name: "Damian Test Business", key: "EEEEE-FFFFF", notiz: "", ausgestelltAm: "2026-09-16T12:48:43.702Z", edition: "business", seats: 5 },
    ]));
    const liste = ladeListe(p);
    expect(liste.map((e) => [e.nummer, e.edition])).toEqual([[7, "alt"], [1, "alt"], [5, "business"]]);
    expect(liste.map(editionVon)).toEqual(["alt", "alt", "business"]);
    speichereListe(p, liste);
    expect(ladeListe(p).map((e) => e.edition)).toEqual(["alt", "alt", "business"]);
  });

  it("was eingetragen wird, trägt die Stufe, die gewählt wurde — die alte Einzelstufe nie", () => {
    const p = datei();
    const { eintrag } = trageEin(p, "Mandels Kanzlei", "Handverkauf", PRIVAT, OEFFENTLICH, new Date("2026-10-10T09:00:00Z"), "business", 5);
    expect(eintrag.edition).toBe("business");
    expect(eintrag.seats).toBe(5);
    expect(() => trageEin(p, "Wer auch immer", "", PRIVAT, OEFFENTLICH, new Date(), "pro" as never)).toThrow(/Stufe/);
  });

  it("die Nachricht an den Kunden nennt die alte Stufe nicht und keine Aktivierung, die es seit 3.1.5 nicht mehr gibt", () => {
    const key = stelleAus("Sarah Mandel", 7, PRIVAT, OEFFENTLICH, "enterprise");
    for (const sprache of ["de", "en"] as const) {
      const t = nachricht("Sarah Mandel", 7, key, sprache, "enterprise");
      expect(t).toContain("K3PTA Enterprise");
      expect(t).toContain(key);
      expect(t).toContain("0007");
      expect(t).toMatch(sprache === "de" ? /unbegrenzt/ : /unlimited/);
      expect(t).not.toMatch(/Pro\b/);
      expect(t).not.toMatch(/K3PTA-Pro|Upgrade|activate|aktivier/i);
    }
    const alt = altschluessel("K3PTA Demo", 7, 1, 1, "pro");
    for (const sprache of ["de", "en"] as const) {
      const t = nachricht("K3PTA Demo", 7, alt, sprache, "alt");
      expect(t).not.toMatch(/Pro\b/);
      expect(t).not.toMatch(/K3PTA-Pro|Upgrade|activate|aktivier/i);
      expect(t).toContain("K3PTA Enterprise");
    }
  });

  it("eine Team-Lizenz nennt die Seats und bleibt beim Produktnamen", () => {
    const key = stelleAus("Mandels Kanzlei", 8, PRIVAT, OEFFENTLICH, "business", 5);
    expect(nachricht("Mandels Kanzlei", 8, key, "de", "business", 5)).toMatch(/5 Seats/);
    expect(nachricht("Mandels Kanzlei", 8, key, "en", "business", 5)).toMatch(/5 seats/);
  });
});

describe("das Schlüssel-Werkzeug auf der Kommandozeile", () => {
  const CLI = path.join(process.cwd(), "scripts", "generate-license.mjs");
  const aufruf = (...args: string[]) => spawnSync(process.execPath, [CLI, ...args], {
    encoding: "utf8",
    env: { ...process.env, KEPTA_LICENSE_PRIVATE_KEY: PRIVAT },
  });

  it("ein Business-Schlüssel aus dem Skript wird von derselben Prüfung angenommen wie einer aus dem Studio", () => {
    const out = aufruf("--name", "Mandels Kanzlei", "--nummer", "8", "--edition", "business", "--seats", "5", "--nur-schluessel");
    expect(out.status, out.stderr).toBe(0);
    expect(pruefeSchluessel("Mandels Kanzlei", out.stdout.trim(), OEFFENTLICH, KEINE)).toMatchObject({ gueltig: true, nummer: 8, edition: "business", seats: 5 });
  });

  it("die alte Einzelstufe wird abgewiesen, bevor irgendetwas signiert wird", () => {
    const out = aufruf("--name", "Sarah Mandel", "--nummer", "7", "--edition", "pro");
    expect(out.status).toBe(1);
    expect(out.stderr).not.toMatch(/Pro\b/);
    expect(out.stderr).toMatch(/business, enterprise/);
  });
});

describe("kein Pro als Stufe im Bestand", () => {
  const ORDNUNGEN = ["src", "server", "scripts", "tools", "tests"];
  const ENDUNGEN = new Set([".ts", ".tsx", ".js", ".mjs", ".cjs", ".html", ".css", ".json", ".md", ".toml"]);
  const WURZELDATEIEN = ["README.md", "AGENTS.md", "SECURITY.md", "SECURITY-ENTERPRISE.md", "ROADMAP.md", "CONTRIBUTING.md", "electron.js"];
  const FREI: RegExp[] = [
    /[\\/]node_modules[\\/]/,
    /[\\/]dist[\\/]/,
    /[\\/]release[\\/]/,
    /\.map$/,
    /[\\/]longmemeval[\\/]/,
    /[\\/](kein-pro-tier|doku-zahlen)\.test\.ts$/,
  ];

  function quellen(): string[] {
    const gefunden: string[] = [];
    const geh = (ordner: string) => {
      for (const e of fs.readdirSync(ordner, { withFileTypes: true })) {
        const p = path.join(ordner, e.name);
        if (FREI.some((r) => r.test(p))) continue;
        if (e.isDirectory()) geh(p);
        else if (ENDUNGEN.has(path.extname(e.name))) gefunden.push(p);
      }
    };
    for (const o of ORDNUNGEN) {
      if (fs.existsSync(path.join(process.cwd(), o))) geh(path.join(process.cwd(), o));
    }
    for (const f of WURZELDATEIEN) {
      const p = path.join(process.cwd(), f);
      if (fs.existsSync(p)) gefunden.push(p);
    }
    return gefunden;
  }

  // Großgeschrieben ist „Pro" der Produktname; „kepta-pro-releases" (404) und
  // das deutsche „pro" (= je) sind keine Stufen-Nennung.
  const VERBOTEN: RegExp[] = [
    /KEPTA[\s-]Pro\b/g,
    /\bPro[- ](Feature|Tag|Plan|Stufe|Lizenz|Kauf|license|day|plan|tier)\b/g,
    /Upgrade to Pro/g,
  ];

  it("keine Datei im Bestand benennt die tote Stufe als Produkt", () => {
    const fehl: string[] = [];
    for (const q of quellen()) {
      const text = fs.readFileSync(q, "utf8");
      for (const muster of VERBOTEN) {
        for (const m of text.matchAll(muster)) {
          fehl.push(`${path.relative(process.cwd(), q)}: „${m[0]}“`);
        }
      }
    }
    expect(fehl.join("\n")).toBe("");
  });

  it("die tote Stufe steht nirgends zur Auswahl", () => {
    const html = fs.readFileSync(path.join(process.cwd(), "tools", "license-studio", "index.html"), "utf8");
    expect(html).not.toMatch(/value="pro"/);
    const cli = fs.readFileSync(path.join(process.cwd(), "scripts", "generate-license.mjs"), "utf8");
    expect(cli).not.toMatch(/--edition pro/);
    const haupt = fs.readFileSync(path.join(process.cwd(), "tools", "license-studio", "main.ts"), "utf8");
    expect(haupt).not.toMatch(/:\s*"pro"/);
  });
});
