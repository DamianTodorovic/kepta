// @vitest-environment node
//
// Aufgabe #52 — Damians Bestand haengt die App: GET /api/memories hatte **keinen**
// seitenweisen Leseweg. `ctx.listAllMemories()` (server/app.ts:127) holte bei jedem
// Aufruf die ganze Basis, `JSON.stringify` und ein sha1 ueber den ganzen String
// folgten — an der echten Basis (14.702 Knoten) 30.981.380 Bytes in 9,99 s, von der
// Leitung gemessen. Ein `?limit=` ging an der Route vorbei.
//
// Der Vertrag, den diese Datei haelt: `limit`/`offset` gelten, `total` ist die Zahl
// der Menge, aus der geschnitten wird, und `begrenzt`/`hinweis` melden die Kappe —
// nach dem Muster der Kernsuche (SUCHE_LIMIT_MIN/STD/MAX = 1/10/100,
// kepta-core/src/core/mcp.ts:49-51).
//
// WARUM IN KOEPFEN, NICHT IM BODY: die Antwortform war ein nackter Array. Drei
// Flaechen lesen ihn (src/lib/store.ts:55, src/components/Dashboard.tsx:258,
// src/components/Chat.tsx:670), und 34 Tests in sieben Dateien tun es auch, waehrend
// ihre Scheiben laufen. Ein Objekt-Leib haette die Welle gebrochen; die Koepfe
// tragen dieselbe Zahl, ohne eine bestehende Antwort umzubauen. Die Flaechen lesen
// beim Umstellen `x-kepta-total` statt ihrer eigenen Laenge und zeigen "von 14.702".
//
// Ein Horcher pro Datei auf 127.0.0.1:8817 — nie request(app) (Ursache-9-Heilung,
// tests/helfer/hoerer.ts und tests/helfer/lauscher.ts).
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { KeptaStore } from "../src/core/store";
import { defaultExtensions } from "../src/core/extensions";
import { createApp } from "../server/app";
import { lauscht, niederlegen } from "./helfer/lauscher";

const PORT = 8817;
let URLE = `http://127.0.0.1:${PORT}`;

const AKTIVE = 400;
const PAPIERKORB = 300;
/** So gross wie ein mittlerer Knoten an Damians Basis (30.981.380 / 14.702 = 2.107 Bytes). */
const BROCKEN = "Diese Notiz haelt einen Absatz mit Substanz, damit die Bytes pro Eintrag der echten Basis aehneln. ";

let wurzel = "";
let vorherHeim: string | undefined;
let vorherDaten: string | undefined;
let store: KeptaStore;
let hoerer: import("node:http").Server;

interface Antwort {
  status: number;
  text: string;
  knoten: any[] | null;
  /** Der Antwortleib, wenn er ein Objekt ist — die Zahl MUSS aus dem Leib kommen. */
  leib: { count?: number; total?: number; limit?: number; offset?: number; begrenzt?: boolean; hinweis?: string; memories?: unknown[]; error?: string } | null;
  bytes: number;
  etag: string | null;
  count: number;
  total: number;
  limit: number;
  offset: number;
  begrenzt: string | null;
  hinweis: string;
  fehler?: string;
}

async function lese(weg: string, koepfe: Record<string, string> = {}): Promise<Antwort> {
  const antwort = await fetch(`${URLE}${weg}`, { headers: koepfe });
  const text = await antwort.text();
  let gekocht: unknown = null;
  try { gekocht = JSON.parse(text); } catch { /* die Antwort ist selbst das Ergebnis */ }
  const Kopf = (n: string) => antwort.headers.get(n);
  const kopfZahl = (n: string): number => (Kopf(n) === null ? -1 : Number(Kopf(n)));
  const istObjekt = gekocht !== null && !Array.isArray(gekocht) && typeof gekocht === "object";
  const leib = istObjekt ? (gekocht as Antwort["leib"]) : null;
  return {
    status: antwort.status,
    text,
    knoten: Array.isArray(gekocht) ? gekocht as any[] : Array.isArray(leib?.memories) ? (leib!.memories as any[]) : null,
    leib,
    bytes: Buffer.byteLength(text),
    etag: antwort.headers.get("etag"),
    count: kopfZahl("x-kepta-count"),
    total: kopfZahl("x-kepta-total"),
    limit: kopfZahl("x-kepta-limit"),
    offset: kopfZahl("x-kepta-offset"),
    begrenzt: Kopf("x-kepta-begrenzt"),
    hinweis: Kopf("x-kepta-hinweis") ?? "",
    fehler: leib ? String(leib.error ?? "") : undefined,
  };
}

beforeAll(async () => {
  wurzel = fs.mkdtempSync(path.join(os.tmpdir(), "kepta-leseweg-"));
  // Kapsel: createApp zieht ohne KEPTA_DATA_DIR ~/.kepta des Anmeldekontos an
  // (server/app.ts:120), und os.homedir() folgt HOME. Haelt tests/testkapsel.test.ts.
  vorherHeim = process.env.HOME;
  vorherDaten = process.env.KEPTA_DATA_DIR;
  process.env.HOME = wurzel;
  process.env.KEPTA_DATA_DIR = wurzel;
  store = new KeptaStore(path.join(wurzel, "kepta.db"), defaultExtensions());
  for (let i = 0; i < AKTIVE; i++) {
    store.createMemory({ title: `Aktiv ${i}`, content: `${BROCKEN.repeat(2)} Nummer ${i}.`, tags: ["leseweg"] });
  }
  const fuerKorb: string[] = [];
  for (let i = 0; i < PAPIERKORB; i++) {
    fuerKorb.push(store.createMemory({ title: `Weg ${i}`, content: `${BROCKEN.repeat(2)} Papierkorb ${i}.`, tags: ["leseweg"] }).id);
  }
  for (const id of fuerKorb) store.trashMemory(id);
  const horcher = await lauscht(createApp(store), PORT);
  hoerer = horcher.server;
  URLE = horcher.urle;
});

afterAll(async () => {
  if (hoerer) await niederlegen(hoerer);
  store?.close();
  if (vorherHeim === undefined) delete process.env.HOME;
  else process.env.HOME = vorherHeim;
  if (vorherDaten === undefined) delete process.env.KEPTA_DATA_DIR;
  else process.env.KEPTA_DATA_DIR = vorherDaten;
  fs.rmSync(wurzel, { recursive: true, force: true });
});

describe("seitenweiser Leseweg — die Route deckelt, was sie liefert", () => {
  // GFs Befund vom 13.10. 21:26, im eigenen Browser gemessen
  // (audit-2026-10-09/gf-screens/graph-14k-detailstufe.png): die Flaeche zeigte
  // "100 entries · 0 concepts · 0 links" und einen Kopf "100 entries", waehrend in der
  // Tuer 14.702 lagen. Der Kopf `x-kepta-total` fuehrt ueber einen Weg, der ein
  // `res.json(array` baut — **kein Renderer darf auf Header-Hoffnung bauen.** Also:
  // die Zahl, die die Flaeche zeigt, steht im Leib. Wie bei der Suchtuer
  // (`server/router/search.ts:23-28`: {query, count, total, memories}).
  it("der Leib nennt seinen Vertrag selbst: total, begrenzt, hinweis", async () => {
    const r = await lese("/api/memories");
    expect(r.leib, "die Liste antwortet als Objekt mit Zahl, nicht als nackter Array").toBeTruthy();
    expect(r.leib!.total).toBe(AKTIVE);
    expect(r.leib!.count).toBe(100);
    expect(r.leib!.limit).toBe(100);
    expect(r.leib!.offset).toBe(0);
    expect(r.leib!.begrenzt).toBe(true);
    expect(typeof r.leib!.hinweis).toBe("string");
    expect(r.leib!.hinweis).toMatch(/of 400/);
    expect(Array.isArray(r.leib!.memories)).toBe(true);
    expect(r.leib!.memories).toHaveLength(100);
  });

  it("begrenzt ist hoerbar, wo die Kappe greift, und still, wo die Seite alles traegt", async () => {
    const kappe = await lese("/api/memories?limit=50");
    expect(kappe.leib!.begrenzt).toBe(true);
    expect(kappe.leib!.total).toBe(AKTIVE);
    const alles = await lese("/api/memories?alle=1");
    expect(alles.leib!.begrenzt).toBe(false);
    expect(alles.leib!.count).toBe(AKTIVE);
    expect(alles.leib!.total).toBe(AKTIVE);
    // Ein Blatt, das die letzte Seite erreicht hat, meldet keine offene Kappe mehr.
    const letzte = await lese(`/api/memories?limit=100&offset=${AKTIVE - 100}`);
    expect(letzte.leib!.begrenzt).toBe(false);
  });

  it("ohne limit kommt eine Seite, nicht der ganze Bestand — und die Kappe sagt es", async () => {
    const r = await lese("/api/memories");
    expect(r.status).toBe(200);
    expect(r.knoten).toHaveLength(100);
    expect(r.count).toBe(100);
    expect(r.total).toBe(AKTIVE);
    expect(r.limit).toBe(100);
    expect(r.offset).toBe(0);
    expect(r.begrenzt).toBe("1");
    expect(r.hinweis).toMatch(/100/);
    expect(r.hinweis).toMatch(/of 400/);
    expect(r.hinweis).toMatch(/limit=/);
    expect(r.hinweis).toMatch(/alle=1/);
  });

  it("ein Abriss bleibt unter einer Megabyte — die Default-Kappe ist die Bremse", async () => {
    const defaultSeite = await lese("/api/memories");
    expect(defaultSeite.bytes).toBeLessThan(1_000_000);
    const groesste = await lese("/api/memories?limit=200");
    expect(groesste.bytes).toBeLessThan(1_000_000);
    // Kontrolle, dass die Kappe die Zahl ist, nicht der Zufall: ohne sie waere alles da.
    const ganze = await lese("/api/memories?alle=1");
    expect(ganze.bytes).toBeGreaterThan(defaultSeite.bytes * 3);
  });

  it("limit gilt wirklich: 50 angefordert, 50 bekommen, total bleibt die ganze Menge", async () => {
    const r = await lese("/api/memories?limit=50");
    expect(r.knoten).toHaveLength(50);
    expect(r.count).toBe(50);
    expect(r.total).toBe(AKTIVE);
    expect(r.limit).toBe(50);
  });

  it("offset schiebt die Seite, ohne Doppelung und ohne Luecke", async () => {
    const erste = await lese("/api/memories?limit=50");
    const zweite = await lese("/api/memories?limit=50&offset=50");
    const a = erste.knoten!.map((m: { id: string }) => m.id);
    const b = zweite.knoten!.map((m: { id: string }) => m.id);
    expect(b).toHaveLength(50);
    expect(zweite.offset).toBe(50);
    expect(new Set([...a, ...b]).size).toBe(100);
    const letzte = await lese(`/api/memories?limit=50&offset=${AKTIVE - 50}`);
    expect(letzte.knoten).toHaveLength(50);
    expect(letzte.begrenzt).toBe("0");
    const ueber = await lese(`/api/memories?limit=50&offset=${AKTIVE}`);
    expect(ueber.knoten).toHaveLength(0);
    expect(ueber.total).toBe(AKTIVE);
    expect(ueber.begrenzt).toBe("0");
  });

  it("ein limit ueber der Obergrenze wird geklemmt und gesagt, nicht still geschluckt", async () => {
    const r = await lese("/api/memories?limit=1000");
    expect(r.status).toBe(200);
    expect(r.limit).toBe(200);
    expect(r.knoten).toHaveLength(200);
    expect(r.begrenzt).toBe("1");
    expect(r.hinweis).toMatch(/limit=1000 is outside 1\.\.200/);
    expect(r.hinweis).toMatch(/pinned to 200/);
  });

  it("muell beim limit wird abgelehnt, statt den ganzen Bestand zu liefern", async () => {
    for (const wert of ["abc", "0", "-5", "1,5", ""]) {
      const r = await lese(`/api/memories?limit=${encodeURIComponent(wert)}`);
      expect(r.status, `limit=${wert}`).toBe(400);
      expect(r.fehler).toMatch(/limit must be a whole number from 1 to 200/);
      expect(r.fehler).toMatch(/alle=1/);
      // Ein Erfolgskopf darf nicht stehen bleiben, wenn die Antwort eine Ablehnung ist.
      expect(r.count, `limit=${wert}`).toBe(-1);
    }
  });

  it("auch alle und offset werden streng gelesen — Muell liefert nie die ganze Basis", async () => {
    const falschesAlle = await lese("/api/memories?alle=ja");
    expect(falschesAlle.status).toBe(400);
    expect(falschesAlle.fehler).toMatch(/alle takes exactly 1 or true/);
    const muellOffset = await lese("/api/memories?offset=x");
    expect(muellOffset.status).toBe(400);
    expect(muellOffset.fehler).toMatch(/offset must be a whole number from 0 up/);
    expect(muellOffset.knoten).toBeNull();
  });

  it("der Papierkorb ist genauso seitenweis gezaehlt", async () => {
    const r = await lese("/api/memories?trash=1&limit=50");
    expect(r.knoten).toHaveLength(50);
    expect(r.total).toBe(PAPIERKORB);
    expect(r.count).toBe(50);
    expect(r.begrenzt).toBe("1");
    expect(r.hinweis).toMatch(/trashed notes/);
    const ganz = await lese("/api/memories?trash=1&alle=1");
    expect(ganz.total).toBe(PAPIERKORB);
    expect(ganz.knoten).toHaveLength(PAPIERKORB);
  });

  it("alle=1 ist der ausdrueckliche, schwere Weg — begrenzt:0 und ein Hinweis darauf", async () => {
    const r = await lese("/api/memories?alle=1");
    expect(r.knoten).toHaveLength(AKTIVE);
    expect(r.count).toBe(AKTIVE);
    expect(r.total).toBe(AKTIVE);
    expect(r.begrenzt).toBe("0");
    expect(r.hinweis).toMatch(/alle=1 asked for the whole base/);
    expect(r.hinweis).toMatch(/heavy path/);
  });

  it("total zaehlt denselben Satz, aus dem die Seite geschnitten wird — aktiv und Papierkorb vermischen sich nicht", async () => {
    const aktive = await lese("/api/memories?limit=10");
    expect(aktive.total).toBe(AKTIVE);
    const korb = await lese("/api/memories?trash=1&limit=10");
    expect(korb.total).toBe(PAPIERKORB);
    expect(aktive.total + korb.total).toBe(AKTIVE + PAPIERKORB);
    const titel = aktive.knoten!.map((m: { title: string }) => m.title);
    expect(titel.some((t: string) => t.startsWith("Weg "))).toBe(false);
  });

  it("ETag gilt pro Seite — unveraenderte Seite antwortet 304, ohne Bytes", async () => {
    const erste = await lese("/api/memories?limit=20");
    expect(erste.etag).toBeTruthy();
    expect(erste.knoten).toHaveLength(20);
    const zweite = await lese("/api/memories?limit=20", { "if-none-match": String(erste.etag) });
    expect(zweite.status).toBe(304);
    expect(zweite.bytes).toBe(0);
    const andereSeite = await lese("/api/memories?limit=20&offset=20", { "if-none-match": String(erste.etag) });
    expect(andereSeite.status).toBe(200);
    expect(andereSeite.offset).toBe(20);
  });
});
