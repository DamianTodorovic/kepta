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
import { architektur, erwartet, findeApps, pruefe } from "../scripts/pruefe-native.mjs";

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
