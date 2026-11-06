import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

// Bis v2.6.9 kam das macOS-Buendel ohne _CodeSignature aus der CI: die einzige
// Signatur war die linker-signierte der Electron-Binaerdatei (Identifier=Electron),
// und codesign --verify schlug darauf fehl. Fuer Nutzer ist das schlimmer als
// unsigniert — macOS meldet dann oft "beschaedigt" statt "nicht verifiziert", und
// dafuer gibt es kein "Trotzdem oeffnen".
const wurzel = process.cwd();
const cfg = JSON.parse(fs.readFileSync(path.join(wurzel, "electron-builder.json"), "utf-8"));

describe("macOS: Ad-hoc-Signatur", () => {
  it("der Build ruft den Signaturschritt auf", () => {
    expect(cfg.afterPack).toBe("scripts/adhoc-sign.cjs");
    expect(fs.existsSync(path.join(wurzel, cfg.afterPack))).toBe(true);
  });

  it("signiert nur auf macOS", () => {
    const quelle = fs.readFileSync(path.join(wurzel, "scripts/adhoc-sign.cjs"), "utf-8");
    expect(quelle).toMatch(/electronPlatformName !== "darwin"/);
  });

  it("prueft die Signatur, statt ihr zu vertrauen", () => {
    // Ein Buendel mit kaputter Signatur ist schlimmer als eines ohne. Der Build
    // muss deshalb abbrechen, wenn die Pruefung nicht durchgeht.
    const quelle = fs.readFileSync(path.join(wurzel, "scripts/adhoc-sign.cjs"), "utf-8");
    expect(quelle).toContain('"--verify"');
    expect(quelle).toContain('"--strict"');
  });

  it("die CI stellt die Zertifikatssuche weiterhin ab", () => {
    // Ohne Zertifikat ist die Suche sinnlos und macht den Build langsam und
    // unvorhersehbar. Das Signieren uebernimmt der afterPack-Schritt.
    const ci = fs.readFileSync(path.join(wurzel, ".github/workflows/build.yml"), "utf-8");
    expect(ci).toMatch(/CSC_IDENTITY_AUTO_DISCOVERY:\s*"false"/);
  });
});

describe("macOS: die Anleitung fuer den ersten Start", () => {
  // Englisch-only seit dem Open-Core-Split — README.de.md ist entfallen.
  const dateien = ["README.md", ".github/release-notes.md"];

  it.each(dateien)("%s raet nicht mehr zum Rechtsklick", (datei) => {
    // Apple hat den Weg "Rechtsklick -> Oeffnen" mit macOS 15 entfernt. Eine
    // Anleitung, die dort nichts bewirkt, ist schlimmer als keine.
    const t = fs.readFileSync(path.join(wurzel, datei), "utf-8");
    const zeilen = t.split("\n").filter((z) => /right-click|Rechtsklick/i.test(z));
    for (const z of zeilen) {
      // Erlaubt ist nur der Hinweis, dass dieser Weg nicht mehr funktioniert.
      expect(z).toMatch(/removed|entfernt|no longer|nicht mehr/i);
    }
  });

  it.each(dateien)("%s nennt den Weg, der ueberall funktioniert", (datei) => {
    const t = fs.readFileSync(path.join(wurzel, datei), "utf-8");
    expect(t).toContain("xattr -dr com.apple.quarantine");
  });

  // Die Zeile oben prueft das Kommando und sieht den Operanden nicht. Genau der ist
  // aber umgezogen: seit der Marke K3PTA heisst das Bundel K3PTA.app, und ein Kunde,
  // der die Anleitung Wort fuer Wort kopiert, bekommt "No such file" — die Antwort
  // auf die eine Frage, die Gatekeeper ihm stellt. Gemessen 6.11. 19:49 MEZ:
  // /Applications/KEPTA.app fehlt, /Applications/K3PTA.app vorhanden.
  it.each(dateien)("%s nennt in jedem Pfad die Marke, die der Build wirklich erzeugt", (datei) => {
    const t = fs.readFileSync(path.join(wurzel, datei), "utf-8");
    const buendel = [...t.matchAll(/\/Applications\/([^/\s"`)]+)\.app/g)].map((m) => m[1]!);
    const koepfe = [...t.matchAll(/Contents\/MacOS\/([A-Za-z0-9_-]+)/g)].map((m) => m[1]!);
    expect(buendel.length + koepfe.length, "der Text nennt keinen /Applications-Pfad — die Sonde ist taub")
      .toBeGreaterThan(0);
    for (const name of new Set([...buendel, ...koepfe])) expect(name).toBe(cfg.productName);
  });
});
