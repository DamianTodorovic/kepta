// Der Wissensgraph der Core-Oberfläche: Datenlayer (Notizen → Knoten, [[Links]]
// → Kanten) und das Weltbild in Welteinheiten. Kanten nur zwischen existierenden
// Notizen, keine Selbst-Kanten, Dedup, Zähler für unverarbeitete Verweise.
// Das Layout heißt nicht mehr `kraftLayout` (null Produktions-Aufrufer, O(n²));
// es sitzt in src/core/graf-kraft.ts und arbeitet in Welteinheiten.
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { KeptaStore } from "../../src/core/store";
import { baueGraph } from "../../src/ui/graph";
import { berechneWelt, type KraftKante } from "../../src/core/graf-kraft";
import { WELT_GROESSE, WELT_RAD } from "../../src/core/graf-vertrag";

let store: KeptaStore;
let dir: string;

function notiz(titel: string, inhalt: string, tags: string[] = []): void {
  store.createMemory({ title: titel, content: inhalt, tags });
}

/** Dasselbe Bild, das Weltbild dazu: die Kanten des Datenlayers als Federn. */
function weltAus(g: ReturnType<typeof baueGraph>) {
  const kanten: KraftKante[] = g.edges.map((e) => ({
    quelle: e.quelle,
    ziel: e.ziel,
    sorte: e.real ? ("echt" as const) : ("aehnlich" as const),
    feder: e.staerke,
  }));
  return berechneWelt({ knoten: g.nodes.map((n) => ({ id: n.id })), kanten });
}

beforeEach(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "kepta-graph-"));
  store = new KeptaStore(path.join(dir, "t.db"));
});
afterEach(() => {
  store.close();
});

describe("baueGraph", () => {
  it("Notiz-Knoten, [[Link]]-Kanten auf existierende Titel, Dedup, keine Selbst-Kanten", () => {
    notiz("Hetzner", "Die Produktion läuft auf [[Hetzner]]-Servern. Siehe auch [[Hetzner]] und [[Datenbank]].");
    notiz("Datenbank", "PostgreSQL 16 auf [[Hetzner]].");
    notiz("Freitext", "Ein [[Geistertitel]] verweist ins Leere.");
    const g = baueGraph(store);
    expect(g.nodes.map((n) => n.titel).sort()).toEqual(["Datenbank", "Freitext", "Hetzner"]);
    // Hetzner↔Datenbank: zwei [[Links]] (Hin + Rück), aber als EINE ungerichtete Kante dedupliziert.
    expect(g.edges.length).toBe(1);
    // Keine Selbst-Kante: [[Hetzner]] in der Hetzner-Notiz selbst zählt als Verweis, keine Kante.
    expect(g.verweise).toBe(5);
    const hetzner = g.nodes.find((n) => n.titel === "Hetzner")!;
    expect(hetzner.grad).toBeGreaterThanOrEqual(1);
  });

  it("Groß-/Kleinschreibung im [[Link]] löst auf; Teil vor | gewinnt", () => {
    notiz("Deploy", "Deploy nur via [[deploy-Runbuch|Runbook]].");
    notiz("deploy-runbuch", "Der Runbook-Inhalt.");
    const g = baueGraph(store);
    expect(g.edges.length).toBe(1);
    const ids = [g.edges[0]!.quelle, g.edges[0]!.ziel].sort();
    const deploy = g.nodes.find((n) => n.titel === "Deploy")!;
    expect(ids).toContain(deploy.id);
  });
});

describe("berechneWelt (serverseitiges Kraftfeld in Welteinheiten)", () => {
  it("alle Knoten innerhalb der Welt, ohne NaN", () => {
    notiz("Alpha", "Siehe [[Beta]].");
    notiz("Beta", "Rückverweis auf [[Alpha]].");
    const g = baueGraph(store);
    const welt = weltAus(g);
    expect(welt.size).toBe(2);
    for (const platz of welt.values()) {
      expect(Number.isFinite(platz.x)).toBe(true);
      expect(Number.isFinite(platz.y)).toBe(true);
      expect(platz.x).toBeGreaterThanOrEqual(WELT_RAD - 0.05);
      expect(platz.x).toBeLessThanOrEqual(WELT_GROESSE - WELT_RAD + 0.05);
      expect(platz.y).toBeGreaterThanOrEqual(WELT_RAD - 0.05);
      expect(platz.y).toBeLessThanOrEqual(WELT_GROESSE - WELT_RAD + 0.05);
    }
  });

  it("leerer Bestand → leere Welt (kein Crash)", () => {
    expect(berechneWelt({ knoten: [], kanten: [] })).toEqual(new Map());
  });

  it("verbundene Knoten landen naeher zusammen als unverbundene — als Population", () => {
    // Der Einzelvergleich von drei Kanten gegen einen isolierten Knoten haengt an
    // den Zufalls-IDs der Notizen: dasselbe Gesetz, anderer Lauf, anderes Urteil
    // (gemessen: 261 gegen 231 im einen, 204 gegen 160 im anderen). Geprueft wird
    // deshalb dieselbe Groessenordnung wie in F10 — mediale Kantenlaenge gegen
    // mediale Entfernung zufaelliger Paare. Ein ungeordnetes Bild waere ~1,0.
    //
    // Der Bestand braucht dafuer echte Gruppen. Zwei Fallen dabei, beide selbst
    // gemessen: ein Tag `sach0` zerfaellt nach der Indexregel in `sach` und `0`,
    // die 6 Gruppen sind also EINE Gruppe; und Titel wie `Wissen 000` teilen das
    // Wort `wissen` und machen aus 60 Notizen 1200 Kanten — dann gibt es keine
    // unverbundenen Paare mehr, gegen die man etwas messen koennte.
    const gruppen = ["alpha", "beta", "gamma", "delta", "epsilon", "zeta"];
    for (let i = 0; i < 60; i++) {
      const gruppe = gruppen[i % gruppen.length]!;
      notiz(`${gruppe} ${i}`, `Ein Text aus der Gruppe.`, [gruppe]);
    }
    const g = baueGraph(store, 60);
    const welt = weltAus(g);
    const laenge = (a: string, b: string) => Math.hypot(welt.get(a)!.x - welt.get(b)!.x, welt.get(a)!.y - welt.get(b)!.y);
    const verbunden = g.edges.map((e) => laenge(e.quelle, e.ziel)).sort((a, b) => a - b);
    let seed = 11;
    const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
    const ids = g.nodes.map((n) => n.id);
    const kontrolle: number[] = [];
    for (let i = 0; i < 400; i++) {
      const a = ids[Math.floor(rnd() * ids.length)]!;
      const b = ids[Math.floor(rnd() * ids.length)]!;
      if (a !== b) kontrolle.push(laenge(a, b));
    }
    kontrolle.sort((a, b) => a - b);
    const med = (x: number[]) => x[Math.floor(x.length / 2)]!;
    const verhaeltnis = med(verbunden) / Math.max(1, med(kontrolle));
    console.log(`[graph] naehe-population knoten=${g.nodes.length} kanten=${verbunden.length} medialeKante=${med(verbunden).toFixed(0)}WE kontrollpaar=${med(kontrolle).toFixed(0)}WE verhaeltnis=${verhaeltnis.toFixed(3)}`);
    expect(verbunden.length).toBeGreaterThan(100);
    expect(verbunden.length).toBeLessThan(g.nodes.length * (g.nodes.length - 1) / 2);
    expect(verhaeltnis).toBeLessThan(0.8);
  });
});

describe("Ähnlichkeits-Kanten (Port aus der App-Ära)", () => {
  it("gleiche Tags + ähnlicher Titel → gestrichelte Kante (real: false)", () => {
    notiz("Mandant Weber Akte", "Quartalsabrechnung, Wartestufe.", ["mandant", "weber"]);
    notiz("Mandant Weber Rechnung", "Rechnung Q3 vorbereitet.", ["mandant", "weber"]);
    notiz("Völlig anderes Thema", "Der einzige Satz ohne Berührung.", ["island"]);
    const g = baueGraph(store);
    const aehnlich = g.edges.filter((e) => !e.real);
    expect(aehnlich.length).toBe(1);
    expect(aehnlich[0]!.staerke).toBeGreaterThan(0.24);
    expect(g.edges.filter((e) => e.real).length).toBe(0);
  });

  it("[[Link]] gewinnt: das Paar bekommt eine echte Kante, nicht zwei", () => {
    notiz("Deploy Runbook", "Siehe [[Deploy Runbook Details]].", ["deploy"]);
    notiz("Deploy Runbook Details", "Der Ablauf Schritt für Schritt.", ["deploy"]);
    const g = baueGraph(store);
    const paare = g.edges.filter((e) => e.real);
    expect(paare.length).toBe(1);
    // Keine zusätzliche Ähnlichkeits-Kante für dasselbe Paar:
    expect(g.edges.length).toBe(1);
    expect(g.edges.every((e) => e.real)).toBe(true);
  });

  it("keine Berührung → keine Ähnlichkeits-Kante (kein gemeinsames Titelwort, keine geteilten Tags)", () => {
    notiz("Gartenbewaesserung", "Der Bewässerungsplan fürs Hochbeet.", ["garten"]);
    notiz("Quantenchromatographie", "Die Trennung der Isotope.", ["chemie"]);
    const g = baueGraph(store);
    expect(g.edges.length).toBe(0);
  });

  it("das Weltbild kennt jeden Knoten des Datenlayers", () => {
    notiz("X Hub", "Siehe [[X A]] und [[X B]].", ["hub"]);
    notiz("X A", "Erster Anhang.", ["hub"]);
    notiz("X B", "Zweiter Anhang.", ["hub"]);
    const g = baueGraph(store);
    expect(g.edges.length).toBeGreaterThanOrEqual(2);
    const welt = weltAus(g);
    expect(welt.size).toBe(3);
  });
});
