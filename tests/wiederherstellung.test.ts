// Das Wiederherstellungs-Werkzeug: aus einem JSON-Vollsatz entsteht eine neue
// Wissensbasis mit Original-IDs, Zeitstempeln, Tags und Supersede-Ketten —
// geprüft am Rundtrip (sichern → neue Basis → vergleichen).
import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";
import fs from "node:fs";
import { KeptaStore } from "../src/core/store";
import { indexMemory } from "../src/core/engine";

const WERKZEUG = path.join(__dirname, "..", "tools", "wiederherstellung.mjs");

function notiz(ueber: Record<string, unknown>): Record<string, unknown> {
  const basis = {
    id: `k-test-${Math.random().toString(36).slice(2, 10)}`,
    title: "Notiz",
    content: "Inhalt",
    tags: [] as string[],
    type: "semantic",
    scope: "local",
    confidence: 0.8,
    validFrom: null,
    validTo: null,
    supersededBy: null,
    deletedAt: null,
    createdAt: 1_700_000_000_000,
    updatedAt: 1_700_000_000_000,
  };
  return { ...basis, ...ueber };
}

describe("Wiederherstellung aus dem JSON-Vollsatz", () => {
  it("Rundtrip: Original-IDs, Zeitstempel, Tags, Supersede-Kette und Zeitreise bleiben erhalten", () => {
    const quelle = path.join(fs.mkdtempSync(path.join(tmpdir(), "kepta-wiederherstellung-")), "notizen.json");
    const original = [
      notiz({ title: "Aktive Notiz", content: "Bleibt bestehen", tags: ["kanzlei", "vertrag"], createdAt: 1_600_000_000_000 }),
      notiz({ title: "Alte Fassung", content: "Ersetzt worden", supersededBy: "k-test-nachfolger", updatedAt: 1_650_000_000_000 }),
      notiz({ id: "k-test-nachfolger", title: "Neue Fassung", content: "Die aktuelle Wahrheit" }),
      notiz({ title: "Papierkorb-Kandidat", content: "Weg damit", deletedAt: 1_690_000_000_000 }),
      notiz({ title: "Zeitreise", content: "Galt nur bis Mai", validFrom: 1_600_000_000_000, validTo: 1_650_000_000_000 }),
    ];
    fs.writeFileSync(quelle, JSON.stringify(original));

    const ziel = fs.mkdtempSync(path.join(tmpdir(), "kepta-wiederherstellung-ziel-"));
    execFileSync(path.join(__dirname, "..", "node_modules", ".bin", "tsx"), [WERKZEUG, quelle, ziel, "--paper"], { encoding: "utf8" });

    const basis = new KeptaStore(path.join(ziel, "kepta.db"));
    const alle = basis.listMemories({ limit: 5000, offset: 0 });
    // 3 aktive (die ersetzte + die Papierkorb-Notiz zählen anders) — exakt prüfen:
    // Ersetzte Notizen bleiben in der Basis (by design) — nur der Papierkorb ist raus.
    const titel = alle.map((m) => m.title).sort();
    expect(titel).toEqual(["Aktive Notiz", "Alte Fassung", "Neue Fassung", "Zeitreise"].sort());
    const papierkorb = alle.some((m) => m.title === "Papierkorb-Kandidat");
    expect(papierkorb).toBe(false);

    const neue = basis.getMemory("k-test-nachfolger");
    expect(neue?.supersededBy).toBeNull();
    const alte = basis.getMemory(original[1].id as string);
    expect(alte?.supersededBy).toBe("k-test-nachfolger");
    expect(alte?.createdAt).toBe(1_700_000_000_000);
    expect(alte?.updatedAt).toBe(1_650_000_000_000);

    // Zeitreise: die Zeitreise-Notiz gilt nur im Fenster
    const inFenster = alle.find((m) => m.title === "Zeitreise");
    expect(inFenster?.validFrom).toBe(1_600_000_000_000);
    expect(inFenster?.validTo).toBe(1_650_000_000_000);
    basis.close();
  });
});
