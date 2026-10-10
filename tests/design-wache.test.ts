import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";

type Befund = { sektion: string; befund: string; zahl: string; schwelle: string; fund: string; ok: boolean };
type Ergebnis = { rot: number; messungen: number; linien: Befund[]; schwelle: Record<string, number> };
import path from "node:path";

// Die Design-Wache ist das Gate dieser Scheibe: sie rechnet die Token-Werte
// aus src/index.css und src/lib/kepta-icons.tsx, kein Mensch prüft per Auge.
// Dieser Test hängt sie in die Suite und — zweiter, wichtiger Teil — er hält
// die Schwellen selbst fest. Eine Wache, deren Latte jemand still
// tiefer legt, ist keine Wache.

const PFAD = path.join(process.cwd(), "scripts/design-wache.mjs");

function wache(): Ergebnis {
  let stdout: string;
  try {
    stdout = execFileSync(process.execPath, [PFAD, "--json"], { encoding: "utf8", cwd: process.cwd() });
  } catch (e) {
    // Exit 1 heißt: Befunde unter der Schwelle. Der Output ist trotzdem da.
    stdout = String((e as { stdout?: string }).stdout ?? "");
    if (!stdout.trim()) throw e;
  }
  return JSON.parse(stdout);
}

describe("Design-Wache", () => {
  const ergebnis = wache();

  it("kennt ihre Schwellen aus D1 Teil C — die Latte liegt fest", () => {
    expect(ergebnis.schwelle.text).toBeCloseTo(4.5, 3);      // Apple HIG, bis 17 pt
    expect(ergebnis.schwelle.nachbar).toBeCloseTo(1.3, 3);   // Z-01 benachbarte Flächen
    expect(ergebnis.schwelle.kante).toBeCloseTo(3.0, 3);     // WCAG 1.4.11
    expect(ergebnis.schwelle.schriftpx).toBe(11);            // Z-04
    expect(ergebnis.schwelle.stufen).toBe(8);                 // Z-04
    expect(ergebnis.schwelle.iconpx).toBe(14);                // Z-06
  });

  it("rechnet mehr als hundert Messungen, nicht fünf", () => {
    expect(ergebnis.messungen).toBeGreaterThan(100);
  });

  it("meldet nichts, was unter der Schwelle liegt", () => {
    const rot = ergebnis.linien.filter((l) => !l.ok);
    expect(
      rot.map((l) => `${l.sektion} · ${l.befund} · ${l.zahl} · ${l.schwelle} · ${l.fund}`),
      "Wache meldet Befunde unter der Schwelle"
    ).toEqual([]);
  });

  // Die vier Sonden aus D1 C.16 — hier als eigene Scheibe maschinell, damit
  // ein künftiger Lauf nicht wieder "sieht das schon so" sagt.
  it("hält die Ebenen-Wache: jede Leiterstufe 1,30 gegen den Nachbarn", () => {
    const leiter = ergebnis.linien.filter((l) => l.sektion === "flächen" && /Leiter/.test(l.befund));
    expect(leiter.length).toBeGreaterThanOrEqual(4); // beide Themen, beide Nachbarschaften
    for (const l of leiter) expect(parseFloat(l.zahl.replace(",", "."))).toBeGreaterThanOrEqual(1.3 - 0.006);
  });

  it("hält die Ruhe-Ebenen-Wache: jede Schrift 4,50 in beiden Themen", () => {
    const text = ergebnis.linien.filter((l) => l.sektion === "text" && /als Schrift/.test(l.befund));
    expect(text.length).toBeGreaterThanOrEqual(20); // dunkel und hell, alle Texttoken
    for (const l of text) expect(parseFloat(l.zahl.replace(",", "."))).toBeGreaterThanOrEqual(4.5);
  });

  it("hält die Zeichen-Wache: kein Bild unter zwei Namen", () => {
    const doppel = ergebnis.linien.filter((l) => l.sektion === "icons" && /identischen Pfad-Daten/.test(l.befund));
    expect(doppel).toHaveLength(1);
    expect(doppel[0].zahl).toBe("0 Gruppen / 0 Namen");
    expect(doppel[0].ok).toBe(true);
  });

  it("hält die Variablen-Wache: keine Referenz ohne Definition", () => {
    const l = ergebnis.linien.find((x) => x.sektion === "var" && /ohne Definition/.test(x.befund));
    expect(l, "die Referenz-Zeile fehlt").toBeDefined();
    expect(l!.zahl).toBe("0");
  });
});
