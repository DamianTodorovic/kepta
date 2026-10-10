import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { tmpdir } from "node:os";
import path from "node:path";
import fs from "node:fs";
import request from "supertest";
import { KeptaStore } from "../src/core/store";

// server.ts nur importieren, nachdem AUTOSTART gesetzt ist.
process.env.KEPTA_NO_AUTOSTART = "1";

let createApp: (store: KeptaStore) => import("express").Express;
let store: KeptaStore;
let app: import("express").Express;
let prevHome: string | undefined;
let dir: string;

beforeEach(async () => {
  dir = fs.mkdtempSync(path.join(tmpdir(), "kepta-geheim-"));
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

/** Der blob, den die Desktop-App wirklich schreibt (kepta-app/src/lib/ai.ts:230). */
const blobDerApp = {
  providerId: "anthropic",
  baseUrl: "https://api.anthropic.com",
  model: "claude-sonnet-4-5",
  apiKey: "sk-ant-APP-SCHLUESSEL-9f3k2",
};

describe("A3-09 — GET /api/settings gab den KI-Zugangsschluessel im Klartext heraus", () => {
  it("nach dem PUT steht der Schluessel in keiner Zeile der Antwort", async () => {
    const put = await request(app).put("/api/settings").send({ anthropicApiKey: "sk-test-1234567890abcd" });
    expect(put.status).toBe(200);
    const res = await request(app).get("/api/settings");
    expect(res.status).toBe(200);
    expect(res.text).not.toContain("sk-test-1234567890abcd");
    expect(JSON.stringify(res.body)).not.toContain("sk-test");
  });

  it("die Antwort nennt gesetzt und das Ende der Zeichenkette", async () => {
    await request(app).put("/api/settings").send({ anthropicApiKey: "sk-test-1234567890abcd" });
    const res = await request(app).get("/api/settings");
    expect(res.body.anthropicApiKey).toEqual({ gesetzt: true, ende: "abcd" });
  });

  it("in der verschlüsselten Datenbank liegt weiterhin der echte Wert", async () => {
    await request(app).put("/api/settings").send({ anthropicApiKey: "sk-test-1234567890abcd" });
    await request(app).get("/api/settings");
    expect(store.einstellungen().anthropicApiKey).toBe("sk-test-1234567890abcd");
  });

  it("der ai_settings-Blob der App (darin lebt der Schluessel wirklich) geht nicht im Klartext heraus", async () => {
    await request(app).put("/api/settings").send({ ai_settings: JSON.stringify(blobDerApp) });
    const res = await request(app).get("/api/settings");
    expect(res.text).not.toContain(blobDerApp.apiKey);
    expect(res.text).not.toContain("sk-ant");
    const roh = JSON.stringify(blobDerApp);
    expect(res.body.ai_settings).toEqual({ gesetzt: true, ende: roh.slice(-4) });
  });

  it("Schluessel mit PUT ändern: die Anzeige folgt dem neuen Wert, der Klartext bleibt draussen", async () => {
    await request(app).put("/api/settings").send({ anthropicApiKey: "sk-alterwert-wxyz" });
    await request(app).put("/api/settings").send({ anthropicApiKey: "sk-neuerwert-77qk" });
    const res = await request(app).get("/api/settings");
    expect(res.body.anthropicApiKey).toEqual({ gesetzt: true, ende: "77qk" });
    expect(res.text).not.toContain("sk-neuerwert-77qk");
    expect(store.einstellungen().anthropicApiKey).toBe("sk-neuerwert-77qk");
  });

  it("ein gelöschter Schluessel verschwindet aus der Anzeige", async () => {
    await request(app).put("/api/settings").send({ anthropicApiKey: "sk-test-1234567890abcd" });
    await request(app).put("/api/settings").send({ anthropicApiKey: null });
    const res = await request(app).get("/api/settings");
    expect(res.body.anthropicApiKey).toBeUndefined();
    expect(res.text).not.toContain("sk-test");
  });

  it("andere Secret-Namen sind ebenfalls zu (token, secret, passphrase, password)", async () => {
    await request(app).put("/api/settings").send({
      githubToken: "ghp_GEHEIM_12321",
      clientSecret: "sec_GEHEIM_99",
      dbPassphrase: "passwort_GEHEIM_1",
      smtpPassword: "pw_GEHEIM_77",
    });
    const res = await request(app).get("/api/settings");
    for (const geheim of ["ghp_GEHEIM_12321", "sec_GEHEIM_99", "passwort_GEHEIM_1", "pw_GEHEIM_77"]) {
      expect(res.text).not.toContain(geheim);
    }
    expect(res.body.githubToken).toEqual({ gesetzt: true, ende: "ghp_GEHEIM_12321".slice(-4) });
  });

  it("ein zu kurzer Secret-Wert zeigt kein Ende, das die halbe Zeichenkette waere", async () => {
    await request(app).put("/api/settings").send({ anthropicApiKey: "abc12" });
    const res = await request(app).get("/api/settings");
    expect(res.body.anthropicApiKey).toEqual({ gesetzt: true, ende: null });
    expect(res.text).not.toContain("abc12");
  });

  it("normale Einstellungen bleiben lesbar (die App holt sich ihre Profildaten weiter)", async () => {
    await request(app).put("/api/settings").send({ theme: "dark", kepta_type_colors: '{"fact":"#123456"}', ui_prefs: '{"zoom":1}' });
    const res = await request(app).get("/api/settings");
    expect(res.body.theme).toBe("dark");
    expect(res.body.kepta_type_colors).toBe('{"fact":"#123456"}');
    expect(res.body.ui_prefs).toBe('{"zoom":1}');
  });

  it("die PUT-Antwort gibt nichts heraus, was sie schreibt", async () => {
    const res = await request(app).put("/api/settings").send({ anthropicApiKey: "sk-test-1234567890abcd" });
    expect(res.text).not.toContain("sk-test-1234567890abcd");
    expect(res.body.ok).toBe(true);
  });
});
