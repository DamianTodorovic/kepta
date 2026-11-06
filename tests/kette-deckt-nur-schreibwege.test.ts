// @vitest-environment node
//
// P123 — was die Kette wirklich huet. README.md:91 verspricht nach aussen:
// "every AI access is written to a tamper-evident audit log you can check and
// export". Die Kette liegt in src/lib/pruefprotokoll.ts, und geschrieben wird
// sie an zwei Orten: den 14 Mutationen in server/router/audit.ts und acht
// ausdrueckliche Aufrufe (mcp.ts, briefing.ts, chat.ts, clients.ts, schild.ts,
// audit.ts). Ein *Lesen* ueber HTTP gehoert zu keiner davon, und
// src/core/store.ts:584 schreibt nur in einen Sink, den die App nie setzt
// (extensions.ts:136 NOOP_SINK, 162 als Default). Diese Datei misst das, statt
// es zu glauben, und laesst die Aussendung danach nicht mehr sagen als die Maschine.
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import request from "supertest";
import { KeptaStore } from "../src/core/store";
import { createApp } from "../server/app";
import { liste as auditListe } from "../src/lib/pruefprotokoll";

process.env.KEPTA_NO_AUTOSTART = "1";
process.env.KEPTA_ENCRYPTION = "off";

let kapsel: string;
let vorherHeim: string | undefined;
let vorherDaten: string | undefined;
let datei: string;
let store: KeptaStore;
let app: ReturnType<typeof createApp>;

beforeEach(() => {
  kapsel = fs.mkdtempSync(path.join(os.tmpdir(), "kepta-kette-"));
  vorherHeim = process.env.HOME;
  vorherDaten = process.env.KEPTA_DATA_DIR;
  process.env.HOME = kapsel;
  process.env.KEPTA_DATA_DIR = kapsel;
  datei = path.join(kapsel, "kette.db");
  store = new KeptaStore(datei);
  app = createApp(store);
});

afterEach(() => {
  store.close();
  if (vorherHeim === undefined) delete process.env.HOME;
  else process.env.HOME = vorherHeim;
  if (vorherDaten === undefined) delete process.env.KEPTA_DATA_DIR;
  else process.env.KEPTA_DATA_DIR = vorherDaten;
  fs.rmSync(kapsel, { recursive: true, force: true });
});

// liste() liefert { entries, more } — nach Zaehlen, nicht nach Objekt.
const eintraege = () => auditListe(store, { limit: 500 }).entries.length;

describe("die Kette schreibt, wo die Maschine schreibt", () => {
  it("ein HTTP-Schreibweg hinterlaesst einen Ketten-Eintrag", async () => {
    const vorher = eintraege();
    const res = await request(app).post("/api/memories").send({ title: "Kette", content: "ein Satz" });
    expect(res.status, `Text: ${res.text.slice(0, 160)}`).toBeLessThan(300);
    expect(eintraege() - vorher, "POST /api/memories muss die Kette fuellen").toBe(1);
  });

  it("ein HTTP-Leseweg hinterlaesst KEINEN Ketten-Eintrag", async () => {
    const vorher = eintraege();
    const liste = await request(app).get("/api/memories");
    expect(liste.status).toBeLessThan(300);
    const such = await request(app).get("/api/memories/search?q=Kette");
    expect(such.status, `Text: ${such.text.slice(0, 160)}`).toBeLessThan(300);
    expect(eintraege() - vorher,
      "zwei Lesewege durch HTTP — die Kette wuchs, also waere der README-Satz wahr und dieser Fall falsch").toBe(0);
  });

  it("der Suchweg durch die MCP-Tuer schreibt die Kette", async () => {
    const vorher = eintraege();
    const res = await request(app).post("/api/mcp/search").send({ query: "Kette" });
    expect(res.status, `Text: ${res.text.slice(0, 160)}`).toBeLessThan(300);
    expect(eintraege() - vorher, "POST /api/mcp/search protokolliert ausdruecklich (mcp.ts:80)").toBe(1);
  });
});

describe("die Aussendung sagt nicht mehr als die Kette haelt", () => {
  // Die vier Aussendungstekste, nicht nur das README: der Satz ueber das
  // Pruefprotokoll kann in jedem von ihnen stehen.
  const dateien = ["README.md", "SECURITY.md", "ROADMAP.md", ".github/release-notes.md"];
  const saetze = dateien
    .map((f) => fs.readFileSync(path.join(process.cwd(), f), "utf-8").split(/(?<=[.!?])\s+/).map((s) => [f, s] as const))
    .flat()
    .filter(([, s]) => /tamper-evident audit log/i.test(s));

  it("der Satz ueber das Pruefprotokoll findet sich ueberhaupt", () => {
    expect(saetze.length, "kein Aussendungstext nennt mehr ein tamper-evident audit log — die Wache ist taub")
      .toBeGreaterThan(0);
  });

  it("er behauptet nicht, jedes KI-Lesen lande in der Kette", () => {
    const ueber = saetze.filter(([, s]) => /every AI access/i.test(s) && !/mcp|write|change|sync|seal/i.test(s));
    expect(ueber.length, "die Aussendung behauptet 'every AI access' in der Kette, obwohl HTTP-Lesen dort nicht geschrieben werden:\n  " +
      ueber.map(([f, s]) => `${f}: ${s.slice(0, 160)}`).join("\n  ")).toBe(0);
  });
});
