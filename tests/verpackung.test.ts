// @vitest-environment node
//
// Was die ausgelieferte App nicht enthalten darf: Quellkarten. Bis 2.11 lag
// dist/server.cjs.map im Paket — mit dem Originalquelltext von 17 Dateien,
// Kommentare inklusive. Wer die DMG lud, konnte den Server lesen.
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

const lies = (datei: string) => JSON.parse(fs.readFileSync(path.join(process.cwd(), datei), "utf8"));

describe("das App-Paket", () => {
  it("nimmt keine Quellkarten mit — auch keine von Bibliotheken", () => {
    const dateien: string[] = lies("electron-builder.json").files;
    expect(dateien).toContain("!**/*.map");
    // Die engere Regel für dist ist in der globalen ausgeschlossenen enthalten;
    // nichts anderes darf Maps wieder hereinbringen.
    expect(dateien.filter((f) => f.startsWith("!") && !f.startsWith("!**/"))).toEqual([]);
  });

  it("verkleinert den Server-Code, behält aber die Funktionsnamen", () => {
    const build: string = lies("package.json").scripts.build;
    expect(build).toMatch(/esbuild server\.ts[^&]*--minify/);
    expect(build).toMatch(/esbuild server\.ts[^&]*--keep-names/);
  });
});
