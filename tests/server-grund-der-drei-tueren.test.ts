// @vitest-environment node
// P4-2310 (b), 23.10.: die drei Tueren, die die Flaeche wirklich zeigt, nennen jetzt einen
// Grund - `chat.ts` (500), `recovery-key.ts` (fuenf), `importe.ts` (drei). Dieser Fall haelt
// die zwei, die ohne Anbieter pruefbar sind, an echtem HTTP; die Stelle in chat.ts haelt eine
// Quellzeile (der 500er braucht einen werfenden Anbieter, den dieser Fall nicht stellt).
//
// Vor dem Flicken rot: keine der Antworten traegt `grund`, und die Quellzeile fehlt.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import request from "supertest";
import { fileURLToPath } from "node:url";
import { KeptaStore } from "../src/core/store";

process.env.KEPTA_NO_AUTOSTART = "1";
process.env.KEPTA_ENCRYPTION = "off";

let createApp: typeof import("../server").createApp;
let store: KeptaStore;
let app: import("express").Express;
let vorherHeim: string | undefined;
let dir: string;

beforeEach(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "kepta-grund-"));
  vorherHeim = process.env.HOME;
  process.env.HOME = dir;
  process.env.KEPTA_DATA_DIR = dir;
  vi.resetModules();
  ({ createApp } = await import("../server"));
  store = new KeptaStore(path.join(dir, "test.db"));
  app = createApp(store);
});

afterEach(() => {
  store?.close();
  if (vorherHeim === undefined) delete process.env.HOME;
  else process.env.HOME = vorherHeim;
});

describe("P4-2310 (b): ein Grund an den drei Tueren", () => {
  it("Import und Wiederherstellung nennen ihre Kennung, chat.ts traegt ihre Quellzeile", async () => {
    const leer = await request(app).post("/api/import/chat").send({});
    expect(leer.status).toBe(400);
    expect(leer.body.grund).toBe("import-leer");

    const kaputt = await request(app).post("/api/import/chat").send({ content: "kein json" });
    expect(kaputt.status).toBe(400);
    expect(kaputt.body.grund).toBe("import-kein-json");

    const fremd = await request(app).post("/api/import/chat").send({ content: '{"etwas":"anderes"}' });
    expect(fremd.status).toBe(400);
    expect(fremd.body.grund).toBe("import-unbekanntes-format");

    const ohneKopf = await request(app).post("/api/recovery-key").send({});
    expect(ohneKopf.status).toBe(403);
    expect(ohneKopf.body.grund).toBe("ohne-wiederherstellungs-kopf");

    const ohneVerschluss = await request(app).post("/api/recovery-key").set("x-kepta-recovery", "1").send({});
    expect(ohneVerschluss.status).toBe(404);
    expect(ohneVerschluss.body.grund).toBe("nicht-verschluesselt");

    // chat.ts: der 500er traegt eine Kennung und keinen fremden Ausnahmewortlaut mehr.
    const HIER = path.dirname(fileURLToPath(import.meta.url));
    const quelle = fs.readFileSync(path.resolve(HIER, "../server/router/chat.ts"), "utf8");
    expect(quelle).toMatch(/grund:\s*"chat-fehlgeschlagen"/);
    expect(quelle, "der Ausnahmewortlaut geht wieder nach aussen").not.toMatch(/json\(\{\s*error:\s*msg\s*\}\)/);
  });
});
