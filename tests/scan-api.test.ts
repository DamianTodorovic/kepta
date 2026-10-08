import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { tmpdir } from "node:os";
import path from "node:path";
import fs from "node:fs";
import request from "supertest";
import { KeptaStore } from "../src/core/store";

// Der Rechner-Scan von aussen: hier laeuft er ueber ein ECHTES (temporaeres)
// Heimverzeichnis, in dem absichtlich auch liegt, was er nie anfassen darf.
// Die Regeln sind in tests/scan einzeln geprueft — dieser Test stellt sicher,
// dass sie auf dem Weg durch den Server nicht verloren gehen.

process.env.KEPTA_NO_AUTOSTART = "1";
// Hermetisch: Tests dürfen nie den echten Schlüsselbund berühren (22.9. gelernt —
// ein Keychain-Zugriff aus Tests hat den echten Datenbank-Schlüssel überschrieben).
// Die Nebendateien-Verschlüsselung selbst deckt tests/nebendateien.test.ts mit
// eigenen Schlüsseln ab.
process.env.KEPTA_ENCRYPTION = "off";

let createApp: typeof import("../server").createApp;
let store: KeptaStore;
let app: import("express").Express;
let prevHome: string | undefined;
let heim: string;

function schreibe(rel: string, inhalt: string): void {
  const ziel = path.join(heim, rel);
  fs.mkdirSync(path.dirname(ziel), { recursive: true });
  fs.writeFileSync(ziel, inhalt);
}

beforeEach(async () => {
  const wurzel = fs.mkdtempSync(path.join(tmpdir(), "kepta-scan-"));
  heim = path.join(wurzel, "heim");
  fs.mkdirSync(heim, { recursive: true });
  prevHome = process.env.HOME;
  process.env.HOME = heim;
  process.env.KEPTA_DATA_DIR = path.join(wurzel, "daten");

  // Erwuenscht
  schreibe("Dokumente/Kanzlei/Fristen.md", "Die Fristenkontrolle laeuft montags und donnerstags.");
  schreibe("Dokumente/Urlaub.txt", "Reiseplan fuer den Sommer, Abfahrt am Freitag.");
  schreibe("notiz.md", "Eine Notiz auf oberster Ebene.");
  // Niemals
  schreibe(".ssh/id_rsa", "-----BEGIN OPENSSH PRIVATE KEY-----");
  schreibe(".ssh/config", "Host server");
  schreibe("Projekt/.env", "API_KEY=geheim123");
  schreibe("Projekt/credentials.json", '{"token":"geheim"}');
  schreibe("Projekt/node_modules/pkg/README.md", "fremde Bibliothek");
  schreibe("Projekt/passwords.md", "hunter2");
  schreibe("Bilder/foto.png", "binaerkram");

  vi.resetModules();
  ({ createApp } = await import("../server"));
  store = new KeptaStore(path.join(wurzel, "test.db"));
  app = createApp(store); // der Rechner-Scan läuft für jede Installation
});

afterEach(() => {
  if (prevHome === undefined) delete process.env.HOME;
  else process.env.HOME = prevHome;
});

async function warteAufEnde(): Promise<{ imported: number; phase: string }> {
  for (let i = 0; i < 80; i++) {
    const status = await request(app).get("/api/scan/status");
    expect(status.status, `status-Poll: ${status.status} · ${status.text.slice(0, 200)}`).toBe(200);
    const s = status.body;
    if (!s.running) return s;
    await new Promise((r) => setTimeout(r, 60));
  }
  throw new Error("Scan wurde nicht fertig");
}

describe("POST /api/scan/preview", () => {
  it("zeigt die Dokumente, ohne irgendetwas zu speichern", async () => {
    const vorher = store.listMemories({ limit: 500 }).length;
    const res = await request(app).post("/api/scan/preview").send({});
    expect(res.status).toBe(200);
    expect(res.body.found).toBe(3);
    expect(store.listMemories({ limit: 500 }).length).toBe(vorher);
  });

  it("nennt keine einzige geheime Datei — auch nicht dem Namen nach", async () => {
    const res = await request(app).post("/api/scan/preview").send({});
    expect(res.status, `${res.status} · ${res.text.slice(0, 200)}`).toBe(200);
    // Nur die PFADE pruefen, nicht die ganze Antwort: die Begruendungstexte
    // sprechen selbst von "credentials" ("Keys, passwords and credentials"),
    // das ist Erklaerung und kein Fund.
    const pfade = [
      ...(res.body.sample as { path: string }[]).map((f) => f.path),
      ...(res.body.byFolder as { ordner: string }[]).map((o) => o.ordner),
    ].join("\n");
    for (const verboten of ["id_rsa", ".env", "credentials", "passwords", "node_modules", ".ssh", "Projekt"]) {
      expect(pfade, `Vorschau nennt ${verboten}`).not.toContain(verboten);
    }
    expect(pfade).toContain("Fristen.md");
  });

  it("sagt, warum etwas fehlt", async () => {
    const res = await request(app).post("/api/scan/preview").send({});
    expect(res.status, `${res.status} · ${res.text.slice(0, 200)}`).toBe(200);
    const gruende = (res.body.skipped as { grund: string; anzahl: number }[]).map((s) => s.grund);
    expect(gruende).toContain("geheim");
    expect(res.body.skippedFolders).toBeGreaterThan(0);
  });

  it("gruppiert nach Ordner", async () => {
    const res = await request(app).post("/api/scan/preview").send({});
    expect(res.status, `${res.status} · ${res.text.slice(0, 200)}`).toBe(200);
    const ordner = (res.body.byFolder as { ordner: string; anzahl: number }[]);
    expect(ordner.find((o) => o.ordner === "Dokumente")?.anzahl).toBe(2);
    expect(ordner.find((o) => o.ordner === "(top level)")?.anzahl).toBe(1);
  });

  it("laesst sich nicht auf fremde Verzeichnisse richten", async () => {
    // Ein Aufruf mit /etc oder / faellt auf das Heimverzeichnis zurueck.
    const res = await request(app).post("/api/scan/preview").send({ roots: ["/etc", "/", "../../.."] });
    expect(res.status, `${res.status} · ${res.text.slice(0, 200)}`).toBe(200);
    expect(res.body.roots).toEqual([heim]);
  });

  it("nimmt einen Unterordner des Heims an", async () => {
    const res = await request(app).post("/api/scan/preview").send({ roots: [path.join(heim, "Dokumente")] });
    expect(res.status, `${res.status} · ${res.text.slice(0, 200)}`).toBe(200);
    expect(res.body.roots).toEqual([path.join(heim, "Dokumente")]);
    expect(res.body.found).toBe(2);
  });
});

describe("POST /api/scan/start", () => {
  it("weigert sich ohne ausdrueckliche Bestaetigung", async () => {
    const res = await request(app).post("/api/scan/start").send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/confirm/i);
    expect(store.listMemories({ limit: 500 })).toHaveLength(0);
  });

  it("weigert sich auch bei confirmed:'true' als Zeichenkette", async () => {
    expect((await request(app).post("/api/scan/start").send({ confirmed: "true" })).status).toBe(400);
    expect((await request(app).post("/api/scan/start").send({ confirmed: 1 })).status).toBe(400);
  });

  it("importiert nach Bestaetigung genau die Dokumente", async () => {
    const angestossen = await request(app).post("/api/scan/start").send({ confirmed: true });
    expect(angestossen.status, `start: ${angestossen.status} · ${angestossen.text.slice(0, 200)}`).toBe(200);
    expect(angestossen.body.started).toBe(true);
    const ende = await warteAufEnde();
    expect(ende.phase).toBe("done");
    expect(ende.imported).toBe(3);

    const titel = store.listMemories({ limit: 500 }).map((m) => m.title).sort();
    expect(titel).toEqual(["Fristen", "Urlaub", "notiz"]);
  });

  it("bringt kein Geheimnis in die Wissensbasis", async () => {
    await request(app).post("/api/scan/start").send({ confirmed: true });
    await warteAufEnde();
    const alles = store.listMemories({ limit: 500 }).map((m) => `${m.title} ${m.content}`).join("\n");
    for (const verboten of ["BEGIN OPENSSH", "API_KEY", "geheim123", "hunter2", "fremde Bibliothek"]) {
      expect(alles, `Wissensbasis enthaelt ${verboten}`).not.toContain(verboten);
    }
  });

  it("haengt die Quelle an und markiert alles mit machine-scan", async () => {
    await request(app).post("/api/scan/start").send({ confirmed: true });
    await warteAufEnde();
    const notiz = store.listMemories({ limit: 500 }).find((m) => m.title === "Fristen")!;
    expect(notiz.tags).toContain("machine-scan");
    expect(notiz.content).toContain("— Source:");
    expect(notiz.content).toContain("Fristen.md");
  });

  it("legt beim zweiten Durchlauf keine Dubletten an", async () => {
    await request(app).post("/api/scan/start").send({ confirmed: true });
    await warteAufEnde();
    const nachEins = store.listMemories({ limit: 500 }).length;
    await request(app).post("/api/scan/start").send({ confirmed: true });
    const zwei = await warteAufEnde();
    expect(zwei.imported).toBe(0);
    expect(store.listMemories({ limit: 500 }).length).toBe(nachEins);
  });
});

describe("GET /api/scan/status und Abbruch", () => {
  it("meldet im Ruhezustand nichts Laufendes", async () => {
    const res = await request(app).get("/api/scan/status");
    expect(res.status).toBe(200);
    expect(res.body.running).toBe(false);
    expect(res.body.phase).toBe("idle");
  });

  it("nimmt einen Abbruch entgegen, auch wenn nichts laeuft", async () => {
    const res = await request(app).post("/api/scan/cancel");
    expect(res.status).toBe(200);
    expect(res.body.cancelling).toBe(false);
  });

  it("bricht einen laufenden Durchlauf ab", async () => {
    await request(app).post("/api/scan/start").send({ confirmed: true });
    await request(app).post("/api/scan/cancel");
    const ende = await warteAufEnde();
    expect(["cancelled", "done"]).toContain(ende.phase);
  });
});
