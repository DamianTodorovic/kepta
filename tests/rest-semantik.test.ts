import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { tmpdir } from "node:os";
import path from "node:path";
import fs from "node:fs";
import request from "supertest";
import { KeptaStore } from "../src/core/store";

// P-9: die semantische Karte kommt vom Server.
//
// Nicht, weil die Rechnung dort billiger wäre — sie ist es nicht —, sondern
// weil die Vektoren selbst den Renderer nichts angehen. 768 Gleitkommazahlen
// je Abschnitt durch ein HTTP-Fenster zu schieben, damit die Fläche zwei
// Koordinaten daraus baut, wäre derselbe Fehler wie ein Voll-Lauf der
// Embeddings im Hauptthread: bezahlt wird jedes Mal, gebraucht wird ein Bruch.
//
// Also: der Server projiziert, die Fläche bekommt Plätze. Diese Datei wacht
// dafür, dass die Antwort wirklich Plätze sind und nichts Größeres.

process.env.KEPTA_NO_AUTOSTART = "1";
process.env.KEPTA_ENCRYPTION = "off";

let createApp: typeof import("../server").createApp;
let app: import("express").Express;
let store: KeptaStore;
let dir: string;
let prevHome: string | undefined;

beforeEach(async () => {
  dir = fs.mkdtempSync(path.join(tmpdir(), "kepta-semantik-"));
  prevHome = process.env.HOME;
  process.env.HOME = dir;
  process.env.KEPTA_DATA_DIR = dir;
  const { KeptaStore: Store } = await import("../src/core/store");
  ({ createApp } = await import("../server"));
  store = new Store(path.join(dir, "test.db")) as unknown as KeptaStore;
  app = createApp(store, { lizenziert: () => true });
});

afterEach(() => {
  vi.restoreAllMocks();
  if (prevHome === undefined) delete process.env.HOME;
  else process.env.HOME = prevHome;
});

async function notizMitVektor(titel: string, vektor: number[], modell = "nomic-embed-text"): Promise<string> {
  const res = await request(app).post("/api/memories").send({ title: titel, content: `${titel} — Inhalt für den Abschnitt` });
  expect(res.status, JSON.stringify(res.body)).toBe(200);
  const id = String(res.body.memory.id);
  store.replaceChunks(id, [`${titel} — Inhalt für den Abschnitt`]);
  store.setEmbedding(id, 0, Float32Array.from(vektor), modell);
  return id;
}

type Antwort = {
  punkte: { id: string; x: number; y: number }[];
  modell: string | null;
  getragen: number;
  gesamt: number;
  gekappt: number;
  anteil: [number, number];
};

async function karte(): Promise<Antwort> {
  const res = await request(app).get("/api/graph/semantik");
  expect(res.status, JSON.stringify(res.body)).toBe(200);
  return res.body as Antwort;
}

describe("Die Karte reist als Platz, nicht als Vektor", () => {
  it("nennt je Notiz zwei Koordinaten und nichts, woraus sich ein Vektor bauen ließe", async () => {
    await notizMitVektor("Rahmen Nordwind", [9, 0.5, 0, 0.2]);
    await notizMitVektor("Tranche Nordwind", [10, 0, 0.4, 0]);
    await notizMitVektor("Protokoll Kestrel", [0.3, 9, 0, 0.5]);

    const body = await karte();
    expect(body.punkte).toHaveLength(3);
    for (const p of body.punkte) {
      expect(Object.keys(p).sort(), JSON.stringify(p)).toEqual(["id", "x", "y"]);
      expect(Number.isFinite(p.x) && Number.isFinite(p.y), JSON.stringify(p)).toBe(true);
    }
    // Die harte Wache: nirgends in der Antwort steht ein Vektor. Nicht als
    // Feld, nicht als Base64, nicht als Zahlenreihe.
    const roh = JSON.stringify(body);
    expect(roh).not.toMatch(/embedding|vektor|vector/i);
    expect(roh.length, `Antwort zu groß für drei Plätze: ${roh}`).toBeLessThan(1200);
  });

  it("zählt, was sie trägt, und was der Bestand insgesamt hat", async () => {
    const a = await notizMitVektor("Mit Vektor", [1, 2, 3]);
    await notizMitVektor("Auch mit Vektor", [4, 5, 6]);
    const ohne = await request(app).post("/api/memories").send({ title: "Ohne Vektor", content: "frisch geschrieben" });
    expect(ohne.status).toBe(200);

    const body = await karte();
    expect(body.getragen).toBe(2);
    expect(body.gesamt).toBe(2);
    expect(body.gekappt).toBe(0);
    expect(body.punkte.map((p) => p.id)).toContain(a);
    expect(body.punkte.some((p) => p.id === String(ohne.body.memory.id)), "die unvermessene Notiz steht in der Karte").toBe(false);
  });

  it("mischt keine Modelle und sagt, aus welchem Raum die Karte stammt", async () => {
    await notizMitVektor("Eins", [1, 0, 0]);
    await notizMitVektor("Zwei", [0, 1, 0]);
    await notizMitVektor("Drei", [1, 1, 0]);
    await notizMitVektor("Vier", [9, 9, 9], "all-minilm");

    const body = await karte();
    expect(body.modell).toBe("nomic-embed-text");
    expect(body.getragen).toBe(3);
    expect(body.gesamt, "der Bestand trägt vier Vektoren, die Karte kennt drei").toBe(4);
  });

  it("antwortet mit einer leeren Karte, solange niemand eingebettet hat", async () => {
    await request(app).post("/api/memories").send({ title: "Frisch", content: "noch ohne Vektor" });
    const body = await karte();
    expect(body.punkte).toEqual([]);
    expect(body.modell).toBeNull();
    expect(body.getragen).toBe(0);
  });

  it("nennt den Anteil, den die zwei Achsen tragen", async () => {
    await notizMitVektor("Eins", [4, 1, 3, -2]);
    await notizMitVektor("Zwei", [-3, 2, -1, 4]);
    await notizMitVektor("Drei", [1, -5, 2, 1]);
    await notizMitVektor("Vier", [2, 3, -4, -3]);

    const body = await karte();
    expect(body.anteil[0]).toBeGreaterThanOrEqual(body.anteil[1]);
    expect(body.anteil[0]).toBeGreaterThan(0);
    expect(body.anteil[0] + body.anteil[1]).toBeLessThanOrEqual(1);
  });
});

describe("Die Rechnung läuft einmal, nicht bei jedem Öffnen der Ansicht", () => {
  it("liest den Bestand neu, sobald sich etwas geändert hat — und nur dann", async () => {
    await notizMitVektor("Eins", [1, 0, 0]);
    await notizMitVektor("Zwei", [0, 1, 0]);
    const spion = vi.spyOn(store, "allEmbeddableChunks");

    const eins = await karte();
    const zwei = await karte();
    expect(spion, "zwei Antworten, zwei Voll-Läufe über die Chunks").toHaveBeenCalledTimes(1);
    expect(zwei.punkte).toEqual(eins.punkte);

    await notizMitVektor("Drei", [1, 1, 0]);
    const drei = await karte();
    expect(spion, "nach einer neuen Notiz muss neu gerechnet werden").toHaveBeenCalledTimes(2);
    expect(drei.punkte).toHaveLength(3);
  });
});
