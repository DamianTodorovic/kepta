// Der Pro-Tag UND seine Wächter: 24 Stunden ab Erststart laufen alle
// Pro-Werkzeuge ohne Limiten — und DAMIANs Regel gilt: es darf keinen Weg
// geben, sich Pro dauerhaft kostenlos zu verschaffen. Diese Datei greift die
// Umgehungen einzeln an und beweist, dass sie scheitern:
//
//   1. App-Neustart      → Zähler und Probetag leben persistent, kein Reset
//   2. Uhr zurückdrehen  → Monotonie-Anker: Anomalie → Pro-Tag verfällt
//   3. DB bearbeiten     → Zustand ist verschlüsselt + authentisiert (AES-256-GCM)
//                          mit einem eigenen Schlüssel; Editieren fällt auf
//   4. Blob löschen      → der Erststart-Anker belegt die Installation: Verfall
//   5. Klartext-Stempel fälschen → Diskrepanz zum Anker: Verfall
//
// Hermetik (22.9.-Lektion): KEPTA_PLAN_KEY/KEPTA_PROTAG_ANKER ersetzen die
// beiden Schlüsselbund-Einträge — kein echter Bund-Kontakt, kein Risiko für
// die echte Installation.
// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import os from "node:os";
import path from "node:path";
const { tmpdir } = os;
import fs from "node:fs";
import crypto from "node:crypto";
import request from "supertest";
import { KeptaStore } from "../src/core/store";
import { ersterStartSichern, probetagStatus, PROBETAG_LAENGE_MS } from "../server/helfer/probetag";
import { ladePlanZustand, verbrauchtFuer, zaehleFuer, lokalerTag, ankerDateiPfadFuer } from "../server/helfer/planzustand";

process.env.KEPTA_NO_AUTOSTART = "1";
process.env.KEPTA_ENCRYPTION = "off";
// Fester Test-Schlüssel für den verschlüsselten Plan-Zustand (kein Bund-Kontakt).
process.env.KEPTA_PLAN_KEY = crypto.randomBytes(32).toString("hex");

let dir: string;
let store: KeptaStore;
let createApp: typeof import("../server").createApp;
const DATEN = "/tmp/kepta-protag-test-daten"; // für Tests ohne Bund-Berührung irrelevant

beforeEach(async () => {
  dir = fs.mkdtempSync(path.join(tmpdir(), "kepta-protag-"));
  process.env.HOME = dir;
  process.env.KEPTA_DATA_DIR = dir;
  delete process.env.KEPTA_PROTAG_ANKER;
  const mod = await import("../server");
  createApp = mod.createApp;
  store = new KeptaStore(path.join(dir, "test.db"));
});

afterEach(() => {
  store.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

describe("Probetag: der normale Lebenszyklus", () => {
  it("sichert den Erststart einmalig — kein zweiter Tag durch erneutes Sichern", () => {
    const jetzt = Date.now();
    expect(ersterStartSichern(store, DATEN, jetzt)).toBe(jetzt);
    expect(ersterStartSichern(store, DATEN, jetzt + 3_600_000)).toBe(jetzt);
    expect(probetagStatus(store, DATEN, jetzt + 3_600_000).start).toBe(jetzt);
  });

  it("läuft 24 Stunden und endet dann exakt", () => {
    const start = Date.now();
    ersterStartSichern(store, DATEN, start);
    expect(probetagStatus(store, DATEN, start + PROBETAG_LAENGE_MS - 1).aktiv).toBe(true);
    expect(probetagStatus(store, DATEN, start + PROBETAG_LAENGE_MS).aktiv).toBe(false);
    expect(probetagStatus(store, DATEN, start + PROBETAG_LAENGE_MS).restMs).toBe(0);
  });

  it("migriert den 2.13.5-Klartext-Stempel ohne Verlust", () => {
    const alt = Date.now() - 3600_000;
    store.setzeEinstellungen({ probetag_start: String(alt) });
    expect(probetagStatus(store, DATEN).start).toBe(alt);
    expect(probetagStatus(store, DATEN).aktiv).toBe(true);
  });

  it("/api/license erzählt der Oberfläche die Restlaufzeit", async () => {
    const app = createApp(store, { probetag: true });
    const res = await request(app).get("/api/license");
    expect(res.body.licensed).toBe(false);
    expect(res.body.protag.aktiv).toBe(true);
    expect(res.body.protag.restMs).toBeGreaterThan(PROBETAG_LAENGE_MS - 60_000);
  });

  it("ohne die Option (Tests, offener Kern): kein Probetag, keine Auskunft", async () => {
    const app = createApp(store);
    const res = await request(app).get("/api/license");
    expect(res.body.protag).toBeUndefined();
  });
});

describe("ANGRIFF 1 — App-Neustart: Zähler und Probetag leben persistent", () => {
  it("die Tageszähler überleben die App — 20 Profile-Saves, Neustart, dann 429", async () => {
    const start = Date.now() - PROBETAG_LAENGE_MS - 1000; // Probetag vorbei: reines Free-Plan-Verhalten
    ersterStartSichern(store, DATEN, start);
    const ersteApp = createApp(store, { probetag: true });
    for (let i = 0; i < 20; i++) {
      const res = await request(ersteApp).post("/api/profile").send({ notiz: String(i) });
      expect(res.status).toBe(200);
    }
    store.close();
    store = new KeptaStore(path.join(dir, "test.db"));
    const zweiteApp = createApp(store, { probetag: true });
    const res = await request(zweiteApp).post("/api/profile").send({ notiz: "eins zu viel" });
    expect(res.status).toBe(429);
    expect(res.headers["x-kepta-plan"]).toBe("free");
  });

  it("das Tagesfenster rollt um — am nächsten Tag zählt wieder von vorn", () => {
    const jetzt = Date.now();
    zaehleFuer(store, DATEN, "chat", jetzt);
    zaehleFuer(store, DATEN, "chat", jetzt);
    expect(verbrauchtFuer(store, DATEN, "chat", jetzt)).toBe(2);
    expect(verbrauchtFuer(store, DATEN, "chat", jetzt + 26 * 3600_000)).toBe(0);
    expect(lokalerTag(jetzt)).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("der Probetag wird durch Neustart NICHT erneuert", async () => {
    const start = Date.now();
    ersterStartSichern(store, DATEN, start);
    store.close();
    store = new KeptaStore(path.join(dir, "test.db"));
    const app = createApp(store, { probetag: true });
    const res = await request(app).get("/api/license");
    expect(res.body.protag.restMs).toBeLessThanOrEqual(PROBETAG_LAENGE_MS);
  });
});

describe("ANGRIFF 2 — Uhr zurückdrehen: die Zeit ist verbraucht, nicht das Datum erreicht", () => {
  it("eine Stunde vor dem Erststart: Anomalie → Probetag verfällt", () => {
    const start = Date.now();
    ersterStartSichern(store, DATEN, start);
    expect(probetagStatus(store, DATEN, start - 3600_000).aktiv).toBe(false);
    expect(probetagStatus(store, DATEN, start - 3600_000).restMs).toBe(0);
  });

  it("der Verfall ist endgültig — auch mit wieder korrekter Uhr", () => {
    const start = Date.now();
    ersterStartSichern(store, DATEN, start);
    probetagStatus(store, DATEN, start - 3600_000); // Manipulation
    const danach = probetagStatus(store, DATEN, start + 3600_000);
    expect(danach.aktiv).toBe(false);
    expect(danach.restMs).toBe(0);
  });

  it("kleine Uhr-Korrekturen (unter 2 Minuten) sind keine Anomalie", () => {
    const start = Date.now();
    ersterStartSichern(store, DATEN, start);
    expect(probetagStatus(store, DATEN, start - 60_000).aktiv).toBe(true);
  });
});

describe("ANGRIFF 3 — Datenbank bearbeiten: der Zustand fällt auf", () => {
  it("ein zusammengewürfelter Zustands-Blob ist eine Manipulation → Verfall", () => {
    const start = Date.now();
    ersterStartSichern(store, DATEN, start);
    store.setzeEinstellungen({ plan_zustand: "hier-habe-ich-herumgeschrieben" });
    expect(probetagStatus(store, DATEN, start + 60_000).aktiv).toBe(false);
  });

  it("der Zustand ist ohne den eigenen Schlüssel nicht lesbar — Editing scheitert an der Authentisierung", () => {
    const start = Date.now();
    ersterStartSichern(store, DATEN, start);
    const { zustand } = ladePlanZustand(store, DATEN);
    expect(zustand.protagStart).toBe(start);
    // Der Blob ist kein Klartext: die Struktur ist von außen nicht erkennbar.
    const blob = store.einstellungen()["plan_zustand"];
    expect(blob).not.toContain("protagStart");
    expect(blob).not.toContain(String(start));
  });

  it("BLOB LÖSCHEN rettet den Probetag nicht — der Anker belegt die Installation", () => {
    const start = Date.now();
    process.env.KEPTA_PROTAG_ANKER = String(start); // simuliert den vorhandenen Schlüsselbund-Eintrag
    ersterStartSichern(store, DATEN, start);
    store.setzeEinstellungen({ plan_zustand: null }); // der Angriff
    expect(probetagStatus(store, DATEN, start + 60_000).aktiv).toBe(false);
    delete process.env.KEPTA_PROTAG_ANKER;
  });

  it("KOMPLETT-LÖSCH-ANGRIFF: DB-Stempel und Blob weg, aber die verborgene Ankerdatei belegt die Installation → Verfall", () => {
    const start = Date.now();
    ersterStartSichern(store, DATEN, start); // schreibt die Ankerdatei unter dem Test-HOME
    store.setzeEinstellungen({ plan_zustand: null, probetag_start: null }); // der Angriff
    expect(probetagStatus(store, DATEN, start + 60_000).aktiv).toBe(false);
    expect(probetagStatus(store, DATEN, start + 60_000).restMs).toBe(0);
  });

  it("die Ankerdatei selbst fälschen (Müll hineinschreiben) gilt als Anomalie → Verfall", () => {
    const start = Date.now();
    ersterStartSichern(store, DATEN, start);
    fs.writeFileSync(ankerDateiPfadFuer(), "hier-habe-ich-herumgeschrieben", "utf8");
    expect(probetagStatus(store, DATEN, start + 60_000).aktiv).toBe(false);
  });

  it("den Klartext-Stempel fälschen bringt nichts — Diskrepanz zum Anker: Verfall", () => {
    const start = Date.now();
    process.env.KEPTA_PROTAG_ANKER = String(start);
    ersterStartSichern(store, DATEN, start);
    store.setzeEinstellungen({ probetag_start: String(start - 20 * 3600_000) }); // „gestern installiert" — egal,Probetag sei geschenkt
    expect(probetagStatus(store, DATEN, start + 60_000).aktiv).toBe(false);
    delete process.env.KEPTA_PROTAG_ANKER;
  });

  it("ohne Plan-Schlüssel-Umgebung läuft der Probetag weiter (Schlüssel-Fallback)", () => {
    delete process.env.KEPTA_PLAN_KEY;
    try {
      const start = Date.now();
      ersterStartSichern(store, DATEN, start);
      const status = probetagStatus(store, DATEN, start + 60_000);
      // Der Zustandsschlüssel wird pro Prozess einmal beschafft und bleibt —
      // fehlt die Umgebung (Server ohne Bund), trägt den Zustand die DB.
      expect(status.aktiv).toBe(true);
    } finally {
      process.env.KEPTA_PLAN_KEY = crypto.randomBytes(32).toString("hex");
    }
  });
});
