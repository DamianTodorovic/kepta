// @vitest-environment node
//
// Verwaltete Konfiguration + zentrale Richtlinien (src/lib/richtlinien.ts und
// ihre Durchsetzung im Server): eine Datei der Organisation steuert die App —
// Lizenz vorab eingetragen (MDM), Cloud-Chat zu, Rechner-Scan zu, Shield an.
// Fehlt oder ist die Datei kaputt, bleibt alles beim Alten.
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { tmpdir } from "node:os";
import path from "node:path";
import fs from "node:fs";
import crypto from "node:crypto";
import request from "supertest";
import { KeptaStore } from "../src/core/store";
import { alsGruppen, signiere } from "../src/core/lizenz";
import { kandidatenPfade, liesVerwaltet, richtlinie, richtlinienCacheLeeren } from "../src/lib/richtlinien";

process.env.KEPTA_NO_AUTOSTART = "1";
// Hermetisch: Tests dürfen nie den echten Schlüsselbund berühren (22.9. gelernt —
// ein Keychain-Zugriff aus Tests hat den echten Datenbank-Schlüssel überschrieben).
// Die Nebendateien-Verschlüsselung selbst deckt tests/nebendateien.test.ts mit
// eigenen Schlüsseln ab.
process.env.KEPTA_ENCRYPTION = "off";

const paar = vi.hoisted(() => ({ privat: "", oeffentlich: "" }));

vi.mock("../src/core/lizenz", async (importOriginal) => {
  const echt = await importOriginal<typeof import("../src/core/lizenz")>();
  const { generateKeyPairSync } = await import("node:crypto");
  if (!paar.privat) {
    const { publicKey, privateKey } = generateKeyPairSync("ed25519");
    paar.privat = privateKey.export({ type: "pkcs8", format: "der" }).toString("base64");
    paar.oeffentlich = publicKey.export({ type: "spki", format: "der" }).toString("base64");
  }
  return {
    ...echt,
    pruefeSchluessel: (name: string, key: string) => echt.pruefeSchluessel(name, key, paar.oeffentlich, new Set()),
    validiereSchluessel: (name: string, key: string) => echt.pruefeSchluessel(name, key, paar.oeffentlich, new Set()).gueltig,
  };
});

let createApp: typeof import("../server").createApp;
let store: KeptaStore;
let app: import("express").Express;
let dir: string;
let prevHome: string | undefined;
let verwaltetDatei: string;

function schreibeVerwaltet(inhalt: unknown): void {
  fs.writeFileSync(verwaltetDatei, typeof inhalt === "string" ? inhalt : JSON.stringify(inhalt));
  richtlinienCacheLeeren();
}

beforeEach(async () => {
  dir = fs.mkdtempSync(path.join(tmpdir(), "kepta-richtlinien-"));
  prevHome = process.env.HOME;
  process.env.HOME = dir;
  process.env.KEPTA_DATA_DIR = dir;
  verwaltetDatei = path.join(dir, "managed-settings.json");
  process.env.KEPTA_MANAGED_CONFIG = verwaltetDatei;
  vi.resetModules();
  ({ createApp } = await import("../server"));
  store = new KeptaStore(path.join(dir, "test.db"));
  app = createApp(store);
});

afterEach(() => {
  delete process.env.KEPTA_MANAGED_CONFIG;
  if (prevHome === undefined) delete process.env.HOME;
  else process.env.HOME = prevHome;
});

describe("liesVerwaltet", () => {
  it("ohne Datei: null — nichts ist verwaltet", () => {
    expect(liesVerwaltet()).toBeNull();
    expect(richtlinie("chat_cloud")).toBeUndefined();
  });

  it("liest Richtlinien und wirft unbekannte Werte weg", () => {
    schreibeVerwaltet({ richtlinien: { chat_cloud: "deny", privacy_shield: "force_on", machine_scan: "allow" } });
    expect(liesVerwaltet()?.richtlinien).toEqual({ chat_cloud: "deny", privacy_shield: "force_on" });
    expect(richtlinie("machine_scan")).toBeUndefined();
  });

  it("eine kaputte Datei wird ignoriert — nichts blockiert", () => {
    schreibeVerwaltet("{kaputt");
    expect(liesVerwaltet()).toBeNull();
  });

  it("leere Verwaltung ist wie keine", () => {
    schreibeVerwaltet({});
    expect(liesVerwaltet()).toBeNull();
  });
});

describe("verwaltete Lizenz (MDM-Ausrollung)", () => {
  it("eine gültige Lizenz in der Verwaltung schaltet die App frei — ohne dass sie je eingetippt wurde", async () => {
    schreibeVerwaltet({ license_name: "Mandels Kanzlei", license_key: signiere("Mandels Kanzlei", 21, paar.privat, "business", 5) });
    const res = await request(app).get("/api/license");
    expect(res.body).toMatchObject({ licensed: true, licensee: "Mandels Kanzlei", edition: "business", seats: 5 });
    expect((await request(app).get("/api/scan/status")).status).not.toBe(403);
  });

  it("eine ungültige verwaltete Lizenz schaltet nichts frei", async () => {
    schreibeVerwaltet({ license_name: "Falsch", license_key: signiere("Richtig", 21, paar.privat) });
    expect((await request(app).get("/api/license")).body.licensed).toBe(false);
  });

  it("eine eingetippte Lizenz schlägt die verwaltete — und bleibt nach dem Entfernen der Datei", async () => {
    schreibeVerwaltet({ license_name: "Verwaltet GmbH", license_key: signiere("Verwaltet GmbH", 30, paar.privat) });
    await request(app).post("/api/license").send({ name: "Sarah Mandel", key: signiere("Sarah Mandel", 31, paar.privat) });
    expect((await request(app).get("/api/license")).body.licensee).toBe("Sarah Mandel");
    fs.unlinkSync(verwaltetDatei);
    richtlinienCacheLeeren();
    expect((await request(app).get("/api/license")).body.licensee).toBe("Sarah Mandel");
  });
});

describe("zentrale Richtlinien im Server", () => {
  it("chat_cloud=deny: fremde Hosts werden abgewiesen, lokale Modelle bleiben offen", async () => {
    schreibeVerwaltet({ license_name: "Mandels Kanzlei", license_key: signiere("Mandels Kanzlei", 20, paar.privat), richtlinien: { chat_cloud: "deny" } });
    const cloud = await request(app).post("/api/chat").send({ messages: [{ role: "user", content: "hi" }], baseUrl: "https://api.openai.com/v1" });
    // Diese Abschaltung ist eine Sicherheitszusage: sie darf nie als Zahl ohne
    // Namen fallen. Unter Last ist hier schon ein fremder Status statt 403
    // angekommen — ohne den Antworttext war nicht zu entscheiden, wer geantwortet hat.
    expect(cloud.status, `Abstellung erwartet, geantwortet ${cloud.status}: ${cloud.text.slice(0, 200)}`).toBe(403);
    expect(cloud.body.error).toMatch(/organization's policy/);
    // Lokal (Standard-Ollama ohne baseUrl) kommt an den Modell-Aufruf durch —
    // der scheitert hier am nicht laufenden Ollama, aber eben nicht an der Richtlinie:
    const lokal = await request(app).post("/api/chat").send({ messages: [{ role: "user", content: "hi" }], baseUrl: "http://localhost:11434/v1" });
    expect(lokal.status).not.toBe(403);
  });

  it("chat_cloud=deny: auch der STREAM-Endpunkt weist fremde Hosts ab (26.9.-Audit: die Umgehungslücke)", async () => {
    schreibeVerwaltet({ license_name: "Mandels Kanzlei", license_key: signiere("Mandels Kanzlei", 20, paar.privat), richtlinien: { chat_cloud: "deny" } });
    const stream = await request(app).post("/api/chat/stream").send({ messages: [{ role: "user", content: "hi" }], baseUrl: "https://api.openai.com/v1" });
    expect(stream.status).toBe(403);
    expect(stream.body.error).toMatch(/organization's policy/);
    // Lokal bleibt auch im Stream offen — der Aufruf scheitert erst am Ollama-Connect, nicht an der Richtlinie:
    const lokal = await request(app).post("/api/chat/stream").send({ messages: [{ role: "user", content: "hi" }], baseUrl: "http://localhost:11434/v1" });
    expect(lokal.status).not.toBe(403);
  });

  it("machine_scan=deny: der Scan startet nicht — auch mit confirmed:true", async () => {
    schreibeVerwaltet({ license_name: "Mandels Kanzlei", license_key: signiere("Mandels Kanzlei", 20, paar.privat), richtlinien: { machine_scan: "deny" } });
    const res = await request(app).post("/api/scan/start").send({ confirmed: true });
    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/organization's policy/);
  });

  it("privacy_shield=force_on: abschalten wird ignoriert, der Schutz bleibt an", async () => {
    schreibeVerwaltet({ license_name: "Mandels Kanzlei", license_key: signiere("Mandels Kanzlei", 20, paar.privat), richtlinien: { privacy_shield: "force_on" } });
    await request(app).put("/api/shield").send({ chat: false, apps: false });
    const stand = await request(app).get("/api/shield");
    expect(stand.body.chat).toBe(true);
    expect(stand.body.apps).toBe(true);
  });

  it("/api/policies zeigt die Verwaltung — ohne Geheimnisse", async () => {
    schreibeVerwaltet({
      license_name: "Mandels Kanzlei",
      license_key: signiere("Mandels Kanzlei", 21, paar.privat, "business", 5),
      richtlinien: { chat_cloud: "deny", machine_scan: "deny" },
    });
    const res = await request(app).get("/api/policies");
    expect(res.body).toEqual({ managed: true, policies: { chat_cloud: "deny", machine_scan: "deny" }, licensePreProvisioned: true });
    expect(res.text).not.toContain("signiere");
    expect(JSON.stringify(res.body)).not.toMatch(/[A-Z2-7]{5}-[A-Z2-7]/); // kein Schlüssel im Klartext
  });

  it("ohne Verwaltung: managed false, leere Richtlinien", async () => {
    const res = await request(app).get("/api/policies");
    expect(res.body).toEqual({ managed: false, policies: {}, licensePreProvisioned: false });
  });
});

describe("Kandidatenpfade", () => {
  it("KEPTA_MANAGED_CONFIG kommt zuerst, Plattform-Pfade dahinter", () => {
    const pfade = kandidatenPfade({ KEPTA_MANAGED_CONFIG: "/x/y.json" } as NodeJS.ProcessEnv);
    expect(pfade[0]).toBe("/x/y.json");
    expect(pfade.length).toBeGreaterThan(1);
  });
});
