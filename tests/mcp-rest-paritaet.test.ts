// @vitest-environment node
//
// P152 — README.md:85 verspricht mehr als eine Route: "anything that speaks MCP shares the
// same encrypted knowledge base, plus anything that only speaks HTTP through the REST API.
// What one assistant learns, the next already knows."
//
// Bis heute hielt davon kein Fall die *Daten-Seite*. Die Suite hat:
//   · tests/mcp-behauptungen.test.ts:193 — dieselbe Absage an beiden Tueren (Vertrag),
//   · tests/mcp-behauptungen.test.ts:175 — die HTTP-Agenten-Tuer /api/mcp/save mit Liste danach,
//   · tests/mcp.test.ts — die MCP-Werkzeuge gegen einen Store.
// Was fehlt, ist der Satz selbst: eine Notiz, die durch die eine Tuer hineingeht, muss durch die
// andere *gefunden* werden — Agent schreibt, Hand liest; Hand schreibt, Agent findet.
//
// Darum hier: ein Store, zwei Tueren, beide Richtungen, dazu die Kontrolle mit zwei getrennten
// Bestaenden. Die Kontrolle ist kein Schmuck: ohne sie waere "steht in der Liste" erfuellt, auch
// wenn die Behauptung falsch waere und jede App einfach alles anzeigt.

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { tmpdir } from "node:os";
import path from "node:path";
import fs from "node:fs";
import request from "supertest";
import { KeptaStore } from "../src/core/store";
import { callTool } from "../src/core/mcp";

process.env.KEPTA_NO_AUTOSTART = "1";
// Hermetisch wie in tests/server.test.ts: Tests duerfen nie den echten Schluesselbund ruehren.
// Die Verschluesselung selbst decken tests/nebendateien.test.ts und tests/kette*.test.ts ab.
process.env.KEPTA_ENCRYPTION = "off";

const ausDemFenster = (r: request.Test) => r.set("Origin", "http://127.0.0.1").set("Host", "127.0.0.1");

let dir = "";
let prevHome: string | undefined;
let store: KeptaStore;
let createApp: typeof import("../server").createApp;
let app: import("express").Express;

beforeEach(async () => {
  dir = fs.mkdtempSync(path.join(tmpdir(), "kepta-paritaet-"));
  prevHome = process.env.HOME;
  process.env.HOME = dir;
  process.env.KEPTA_DATA_DIR = dir;
  const { KeptaStore: Store } = await import("../src/core/store");
  store = new Store(path.join(dir, "test.db")) as unknown as KeptaStore;
  ({ createApp } = await import("../server"));
  app = createApp(store);
});

afterEach(() => {
  try {
    store.close();
  } catch {
    /* schon zu */
  }
  if (prevHome === undefined) delete process.env.HOME;
  else process.env.HOME = prevHome;
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch {
    /* weg */
  }
});

describe("P152 — zwei Tueren, ein Gehirn: was die eine lernt, kennt die andere", () => {
  it("der Agent schreibt durch MCP, und die HTTP-Liste zeigt es, die HTTP-Suche findet es", async () => {
    const gespeichert = await callTool(store, "memory_save", {
      title: "Frist Nordwind",
      content: "Nordwind traegt die Umsatzsteuer-Frist bis Freitag, Elena prueft nach.",
    });
    expect(gespeichert.isError, `memory_save warf: ${JSON.stringify(gespeichert.content)}`).toBeFalsy();

    const liste = await request(app).get("/api/memories?limit=50").expect(200);
    expect(JSON.stringify(liste.body), "die Agenten-Notiz fehlt in der HTTP-Liste").toContain("Frist Nordwind");

    const suche = await request(app).get("/api/memories/search?q=Nordwind+Frist").expect(200);
    expect(JSON.stringify(suche.body), "die HTTP-Suche findet die Agenten-Notiz nicht").toContain("Frist Nordwind");
  });

  it("die Hand schreibt durch REST, und memory_search des Agenten findet sie", async () => {
    const neu = await ausDemFenster(
      request(app).post("/api/memories").send({
        title: "Rechnung Elena",
        content: "Elena rechnet die Nordwind-Rechnung am Montag ab, Barzahlung 480 Euro.",
      }),
    );
    expect(neu.status, `POST /api/memories antwortete ${neu.status}: ${JSON.stringify(neu.body)}`).toBeLessThan(300);

    const fund = await callTool(store, "memory_search", { query: "Elena Rechnung Nordwind", limit: 10 });
    expect(JSON.stringify(fund.structuredContent), "der Agent sieht die REST-Notiz nicht").toContain("Rechnung Elena");
  });

  it("Kontrolle: ein zweiter, getrennter Bestand zeigt die Notiz nicht", async () => {
    await callTool(store, "memory_save", { title: "Nur hier", content: "Nordwind allein, ohne zweite Tuer." });
    const ort = fs.mkdtempSync(path.join(tmpdir(), "kepta-paritaet-kontrolle-"));
    const { KeptaStore: Store } = await import("../src/core/store");
    const zweiter = new Store(path.join(ort, "anderer.db")) as unknown as KeptaStore;
    try {
      const appZweiter = createApp(zweiter);
      const liste = await request(appZweiter).get("/api/memories?limit=50").expect(200);
      expect(JSON.stringify(liste.body), "zwei getrennte Bestaende zeigen dieselbe Notiz — die Kontrolle taugt nichts").not.toContain(
        "Nur hier",
      );
      const fund = await callTool(zweiter, "memory_search", { query: "Nordwind allein", limit: 10 });
      expect(JSON.stringify(fund.structuredContent), "der zweite Agent sieht die Notiz des ersten").not.toContain("Nur hier");
    } finally {
      try {
        zweiter.close();
      } catch {
        /* schon zu */
      }
      fs.rmSync(ort, { recursive: true, force: true });
    }
  });

  it("Kontrolle der Kontrolle: derselbe Pfad, zwei Stores — da MUSS die Notiz erscheinen", async () => {
    // Ohne diesen Fall waere die Negativ-Kontrolle oben ein Blindgang: "nicht enthalten" bleibt
    // auch true, wenn das Lesen aus einem ganz andern Grund nichts zurueckgibt (Route tot, Filter
    // zu eng, Titel vertippt). Hier schreiben wir in denselben Datei-Pfad und lesen aus einem
    // zweiten Store darauf -- derselbe Leib, also muss die Notiz durchkommen.
    const ort = fs.mkdtempSync(path.join(tmpdir(), "kepta-paritaet-gleich-"));
    const pfad = path.join(ort, "gemeinsam.db");
    const { KeptaStore: Store } = await import("../src/core/store");
    const einer = new Store(pfad) as unknown as KeptaStore;
    const anderer = new Store(pfad) as unknown as KeptaStore;
    try {
      await callTool(einer, "memory_save", { title: "Gemeinsam", content: "Nordwind und Elena, derselbe Leib." });
      const liste = await request(createApp(anderer)).get("/api/memories?limit=50").expect(200);
      expect(JSON.stringify(liste.body), "zwei Stores auf demselben Pfad sehen sich nicht — dann verliert der Negativ-Fall seine Beweiskraft").toContain(
        "Gemeinsam",
      );
    } finally {
      for (const s of [einer, anderer]) {
        try {
          s.close();
        } catch {
          /* schon zu */
        }
      }
      fs.rmSync(ort, { recursive: true, force: true });
    }
  });
});
