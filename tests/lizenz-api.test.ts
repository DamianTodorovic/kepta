// @vitest-environment node
//
// Die Lizenz-API von Anfang bis Ende — jetzt als FREEMIUM: die App sperrt
// nie. Ohne Schlüssel laufen die Pro-Werkzeuge mit Tageslimiten (429 mit
// Upgrade-Weg, nie 403), mit Schlüssel unbegrenzt, und die Sperrliste entzieht
// eine Freischaltung, ohne die App zu verriegeln. Statt des eingebauten
// Prüfschlüssels gilt hier ein Testpaar, als Sperrliste die Nummer 666. Den
// privaten Schlüssel der echten App gibt es nur in Damians Schlüsselbund.
import { describe, it, expect, beforeEach, vi } from "vitest";
import { tmpdir } from "node:os";
import path from "node:path";
import fs from "node:fs";
import crypto from "node:crypto";
import request from "supertest";
import { KeptaStore } from "../src/core/store";
import { alsGruppen, normalisiere, signiere } from "../src/core/lizenz";

const paar = vi.hoisted(() => ({ privat: "", oeffentlich: "" }));

vi.mock("../src/core/lizenz", async (importOriginal) => {
  const echt = await importOriginal<typeof import("../src/core/lizenz")>();
  const { generateKeyPairSync } = await import("node:crypto");
  if (!paar.privat) {
    const { publicKey, privateKey } = generateKeyPairSync("ed25519");
    paar.privat = privateKey.export({ type: "pkcs8", format: "der" }).toString("base64");
    paar.oeffentlich = publicKey.export({ type: "spki", format: "der" }).toString("base64");
  }
  const gesperrt = new Set([666]);
  return {
    ...echt,
    pruefeSchluessel: (name: string, key: string) => echt.pruefeSchluessel(name, key, paar.oeffentlich, gesperrt),
    validiereSchluessel: (name: string, key: string) => echt.pruefeSchluessel(name, key, paar.oeffentlich, gesperrt).gueltig,
  };
});

process.env.KEPTA_NO_AUTOSTART = "1";
// Hermetisch: Tests dürfen nie den echten Schlüsselbund berühren (22.9. gelernt —
// ein Keychain-Zugriff aus Tests hat den echten Datenbank-Schlüssel überschrieben).
// Die Nebendateien-Verschlüsselung selbst deckt tests/nebendateien.test.ts mit
// eigenen Schlüsseln ab.
process.env.KEPTA_ENCRYPTION = "off";

let datei: string;
let store: KeptaStore;
let app: import("express").Express;
let createApp: typeof import("../server").createApp;

beforeEach(async () => {
  const dir = fs.mkdtempSync(path.join(tmpdir(), "kepta-lizenz-"));
  process.env.HOME = dir;
  process.env.KEPTA_DATA_DIR = dir;
  vi.resetModules();
  ({ createApp } = await import("../server"));
  datei = path.join(dir, "test.db");
  store = new KeptaStore(datei);
  app = createApp(store);
});

const aktiviere = (name: string, key: string) => request(app).post("/api/license").send({ name, key });

describe("GET /api/license", () => {
  it("ohne Schlüssel läuft der Free-Plan — die App ist nicht gesperrt, der Upgrade-Weg geht mit", async () => {
    const res = await request(app).get("/api/license");
    expect(res.body).toEqual({ licensed: false, free: true, upgradeUrl: "https://kepta.pro/upgrade", checkoutLive: false });
    expect(store.einstellungen().trial_start).toBeUndefined();
  });

  it("ein Trial-Start aus einer Vorabversion schaltet nichts frei — Freemium ist kein verkappter Trial", async () => {
    store.setzeEinstellungen({ trial_start: String(Date.now()) });
    const res = await request(app).get("/api/license");
    expect(res.body.licensed).toBe(false);
  });
});

describe("POST /api/license", () => {
  it("ohne Name oder Schlüssel: 400, auf Englisch", async () => {
    const res = await request(app).post("/api/license").send({ name: "Sarah Mandel" });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("Name and license key are required.");
  });

  it("ein Schlüssel für einen anderen Namen: 403, nichts gespeichert", async () => {
    const res = await aktiviere("Sarah Mandel", signiere("Thomas Akt", 7, paar.privat));
    expect(res.status).toBe(403);
    expect(res.body.error).toBe("This license key does not belong to this name.");
    expect(store.einstellungen().license_key).toBeUndefined();
  });

  it("ein Schlüssel der alten Form (nur der Name) schaltet nichts mehr frei", async () => {
    const privat = crypto.createPrivateKey({ key: Buffer.from(paar.privat, "base64"), format: "der", type: "pkcs8" });
    const alt = alsGruppen(crypto.sign(null, Buffer.from(normalisiere("Sarah Mandel")), privat));
    expect((await aktiviere("Sarah Mandel", alt)).status).toBe(403);
  });

  it("der richtige Schlüssel schaltet frei — und nennt Lizenznehmer, Nummer und Stufe", async () => {
    const res = await aktiviere("  Sarah Mandel ", signiere("Sarah Mandel", 7, paar.privat));
    expect(res.body).toEqual({ ok: true, licensed: true, licensee: "Sarah Mandel", number: "0007", edition: "pro", seats: 1 });
    expect((await request(app).get("/api/license")).body).toEqual({ licensed: true, licensee: "Sarah Mandel", number: "0007", edition: "pro", seats: 1 });
  });

  it("ein Business-Schlüssel nennt seine Stufe und die gekaufte Seat-Zahl", async () => {
    const res = await aktiviere("Mandels Kanzlei", signiere("Mandels Kanzlei", 8, paar.privat, "business", 5));
    expect(res.body).toEqual({ ok: true, licensed: true, licensee: "Mandels Kanzlei", number: "0008", edition: "business", seats: 5 });
    expect((await request(app).get("/api/license")).body).toEqual({ licensed: true, licensee: "Mandels Kanzlei", number: "0008", edition: "business", seats: 5 });
  });

  it("ein gesperrter Schlüssel lässt sich nicht aktivieren: 403 mit Erklärung, nichts gespeichert", async () => {
    const res = await aktiviere("Sarah Mandel", signiere("Sarah Mandel", 666, paar.privat));
    expect(res.status, `Sperre erwartet, geantwortet: ${res.res.statusMessage} · ${res.text.slice(0, 200)}`).toBe(403);
    expect(res.body.error).toMatch(/revoked/);
    expect(store.einstellungen().license_key).toBeUndefined();
  });
});

describe("einmal aktiviert, bleibt aktiviert — bis die Nummer gesperrt wird", () => {
  it("nach einem Neustart (die Datenbank neu geöffnet) ist die App weiter frei", async () => {
    await aktiviere("Sarah Mandel", signiere("Sarah Mandel", 7, paar.privat));
    const nachNeustart = createApp(new KeptaStore(datei));
    expect((await request(nachNeustart).get("/api/license")).body.licensed).toBe(true);
  });

  it("kommt die Nummer per Update auf die Sperrliste, ist eine bestehende Freischaltung vorbei", async () => {
    store.setzeEinstellungen({ license_name: "Sarah Mandel", license_key: signiere("Sarah Mandel", 666, paar.privat) });
    expect((await request(app).get("/api/license")).body).toEqual({ licensed: false, revoked: true, free: true, upgradeUrl: "https://kepta.pro/upgrade", checkoutLive: false });
    // Und der Sperre nach: die App läuft weiter (Freemium), sie ist nur wieder im Free-Plan.
    expect((await request(app).get("/api/profile")).status).toBe(200);
  });
});

describe("Freemium: die Pro-Werkzeuge laufen ohne Schlüssel mit Tageslimiten", () => {
  it("das Profil: 20 freie Speicherungen am Tag, die 21. antwortet 429 mit dem Upgrade-Weg", async () => {
    for (let i = 0; i < 20; i++) {
      const res = await request(app).post("/api/profile").send({ beruf: "Anwältin" });
      expect(res.status, `Aufruf ${i + 1}`).toBe(200);
      expect(res.headers["x-kepta-remaining"]).toBe(String(19 - i));
    }
    const ueber = await request(app).post("/api/profile").send({ beruf: "Anwältin" });
    expect(ueber.status).toBe(429);
    expect(ueber.body.error).toMatch(/Daily free limit/);
    expect(ueber.body.upgradeUrl).toBe("https://kepta.pro/upgrade");
  });

  it("Chat: 10 freie Nachrichten mit gemocktem Provider, die 11. stößt an die Grenze", async () => {
    const echt = await vi.importActual<typeof import("../src/core/lizenz")>("../src/core/lizenz");
    void echt;
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ choices: [{ message: { content: "ok" } }] }), { status: 200 })));
    for (let i = 0; i < 10; i++) {
      const res = await request(app).post("/api/chat").send({ messages: [{ role: "user", content: "hi" }] });
      expect(res.status, `Nachricht ${i + 1}`).toBe(200);
    }
    const ueber = await request(app).post("/api/chat").send({ messages: [{ role: "user", content: "hi" }] });
    expect(ueber.status).toBe(429);
    expect(ueber.body.feature).toBe("chat");
    vi.unstubAllGlobals();
  });

  it("Status- und Poll-Routen laufen nie ins Limit — die UI fragt sie im Sekundentakt", async () => {
    for (let i = 0; i < 60; i++) {
      expect((await request(app).get("/api/scan/status")).status).toBe(200);
      expect((await request(app).get("/api/profile")).status).toBe(200);
    }
  });

  it("ohne Schlüssel bleibt frei, was der offene Kern auch kann — die Daten sind nie Geisel", async () => {
    expect((await request(app).get("/api/health")).status).toBe(200);
    expect((await request(app).get("/api/memories")).status).toBe(200);
    expect((await request(app).post("/api/search").send({ query: "x" })).status).toBe(200);
    expect((await request(app).post("/api/recovery-key").set("X-KEPTA-Recovery", "1")).status).toBe(404);
    expect((await request(app).get("/api/license")).status).toBe(200);
  });

  it("mit gültigem Schlüssel: keine Freemium-Limits — der 12. Chat geht durch (dort stößt der Free-Plan an), der Plan-Header sagt pro", async () => {
    await aktiviere("Sarah Mandel", signiere("Sarah Mandel", 7, paar.privat));
    const stromaufwaerts = vi.fn(async () => new Response(JSON.stringify({ choices: [{ message: { content: "ok" } }] }), { status: 200 }));
    vi.stubGlobal("fetch", stromaufwaerts);
    // 12 = über das Free-Limit (10) hinaus, aber unter dem 20/min-Schutzlimiter —
    // es geht hier um das FREEMIUM-Limit, nicht um die Drossel.
    for (let i = 0; i < 12; i++) {
      const res = await request(app).post("/api/chat").send({ messages: [{ role: "user", content: "hi" }] });
      // Der Fall ist unter Last schon einmal mit 401 aufgefallen — ein Status,
      // den diese App nirgends sendet. Ohne den Antworttext daneben bleibt so
      // etwas ein Rätsel, also nennt die Meldung, wer wirklich geantwortet hat.
      expect(res.status, `Nachricht ${i + 1}: ${res.res.statusMessage} · ${res.text.slice(0, 200)}`).toBe(200);
      expect(res.headers["x-kepta-plan"]).toBe("pro");
    }
    expect(stromaufwaerts, "jede Nachricht muss durch die eingesetzte Quelle gehen").toHaveBeenCalledTimes(12);
    vi.unstubAllGlobals();
  });

  it("die Test-Option ersetzt die Prüfung ganz", async () => {
    const offen = createApp(new KeptaStore(datei), { lizenziert: () => true });
    expect((await request(offen).get("/api/license")).body).toEqual({ licensed: true });
  });
});
