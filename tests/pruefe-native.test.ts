// @vitest-environment node
//
// Die Pruefung der gepackten Apps (scripts/pruefe-native.mjs): erkennt sie die
// Architektur der nativen SQLite-Verschluesselung richtig — und schlaegt sie an,
// wenn ein x64-Modul in einer arm64-App steckt?
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { architektur, erwartet, findeApps, pruefe, abiKonflikt, pruefeNode, probeCode, fehlerBeimLaden } from "../scripts/pruefe-native.mjs";

function machO(cpu: number): Buffer {
  const b = Buffer.alloc(32);
  b.writeUInt32LE(0xfeedfacf, 0);
  b.writeUInt32LE(cpu, 4);
  return b;
}
function elf(maschine: number): Buffer {
  const b = Buffer.alloc(64);
  b.writeUInt32BE(0x7f454c46, 0);
  b.writeUInt16LE(maschine, 18);
  return b;
}
function pe(maschine: number): Buffer {
  const b = Buffer.alloc(0x100);
  b.write("MZ", 0, "latin1");
  b.writeUInt32LE(0x80, 0x3c);
  b.write("PE\0\0", 0x80, "latin1");
  b.writeUInt16LE(maschine, 0x84);
  return b;
}

describe("architektur", () => {
  it("liest Mach-O, ELF und PE", () => {
    expect(architektur(machO(0x0100000c))).toBe("arm64");
    expect(architektur(machO(0x01000007))).toBe("x64");
    expect(architektur(machO(7))).toBe("mach-o:7");
    expect(architektur(elf(0xb7))).toBe("arm64");
    expect(architektur(elf(0x3e))).toBe("x64");
    expect(architektur(elf(0x28))).toBe("elf:28");
    expect(architektur(pe(0xaa64))).toBe("arm64");
    expect(architektur(pe(0x8664))).toBe("x64");
    expect(architektur(pe(0x14c))).toBe("pe:14c");
    expect(architektur(Buffer.from("kein binaer"))).toBe("unbekannt");
  });

  it("erkennt das echte Modul dieses Rechners", () => {
    const req = createRequire(import.meta.url);
    const wurzel = path.dirname(req.resolve("better-sqlite3-multiple-ciphers/package.json"));
    const binaer = path.join(wurzel, "build", "Release", "better_sqlite3.node");
    expect(architektur(fs.readFileSync(binaer))).toBe(process.arch);
  });
});

describe("erwartet", () => {
  it("nimmt die Architektur aus den Ordnernamen von electron-builder", () => {
    expect(erwartet("mac-arm64")).toBe("arm64");
    expect(erwartet("mac")).toBe("x64");
    expect(erwartet("linux-arm64-unpacked")).toBe("arm64");
    expect(erwartet("linux-unpacked")).toBe("x64");
    expect(erwartet("win-unpacked")).toBe("x64");
  });
});

describe("pruefe", () => {
  function release(inhalt: Record<string, Buffer | null>): string {
    const r = fs.mkdtempSync(path.join(os.tmpdir(), "kepta-release-"));
    for (const [ordner, binaer] of Object.entries(inhalt)) {
      const res = ordner.startsWith("mac")
        ? path.join(r, ordner, "KEPTA.app", "Contents", "Resources")
        : path.join(r, ordner, "resources");
      fs.mkdirSync(res, { recursive: true });
      fs.writeFileSync(path.join(res, "app.asar"), "");
      if (binaer) {
        const ziel = path.join(res, "app.asar.unpacked", "node_modules", "better-sqlite3-multiple-ciphers", "build", "Release");
        fs.mkdirSync(ziel, { recursive: true });
        fs.writeFileSync(path.join(ziel, "better_sqlite3.node"), binaer);
      }
    }
    fs.writeFileSync(path.join(r, "KEPTA-2.11.0.dmg"), "");
    return r;
  }

  it("findet mac-, linux- und win-Apps samt erwarteter Architektur", () => {
    const r = release({ "mac-arm64": machO(0x0100000c), "linux-unpacked": elf(0x3e), "win-arm64-unpacked": pe(0xaa64) });
    const apps = findeApps(r).map((a) => [a.ordner, a.arch]).sort();
    expect(apps).toEqual([["linux-unpacked", "x64"], ["mac-arm64", "arm64"], ["win-arm64-unpacked", "arm64"]]);
    expect(pruefe(r, { starten: false, protokoll: () => undefined })).toBe(3);
  });

  it("schlaegt an bei falscher Architektur, fehlendem Modul oder ohne App", () => {
    const falsch = release({ "mac-arm64": machO(0x01000007) });
    expect(() => pruefe(falsch, { starten: false, protokoll: () => undefined })).toThrow("x64 statt arm64");
    const fehlt = release({ "linux-arm64-unpacked": null });
    expect(() => pruefe(fehlt, { starten: false, protokoll: () => undefined })).toThrow("fehlt in app.asar.unpacked");
    expect(() => pruefe(fs.mkdtempSync(path.join(os.tmpdir(), "kepta-leer-")), { starten: false })).toThrow("Keine gepackte App");
  });
});

// Der andere Irrtum, den ein Paketbau hinterlaessst: er baut das native Modul fuer
// Electron in node_modules um, und der naechste Testlauf unter Node faellt mit 460
// Fehlern — deren sichtbare Meldung eine Nachlaufzeile aus dem afterEach ist, nicht
// die Ursache. Die Wache vor `npm test` soll den Grund nennen, bevor die Suite laeuft.
const ABI_STREIT = `Error: The module '.../better_sqlite3.node'
was compiled against a different Node.js version using
NODE_MODULE_VERSION 149. This version of Node.js requires
NODE_MODULE_VERSION 147. Please try re-compiling or re-installing
the module (for instance, using \`npm rebuild\` or \`npm install\`).`;

describe("Die Wache vor dem Testlauf", () => {
  it("erkennt den ABI-Streit an der echten Meldung", () => {
    expect(abiKonflikt(ABI_STREIT)).toBe(true);
  });

  it("haelt einen echten Fehler nicht fuer einen ABI-Streit", () => {
    expect(abiKonflikt("TypeError: Cannot read properties of undefined (reading 'close')")).toBe(false);
    expect(abiKonflikt("")).toBe(false);
  });

  it("nennt die Heilung, wenn das Modul fuer eine andere Laufzeit gebaut ist", () => {
    const zeilen: string[] = [];
    expect(pruefeNode({ fehler: () => ABI_STREIT, protokoll: (t: string) => zeilen.push(t) })).toBe(false);
    expect(zeilen.length).toBe(1);
    expect(zeilen[0]).toContain("npm rebuild better-sqlite3-multiple-ciphers");
    expect(zeilen[0]).toContain("Kein Fehler im Code");
  });

  it("schweigt, wenn das Modul laedt", () => {
    const zeilen: string[] = [];
    expect(pruefeNode({ fehler: () => null, protokoll: (t: string) => zeilen.push(t) })).toBe(true);
    expect(zeilen).toEqual([]);
  });

  it("erfindet keinen ABI-Streit, wenn etwas anderes kaputt ist", () => {
    const zeilen: string[] = [];
    const text = "Error: Could not locate the bindings file. Tried:\n -> /x/better_sqlite3.node";
    expect(pruefeNode({ fehler: () => text, protokoll: (t: string) => zeilen.push(t) })).toBe(false);
    expect(zeilen.join(" ")).toContain("Could not locate the bindings file");
    expect(zeilen.join(" ")).not.toContain("npm rebuild");
  });

  // B9 — die Wache mass nichts, was sie nicht anfasst. Das Modul bindet sein
  // natives Binary faul: ein nacktes require sieht den ABI-Streit nie. Die drei
  // Faelle darunter bauen den Streit nach, ohne ein Binary umzubauen.
  function stubModul(): { pfad: string, ordner: string } {
    const ordner = fs.mkdtempSync(path.join(os.tmpdir(), "kepta-faulbindung-"));
    const pfad = path.join(ordner, "faules-modul.cjs");
    fs.writeFileSync(pfad, [
      "module.exports = class FaulesModul {",
      "  constructor() {",
      `    throw new Error(${JSON.stringify(ABI_STREIT)});`,
      "  }",
      "};",
      "",
    ].join("\n"));
    return { pfad, ordner };
  }
  function kind(code: string): { ging: boolean, fehlerText: string } {
    try {
      execFileSync(process.execPath, ["-e", code], { stdio: ["ignore", "ignore", "pipe"], timeout: 30_000 });
      return { ging: true, fehlerText: "" };
    } catch (e) {
      return { ging: false, fehlerText: String((e as { stderr?: string }).stderr ?? (e as Error).message) };
    }
  }

  it("ein Modul, das nur beim requiren laedt, taeuscht die alte Pruefung — die Probe faengt es", () => {
    const { pfad, ordner } = stubModul();
    try {
      const alt = kind(`require(${JSON.stringify(pfad)});`);
      expect(alt.ging, "das nackte require warf doch — dann ist der Nachbau keins").toBe(true);
      const neu = kind(probeCode(pfad, path.join(ordner, "probe.db")));
      expect(neu.ging, "die Probe liess einen faul bindenden Baustein durch").toBe(false);
      expect(abiKonflikt(neu.fehlerText), `kein ABI-Wort im Kind: ${neu.fehlerText.slice(0, 120)}`).toBe(true);
    } finally {
      fs.rmSync(ordner, { recursive: true, force: true });
    }
  });

  it("pruefeNode nennt die Heilung auch ohne geschenkten Fehlertext", () => {
    const { pfad, ordner } = stubModul();
    try {
      const zeilen: string[] = [];
      const echt = () => kind(probeCode(pfad, path.join(ordner, "probe.db"))).fehlerText;
      expect(pruefeNode({ fehler: echt, protokoll: (t: string) => zeilen.push(t) })).toBe(false);
      expect(zeilen.join(" ")).toContain("npm rebuild better-sqlite3-multiple-ciphers");
      expect(zeilen.join(" ")).toContain("kein Paketbau mehr");
    } finally {
      fs.rmSync(ordner, { recursive: true, force: true });
    }
  });

  it("die echte Funktion selbst faellt durch die faul bindende Tuer", () => {
    // Nicht nur der gebaute Code wird geprueft, sondern der Griff, den die Wache
    // wirklich tut: wer fehlerBeimLaden() auf ein nacktes require zurueckdreht,
    // sieht hier rot — nicht erst in der naechsten Suite, die 59 Dateien verliert.
    const { pfad, ordner } = stubModul();
    try {
      const text = fehlerBeimLaden(pfad);
      expect(text, "die Wache liess einen faul bindenden Baustein durch").not.toBeNull();
      expect(abiKonflikt(String(text)), `kein ABI-Wort: ${String(text).slice(0, 120)}`).toBe(true);
    } finally {
      fs.rmSync(ordner, { recursive: true, force: true });
    }
  });

  it("die echte Probe verschluesselt auf diesem Rechner eine Probedatenbank", () => {
    // Der gruene Zweig: dasselbe Kind, das den faul bindenden Baustein erwischt,
    // muss am echten Modul durchkommen — sonst ist die Wache nur laut.
    expect(fehlerBeimLaden()).toBe(null);
  });
});
