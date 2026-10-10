import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { tmpdir } from "node:os";
import path from "node:path";
import fs from "node:fs";
import request from "supertest";
import { KeptaStore } from "../src/core/store";

// Server importieren, bevor AUTOSTART gesetzt ist, wurde den echten Server starten.
process.env.KEPTA_NO_AUTOSTART = "1";

let createApp: (store: KeptaStore) => import("express").Express;
let store: KeptaStore;
let app: import("express").Express;
let prevHome: string | undefined;
let dir: string;
let fremd: string;

beforeEach(async () => {
  dir = fs.mkdtempSync(path.join(tmpdir(), "kepta-inbox-"));
  fremd = fs.mkdtempSync(path.join(tmpdir(), "kepta-fremd-"));
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

const inbox = (...t: string[]) => path.join(dir, "inbox", ...t);
const MARKER = "SYMLINK-MARKER-root-GEHEIME-ZAHL-97531";

function legeFremdeDatei(): string {
  const ziel = path.join(fremd, "fremd.txt");
  fs.writeFileSync(ziel, `root: ${MARKER}\n`, "utf-8");
  return ziel;
}

const knotentext = async () => {
  const res = await request(app).get("/api/memories");
  return (res.body as { content: string }[]).map((m) => m.content).join("\n");
};

describe("Q-18 — der Inbox-Watcher folgt Symlinks (CWE-59)", () => {
  it("lehnt einen Symlink auf eine Datei ausserhalb der Inbox ab und meldet den Grund", async () => {
    const ziel = legeFremdeDatei();
    fs.symlinkSync(ziel, inbox("verlinkt.txt"));

    const res = await request(app).post("/api/inbox/scan");
    expect(res.status).toBe(200);
    expect(await knotentext()).not.toContain(MARKER);
    expect(res.body.skipped).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ file: "verlinkt.txt", reason: expect.stringMatching(/symlink/i) }),
      ])
    );
  });

  it("verschiebt den abgelehnten Symlink nicht ins Archiv — er bleibt sichtbar liegen", async () => {
    const ziel = legeFremdeDatei();
    fs.symlinkSync(ziel, inbox("verlinkt.txt"));
    await request(app).post("/api/inbox/scan");
    expect(fs.existsSync(inbox("verlinkt.txt"))).toBe(true);
    expect(fs.existsSync(inbox("archive", "verlinkt.txt"))).toBe(false);
    expect(fs.existsSync(ziel)).toBe(true);
  });

  it("lehnt einen Link ab, der auf eine Datei im selben Ordner zeigt, aber ausserhalb der Inbox liegt", async () => {
    // ~/.kepta/ausserhalb.txt — innerhalb des Datenordners, ausserhalb der Inbox.
    const ziel = path.join(dir, "ausserhalb.txt");
    fs.writeFileSync(ziel, `auch hier: ${MARKER}`, "utf-8");
    fs.symlinkSync(ziel, inbox("nachbarn.txt"));
    const res = await request(app).post("/api/inbox/scan");
    expect(await knotentext()).not.toContain(MARKER);
    expect(res.body.skipped?.[0]?.reason).toBeTruthy();
  });

  it("lehnt ein Symlink-Verzeichnis ab, statt seine Dateien einzusaugen", async () => {
    const ordner = path.join(fremd, "garten");
    fs.mkdirSync(ordner, { recursive: true });
    fs.writeFileSync(path.join(ordner, "beet.md"), `im verlinkten ordner: ${MARKER}`, "utf-8");
    fs.symlinkSync(ordner, inbox("garten"));
    const res = await request(app).post("/api/inbox/scan");
    expect(await knotentext()).not.toContain(MARKER);
    expect(res.body.skipped).toEqual(
      expect.arrayContaining([expect.objectContaining({ file: "garten" })])
    );
  });

  it("eine echte Datei in der Inbox wird weiterhin übernommen (die Schleise ist kein Zubringer-Verbot)", async () => {
    fs.writeFileSync(inbox("echt.txt"), "Ein echter Text aus der Inbox mit Substanz für einen Knoten.", "utf-8");
    const res = await request(app).post("/api/inbox/scan");
    expect(res.body.skipped ?? []).toEqual([]);
    expect(res.body.imported).toBeGreaterThan(0);
    expect(await knotentext()).toContain("echter Text aus der Inbox");
    expect(fs.existsSync(inbox("echt.txt"))).toBe(false);
  });

  it("der WATCHER selbst übernimmt die verlinkte Datei nicht (A3-Beweispfad)", async () => {
    const ziel = legeFremdeDatei();
    fs.writeFileSync(inbox("normal.txt"), "normale Inbox-Datei mit Inhalt, damit der Waechter laeuft.", "utf-8");

    // fs.watch auf macOS liefert beim Zusammenfassen mehrerer Aenderungen auch
    // mal filename:undefined — der Waechter laeuft dann leer. Also so lange
    // nachstupsen, bis die echte Datei wirklich angekommen ist, bevor der Link
    // ueberhaupt entsteht: der Beweis braucht einen bewiesenermassen lebenden Waechter.
    await vi.waitFor(
      async () => {
        if (fs.existsSync(inbox("normal.txt"))) fs.appendFileSync(inbox("normal.txt"), " ");
        expect(await knotentext()).toContain("normale Inbox-Datei");
      },
      { timeout: 20_000, interval: 400 }
    );

    fs.symlinkSync(ziel, inbox("verlinkt.txt"));
    // Der Waechter importiert mit 800 ms Verzug; das Mehrfache davon verstreicht hier.
    await new Promise((r) => setTimeout(r, 2500));
    expect(await knotentext()).not.toContain(MARKER);
    expect(fs.existsSync(inbox("verlinkt.txt"))).toBe(true);
  }, 40_000);
});
