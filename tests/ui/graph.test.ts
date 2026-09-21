// Der Wissensgraph der Core-Oberfläche: Datenlayer (Notizen → Knoten, [[Links]]
// → Kanten) und der /api/graph-Endpunkt. Kanten nur zwischen existierenden
// Notizen, keine Selbst-Kanten, Dedup, Zähler für unverarbeitete Verweise.
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { KeptaStore } from "../../src/core/store";
import { baueGraph } from "../../src/ui/graph";
import { starteOberflaeche, type Oberflaeche } from "../../src/ui/server";

let store: KeptaStore;
let ui: Oberflaeche;
let dir: string;

function notiz(titel: string, inhalt: string, tags: string[] = []): void {
  store.createMemory({ title: titel, content: inhalt, tags });
}

beforeEach(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "kepta-graph-"));
  store = new KeptaStore(path.join(dir, "t.db"));
  ui = await starteOberflaeche(store, { port: 0 });
});
afterEach(async () => {
  await ui.close();
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

describe("/api/graph", () => {
  it("liefert nodes/edges/verweise als JSON", async () => {
    notiz("Alpha", "Siehe [[Beta]] und [[Alpha]] selbst.");
    notiz("Beta", "Rückverweis auf [[Alpha]].");
    const res = await fetch(`${ui.url.replace(/\/$/, "")}/api/graph`);
    expect(res.status).toBe(200);
    const g = await res.json();
    expect(g.nodes.length).toBe(2);
    expect(g.edges.length).toBe(1);
    expect(g.verweise).toBeGreaterThanOrEqual(2);
  });

  it("leerer Store → leere Arrays (kein Crash)", async () => {
    const res = await fetch(`${ui.url.replace(/\/$/, "")}/api/graph`);
    const g = await res.json();
    expect(g.nodes).toEqual([]);
    expect(g.edges).toEqual([]);
  });
});

describe("kraftLayout (serverseitiges Force-Layout)", () => {
  it("alle Knoten innerhalb der Grenzen, ohne NaN, Kanten-Endpunkte existieren", async () => {
    const { kraftLayout } = await import("../../src/ui/graph");
    notiz("Alpha", "Siehe [[Beta]].");
    notiz("Beta", "Rückverweis auf [[Alpha]].");
    const g = baueGraph(store);
    const layout = kraftLayout(g, 900, 500);
    expect(layout.length).toBe(2);
    for (const k of layout) {
      expect(Number.isFinite(k.x)).toBe(true);
      expect(Number.isFinite(k.y)).toBe(true);
      expect(k.x).toBeGreaterThanOrEqual(30);
      expect(k.x).toBeLessThanOrEqual(870);
      expect(k.y).toBeGreaterThanOrEqual(26);
      expect(k.y).toBeLessThanOrEqual(474);
    }
  });

  it("leerer Graph → leeres Layout (kein Crash)", async () => {
    const { kraftLayout } = await import("../../src/ui/graph");
    expect(kraftLayout({ nodes: [], edges: [], verweise: 0 }, 900, 500)).toEqual([]);
  });
});

describe("Ähnlichkeits-Kanten (Port aus Pro)", () => {
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

  it("kraftLayout ordnet verbundene Knoten anhand der kombinierten Kanten", async () => {
    const { kraftLayout } = await import("../../src/ui/graph");
    notiz("X Hub", "Siehe [[X A]] und [[X B]].", ["hub"]);
    notiz("X A", "Erster Anhang.", ["hub"]);
    notiz("X B", "Zweiter Anhang.", ["hub"]);
    const g = baueGraph(store);
    expect(g.edges.length).toBeGreaterThanOrEqual(2);
    const layout = kraftLayout(g, 900, 500);
    expect(layout.length).toBe(3);
  });
});
