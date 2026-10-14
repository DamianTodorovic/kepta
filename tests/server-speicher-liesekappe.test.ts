// @vitest-environment node
// #57 — der Leseweg des Kerns, gemessen an der echten Tuer.
//
// Drei Behauptungen, die vorher im Raum standen und jetzt Zahlen haben:
//
//   1. `GET /api/memories` ignoriert `limit`. `server.ts:841-853` ruft
//      `allApiMemories()` = `listAllMemories()`, und das blaettert den ganzen Bestand
//      in 1000er-Seiten durch (`server.ts:296-305`). Am echten Bestand gemessen
//      (13./14.10., Port 62222 und die Kern-Tuer): 14.702 Knoten, 30.981.380 Bytes,
//      9,99 s — fuer einen Client, der 20 wollte.
//   2. Der ETag ist ein sha256 ueber genau diesen Leib (`server.ts:844`). Die
//      Pruefung "hat sich etwas geaendert" kostet damit einmal die ganze Antwort.
//   3. Die Graph-Tuer uebersetzt `sourceId/targetId` in Namen
//      (`server.ts:1155-1161`) und laesst die Zahlen weg. Ein Client kann eine Kante
//      nur ueber einen Namenssuchschlag an einen Knoten haengen — und die App haelt
//      an den Namen, die Flaeche ebenso. Also: zusaetzlich, nie statt.
//
// Was an der Aufgabe NICHT geaendert wird, weil das Paket auf npm veroeffentlicht
// ist: die Antwort-Form bleibt das naked array. Die Zahl kommt additiv im Header
// `X-Kepta-Total-Count`. Ein Test haelte sonst eine Form-Aenderung fuer Erfolg.
//
// Hausvertrag: ein Hoerer pro Datei, auf 127.0.0.1 gebunden, Port aus dem Dateinamen
// (`tests/helfer/hoerer.ts`, `tests/helfer/port-vergabe.ts`). Kein supertest-Aufbau je
// Anfrage — der bindet ohne Host auf `::`, und die Nachbauten vom 13.10. zeigen, wie ein
// fremder Hoerer dabei die Antwort spricht.

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from "vitest";
import { tmpdir } from "node:os";
import path from "node:path";
import fs from "node:fs";
import crypto from "node:crypto";
import { KeptaStore, LES_FENSTER } from "../src/core/store";
import { hoererDerDatei, type DateiHoerer } from "./helfer/hoerer";

process.env.KEPTA_NO_AUTOSTART = "1";

let createApp: (store: KeptaStore) => import("express").Express;
let store: KeptaStore;
let app: import("express").Express;
let dir = "";
let prevHome: string | undefined;
let hoerer: DateiHoerer;
let URLE = "";

beforeAll(async () => {
  hoerer = await hoererDerDatei("tests/server-speicher-liesekappe.test.ts");
  URLE = hoerer.url;
});

afterAll(async () => {
  await hoerer.schliesse();
});

/** Anlage ueber den Store: diese Scheibe prueft den LESEWEG, nicht den Schreibweg. */
function lege(titel: string, inhalt = "Inhalt"): string {
  return store.createMemory({ title: titel, content: inhalt, tags: ["kappe"] }).id;
}

function menge(n: number, basis = "akte"): void {
  for (let i = 0; i < n; i++) lege(`${basis} ${i}`);
}

async function liste(pfad = "/api/memories", headers: Record<string, string> = {}) {
  const res = await fetch(URLE + pfad, { headers });
  const text = await res.text();
  return { status: res.status, res, text, json: text ? (JSON.parse(text) as unknown) : undefined };
}

beforeEach(async () => {
  dir = fs.mkdtempSync(path.join(tmpdir(), "kepta-liesekappe-"));
  prevHome = process.env.HOME;
  process.env.HOME = dir;
  process.env.KEPTA_DATA_DIR = dir;
  vi.resetModules();
  ({ createApp } = await import("../server"));
  store = new KeptaStore(path.join(dir, "t.db"));
  app = createApp(store);
  hoerer.gebeApp(app);
});

afterEach(() => {
  store.close();
  if (prevHome === undefined) delete process.env.HOME;
  else process.env.HOME = prevHome;
});

describe("Fall 1 — limit wird respektiert, die Form bleibt", () => {
  beforeEach(() => {
    menge(30);
  });

  it("begrenzt die Antwort auf das bestellte Mass", async () => {
    const { json, status } = await liste("/api/memories?limit=5");
    expect(status).toBe(200);
    expect(Array.isArray(json)).toBe(true);
    expect((json as unknown[]).length, "die Route hat 5 bestellt bekommen, aber den vollen Bestand geliefert").toBe(5);
  });

  it("nannt die Gesamtzahl additiv im Header X-Kepta-Total-Count", async () => {
    const { res } = await liste("/api/memories?limit=5");
    expect(res.headers.get("x-kepta-total-count"), "Header fehlt").toBe("30");
  });

  it("laesst die bisherige naked-array-Form unveraendert", async () => {
    const { json } = await liste("/api/memories?limit=2");
    const erste = json as Record<string, unknown>[];
    expect(Array.isArray(erste)).toBe(true);
    // Die Form ist die von `server.ts:277-292` (toApi) — inklusive `userId`, das der
    // Kern aus Kompatibilitaet zum v1-Frontend mitschleppt. Gegentestet wird sie gegen
    // denselben Request vor dem Fix (Scratch-Rueckbau, Bericht Abschnitt "Gegenprobe").
    expect(Object.keys(erste[0]).sort()).toEqual(
      ["confidence", "content", "createdAt", "deletedAt", "id", "scope", "supersededBy", "tags", "title", "type", "updatedAt", "userId", "validFrom", "validTo"].sort(),
    );
  });

  it("kappt den Default, ohne die Zahl zu verschweigen", async () => {
    const { json, res } = await liste("/api/memories");
    expect((json as unknown[]).length).toBeLessThanOrEqual(500);
    expect(res.headers.get("x-kepta-total-count")).toBe("30");
  });

  it("kennt eine harte Obergrenze und schwenkt sie nicht an der Anfrage", async () => {
    const { json, res } = await liste("/api/memories?limit=999999");
    expect((json as unknown[]).length).toBeLessThanOrEqual(LES_FENSTER);
    expect(res.headers.get("x-kepta-total-count")).toBe("30");
  });

  it("zaehlt den Papierkorb an seiner eigenen Menge", async () => {
    lege("zu loeschen");
    const total = Number((await liste("/api/memories")).res.headers.get("x-kepta-total-count"));
    const { res } = await liste("/api/memories?trash=1");
    expect(res.headers.get("x-kepta-total-count")).toBe("0");
    expect(total).toBe(31);
  });
});

describe("Fall 1b — die harte Obergrenze ist eine echte Kante", () => {
  it("liefert nie mehr als LES_FENSTER, auch wenn 999 999 bestellt wird", async () => {
    // LES_FENSTER = 5 000 (`src/core/store.ts:43`). Ein Bestand DARUEBER ist noetig,
    // sonst ist der Fall eine Vermutung: mit 30 Notizen beweist
    // "laenger als 5 000" nichts. 5 001 Notizen kosten ~1 s und sind die
    // kleinste Menge, die die Kante schliessen laesst.
    menge(LES_FENSTER + 1);
    const { json, res } = await liste("/api/memories?limit=999999");
    expect((json as unknown[])).toHaveLength(LES_FENSTER);
    expect(res.headers.get("x-kepta-total-count")).toBe(String(LES_FENSTER + 1));
  });
});

describe("Fall 2 — der ETag wird abgeleitet, nicht aus dem Leib geholt", () => {
  beforeEach(() => {
    menge(12);
  });

  it("ist keine 64-stellige Leib-Hashe mehr", async () => {
    const { text, res } = await liste("/api/memories");
    const etag = res.headers.get("etag") ?? "";
    const sha = crypto.createHash("sha256").update(text).digest("hex");
    expect(etag.replace(/"/g, ""), "der ETag ist immer noch der sha256 des ganzen Leibes").not.toBe(sha);
    expect(etag).toMatch(/^"[at]\d+-\d+-g\d+"$/);
  });

  it("meldet 304 bei unveraendertem Stand und 200 nach einer Aenderung", async () => {
    const { res } = await liste("/api/memories");
    const etag = res.headers.get("etag")!;
    expect((await liste("/api/memories", { "If-None-Match": etag })).status).toBe(304);
    lege("neu dazu");
    expect((await liste("/api/memories", { "If-None-Match": etag })).status).toBe(200);
  });

  it("verwechselt aktiven Bestand und Papierkorb nicht", async () => {
    const aktiv = (await liste("/api/memories")).res.headers.get("etag")!;
    const muell = (await liste("/api/memories?trash=1")).res.headers.get("etag")!;
    expect(aktiv).not.toBe(muell);
  });

  it("bemerkt eine Aenderung, die Zahl und neuester Stand nicht verraeten", async () => {
    // Zwei Schreiben in derselben Millisecond: COUNT bleibt gleich, MAX(updated_at)
    // bleibt gleich. Ein ETag, der nur aus diesen beiden Zahlen lebt, antwortet hier
    // 304 auf einen Leib, der sich geaendert hat — ein Cache, der luegt.
    const { res } = await liste("/api/memories");
    const etag = res.headers.get("etag")!;
    const a = store.listMemories({ limit: 2 })[0]!;
    const b = store.listMemories({ limit: 2, offset: 1 })[0]!;
    store.updateMemory(a.id, { content: "stand eins" });
    store.updateMemory(b.id, { content: "stand zwei" });
    const danach = await liste("/api/memories", { "If-None-Match": etag });
    expect(danach.status, "zwei Aenderungen, aber Zahl und neuester Stand blieben — der ETag hat nicht reagiert").toBe(200);
  });
});

describe("Fall 3 — die Graph-Tuer nennt Kantenenden in beiden Schluesselnaturen", () => {
  beforeEach(() => {
    const m = store.createMemory({ title: "Anlage", content: "..." });
    store.linkEntities(m.id, ["alpha", "beta"]);
    store.addRelation("alpha", "beta", "betreut", m.id);
    const zweite = store.createMemory({ title: "Folge", content: "..." });
    store.linkEntities(zweite.id, ["beta", "gamma"]);
    store.addRelation("beta", "gamma", "betreut", zweite.id);
    const dritte = store.createMemory({ title: "Noch eine", content: "..." });
    store.linkEntities(dritte.id, ["gamma", "delta"]);
    store.addRelation("gamma", "delta", "betreut", dritte.id);
  });

  it("gibt sourceId und targetId zusaetzlich zu den Namen", async () => {
    const res = await fetch(`${URLE}/api/graph?entity=alpha&depth=1`);
    const leib = (await res.json()) as {
      entities: { id: number; name: string }[];
      relations: Record<string, unknown>[];
    };
    expect(leib.relations.length).toBeGreaterThan(0);
    const r = leib.relations[0];
    expect(typeof r.source).toBe("string");
    expect(typeof r.target).toBe("string");
    expect(typeof r.sourceId).toBe("number");
    expect(typeof r.targetId).toBe("number");
    const ids = new Set(leib.entities.map((e) => e.id));
    expect(ids.has(r.sourceId as number) && ids.has(r.targetId as number)).toBe(true);
  });

  it("unterscheidet depth=1 und depth=2 an ein und demselben Startbegriff", async () => {
    const eins = await fetch(`${URLE}/api/graph?entity=alpha&depth=1`).then((r) => r.text());
    const zwei = await fetch(`${URLE}/api/graph?entity=alpha&depth=2`).then((r) => r.text());
    expect(eins.length, "depth=1 und depth=2 antworten bytegleich").not.toBe(zwei.length);
    expect((JSON.parse(zwei) as { entities: unknown[] }).entities.length).toBeGreaterThan(
      (JSON.parse(eins) as { entities: unknown[] }).entities.length,
    );
  });

  it("ohne Startbegriff tut depth weiterhin nichts — Charakterisierung, offener Befund", async () => {
    // Die Leitung schrieb: "die Graph-Tuer uebersetzt sourceId/targetId in Namen,
    // darum sind depth=1 und depth=2 bytegleich". Nachgemessen haelt das nicht: die
    // Uebersetzung ist eine Formfrage, die Wirkungslosigkeit sitzt tiefer —
    // `src/core/store.ts:964` liest `depth` ausschliesslich im `if (entity)`-Zweig
    // (Hopfschleife bei `:972`), der Ganztbestand-Zweig (`:1014-1041`) kennt die
    // Variable gar nicht. Die Zahlen-Enden aus Fall 3 aendern daran nichts.
    //
    // Dieser Fall ist kein Erfolg und kein Rot: er haelt den Zustand fest, damit
    // niemand ihn spaeter fuer eine Heilung haelt.
    const eins = await fetch(`${URLE}/api/graph?depth=1`).then((r) => r.text());
    const zwei = await fetch(`${URLE}/api/graph?depth=2`).then((r) => r.text());
    expect(zwei).toBe(eins);
  });
});
