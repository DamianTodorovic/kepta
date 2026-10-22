// @vitest-environment jsdom
//
// Punkt 5, Auftrag G-72 (22.10.) — Gruppen, die ein Mensch selbst aus einem Tag baut.
//
// Warum dieses Blatt eine eigne Rechnung verlangt und nicht noch eine: die Marke im Bestand
// zaehlt schon `markenHaeufigkeit` (`src/lib/graphHierarchy.ts:197`) — trimmen, kleinschreiben,
// je Notiz entdoppeln. Punkt 1 zieht seinen Tag-Filter (G-74) aus derselben Funktion. Wer hier
// eine zweite Zaehlung baute, haette zwei Zahlen, die sich jederzeit unterscheiden duerfen.
// Diese Faelle halten deshalb die Quelle fest: `zaehleGruppen` darft nur zehlen, was
// `markenHaeufigkeit` schon weiss.
//
// Gegen den Stand `9c64db4` (3.2.34) gefahren, wo `src/lib/gruppen.ts` nicht existiert:
// **rot, und zwar an der Aufloesung des Imports** — die Datei fehlt, also fehlt jede Funktion.
// Der Grund steht im Protokoll dieser Hand, nicht in diesem Kommentar.
import { describe, it, expect, beforeEach } from "vitest";
import {
  GRUPPEN_SCHLUESSEL,
  GRUPPEN_PALETTE,
  leseEinstellung,
  schreibeEinstellung,
  normaliereMarke,
  zaehleGruppen,
  gruppeHinzufuegen,
  gruppeEntfernen,
  gruppenFarbeSetzen,
} from "../../src/lib/gruppen";
import { markenHaeufigkeit } from "../../src/lib/graphHierarchy";
import type { Memory } from "../../src/types";

function notiz(id: string, tags: string[]): Memory {
  return { id, userId: "local", title: id, content: "leib", tags, createdAt: 1, updatedAt: 1 } as Memory;
}

/** Ein Bestand, der die vier Regeln beruehrt: eine Notiz in zwei Gruppen, eine in keiner,
 *  eine mit derselben Marke zweimal in der eigenen Liste, und eine mit Grossbuchstaben. */
const bestand: Memory[] = [
  notiz("a", ["client-x", "md"]),
  notiz("b", ["client-x"]),
  notiz("c", ["Client-X"]),
  notiz("d", ["shop"]),
  notiz("e", ["shop", "client-x"]),
  notiz("f", ["ohne-gruppe"]),
  notiz("g", ["shop", "shop"]),
  notiz("h", []),
];

beforeEach(() => localStorage.clear());

describe("gruppen: eine Rechnung, die beide Flaechen lesen", () => {
  it("zaehlt je Gruppe dieselbe Zahl, die auch die Marken-Zensus kennt", () => {
    const m = zaehleGruppen(bestand, { marken: ["client-x", "shop"], farben: {} });
    const zensus = markenHaeufigkeit(bestand);
    expect(m.gruppen.find((g) => g.marke === "client-x")?.notizen).toBe(zensus.get("client-x"));
    expect(m.gruppen.find((g) => g.marke === "shop")?.notizen).toBe(zensus.get("shop"));
    // 4 Stuecke mit `client-x` (a, b, c, e), 3 mit `shop` (d, e, g) — Grossbuchstaben zaehlen mit.
    expect(m.gruppen.find((g) => g.marke === "client-x")?.notizen).toBe(4);
    expect(m.gruppen.find((g) => g.marke === "shop")?.notizen).toBe(3);
  });

  it("nennt die Luecke und die Ueberlappung, statt sie zu verschlucken", () => {
    const m = zaehleGruppen(bestand, { marken: ["client-x", "shop"], farben: {} });
    expect(m.bestand).toBe(8);
    // a, b, c, d, e, g sind in mindestens einer Gruppe — f und h nicht.
    expect(m.ohneGruppe).toBe(2);
    // e traegt beide Marken, also ist die Summe der Gruppen hoeher als die gedeckte Zahl.
    expect(m.mehrfach).toBe(1);
    const summe = m.gruppen.reduce((n, g) => n + g.notizen, 0);
    expect(summe).toBe(m.bestand - m.ohneGruppe + m.mehrfach);
  });

  it("laesst eine geleerte Gruppe stehen und sagt ihre Null", () => {
    const m = zaehleGruppen(bestand, { marken: ["client-x", "vergessen"], farben: {} });
    expect(m.gruppen).toHaveLength(2);
    const leer = m.gruppen.find((g) => g.marke === "vergessen");
    expect(leer?.notizen).toBe(0);
    expect(leer?.prozent).toBe(0);
  });

  it("zieht das Angebot aus demselben Zensus und laesst Gesetztes weg", () => {
    const m = zaehleGruppen(bestand, { marken: ["shop"], farben: {} });
    const zensus = markenHaeufigkeit(bestand);
    expect(m.baubar.map((b) => b.marke)).not.toContain("shop");
    expect(m.baubar.map((b) => b.marke)).toContain("client-x");
    expect(m.baubar.find((b) => b.marke === "client-x")?.notizen).toBe(zensus.get("client-x"));
    // Haeufigste zuerst, und die Kappe ist eine Zahl, keine Ueberraschung.
    expect(m.baubar[0].notizen).toBeGreaterThanOrEqual(m.baubar[m.baubar.length - 1].notizen);
    for (const b of m.baubar) expect(zensus.has(b.marke)).toBe(true);
  });

  it("gibt zwei Gruppen zwei Farben, die bleiben, wenn eine dritte wegfaellt", () => {
    const m1 = zaehleGruppen(bestand, { marken: ["client-x", "shop"], farben: {} });
    const m2 = zaehleGruppen(bestand, { marken: ["client-x"], farben: {} });
    expect(m1.gruppen[0].farbe).not.toBe(m1.gruppen[1].farbe);
    for (const g of m1.gruppen) expect(GRUPPEN_PALETTE).toContain(g.farbe);
    // Stabilitaet: die Farbe haengt an der Marke, nicht an ihrem Platz in der Liste.
    expect(m2.gruppen[0].farbe).toBe(m1.gruppen[0].farbe);
    // Und eine gesetzte Farbe gewinnt gegen die Palette.
    const m3 = zaehleGruppen(bestand, { marken: ["client-x"], farben: { "client-x": "#123456" } });
    expect(m3.gruppen[0].farbe).toBe("#123456");
  });

  it("stellt eine Gruppe dauerhaft, in Hausform, und nimmt sie wieder weg", () => {
    expect(leseEinstellung()).toEqual({ marken: [], farben: {} });
    const nachher = gruppeHinzufuegen("  #Client-X  ");
    expect(nachher.marken).toEqual(["client-x"]);
    expect(localStorage.getItem(GRUPPEN_SCHLUESSEL)).toContain("client-x");
    // Zweimal dasselbe Tag baut keine zweite Gruppe.
    expect(gruppeHinzufuegen("client-x").marken).toEqual(["client-x"]);
    expect(gruppeEntfernen("client-x").marken).toEqual([]);
    expect(leseEinstellung().marken).toEqual([]);
    gruppeHinzufuegen("shop");
    gruppenFarbeSetzen("shop", "#abcdef");
    expect(leseEinstellung().farben["shop"]).toBe("#abcdef");
    expect(normaliereMarke("#Client-X")).toBe("client-x");
    expect(normaliereMarke("##md")).toBe("md");
  });

  it("traegt nichts zusammen, wo nichts liegt — und wirft nicht bei leerem Bestand", () => {
    const m = zaehleGruppen([], { marken: ["client-x"], farben: {} });
    expect(m.bestand).toBe(0);
    expect(m.gruppen).toHaveLength(1);
    expect(m.gruppen[0].prozent).toBe(0);
    expect(m.ohneGruppe).toBe(0);
    expect(m.baubar).toEqual([]);
  });

  it("schreibt ordentlich: was keine Gruppe hat, verliert auch seine Farbe", () => {
    const e = schreibeEinstellung({ marken: ["  #Shop "], farben: { shop: "#FFFFFF", weg: "#111111", kaputt: "nothex" } });
    expect(e.marken).toEqual(["shop"]);
    expect(e.farben).toEqual({ shop: "#ffffff" });
    expect(leseEinstellung().farben.weg).toBeUndefined();
    // Und ein Wert, der keine Sechsergruppe ist, ueberlebt den Schreibgriff nicht.
    expect(Object.values(leseEinstellung().farben)).not.toContain("nothex");
  });

  it("verdirbt nicht an einer kaputten Speicherung", () => {
    localStorage.setItem(GRUPPEN_SCHLUESSEL, "{kein json");
    expect(leseEinstellung()).toEqual({ marken: [], farben: {} });
    localStorage.setItem(GRUPPEN_SCHLUESSEL, JSON.stringify({ marken: "kein array", farben: null }));
    expect(leseEinstellung()).toEqual({ marken: [], farben: {} });
  });
});
