// @vitest-environment node
//
// Das Release-Werkzeug hat beim Hochzählen von 3.1.2 auf 3.1.3 auch zwei
// ABHÄNGIGKEITEN im Sperrschema erwischt: `bytes` und `@jridgewell/resolve-uri`
// standen danach auf einer Version, die es auf registry.npmjs.org nie gab. Der
// CI-Lauf auf Ubuntu brach mit `ETARGET notarget No matching version found for
// bytes@3.1.3` ab — ein Fehler im Bauwerkzeug, nicht im Code, aber einer, der
// jede saubere Installation unmöglich macht.
//
// Die Wache prüft die eine Invariante, die beide Fälle erwischt: was im
// Sperrschema steht, muss das sein, was auf dem Rechner liegt. Kein Netzwerk,
// keine Auslegung — zwei Dateien pro Paket.
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { vergleicheLock } from "../scripts/pruefe-lock.mjs";

const wurzel = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/** Ein Sperrschema-Ordner im TEMP, damit der echte Baum unangetastet bleibt. */
function probe(pakete: Record<string, { version?: string; link?: boolean }>, installed: Record<string, string>): string {
  const ordner = fs.mkdtempSync(path.join(os.tmpdir(), "kepta-lock-"));
  for (const [pfad, eintrag] of Object.entries(pakete)) {
    if (pfad === "") continue;
    if (eintrag.link) continue;
    fs.mkdirSync(path.join(ordner, pfad), { recursive: true });
    fs.writeFileSync(path.join(ordner, pfad, "package.json"), JSON.stringify({ name: pfad.split("/").pop(), version: installed[pfad] }));
  }
  fs.writeFileSync(path.join(ordner, "package-lock.json"), JSON.stringify({ packages: pakete }));
  return ordner;
}

describe("Sperrschema und installierter Baum dürfen nicht auseinanderlaufen", () => {
  it("meldet nichts, wenn Sperrschema und Baum auf dem Rechner zusammengehen", () => {
    const ordner = probe({ "": { version: "3.1.3" }, "node_modules/ding": { version: "1.9.0" } }, { "node_modules/ding": "1.9.0" });
    try {
      expect(vergleicheLock(ordner)).toEqual([]);
    } finally {
      fs.rmSync(ordner, { recursive: true, force: true });
    }
  });

  it("meldet eine Abhängigkeit, deren Sperrversion nicht auf dem Rechner liegt", () => {
    const ordner = probe({ "node_modules/ding": { version: "2.0.0" } }, { "node_modules/ding": "1.9.0" });
    try {
      const abweichungen = vergleicheLock(ordner);
      expect(abweichungen.length).toBe(1);
      expect(abweichungen[0]).toContain("node_modules/ding");
      expect(abweichungen[0]).toContain("2.0.0");
      expect(abweichungen[0]).toContain("1.9.0");
    } finally {
      fs.rmSync(ordner, { recursive: true, force: true });
    }
  });

  it("überspringt die Wurzel und verlinkte Pakete — die haben keinen eigenen Ordner", () => {
    const ordner = probe({ "": { version: "3.1.3" }, "node_modules/wurzel-thing": { version: "1.0.0", link: true } }, {});
    try {
      expect(vergleicheLock(ordner)).toEqual([]);
    } finally {
      fs.rmSync(ordner, { recursive: true, force: true });
    }
  });

  it("meldet keinen Unterschied für eine Auflösung ohne Ordner — die legt erst ein `npm ci` an", () => {
    const ordner = fs.mkdtempSync(path.join(os.tmpdir(), "kepta-lock-"));
    fs.writeFileSync(path.join(ordner, "package-lock.json"), JSON.stringify({ packages: { "node_modules/spaet": { version: "9.9.9" } } }));
    try {
      expect(vergleicheLock(ordner)).toEqual([]);
    } finally {
      fs.rmSync(ordner, { recursive: true, force: true });
    }
  });

  it("findet am echten Sperrschema dieses Rechners keinen Unterschied", () => {
    const abweichungen = vergleicheLock(wurzel);
    expect(abweichungen, abweichungen.slice(0, 6).join("\n")).toEqual([]);
  });
});
