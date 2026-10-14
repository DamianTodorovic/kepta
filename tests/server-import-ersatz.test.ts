// F12 — dieselbe Luecke, die F3 im Kern (`~/kepta-core/server.ts`) laengst zu hat,
// in der Desktop-App: ihr `POST /api/memories/import` mit mode:"replace" purgierte
// bisher ungefragt, ungesichert und auch bei leerer Nutzlast. Die Testanlage ist
// bewusst die Kern-Anlage (tests/server-import-ersatz.test.ts in ~/kepta-core),
// damit beidea Baeume gegen denselben Wortlauf pruefen und nicht gegen zwei.
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { tmpdir } from "node:os";
import path from "node:path";
import fs from "node:fs";
import crypto from "node:crypto";
import request from "supertest";
import { KeptaStore } from "../src/core/store";
import { defaultExtensions } from "../src/core/extensions";

// server.ts startet beim Import normalerweise automatisch — mit KEPTA_NO_AUTOSTART=1
// wird nur createApp exportiert, ohne Port zu binden. Darum hier kein statischer
// Import von ../server: er wuerde vor dieser Zeile ablaufen und den echten Server
// starten. Der Schluesselbund bleibt unberuehrt (22.9.-Regel, tests/server.test.ts).
process.env.KEPTA_NO_AUTOSTART = "1";
process.env.KEPTA_ENCRYPTION = "off";

let createApp: typeof import("../server").createApp;
let store: KeptaStore;
let app: import("express").Express;
let prevHome: string | undefined;
let dir: string;

beforeEach(async () => {
  dir = fs.mkdtempSync(path.join(tmpdir(), "kepta-ersatz-"));
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

async function fuelle(n: number, praefix = "Bestand") {
  for (let i = 0; i < n; i++) {
    await request(app).post("/api/memories").send({ title: `${praefix} ${i}`, content: `Inhalt ${i} mit Substanz.` });
  }
}

/** Zwei Notizen in den Papierkorb — der Purge bei mode:"replace" erwischt sie mit. */
async function papierkorb(n: number) {
  for (let i = 0; i < n; i++) {
    const post = await request(app).post("/api/memories").send({ title: `Weg ${i}`, content: `Papierkorb-Inhalt ${i}.` });
    await request(app).delete(`/api/memories/${encodeURIComponent(post.body.memory.id)}`);
  }
}

const zaehlen = async () => {
  const aktiv = await request(app).get("/api/memories");
  const trash = await request(app).get("/api/memories?trash=1");
  return { aktiv: aktiv.body.total, trash: trash.body.total };
};

describe("Q-16 — POST /api/memories/import mit mode:\"replace\" loescht die ganze Wissensbasis endgueltig", () => {
  it("lehnt replace ohne ausdrueckliche Bestaetigung ab und laesst jeden Knoten in Ruhe", async () => {
    await fuelle(3);
    const res = await request(app)
      .post("/api/memories/import")
      .send({ mode: "replace", memories: [{ id: "neu-1", title: "Neu", content: "Neuer Inhalt." }] });
    expect(res.status).toBe(400);
    expect(String(res.body.error)).toMatch(/confirm/);
    expect(await zaehlen()).toEqual({ aktiv: 3, trash: 0 });
  });

  it("lehnt eine replace-Nutzlast ohne eine einzige nutzbare Notiz ab (leeres Array)", async () => {
    await fuelle(3);
    await papierkorb(2);
    const res = await request(app)
      .post("/api/memories/import")
      .send({ mode: "replace", confirm: "replace", memories: [] });
    expect(res.status).toBe(400);
    expect(await zaehlen()).toEqual({ aktiv: 3, trash: 2 });
  });

  it("lehnt das Nur-Titel-Backup ab, dessen Notizen durch den Inhaltfilter laufen", async () => {
    await fuelle(3);
    // A3 Abschnitt B: frueher 200 {imported:0} — und der ganze Bestand weg.
    const res = await request(app).post("/api/memories/import").send({
      mode: "replace",
      confirm: "replace",
      memories: [{ id: "a1", title: "Nur-Titel", content: "" }],
    });
    expect(res.status).toBe(400);
    expect(String(res.body.error)).toMatch(/nutzbar|usable/);
    expect(await zaehlen()).toEqual({ aktiv: 3, trash: 0 });
  });

  it("zeigt der Trockenlauf die Zahl der Betroffenen, ohne etwas anzufassen", async () => {
    await fuelle(3);
    await papierkorb(2);
    const res = await request(app)
      .post("/api/memories/import")
      .send({ mode: "replace", dryRun: true, memories: [{ id: "n1", title: "Neu", content: "Inhalt" }] });
    expect(res.status).toBe(200);
    expect(res.body.dryRun).toBe(true);
    expect(res.body.affected).toMatchObject({ active: 3, trashed: 2 });
    expect(res.body.incoming).toBe(1);
    expect(await zaehlen()).toEqual({ aktiv: 3, trash: 2 });
    // Der Trockenlauf schreibt keine Sicherung — er hat nichts zu sichern.
    expect(fs.existsSync(path.join(dir, "backup"))).toBe(false);
  });

  it("legt vor dem Purge die Sicherung auf die Platte und nennt ihren Pfad in der Antwort", async () => {
    await fuelle(3);
    await papierkorb(2);
    const res = await request(app).post("/api/memories/import").send({
      mode: "replace",
      confirm: "replace",
      memories: [{ id: "n1", title: "Neu", content: "Nur dieser Knoten bleibt uebrig." }],
    });
    expect(res.status).toBe(200);
    expect(res.body.imported).toBe(1);
    expect(res.body.purged).toMatchObject({ active: 3, trashed: 2 });

    const pfad = String(res.body.backupPath ?? "");
    expect(pfad).toBeTruthy();
    expect(fs.existsSync(pfad)).toBe(true);
    expect(pfad.startsWith(path.join(dir, "backup"))).toBe(true);
    // Die Sicherung enthaelt den Stand VOR dem Purge — aktive und Papierkorb-Knoten.
    const sicherung = new KeptaStore(pfad);
    try {
      expect(sicherung.listMemories({ limit: 1000 })).toHaveLength(3);
      expect(sicherung.listMemories({ limit: 1000, trash: true })).toHaveLength(2);
    } finally {
      sicherung.close();
    }
    expect(await zaehlen()).toEqual({ aktiv: 1, trash: 0 });
  });

  it("loescht nichts, wenn die Sicherung nicht geschrieben werden kann", async () => {
    await fuelle(3);
    // backup/ als Datei statt Ordner: mkdir und Copy schlagen fehl, der Purge darf trotzdem nicht laufen.
    fs.writeFileSync(path.join(dir, "backup"), "blockiert", "utf-8");
    const res = await request(app).post("/api/memories/import").send({
      mode: "replace",
      confirm: "replace",
      memories: [{ id: "n1", title: "Neu", content: "Inhalt" }],
    });
    expect(res.status).toBe(500);
    expect(String(res.body.error)).toMatch(/Sicherung|backup/);
    expect(await zaehlen()).toEqual({ aktiv: 3, trash: 0 });
  });

  it("sichert verschluesselt weiter: keine Klartext-Kopie neben einer verschluesselten Datenbank", async () => {
    const schluessel = crypto.randomBytes(32);
    const MARKER = "geheimer-satz-fuer-die-backup-pruefung";
    const klarOrdner = fs.mkdtempSync(path.join(tmpdir(), "kepta-ersatz-klar-"));
    const verschluesselt = { ...defaultExtensions(), keys: { keyFor: () => schluessel } };
    const keyed = new KeptaStore(path.join(klarOrdner, "kepta.db"), verschluesselt);
    try {
      const keyedApp = createApp(keyed);
      await request(keyedApp).post("/api/memories").send({ title: "Privat", content: MARKER });
      const res = await request(keyedApp).post("/api/memories/import").send({
        mode: "replace",
        confirm: "replace",
        memories: [{ id: "n1", title: "Neu", content: "Inhalt" }],
      });
      expect(res.status).toBe(200);
      const pfad = String(res.body.backupPath);
      expect(fs.existsSync(pfad)).toBe(true);
      const roh = fs.readFileSync(pfad);
      // Ein Klartext-Snapshot waere ein zweites, unverschuesseltes Gehirn auf der Platte.
      expect(roh.subarray(0, 16).toString("utf-8")).not.toBe("SQLite format 3");
      expect(roh.toString("latin1")).not.toContain(MARKER);
      // Mit demselben Schluessel oeffnet die Sicherung aber — sie ist keine Niete.
      const probe = new KeptaStore(pfad, { ...defaultExtensions(), keys: { keyFor: () => schluessel } });
      try {
        expect(probe.listMemories({ limit: 1000 })[0]?.content).toContain(MARKER);
      } finally {
        probe.close();
      }
    } finally {
      keyed.close();
    }
  });

  it("merge braucht keine Bestaetigung und schreibt keine Sicherung", async () => {
    await fuelle(2);
    const res = await request(app)
      .post("/api/memories/import")
      .send({ mode: "merge", memories: [{ id: "m1", title: "Frisch", content: "Inhalt" }] });
    expect(res.status).toBe(200);
    expect(res.body.imported).toBe(1);
    expect(res.body.backupPath).toBeUndefined();
    expect(fs.existsSync(path.join(dir, "backup"))).toBe(false);
    expect(await zaehlen()).toEqual({ aktiv: 3, trash: 0 });
  });

  it("merge ohne nutzbare Notiz wird abgelehnt statt als Erfolg gemeldet", async () => {
    await fuelle(2);
    const res = await request(app).post("/api/memories/import").send({ memories: [] });
    expect(res.status).toBe(400);
    expect(await zaehlen()).toEqual({ aktiv: 2, trash: 0 });
  });
});

/**
 * Die Rotation: backup/ darf nicht unbegrenzt wachsen (ein Volltausch je Bestaetigung,
 * fuer immer). Policy — letzte fuenf eigene Sicherungen, KEPTA_BACKUP_KEEP steuert,
 * 0 = nichts behalten mit ausdruecklicher Warnung, geloescht wird NACH dem
 * erfolgreich geschriebenen neuen Backup, und nur eigene Dateien.
 */
const pause = () => new Promise((r) => setTimeout(r, 5));

/** Nur die eigenen Dateien des Werkzeugs, dem Ordner nach — beide Namensformen. */
const eigene = () => {
  const ordner = path.join(dir, "backup");
  if (!fs.existsSync(ordner)) return [] as string[];
  return fs.readdirSync(ordner).filter((n) => /^kepta-pre-replace-\d+(?:-[0-9a-f]{4})?\.db$/.test(n)).sort();
};

type Antwort = Awaited<ReturnType<typeof volltausch>>;

const volltausch = async (n: number) =>
  request(app).post("/api/memories/import").send({
    mode: "replace",
    confirm: "replace",
    memories: [{ id: `dreh-${n}`, title: `Stand ${n}`, content: `Inhalt ${n} mit Substanz.` }],
  });

describe("Sicherungsrotation — backup/ haelt die letzten fuenf, Fremdes bleibt liegen", () => {
  it("sechs bestaetigte Volltausche lassen genau fuenf Sicherungen, die aelteste ist weg", async () => {
    await fuelle(1);
    const letzte: Antwort[] = [];
    for (let i = 1; i <= 6; i++) { letzte.push(await volltausch(i)); await pause(); }
    expect(eigene()).toHaveLength(5);
    const sechste = letzte[5]!;
    expect(sechste.body.backupsGehalten).toBe(5);
    expect(sechste.body.backupsEntfernt).toBe(1);
    // Die fuenf, die bleiben, sind die fuenf letzten — nicht irgendwelche.
    expect(eigene()).toEqual([letzte[1], letzte[2], letzte[3], letzte[4], letzte[5]].map((r) => path.basename(String(r.body.backupPath))).sort());
    // Die aelteste Sicherung ist von der Platte, die juengste oeffnet.
    const probe = new KeptaStore(path.join(dir, "backup", eigene()[0]!));
    try { expect(probe.listMemories({ limit: 10 })).toHaveLength(1); } finally { probe.close(); }
  });

  it("KEPTA_BACKUP_KEEP=2 behaelt zwei, der Rest wird geloescht", async () => {
    vi.stubEnv("KEPTA_BACKUP_KEEP", "2");
    try {
      await fuelle(1);
      for (let i = 1; i <= 4; i++) { await volltausch(i); await pause(); }
      expect(eigene()).toHaveLength(2);
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("KEPTA_BACKUP_KEEP=0 behaelt nichts und warnt ausdruecklich — der Purge laeuft weiter", async () => {
    vi.stubEnv("KEPTA_BACKUP_KEEP", "0");
    try {
      await fuelle(2);
      const res = await volltausch(1);
      expect(res.status).toBe(200);
      expect(res.body.imported).toBe(1);
      expect(res.body.backupsGehalten).toBe(0);
      expect(String(res.body.backupPath)).toMatch(/kepta-pre-replace-\d+(-[0-9a-f]{4})?\.db$/);
      expect(fs.existsSync(String(res.body.backupPath))).toBe(false);
      expect(String(res.body.warning)).toMatch(/KEPTA_BACKUP_KEEP=0/);
      expect(String(res.body.warning)).toMatch(/cannot be undone from disk/);
      expect(eigene()).toEqual([]);
      expect(await zaehlen()).toEqual({ aktiv: 1, trash: 0 });
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("fremde Dateien im Sicherungsordner werden nicht angefasst", async () => {
    await fuelle(1);
    const ordner = path.join(dir, "backup");
    fs.mkdirSync(ordner, { recursive: true });
    fs.writeFileSync(path.join(ordner, "wichtige-altdatei.db"), "fremd", "utf-8");
    fs.writeFileSync(path.join(ordner, "kepta-pre-replace-abz.db"), "kein stempel", "utf-8");
    fs.mkdirSync(path.join(ordner, "unterordner"), { recursive: true });
    for (let i = 1; i <= 4; i++) { await volltausch(i); await pause(); }
    expect(eigene()).toHaveLength(4);
    expect(fs.existsSync(path.join(ordner, "wichtige-altdatei.db"))).toBe(true);
    expect(fs.existsSync(path.join(ordner, "kepta-pre-replace-abz.db"))).toBe(true);
    expect(fs.existsSync(path.join(ordner, "unterordner"))).toBe(true);
  });

  it("unverstaendliche Werte fallen auf 5 zurueck und sagen es, gebrochene werden abgerundet", async () => {
    const faelle: { wert: string; gehalten: number; warnt: boolean }[] = [
      { wert: "abc", gehalten: 4, warnt: true },
      { wert: "-1", gehalten: 4, warnt: true },
      { wert: "", gehalten: 4, warnt: false },
      { wert: "2.5", gehalten: 2, warnt: false },
    ];
    for (const fall of faelle) {
      vi.stubEnv("KEPTA_BACKUP_KEEP", fall.wert);
      try {
        fs.rmSync(path.join(dir, "backup"), { recursive: true, force: true });
        await fuelle(1);
        const erste = await volltausch(1); await pause();
        for (const i of [2, 3, 4]) { await volltausch(i); await pause(); }
        expect(eigene()).toHaveLength(fall.gehalten);
        // Der Default wird nur genannt, wenn ein Wert wirklich ignoriert wurde.
        if (fall.warnt) expect(String(erste.body.warning)).toMatch(/KEPTA_BACKUP_KEEP/);
        else expect(String(erste.body.warning ?? "")).not.toMatch(/KEPTA_BACKUP_KEEP/);
      } finally {
        vi.unstubAllEnvs();
      }
    }
  });

  it("schlaegt die neue Sicherung fehl, bleiben die alten stehen und es wird nichts purgiert", async () => {
    await fuelle(2);
    const erste = await volltausch(1);
    expect(erste.status).toBe(200);
    const bestand = await zaehlen();
    const ordner = path.join(dir, "backup");
    fs.chmodSync(ordner, 0o500);
    try {
      const zweite = await volltausch(2);
      expect(zweite.status).toBe(500);
      expect(String(zweite.body.error)).toMatch(/backup|Sicherung/);
    } finally {
      fs.chmodSync(ordner, 0o700);
    }
    // Die aeltere Sicherung ist unangetastet, der Bestand auch.
    expect(fs.existsSync(String(erste.body.backupPath))).toBe(true);
    expect(await zaehlen()).toEqual(bestand);
  });
});

describe("Sicherungsname — derselbe Name, dieselbe Loeschregel wie im Kern", () => {
  it("zwei Volltausche in derselben Millisekunde schreiben zwei Dateien, nicht eine ueber die andere", async () => {
    const { datenbanksicherung } = await import("../server/helfer/sicherung");
    const zweiter = new KeptaStore(path.join(dir, "zweite.db"));
    try {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-10-10T09:00:00Z"));
      const a = datenbanksicherung(zweiter);
      const b = datenbanksicherung(zweiter);
      vi.useRealTimers();
      expect(a).toBeTruthy();
      expect(b).toBeTruthy();
      expect(a).not.toBe(b);
      expect(fs.readdirSync(path.join(dir, "backup"))).toHaveLength(2);
    } finally {
      vi.useRealTimers();
      zweiter.close();
    }
  });

  it("raeumt beide Namensformen weg — die alte ohne Kuerzel und die neue mit ihr", async () => {
    const { halteSicherungen } = await import("../server/helfer/sicherung");
    const ordner = path.join(dir, "backup");
    fs.mkdirSync(ordner, { recursive: true });
    fs.writeFileSync(path.join(ordner, "kepta-pre-replace-1700000000000.db"), "alte form", "utf-8");
    fs.writeFileSync(path.join(ordner, "kepta-pre-replace-1800000000000-abcd.db"), "neue form", "utf-8");
    fs.writeFileSync(path.join(ordner, "kepta-pre-replace-abz.db"), "fremd, nie von uns", "utf-8");
    const ergebnis = halteSicherungen(ordner, 1);
    // Zwei eigene Staende in zwei Namensformen, einer darf bleiben: die aeltere
    // Form ohne Kuerzel wird also ebenso geraeumt wie die neue mit ihr.
    expect(ergebnis).toEqual({ gehalten: 1, entfernt: 1 });
    expect(fs.existsSync(path.join(ordner, "kepta-pre-replace-1700000000000.db"))).toBe(false);
    expect(fs.existsSync(path.join(ordner, "kepta-pre-replace-1800000000000-abcd.db"))).toBe(true);
    expect(fs.existsSync(path.join(ordner, "kepta-pre-replace-abz.db"))).toBe(true);
  });
});
