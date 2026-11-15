import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { tmpdir } from "node:os";
import path from "node:path";
import fs from "node:fs";
import request from "supertest";
import { KeptaStore } from "../src/core/store";
import { indexMemory } from "../src/core/engine";
import { MIN_PASSPHRASE_LENGTH, PRAXISSYNC_FORMAT, type SyncBundle } from "../src/core/praxissync";

// Praxis-Sync war gebaut und getestet, aber an nichts angeschlossen: weder der
// MCP-Server noch die Oberflaeche importierten praxissync.ts. Als Funktion
// existierte der verschluesselte Geraeteabgleich damit nicht. Diese Datei
// beschreibt, was die HTTP-Ebene koennen muss, damit er benutzbar wird.
process.env.KEPTA_NO_AUTOSTART = "1";
// Hermetisch: Tests dürfen nie den echten Schlüsselbund berühren (22.9. gelernt —
// ein Keychain-Zugriff aus Tests hat den echten Datenbank-Schlüssel überschrieben).
// Die Nebendateien-Verschlüsselung selbst deckt tests/nebendateien.test.ts mit
// eigenen Schlüsseln ab.
process.env.KEPTA_ENCRYPTION = "off";

const GUTE_PASSPHRASE = "kanzlei-passwort-2026";

let createApp: (store: KeptaStore) => import("express").Express;
let store: KeptaStore;
let app: import("express").Express;
let dir: string;
let prevHome: string | undefined;

beforeEach(async () => {
  dir = fs.mkdtempSync(path.join(tmpdir(), "kepta-sync-api-"));
  prevHome = process.env.HOME;
  process.env.HOME = dir;
  process.env.KEPTA_DATA_DIR = dir;
  vi.resetModules();
  ({ createApp } = await import("../server"));
  store = new KeptaStore(path.join(dir, "test.db"));
  app = createApp(store);
});

afterEach(() => {
  if (prevHome === undefined) delete process.env.HOME;
  else process.env.HOME = prevHome;
});

function notiz(id: string, titel: string, inhalt: string, scope = "local") {
  const m = store.createMemory({ id, title: titel, content: inhalt, scope });
  indexMemory(store, m.id);
  return m;
}

describe("POST /api/sync/export", () => {
  it("liefert ein verschluesseltes Bundle mit den erwarteten Feldern", async () => {
    notiz("s1", "Carbonara", "Echte Carbonara kommt ohne Sahne aus.");
    const res = await request(app).post("/api/sync/export").send({ passphrase: GUTE_PASSPHRASE });

    expect(res.status).toBe(200);
    const b = res.body.bundle as SyncBundle;
    expect(b.format).toBe(PRAXISSYNC_FORMAT);
    expect(b.count).toBe(1);
    expect(b.kdf).toEqual({ name: "scrypt", N: 131072, r: 8, p: 1 });
    for (const feld of ["salt", "iv", "ciphertext", "authTag", "payloadHash", "createdAt"] as const) {
      expect(typeof b[feld], `Feld ${feld} fehlt`).toBe("string");
    }
  });

  it("verschluesselt wirklich: der Klartext taucht im Bundle nicht auf", async () => {
    notiz("s1", "Mandat Mueller", "Streitwert 48.000 Euro, Gegenseite Kanzlei Schmidt.");
    const res = await request(app).post("/api/sync/export").send({ passphrase: GUTE_PASSPHRASE });
    const roh = JSON.stringify(res.body);
    expect(roh).not.toContain("Streitwert");
    expect(roh).not.toContain("Schmidt");
    expect(roh).not.toContain("Mandat Mueller");
  });

  it("gibt die Passphrase niemals zurueck", async () => {
    notiz("s1", "T", "x");
    const res = await request(app).post("/api/sync/export").send({ passphrase: GUTE_PASSPHRASE });
    expect(JSON.stringify(res.body)).not.toContain(GUTE_PASSPHRASE);
  });

  it("lehnt zu kurze Passphrasen mit 400 ab, nicht mit 500", async () => {
    notiz("s1", "T", "x");
    const res = await request(app).post("/api/sync/export").send({ passphrase: "kurz" });
    expect(res.status).toBe(400);
    expect(String(res.body.error)).toMatch(new RegExp(String(MIN_PASSPHRASE_LENGTH)));
  });

  it("lehnt eine fehlende Passphrase ab", async () => {
    const res = await request(app).post("/api/sync/export").send({});
    expect(res.status).toBe(400);
  });

  it("trennt Mandanten: nur der angeforderte Scope geht ins Bundle", async () => {
    notiz("a1", "Mueller", "Akte Mueller", "mandant-mueller");
    notiz("b1", "Schmidt", "Akte Schmidt", "mandant-schmidt");
    const res = await request(app)
      .post("/api/sync/export")
      .send({ passphrase: GUTE_PASSPHRASE, scope: "mandant-mueller" });
    expect(res.status).toBe(200);
    expect(res.body.bundle.count).toBe(1);
    expect(res.body.bundle.scope).toBe("mandant-mueller");
  });
});

describe("POST /api/sync/import", () => {
  async function bundleVon(inhalt: string, scope = "local"): Promise<SyncBundle> {
    notiz("q1", "Quelle", inhalt, scope);
    const res = await request(app).post("/api/sync/export").send({ passphrase: GUTE_PASSPHRASE, scope });
    return res.body.bundle as SyncBundle;
  }

  it("Rundlauf: exportieren, in einen leeren Speicher importieren, Inhalt stimmt", async () => {
    const bundle = await bundleVon("Echte Carbonara kommt ohne Sahne aus.");

    // Zweiter Speicher, wie ein zweites Geraet
    const zielDir = fs.mkdtempSync(path.join(tmpdir(), "kepta-sync-ziel-"));
    const ziel = new KeptaStore(path.join(zielDir, "ziel.db"));
    const zielApp = createApp(ziel);

    const res = await request(zielApp).post("/api/sync/import").send({ bundle, passphrase: GUTE_PASSPHRASE });
    expect(res.status).toBe(200);
    expect(res.body.imported).toBe(1);
    expect(ziel.getMemory("q1")?.content).toBe("Echte Carbonara kommt ohne Sahne aus.");
  });

  it("ist idempotent: derselbe Import zweimal legt nichts doppelt an", async () => {
    const bundle = await bundleVon("Zweimal ist einmal zu viel.");
    const zielDir = fs.mkdtempSync(path.join(tmpdir(), "kepta-sync-ziel2-"));
    const ziel = new KeptaStore(path.join(zielDir, "ziel.db"));
    const zielApp = createApp(ziel);

    await request(zielApp).post("/api/sync/import").send({ bundle, passphrase: GUTE_PASSPHRASE });
    const zweiter = await request(zielApp).post("/api/sync/import").send({ bundle, passphrase: GUTE_PASSPHRASE });
    expect(zweiter.status).toBe(200);
    expect(zweiter.body.imported).toBe(0);
    expect(zweiter.body.skipped).toBe(1);
    expect(ziel.countMemories().active).toBe(1);
  });

  it("falsche Passphrase: 400 mit klarer Meldung, kein 500", async () => {
    const bundle = await bundleVon("geheim");
    const res = await request(app).post("/api/sync/import").send({ bundle, passphrase: "voellig-falsches-wort" });
    expect(res.status).toBe(400);
    expect(String(res.body.error)).toMatch(/entschl|Passphrase/i);
  });

  it("manipuliertes Paket fliegt auf", async () => {
    const bundle = await bundleVon("unveraendert");
    const manipuliert = { ...bundle, payloadHash: "0".repeat(64) };
    const res = await request(app).post("/api/sync/import").send({ bundle: manipuliert, passphrase: GUTE_PASSPHRASE });
    expect(res.status).toBe(400);
  });

  it("fremdes Format wird abgewiesen", async () => {
    const bundle = await bundleVon("egal");
    const res = await request(app)
      .post("/api/sync/import")
      .send({ bundle: { ...bundle, format: "andere-app" }, passphrase: GUTE_PASSPHRASE });
    expect(res.status).toBe(400);
    expect(String(res.body.error)).toMatch(/Format/i);
  });

  it("fehlendes Bundle wird abgewiesen, ohne den Server zu werfen", async () => {
    const res = await request(app).post("/api/sync/import").send({ passphrase: GUTE_PASSPHRASE });
    expect(res.status).toBe(400);
  });

  it("Muell statt Bundle wird abgewiesen", async () => {
    const res = await request(app)
      .post("/api/sync/import")
      .send({ bundle: { format: PRAXISSYNC_FORMAT, ciphertext: "nicht-base64!!" }, passphrase: GUTE_PASSPHRASE });
    expect(res.status).toBe(400);
  });
});

describe("GET /api/sync/journal", () => {
  it("haelt den Export fest und meldet die Kette als unversehrt", async () => {
    notiz("j1", "Journal", "x");
    await request(app).post("/api/sync/export").send({ passphrase: GUTE_PASSPHRASE });

    const res = await request(app).get("/api/sync/journal");
    expect(res.status).toBe(200);
    expect(res.body.intact).toBe(true);
    expect(res.body.entries.length).toBeGreaterThanOrEqual(1);
    const letzter = res.body.entries[res.body.entries.length - 1];
    expect(letzter.direction).toBe("export");
    expect(typeof letzter.hash).toBe("string");
  });

  it("der Mitschnitt enthaelt keine Inhalte, nur Hashes", async () => {
    notiz("j1", "Mandat Mueller", "Streitwert 48.000 Euro");
    await request(app).post("/api/sync/export").send({ passphrase: GUTE_PASSPHRASE });
    const res = await request(app).get("/api/sync/journal");
    const roh = JSON.stringify(res.body);
    expect(roh).not.toContain("Streitwert");
    expect(roh).not.toContain("Mandat Mueller");
    expect(roh).not.toContain(GUTE_PASSPHRASE);
  });
});
