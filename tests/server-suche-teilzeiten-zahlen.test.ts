// @vitest-environment node
//
// Zelle #98, Engine-Spalte (Leitung 24.10. 15:50 MESZ): die Arbeit IN der Engine wird gemessen.
//
// Die gelandete Routen-Haelfte (3.2.56, Kopf 2e99236) nennt vorarbeit, engine, ruckmeldung, formen,
// gesamt - aber nicht, wohin die Engine-Zeit geht. An der ausgelieferten 3.2.56 nannte eine Suche
// `engine=1763,27` bei `vorarbeit=0.07` (15:45:39 MESZ); die Strafe sitzt IN der Engine.
//
// Dieser Fall verlangt drei Zahlenfelder aus der Engine (wortlese, einbettung, vektor), als Zahlen,
// mit einem Verhaeltnis, das verlieren kann - und am Tor Kopf und Leib mit derselben Zahl.
// Am Kopf 2e99236 faellt er: die Engine misst nichts.
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import http from "node:http";
import { KeptaStore } from "../src/core/store";
import { defaultExtensions } from "../src/core/extensions";
import { createApp } from "../server/app";
import { searchMemories } from "../src/core/engine";
import { lauscht, niederlegen } from "./helfer/lauscher";

const PORT = 8954;
let URLE = `http://127.0.0.1:${PORT}`;
let wurzel = "";
let vorherHeim: string | undefined;
let vorherDaten: string | undefined;
let store: KeptaStore;
let hoerer: http.Server;

// Ohne Ollama: der Vektor-Zweig greift nicht ins Netz. ABER der Stub darf nicht die eigne Tuer
// treffen - sonst antwortet der Testserver mit 503, und der Fall misst seine eigne Attrappe
// (gemessen 17:41:07 MESZ: drei Faelle rot mit "expected 503 to be 200").
const echterFetch = globalThis.fetch;
vi.stubGlobal("fetch", vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
  if (String(url).includes("127.0.0.1")) return echterFetch(url as never, init as never);
  return { ok: false, status: 503, json: async () => ({}) } as unknown as Response;
}));

const DREI = ["wortlese", "einbettung", "vektor"] as const;
const GET_MARKEN = ["vorarbeit", "wortlese", "einbettung", "vektor", "engine", "formen", "gesamt"];
const POST_MARKEN = ["vorarbeit", "wortlese", "einbettung", "vektor", "engine", "rueckmeldung", "formen", "gesamt"];

function kopfPaare(kopf: string | null): Record<string, number> | null {
  if (!kopf) return null;
  const out: Record<string, number> = {};
  for (const stueck of kopf.split(";")) {
    const [name, wert] = stueck.split("=");
    if (!name || wert === undefined) continue;
    out[name.trim()] = Number(wert);
  }
  return out;
}

beforeAll(async () => {
  wurzel = fs.mkdtempSync(path.join(os.tmpdir(), "kepta-engspalte-"));
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
    store.createMemory({ title: `Engspalte ${i}`, content: `engspaltenprobe am Tor Nummer ${i} mit etwas Text`, tags: [] } as never);
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

describe("#98 Engine-Spalte: die Arbeit in der Engine, als Zahlen", () => {
  it("die Engine nennt wortlese, einbettung, vektor und gesamt als endliche Zahlen", async () => {
    const r = await searchMemories(store, { query: "engspaltenprobe", limit: 5, offset: 0 });
    expect(r.teilzeiten, "die Engine misst nichts").toBeTruthy();
    for (const f of [...DREI, "gesamt"]) {
      expect(typeof (r.teilzeiten as Record<string, unknown>)[f], `${f} ist keine Zahl`).toBe("number");
      expect(Number.isFinite((r.teilzeiten as Record<string, number>)[f]), `${f} ist nicht endlich`).toBe(true);
      expect((r.teilzeiten as Record<string, number>)[f], `${f} ist negativ`).toBeGreaterThanOrEqual(0);
    }
  });

  it("das Verhaeltnis haelt: gesamt deckt wortlese und vektor", async () => {
    const r = await searchMemories(store, { query: "engspaltenprobe", limit: 5, offset: 0 });
    const t = r.teilzeiten!;
    expect(t.gesamt).toBeGreaterThanOrEqual(t.wortlese);
    expect(t.gesamt).toBeGreaterThanOrEqual(t.vektor);
  });

  it("kalt und warm im selben Prozess: beide tragen die drei Felder, je mit eigner Uhrzeit", async () => {
    const frisch = `engspalte${Date.now()}`;
    const kalt = await searchMemories(store, { query: frisch, limit: 5 });
    const kaltUhr = performance.now();
    const kaltZeit = new Date().toISOString(); // fuers Protokoll, nicht fuer die Erwartung
    const warm = await searchMemories(store, { query: frisch, limit: 5 });
    const warmUhr = performance.now();
    const warmZeit = new Date().toISOString();
    for (const f of DREI) {
      expect(typeof kalt.teilzeiten![f]).toBe("number");
      expect(typeof warm.teilzeiten![f]).toBe("number");
    }
    // Die Wanduhr in Millisekunden war eine Wette, keine Eigenschaft: auf CI kostet eine
    // Suche ~1 ms (16.11.2026 gemessen, gesamt 1.18 und 1.089), drei grüne Läufe bestanden
    // nur, weil die Stempel zufällig 1 ms auseinander lagen (.370/.371, .757/.758,
    // .373/.374) — der rote Lauf landete in derselben Millisekunde (.266 zweimal).
    // Die monotone Uhr löst unter 1 ms auf und kann nicht zurücklaufen.
    expect(warmUhr).toBeGreaterThan(kaltUhr);
    expect(kalt.teilzeiten, "zwei Messungen, nicht dasselbe Objekt zweimal").not.toBe(warm.teilzeiten);
    console.log(`ENGINE-KALT ${kaltZeit} ${JSON.stringify(kalt.teilzeiten)}`);
    console.log(`ENGINE-WARM ${warmZeit} ${JSON.stringify(warm.teilzeiten)}`);
  });

  it("bei eingefrorener Wanduhr tragen kalt und warm trotzdem verschiedene Messzeiten", async () => {
    // Die CI-Bedingung wird nachgestellt, nicht erhofft: nur Date ist gefälscht, die
    // monotone Uhr bleibt echt. Der rote Lauf vom 16.11.2026 09:06:44.266Z steht hier
    // als eingefrorene Wanduhr — zwei Suchen, ein ISO-Stempel, zwei Messzeiten.
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-16T09:06:44.266Z"));
    try {
      const frisch = `engspalte-frost-${Date.now()}`;
      const kalt = await searchMemories(store, { query: frisch, limit: 5 });
      const kaltIso = new Date().toISOString();
      const kaltUhr = performance.now();
      const warm = await searchMemories(store, { query: frisch, limit: 5 });
      const warmIso = new Date().toISOString();
      const warmUhr = performance.now();
      expect(warmIso, "die Wanduhr steht still — das ist die nachgestellte CI-Bedingung").toBe(kaltIso);
      expect(warmUhr, "die monotone Uhr trennt die zwei Messungen").toBeGreaterThan(kaltUhr);
      expect(kalt.teilzeiten).not.toBe(warm.teilzeiten);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("#98 Engine-Spalte am Tor: Kopf und Leib mit derselben Zahl", () => {
  it("GET: die Markenmenge traegt die drei Arbeitsfelder, Kopf und Leib gleich", async () => {
    const r = await fetch(`${URLE}/api/memories/search?q=engspaltenprobe&limit=5`);
    expect(r.status).toBe(200);
    const kopf = kopfPaare(r.headers.get("x-kepta-teilzeiten"));
    expect(kopf, "kein x-kepta-teilzeiten-Kopf").toBeTruthy();
    expect(Object.keys(kopf!).sort(), `Marken: ${r.headers.get("x-kepta-teilzeiten")}`).toEqual([...GET_MARKEN].sort());
    const leib = (await r.json()) as { teilzeiten?: Record<string, number> };
    expect(leib.teilzeiten, "kein teilzeiten-Feld im Leib").toBeTruthy();
    for (const [name, wert] of Object.entries(kopf!)) {
      expect(leib.teilzeiten![name], `${name}: Kopf ${wert} gegen Leib ${leib.teilzeiten![name]}`).toBe(wert);
    }
  });

  it("POST: dieselbe Menge plus rueckmeldung, Kopf und Leib gleich", async () => {
    const r = await fetch(`${URLE}/api/search`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: "engspaltenprobe", topK: 5 }),
    });
    expect(r.status).toBe(200);
    const kopf = kopfPaare(r.headers.get("x-kepta-teilzeiten"));
    expect(kopf, "kein x-kepta-teilzeiten-Kopf am POST-Weg").toBeTruthy();
    expect(Object.keys(kopf!).sort(), `Marken: ${r.headers.get("x-kepta-teilzeiten")}`).toEqual([...POST_MARKEN].sort());
    const leib = (await r.json()) as { teilzeiten?: Record<string, number> };
    for (const [name, wert] of Object.entries(kopf!)) {
      expect(leib.teilzeiten![name], `${name}: Kopf ${wert} gegen Leib ${leib.teilzeiten![name]}`).toBe(wert);
    }
  });

  it("Gegen-Kopf: GET /api/mcp/tools traegt keinen Teilzeit-Kopf", async () => {
    const r = await fetch(`${URLE}/api/mcp/tools`);
    expect(r.status).toBe(200);
    expect(r.headers.get("x-kepta-teilzeiten")).toBeNull();
  });
});
