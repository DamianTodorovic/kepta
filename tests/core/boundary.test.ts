import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

// The keeper test for the confidentiality claim: the memory core (src/core)
// may only reach Node built-ins, its own files and the SQLite engine. No UI
// imports, no other runtime packages, no network clients. If any import line here starts failing, the
// "your data never leaves the machine" property has lost its guard.

const CORE_DIR = path.resolve(__dirname, "../../src/core");

function importSpecifiers(file: string): string[] {
  const src = fs.readFileSync(file, "utf-8");
  const out: string[] = [];
  const patterns = [
    /(?:^|\n)\s*import\s+(?:[\s\S]*?from\s+)?"([^"]+)"/g,
    /(?:^|\n)\s*export\s+[^;]*?from\s+"([^"]+)"/g,
    /(?:^|\n)\s*(?:const|let|var)\s+[\s\S]*?require\("([^"]+)"\)/g,
  ];
  for (const re of patterns) {
    for (const m of src.matchAll(re)) out.push(m[1]!);
  }
  return out;
}

describe("memory core boundary (src/core)", () => {
  const coreFiles = fs
    .readdirSync(CORE_DIR)
    .filter((f) => f.endsWith(".ts"))
    .map((f) => path.join(CORE_DIR, f));

  it("contains exactly the known core files (no silent additions)", () => {
    const names = coreFiles.map((f) => path.basename(f)).sort();
    expect(names).toEqual([
      // ChatGPT-Export-Importer (Kompatibilitaetsfalle): gleiche Grenze wie der
      // Rest des Kerns — nur Node-Bordmittel, Store/Engine, kein Netz, keine UI.
      "chatgpt-import.ts",
      "embeddings.ts",
      "engine.ts",
      "extensions.ts",
      // Das Weltbild des Graph-Dienstes: Viertelchen-Baum, Abkuehlung und
      // keim(id) — reine Geometrie auf Zahlen, ohne DOM, ohne Store, ohne Netz.
      "graf-kraft.ts",
      // Begriffsrechnung fuer den Index: Zerlegung, df, g(t)=ln(1+N/df),
      // Jaccard. Nutzt nur src/core/stopwords.ts, nicht die Anfrage-Kappe.
      "graf-terms.ts",
      // Der Datenvertrag von GET /api/graph/bild: Typen und Konstanten, keine
      // Rechnung, kein Import — das Kuvert, gegen das Client und Kern prüfen.
      "graf-vertrag.ts",
      // Claude-Export-Importer: dieselbe Klasse wie chatgpt-import.ts (die
      // Kompatibilitaetsfalle), dieselbe Grenze — nur Node-Bordmittel, Store,
      // Engine, obsidian.ts; kein Netz, keine UI, kein Pfad ausser Home/Temp.
      "import-claude.ts",
      // Ordner-Importer: ein ganzer Markdown-/Textbestand des Nutzers. Die Zeit-
      // regel (Quellendatum -> gilt ab, Plattendatum -> nur angelegt) und die
      // Duplett-pruefung sind Kernlogik, nicht Transport — ein Rausziehen aus dem
      // Kern waere eine Schwecbung: src/ wird von dieser Wache nicht geprueft.
      "import-ordner.ts",
      // Tabellen-Importer (CSV/JSONL mit Spaltensprache): dieselbe Begruendung
      // wie import-ordner.ts, plus der Kopfschutz (unerkannte Inhaltsspalte =
      // Abweisung, kein geratenes Textfeld).
      "import-tabelle.ts",
      // Die Zuordnung von Wissensarten gehoert in den Kern: sie entscheidet in
      // createMemory und muss deshalb ohne Umweg ueber die Oberflaeche
      // erreichbar sein — auch fuer den MCP-Server.
      "klassifikation.ts",
      "mcp.ts",
      "migrate.ts",
      "obsidian.ts",
      "praxissync.ts",
      // Die Reparatur-Planung (alte Binärmuell-Chunks durch frische Extraktion
      // ersetzen) ist reine Kernlogik — das Schreiben macht der Server.
      "reparatur.ts",
      // Der eine Sanitizer für alle Wege (2.13.2-Parität mit der App): dieselbe
      // Text-/Tag-Filter-Logik für Store und Server — reine Stringlogik.
      "sanitize.ts",
      // Der Datenbankschluessel und der Schluesselbund des Systems gehoeren in
      // den Kern: der Store braucht ihn, bevor er die Datei auch nur liest.
      "schluessel.ts",
      "stopwords.ts",
      "store.ts",
      "synonyme.ts",
      "types.ts",
      "version.ts",
    ]);
  });

  // A relative specifier is not automatically an own module: "../lib/ai" starts
  // with "../" and reaches the sixteen third-party providers. Testing the prefix
  // therefore proves nothing — the specifier has to be resolved, and the result
  // has to land inside src/core.
  // Die einzige Laufzeit-Abhaengigkeit des Kerns: SQLite selbst, mit
  // Verschluesselung (SQLite3 Multiple Ciphers). Eine Datenbank-Engine, kein
  // Netzwerk-Client — sie ersetzt node:sqlite, das keine verschluesselte Datei oeffnen kann.
  const ERLAUBTE_PAKETE = new Set(["better-sqlite3-multiple-ciphers"]);

  function escapesCore(file: string, spec: string): boolean {
    if (spec.startsWith("node:")) return false;
    if (ERLAUBTE_PAKETE.has(spec)) return false;
    if (!spec.startsWith(".")) return true; // runtime package
    const resolved = path.resolve(path.dirname(file), spec);
    return resolved !== CORE_DIR && !resolved.startsWith(CORE_DIR + path.sep);
  }

  it("imports only node built-ins and files inside src/core", () => {
    const violations: string[] = [];
    for (const file of coreFiles) {
      for (const spec of importSpecifiers(file)) {
        if (escapesCore(file, spec)) violations.push(`${path.basename(file)} → ${spec}`);
      }
    }
    expect(violations).toEqual([]);
  });

  it("actually catches an import that leaves the core (guard against a green no-op)", () => {
    const probe = path.join(CORE_DIR, "engine.ts");
    // The exact violation that used to slip through: relative, yet outside src/core.
    expect(escapesCore(probe, "../lib/ai")).toBe(true);
    expect(escapesCore(probe, "../../src/lib/ai")).toBe(true);
    expect(escapesCore(probe, "openai")).toBe(true);
    // Nur genau dieses eine Paket — nicht alles, was aehnlich heisst.
    expect(escapesCore(probe, "better-sqlite3")).toBe(true);
    expect(escapesCore(probe, "better-sqlite3-multiple-ciphers/lib/database")).toBe(true);
    expect(escapesCore(probe, "better-sqlite3-multiple-ciphers")).toBe(false);
    // ...while the legitimate cases stay allowed.
    expect(escapesCore(probe, "./store")).toBe(false);
    expect(escapesCore(probe, "node:crypto")).toBe(false);
  });

  it("contains no network endpoints outside localhost", () => {
    const violations: string[] = [];
    for (const file of coreFiles) {
      const src = fs.readFileSync(file, "utf-8");
      for (const m of src.matchAll(/https?:\/\/[^\s"'`)]+/g)) {
        const url = m[0]!;
        if (!url.includes("127.0.0.1") && !url.includes("localhost")) {
          violations.push(`${path.basename(file)} → ${url}`);
        }
      }
    }
    expect(violations).toEqual([]);
  });
});
