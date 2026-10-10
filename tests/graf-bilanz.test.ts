// A9 §3: "Das Bild zeigt, was da ist" — es zeigt einen Ausschnitt und sagt es
// nicht. Der Kern kappt still auf 500 Begriffe und 2 000 Relationen ohne ORDER BY
// (src/core/store.ts:976,981), die Notizliste endet bei updated_at DESC, und kein
// Feld sagt, was fehlt. Dazu: dieselbe Welt antwoordet durch die MCP-Tuer mit
// Privatheits-Floor (src/core/mcp.ts:531-551) und durch REST ohne (B-14).
//
// Dieser Test fuehrt die Rechenpflicht an Bestaenden vor, die bewusst ueber die
// Kappen laufen, und prueft den Floor auf beiden Tueren.
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import request from "supertest";
import { KeptaStore } from "../src/core/store";
import { handleRpc } from "../src/core/mcp";
import type { GrafAntwort } from "../src/core/graf-vertrag";

process.env.KEPTA_NO_AUTOSTART = "1";

let createApp: (store: KeptaStore) => import("express").Express;
let store: KeptaStore;
let app: import("express").Express;
let dir: string;
let prevHome: string | undefined;

beforeEach(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "kepta-graf-bilanz-"));
  prevHome = process.env.HOME;
  process.env.HOME = dir;
  process.env.KEPTA_DATA_DIR = dir;
  vi.resetModules();
  ({ createApp } = await import("../server"));
  store = new KeptaStore(path.join(dir, "t.db"));
  app = createApp(store);
});

afterEach(() => {
  store.close();
  if (prevHome === undefined) delete process.env.HOME;
  else process.env.HOME = prevHome;
});

async function bild(query: string) {
  const res = await request(app).get(`/api/graph/bild${query}`);
  return { status: res.status, body: res.body as GrafAntwort, etag: res.headers["etag"] as string | undefined };
}

/** Ein Bestand, der ueber jede Knotenkappe laeuft: 1000 Notizen, eine gemeinsame. */
function saete(notizen: number): void {
  for (let i = 0; i < notizen; i++) {
    store.createMemory({
      title: `Notiz ${String(i).padStart(4, "0")}`,
      content: `Inhalt ${i}. Siehe [[Notiz 0000]].`,
      tags: ["gemeinsam", `marke-${i % 7}`],
    });
  }
}

describe("graf-bilanz: keine Kappe ist still", () => {
  it("ein Bestand ueber der Knotenkappe meldet die Differenz", async () => {
    saete(1000);
    const res = await bild("?sicht=notiz&knoten=400&layout=0");
    expect(res.status).toBe(200);
    const b = res.body;
    expect(b.vertrag).toBe("graf-2");
    expect(b.bestand.notizen).toBe(1000);
    expect(b.bestand.knoten).toBe(1000);
    expect(b.knoten.length).toBe(400);
    expect(b.kuerzung.uebrig.knoten).toBe(600);
    expect(b.kuerzung.grund).toContain("knoten");
    expect(b.kuerzung.vollstaendig).toBe(false);
    // Rechenpflicht A9 §3 Regel 1: jede gemeldete Zahl ist die Differenz zu bestand.
    expect(b.bestand.knoten).toBe(b.knoten.length + b.kuerzung.uebrig.knoten);
    expect(b.bestand.kanten).toBe(b.kanten.length + b.kuerzung.uebrig.kanten);
  });

  it("die Auswahl folgt dem Wert, nicht dem Kopf der Tabelle", async () => {
    // Die aelteste Notiz ist das Ziel von zwoelf Links: sie muss ins kleine
    // Fenster, obwohl listMemories sie zuletzt liefern wuerde.
    store.createMemory({ title: "Aelteste Hub-Notiz", content: "a", tags: ["hub"], updatedAt: 1 });
    for (let i = 0; i < 6; i++) {
      store.createMemory({ title: `Jung ${i}`, content: "Siehe [[Aelteste Hub-Notiz]] und [[Aelteste Hub-Notiz]].", tags: ["hub"] });
    }
    const res = await bild("?sicht=notiz&knoten=3&layout=0");
    expect(res.body.knoten.map((k) => k.titel)).toContain("Aelteste Hub-Notiz");
    // gradEcht zaehlt nur, was im Bild steht: zwei der sechs Jungs passen hinein.
    const hub = res.body.knoten.find((k) => k.titel === "Aelteste Hub-Notiz")!;
    expect(hub.gradEcht).toBeGreaterThan(0);
  });

  it("ein Begriff aus der Entitaeten-Kappe fehlt mit Zahl, nicht mit Schweigen", async () => {
    for (let i = 0; i < 600; i++) {
      const m = store.createMemory({ title: `Traeger ${i}`, content: "x", tags: [] });
      store.linkEntities(m.id, [`begriff-${i}`]);
    }
    const res = await bild("?sicht=konzept&knoten=500&layout=0");
    const b = res.body;
    expect(b.bestand.knoten).toBe(600);
    expect(b.knoten.length).toBeLessThanOrEqual(500);
    expect(b.kuerzung.uebrig.knoten).toBe(b.bestand.knoten - b.knoten.length);
    expect(b.kuerzung.vollstaendig).toBe(false);
  });

  it("verwaiste Behauptungen zahlen, ohne als lebendig gemalt zu werden", async () => {
    const alpha = store.createMemory({ title: "Alpha", content: "x", tags: [] });
    const beta = store.createMemory({ title: "Beta", content: "x", tags: [] });
    const traeger = store.createMemory({ title: "Traeger", content: "x", tags: [] });
    store.linkEntities(alpha.id, ["Alpha", "Beta"]);
    store.linkEntities(beta.id, ["Alpha", "Beta"]);
    store.addRelation("Alpha", "Beta", "mentions", traeger.id);
    store.addRelation("Alpha", "Beta", "behauptet", null);
    store.addRelation("Alpha", "Beta", "verwaist", traeger.id);
    store.purgeMemory(traeger.id);

    const res = await bild("?sicht=konzept&layout=0");
    const b = res.body;
    expect(b.kuerzung.verwaiste.kanten).toBe(3);
    expect(b.kanten).toHaveLength(0);
    // Die drei Zeilen sind im Bestand, aber keine von ihnen ist eine lebende Kante.
    expect(b.bestand.kanten).toBe(b.kanten.length + b.kuerzung.uebrig.kanten + b.kuerzung.verwaiste.kanten);
  });
});

describe("graf-bilanz: dieselbe Grenze vor beiden Tueren", () => {
  it("eine private Notiz erscheint in keiner Antwort, ihre Zahl aber ueberall", async () => {
    store.createMemory({ title: "Oeffentliche Welt", content: "Siehe [[Privates Tagebuch]].", tags: ["tagoffen"] });
    store.createMemory({ title: "Privates Tagebuch", content: "nur fuer mich", tags: ["tagoffen"], scope: "private" });

    const res = await bild("?sicht=notiz&layout=0");
    expect(res.status).toBe(200);
    expect(JSON.stringify(res.body)).not.toContain("Privates Tagebuch");
    expect(res.body.kuerzung.gefiltert.privat).toBe(1);
    expect(res.body.kuerzung.grund).toContain("privat");
    expect(res.body.bestand.notizen).toBe(2);
    // Die sichtbare Welt ist eine weniger: bestand.knoten zaehlt nur Freigegebenes.
    expect(res.body.bestand.knoten).toBe(1);

    const mcp = await handleRpc({ store, transport: "stdio" }, {
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: { name: "memory_graph", arguments: {} },
    });
    expect(JSON.stringify(mcp)).not.toContain("Privates Tagebuch");
  });

  it("ein Begriff faellt erst, wenn ALLE seine Traeger privat sind", async () => {
    const offen = store.createMemory({ title: "Offene Notiz", content: "x", tags: [] });
    const privat = store.createMemory({ title: "Private Notiz", content: "x", tags: [], scope: "private" });
    store.linkEntities(offen.id, ["Geteilter Begriff"]);
    store.linkEntities(privat.id, ["Geteilter Begriff", "Nur privat"]);
    store.addRelation("Geteilter Begriff", "Nur privat", "erwaehnt", offen.id);
    store.addRelation("Nur privat", "Geteilter Begriff", "gehoert", privat.id);

    const res = await bild("?sicht=konzept&layout=0");
    // Der Store normiert Begriffsnamen in Kleinschreibung — verglichen wird,
    // welcher Begriff fällt, nicht wie er geschrieben steht.
    const titel = res.body.knoten.map((k) => k.titel.toLowerCase());
    expect(titel).toContain("geteilter begriff");
    expect(titel).not.toContain("nur privat");
    expect(res.body.kuerzung.gefiltert.privat).toBeGreaterThan(0);
    // Keine gemalte Kante zeigt aus dem Bild heraus — dieRelation mit privatem
    // Traeger faellt mit ihm, und ihre Zahl bleibt in der Bilanz sichtbar.
    const imBild = new Set(res.body.knoten.map((k) => k.id));
    expect(res.body.kanten.every((k) => imBild.has(k.quelle) && imBild.has(k.ziel))).toBe(true);
  });
});

describe("graf-bilanz: ein +N ist eine Tuer", () => {
  it("versteckte Nachbarn lassen sich mit einer Anfrage einloesen", async () => {
    store.createMemory({ title: "Hub", content: "x", tags: ["gemeinsam", "selten"] });
    for (let i = 0; i < 8; i++) {
      store.createMemory({ title: `Rand ${i}`, content: "y", tags: ["gemeinsam"] });
    }
    const knapp = await bild("?sicht=notiz&kanten=4&layout=0");
    const versteckt = knapp.body.knoten.reduce((s, k) => s + k.versteckteNachbarn, 0);
    expect(versteckt).toBeGreaterThan(0);
    expect(knapp.body.kuerzung.uebrig.kanten).toBeGreaterThan(0);
    expect(knapp.body.kanten.length).toBeLessThanOrEqual(4);

    // Dieselbe Anfrage mit offenem Fenster: die Nachbarn sind da, die Zahl sinkt.
    const weit = await bild("?sicht=notiz&kanten=2000&layout=0");
    expect(weit.body.kanten.length).toBeGreaterThan(knapp.body.kanten.length);
    expect(weit.body.knoten.reduce((s, k) => s + k.versteckteNachbarn, 0)).toBe(0);
  });
});
