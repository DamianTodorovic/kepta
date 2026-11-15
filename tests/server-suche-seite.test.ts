// @vitest-environment node
//
// Zellen #95 und #99 an der Tuer (Leitung 24.10. 13:22 MESZ).
//
// #95: `GET /api/memories/search` seitet wie die Liste - `offset`, `begrenzt`, `hinweis`.
// #99: die Suche haengt am Chat-Limiter (`server/helfer/limiter.ts:52`, max 20/min); Punkt 6s
//      zwei 20er-Laeufe waren 0 Treffer bei lauter 429. Die Suche bekommt eine eigne, groessere,
//      lesende Kappe, und die Kappe steht im Kopf der Antwort.
//
// Am Kopf cb7c53e faellt dieser Fall: die Route kennt kein offset, traegt keine Kappenfelder
// und antwortet ab der 21. Suche mit 429.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import http from "node:http";
import { KeptaStore } from "../src/core/store";
import { defaultExtensions } from "../src/core/extensions";
import { createApp } from "../server/app";
import { lauscht, niederlegen } from "./helfer/lauscher";

const PORT = 8952;
let URLE = `http://127.0.0.1:${PORT}`;
let wurzel = "";
let vorherHeim: string | undefined;
let vorherDaten: string | undefined;
let store: KeptaStore;
let hoerer: http.Server;

const SUCH_KAPPE = 240;

beforeAll(async () => {
  wurzel = fs.mkdtempSync(path.join(os.tmpdir(), "kepta-suchkappe-"));
  vorherHeim = process.env.HOME;
  vorherDaten = process.env.KEPTA_DATA_DIR;
  process.env.HOME = wurzel;
  process.env.KEPTA_DATA_DIR = wurzel;
  const datenSchluessel = new Uint8Array(crypto.randomBytes(32));
  store = new KeptaStore(path.join(wurzel, "kepta.db"), {
    ...defaultExtensions(),
    keys: { ablage: "KEPTA_DB_KEY (Messlauf)", keyFor: () => datenSchluessel },
  });
  for (let i = 0; i < 12; i++) {
    store.createMemory({ title: `Tuer ${i}`, content: `seitenprobe am Tor Nummer ${i}`, tags: [] } as never);
  }
  const horcher = await lauscht(createApp(store), PORT);
  hoerer = horcher.server;
  URLE = horcher.urle;
});

afterAll(async () => {
  if (hoerer) await niederlegen(hoerer);
  store?.close();
  if (vorherHeim === undefined) delete process.env.HOME; else process.env.HOME = vorherHeim;
  if (vorherDaten === undefined) delete process.env.KEPTA_DATA_DIR; else process.env.KEPTA_DATA_DIR = vorherDaten;
  fs.rmSync(wurzel, { recursive: true, force: true });
});

async function suche(query: string) {
  const r = await fetch(`${URLE}/api/memories/search${query}`);
  const text = await r.text();
  let leib: Record<string, unknown> = {};
  try { leib = JSON.parse(text) as Record<string, unknown>; } catch { /* keine JSON-Antwort */ }
  return { status: r.status, kopf: r.headers, leib, text };
}

describe("Tuer: die Suche seitet (#95)", () => {
  it("Seite 1 nennt offset, begrenzt, hinweis und den Rest", async () => {
    const { status, leib } = await suche("?q=seitenprobe&limit=4&offset=0");
    expect(status).toBe(200);
    expect(leib.count).toBe(4);
    expect(leib.total).toBe(12);
    expect(leib.offset).toBe(0);
    expect(leib.begrenzt).toBe(true);
    expect(String(leib.hinweis)).toMatch(/8 more/);
  });

  it("Seite 2 bringt andere Knoten, am Ende steht begrenzt false", async () => {
    const a = await suche("?q=seitenprobe&limit=4&offset=0");
    const b = await suche("?q=seitenprobe&limit=4&offset=8");
    expect(b.status).toBe(200);
    expect(b.leib.offset).toBe(8);
    expect(b.leib.count).toBe(4);
    expect(b.leib.begrenzt).toBe(false);
    const idsA = new Set((a.leib.memories as Array<{ id: string }>).map((m) => m.id));
    expect((b.leib.memories as Array<{ id: string }>).some((m) => idsA.has(m.id))).toBe(false);
  });

  it("offset hinter dem Ende: null Treffer, total bleibt", async () => {
    const { status, leib } = await suche("?q=seitenprobe&limit=4&offset=40");
    expect(status).toBe(200);
    expect(leib.count).toBe(0);
    expect(leib.total).toBe(12);
    expect(leib.begrenzt).toBe(false);
  });
});

describe("Tuer: die Suche hat ihre eigne Kappe (#99)", () => {
  it("25 Suchen ueber den POST-Weg: keine 429", async () => {
    const codes: number[] = [];
    for (let i = 0; i < 25; i++) {
      const r = await fetch(`${URLE}/api/search`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: "seitenprobe", topK: 1, offset: i }),
      });
      codes.push(r.status);
    }
    expect(codes.filter((c) => c === 429)).toHaveLength(0);
    expect(codes.every((c) => c === 200)).toBe(true);
  });

  it("die Kappe steht im Kopf der Antwort", async () => {
    const { kopf } = await suche("?q=seitenprobe&limit=1");
    expect(kopf.get("x-kepta-suche-kappe")).toBe(`${SUCH_KAPPE};w=60`);
  });

  it("Gegenfall: der Chat-Weg bleibt bei 20 gedeckelt", async () => {
    const codes: number[] = [];
    for (let i = 0; i < 25; i++) {
      const r = await fetch(`${URLE}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: [] }),
      });
      codes.push(r.status);
    }
    expect(codes.some((c) => c === 429)).toBe(true);
    expect(codes.filter((c) => c === 200).length).toBeLessThanOrEqual(20);
  });
});
