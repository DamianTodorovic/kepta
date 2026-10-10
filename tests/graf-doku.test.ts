// A9 §5: "Eine Wache ueber der Behauptung." Die Doku nannte einen Graphen, den
// der Code nicht hatte (B-2, B-3): `width`/`height` als serverseitiges Layout
// behauptet, `src/ui/graph.ts` „behind the API and the CLI" genannt, und ein
// Kraft-Layout ohne jeden Produktions-Aufrufer (B-4). Diese Datei prueft jede
// Behauptung ueber den Bild-Pfad gegen die Route, die sie bedient — ein
// dokumentierter Parameter, den die Route nicht liest, macht sie rot.
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import request from "supertest";
import Ajv from "ajv";
import { KeptaStore } from "../src/core/store";
import type { GrafAntwort } from "../src/core/graf-vertrag";

process.env.KEPTA_NO_AUTOSTART = "1";

let createApp: (store: KeptaStore) => import("express").Express;
let store: KeptaStore;
let app: import("express").Express;
let dir: string;
let prevHome: string | undefined;

beforeEach(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "kepta-graf-doku-"));
  prevHome = process.env.HOME;
  process.env.HOME = dir;
  process.env.KEPTA_DATA_DIR = dir;
  vi.resetModules();
  ({ createApp } = await import("../server"));
  store = new KeptaStore(path.join(dir, "t.db"));
  app = createApp(store);
  store.createMemory({ title: "Alpha", content: "Siehe [[Beta]].", tags: ["gemeinsam"] });
  store.createMemory({ title: "Beta", content: "Ein Satz.", tags: ["gemeinsam"] });
  store.linkEntities(store.listMemories({ limit: 1 })[0]!.id, ["Alpha", "Beta"]);
  store.addRelation("Alpha", "Beta", "mentions", store.listMemories({ limit: 1 })[0]!.id);
});

afterEach(() => {
  store.close();
  if (prevHome === undefined) delete process.env.HOME;
  else process.env.HOME = prevHome;
});

const lies = (p: string) => fs.readFileSync(path.resolve(process.cwd(), p), "utf-8");

/**
 * Die Parameternamen, die beide READMEs dem Bild-Pfad zuordnen: Woerter in
 * Backticks innerhalb des Abschnitts ueber GET /api/graph/bild.
 */
function dokumentierteParameter(datei: string): string[] {
  const text = lies(datei);
  const anfang = text.indexOf("/api/graph/bild");
  if (anfang < 0) return [];
  const abschnitt = text.slice(anfang, text.indexOf("\n## ", anfang) > 0 ? text.indexOf("\n## ", anfang) : anfang + 3000);
  const namen = new Set<string>();
  for (const m of abschnitt.matchAll(/`([a-zäöüß_]{3,20})`/g)) {
    const wort = m[1]!;
    // Die Absaetze erwaehnen auch Feldnamen des Kuverts (kuerzung, uebrig …) —
    // gefragt sind nur die Parameter, die hinter einem ? stehen koennen.
    if (["sicht", "entitaet", "tiefe", "knoten", "kanten", "layout", "width", "height"].includes(wort)) namen.add(wort);
  }
  return [...namen];
}

describe("graf-doku: was die Doku behauptet, liest die Route", () => {
  it("jeder dokumentierte Parameter wird von der Route gelesen — und width/height werden abgewiesen", async () => {
    // Die Frage ist nicht, ob ein Wert gefaellt, sondern ob die Route den Namen
    // kennt. "unknown parameter" ist der eine Grund, ein ungueltiger Wert der
    // andere — nur der erste ist die Behauptung, die die Doku nicht halten kann.
    const unbekannt = /unknown parameter/;
    for (const datei of ["README.md", "README.de.md"]) {
      const dokumentiert = dokumentierteParameter(datei);
      expect(dokumentiert.length).toBeGreaterThan(3);
      for (const name of dokumentiert) {
        const res = await request(app).get(`/api/graph/bild?${name}=1`);
        const meldetUnbekannt = res.status === 400 && unbekannt.test(String(res.body?.error ?? ""));
        if (name === "width" || name === "height") {
          // Der Vertrag schliesst das Fenster absichtlich aus (A9 B-1/B-2), und
          // die Doku sagt genau das: „ohne width/height, absichtlich".
          expect([datei, name, meldetUnbekannt], `${datei} behauptet ?${name}, die Route liest es`).toEqual([datei, name, true]);
          continue;
        }
        expect([datei, name, meldetUnbekannt], `${datei} dokumentiert ?${name}, die Route weist es als unbekannt ab`).toEqual([datei, name, false]);
      }
    }
  });

  it("beide Sichten antworten nach dem Vertragsschema", async () => {
    const schema = JSON.parse(lies("schemas/graf-antwort-v2.schema.json"));
    const ajv = new Ajv({ strict: false, allErrors: true });
    const pruefe = ajv.compile(schema);
    for (const sicht of ["konzept", "notiz"]) {
      const res = await request(app).get(`/api/graph/bild?sicht=${sicht}`);
      expect(res.status).toBe(200);
      const fehler = (pruefe(res.body) ? [] : (pruefe.errors ?? [])).map((e) => `${e.instancePath || "/"} ${e.message}`);
      expect(fehler).toEqual([]);
      const antwort = res.body as GrafAntwort;
      expect(antwort.vertrag).toBe("graf-2");
      expect(antwort.welt.einheit).toBe("welt");
      expect(antwort.welt.groesse).toBe(1000);
      // Plaetze sind Welteinheiten: kein Feld nennt eine Pixelgroesse.
      expect(JSON.stringify(antwort)).not.toMatch(/"(breite|height|width)":/);
    }
  });

  it("das Kuvert nennt seine Rechenpflicht, und die Antwort haelt sie ein", async () => {
    const res = await request(app).get("/api/graph/bild?sicht=notiz");
    const b = res.body as GrafAntwort;
    expect(b.bestand.knoten).toBe(b.knoten.length + b.kuerzung.uebrig.knoten);
    expect(b.bestand.kanten).toBe(b.kanten.length + b.kuerzung.uebrig.kanten);
  });

  it("kraftLayout ist aus dem Build gefallen — Entscheidung 1, kein Toedcode mit Testabdeckung", () => {
    // A9 §5: die Funktion musste entweder einen Produktions-Aufrufer bekommen
    // oder aus dem Build. Sie ist raus; das Weltbild sitzt in src/core/graf-kraft.ts.
    const baum = ["src/ui/graph.ts", "src/cli-erlebnis.ts", "src/demo.ts", "src/demo-show.ts", "server.ts", "src/mcp-server.ts"];
    for (const datei of baum) {
      expect([datei, lies(datei).includes("kraftLayout")], `${datei} ruft kraftLayout noch auf`).toEqual([datei, false]);
    }
    const quelle = lies("src/ui/graph.ts");
    expect(quelle).not.toMatch(/export function kraftLayout/);
    // Die Wache gegen die Umkehrung: es gibt genau EINEN Layout-Pfad im Kern.
    const layoutDateien = fs
      .readdirSync(path.resolve(process.cwd(), "src/core"))
      .filter((f) => /kraft|layout/i.test(f));
    expect(layoutDateien).toEqual(["graf-kraft.ts"]);
  });

  it("die Antwort ist English in der Fehlerseite, Deutsch in den Feldnamen", async () => {
    // CONTRIBUTING.md setzt die Sprachregelung: maschinenlesbarer Text English.
    const res = await request(app).get("/api/graph/bild?sicht=nichts");
    expect(res.status).toBe(400);
    expect(String(res.body.error)).toMatch(/^[A-Za-z0-9 .,'`:;()/?-]+$/);
  });
});
