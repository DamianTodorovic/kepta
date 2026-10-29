// @vitest-environment node
//
// Punkt 126, zweite Schicht — die Route.
//
// Der Kern kann die Behauptung seit `tests/core/behauptung-setzen.test.ts` setzen. Was einer
// Hand fehlt, ist ein Weg hinein und ein Weg heraus:
//   · `server/router/memories.ts` ruft `verknuepfeNotiz(id, titel, links)` — drei Felder,
//     kein viertes, also bleibt jede Behauptung auf dem Weg liegen (gemessen 29.10. an
//     Damians Bestand: 0 von 1 468 Relationen mit einem Typwort).
//   · Ohne Leser kann die Oberflaeche nicht zeigen, was schon steht — ein Feld, das nur
//     schreibt, laesst die Person ihre eigne Aussage erneut tippen oder gar nicht loeschen.
//
// Die gefaehrlichste Zeile dieser Datei ist die vierte: wer das Feld **nicht** schickt, darf
// nichts loeschen. Ein Agent, der dieselbe Notiz speichert, ruft denselben Pfad.

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { tmpdir } from "node:os";
import path from "node:path";
import fs from "node:fs";
import request from "supertest";
import { KeptaStore } from "../src/core/store";

process.env.KEPTA_NO_AUTOSTART = "1";
process.env.KEPTA_ENCRYPTION = "off";

let dir = "";
let prevHome: string | undefined;
let store: KeptaStore;
let createApp: typeof import("../server").createApp;
let app: import("express").Express;

beforeEach(async () => {
  dir = fs.mkdtempSync(path.join(tmpdir(), "kepta-behauptung-rest-"));
  prevHome = process.env.HOME;
  process.env.HOME = dir;
  process.env.KEPTA_DATA_DIR = dir;
  const { KeptaStore: Store } = await import("../src/core/store");
  store = new Store(path.join(dir, "test.db")) as unknown as KeptaStore;
  ({ createApp } = await import("../server"));
  app = createApp(store);
});

afterEach(() => {
  try { store.close(); } catch { /* schon zu */ }
  process.env.HOME = prevHome;
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* weg */ }
});

describe("126 das Tor der Behauptung", () => {
  it("ein Speichern mit dem Feld setzt die Aussage, und der Leser zeigt sie", async () => {
    const notiz = await request(app)
      .post("/api/memories")
      .send({ title: "Uebergabe 14.03", content: "Nordwind und Elena sind genannt.",
              beziehungen: [{ quelle: "Nordwind", ziel: "Elena", wort: "betreut" }] })
      .expect(200);
    const id = String(notiz.body.memory.id);
    expect(notiz.body.behauptungen, "die Antwort nennt nicht, wie viel ankam").toBe(1);

    const lesung = await request(app).get(`/api/memories/${id}/behauptungen`).expect(200);
    expect(lesung.body.behauptungen).toHaveLength(1);
    expect(lesung.body.behauptungen[0].wort).toBe("betreut");
    expect(lesung.body.behauptungen[0].quelle).toBe("nordwind");
  });

  it("die Graph-Tuer liefert das Wort — sonst malt die Flaeche eine Linie ohne Auskunft", async () => {
    await request(app)
      .post("/api/memories")
      .send({ title: "Uebergabe 14.03", content: "Nordwind und Elena sind genannt.",
              beziehungen: [{ quelle: "Nordwind", ziel: "Elena", wort: "betreut" }] })
      .expect(200);
    const graph = await request(app).get("/api/graph?limit=500").expect(200);
    const kanten = (graph.body.relations ?? []).filter((r: { relation: string }) => r.relation === "betreut");
    expect(kanten.length, `kein "betreut" unter ${((graph.body.relations ?? []).length)} Relationen`).toBe(1);
  });

  it("ein Systemwort wird abgewiesen und nennt den Grund", async () => {
    const ant = await request(app)
      .post("/api/memories")
      .send({ title: "Protokoll", content: "Nordwind und Elena.",
              beziehungen: [{ quelle: "nordwind", ziel: "elena", wort: "mentions" }] })
      .expect(400);
    expect(String(ant.body.error).toLowerCase(), "die Absage nennt nicht, was zu tun ist")
      .toContain("word");
    const neue = await request(app).get("/api/memories?limit=5").expect(200);
    expect(neue.body.memories ?? neue.body.items ?? [], "die abgewiesene Notiz wurde doch angelegt").toHaveLength(0);
  });

  it("wer das Feld nicht schickt, loescht nichts", async () => {
    const angelegt = await request(app)
      .post("/api/memories")
      .send({ title: "Protokoll", content: "Nordwind und Elena.",
              beziehungen: [{ quelle: "Nordwind", ziel: "Elena", wort: "betreut" }] })
      .expect(200);
    const id = String(angelegt.body.memory.id);
    // Zweiter Speichern ohne das Feld — so speichert ein Agent, so speichert der Nachzug.
    await request(app).post("/api/memories").send({ id, content: "Nordwind und Elena, spaeter ergänzt." }).expect(200);
    const lesung = await request(app).get(`/api/memories/${id}/behauptungen`).expect(200);
    expect(lesung.body.behauptungen, "ein Speichern ohne Feld hat die Aussage der Hand geloescht").toHaveLength(1);
  });

  it("mehr als die Kappe wird gesetzt, was ankam, und die Zahl sagt es", async () => {
    const viele = Array.from({ length: 25 }, (_, i) => ({ quelle: "nordwind", ziel: `partner ${i}`, wort: `belegt ${i}` }));
    const ant = await request(app)
      .post("/api/memories")
      .send({ title: "Protokoll", content: "Nordwind.", beziehungen: viele })
      .expect(200);
    expect(ant.body.behauptungen, "die Antwort verschweigt, dass die Kappe griff").toBe(20);
  });

  it("Muell im Feld wirft nicht und setzt nichts", async () => {
    for (const muell of [undefined, null, "betreut", 42, [{ quelle: 1 }], {}]) {
      const ant = await request(app).post("/api/memories").send({ title: "Protokoll", content: "x", beziehungen: muell });
      expect([200, 400], `die Form ${JSON.stringify(muell)} warf eine Antwort von ${ant.status}`).toContain(ant.status);
    }
    const graph = await request(app).get("/api/graph?limit=500").expect(200);
    expect((graph.body.relations ?? []).filter((r: { relation: string }) => r.relation === "betreut")).toHaveLength(0);
  });
});
