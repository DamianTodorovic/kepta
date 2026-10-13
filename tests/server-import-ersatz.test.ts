import { describe, it, expect, beforeEach, afterEach, vi, beforeAll, afterAll } from "vitest";
import { tmpdir } from "node:os";
import path from "node:path";
import fs from "node:fs";
import crypto from "node:crypto";
import request from "supertest";
import { KeptaStore } from "../src/core/store";
import { hoererDerDatei, type DateiHoerer } from "./helfer/hoerer";
import { anlage } from "./helfer/anlage";
import { defaultExtensions } from "../src/core/extensions";

// server.ts startet beim Import normalerweise automatisch — mit KEPTA_NO_AUTOSTART=1
// wird nur createApp exportiert, ohne Port zu binden. Darum hier kein statischer
// Import von ../server: er liefe vor dieser Zeile ab und startete den echten Server.
process.env.KEPTA_NO_AUTOSTART = "1";

let createApp: (store: KeptaStore) => import("express").Express;
let store: KeptaStore;
let app: import("express").Express;
let prevHome: string | undefined;
let dir: string;

// Ein Horcher pro Datei, auf IHREM Port — nicht einer je Anfrage
// (`tests/helfer/hoerer.ts`: der Nachbau vom 13.10., der eine offene
// `request(URLE)`-Kette an einen fremden v4-Hoerer verlor).
let hoerer: DateiHoerer;
let URLE: string;
// Der zweite Stapel (die verschluesselte Probe weiter unten) braucht einen eigenen
// Horcher, weil beide Stapel nicht derselbe sind: ein Horcher reicht fuer einen
// Stapel, und ein zweiter `hoererDerDatei`-Aufruf mit Slot ist dieselbe Zuteilung —
// kein Horcher je Anfrage, kein zweiter Lauf auf derselben Zahl
// (`tests/helfer/port-vergabe.ts`: HORCHENDE_KENNUNGEN).
let hoererZ: DateiHoerer;
let URLZ: string;

beforeAll(async () => {
  hoerer = await hoererDerDatei("tests/server-import-ersatz.test.ts");
  URLE = hoerer.url;
  hoererZ = await hoererDerDatei("tests/server-import-ersatz.test.ts#zweitstapel");
  URLZ = hoererZ.url;
});

afterAll(async () => {
  await hoerer.schliesse();
  await hoererZ.schliesse();
});

beforeEach(async () => {
  dir = fs.mkdtempSync(path.join(tmpdir(), "kepta-ersatz-"));
  prevHome = process.env.HOME;
  process.env.HOME = dir;
  process.env.KEPTA_DATA_DIR = dir;
  vi.resetModules();
  ({ createApp } = await import("../server"));
  store = new KeptaStore(path.join(dir, "test.db"));
  app = createApp(store);
  hoerer.gebeApp(app);
});

afterEach(() => {
  if (prevHome === undefined) delete process.env.HOME;
  else process.env.HOME = prevHome;
});

async function fuelle(n: number, praefix = "Bestand") {
  for (let i = 0; i < n; i++) {
    anlage(await request(URLE).post("/api/memories").send({ title: `${praefix} ${i}`, content: `Inhalt ${i} mit Substanz.` }), `${praefix} ${i} anlegen`);
  }
}

/** Zwei Notizen in den Papierkorb — der Purge bei mode:"replace" erwischt sie mit. */
async function papierkorb(n: number) {
  for (let i = 0; i < n; i++) {
    const post = anlage(await request(URLE).post("/api/memories").send({ title: `Weg ${i}`, content: `Papierkorb-Inhalt ${i}.` }), `Weg ${i} anlegen`);
    anlage(await request(URLE).delete(`/api/memories/${encodeURIComponent(post.body.memory.id)}`), `Weg ${i} in den Papierkorb`, [200, 204]);
  }
}

const zaehlen = async () => {
  const aktiv = await request(URLE).get("/api/memories");
  const trash = await request(URLE).get("/api/memories?trash=1");
  return { aktiv: aktiv.body.length, trash: trash.body.length };
};

describe("Q-16 — POST /api/memories/import mit mode:\"replace\" kann die ganze Wissensbasis endgültig löschen", () => {
  it("lehnt replace ohne ausdrückliche Bestätigung ab und lässt jeden Knoten in Ruhe", async () => {
    await fuelle(3);
    const res = await request(URLE)
      .post("/api/memories/import")
      .send({ mode: "replace", memories: [{ id: "neu-1", title: "Neu", content: "Neuer Inhalt." }] });
    expect(res.status).toBe(400);
    expect(String(res.body.error)).toMatch(/confirm/);
    expect(await zaehlen()).toEqual({ aktiv: 3, trash: 0 });
  });

  it("lehnt eine replace-Nutzlast ohne eine einzige nutzbare Notiz ab (leeres Array)", async () => {
    await fuelle(3);
    await papierkorb(2);
    const res = await request(URLE)
      .post("/api/memories/import")
      .send({ mode: "replace", confirm: "replace", memories: [] });
    expect(res.status).toBe(400);
    expect(await zaehlen()).toEqual({ aktiv: 3, trash: 2 });
  });

  it("lehnt das Nur-Titel-Backup ab, dessen Notizen durch den Inhaltfilter laufen", async () => {
    await fuelle(3);
    // A3 Abschnitt B: frueher 200 {imported:0} — und der ganze Bestand weg.
    const res = await request(URLE).post("/api/memories/import").send({
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
    const res = await request(URLE)
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
    const res = await request(URLE).post("/api/memories/import").send({
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
    // Die Sicherung enthaelt den Stand VOR dem Purge — aktive und Paperkorb-Knoten.
    const sicherung = new KeptaStore(pfad);
    try {
      expect(sicherung.listMemories({ limit: 1000 })).toHaveLength(3);
      expect(sicherung.listMemories({ limit: 1000, trash: true })).toHaveLength(2);
    } finally {
      sicherung.close();
    }
    expect(await zaehlen()).toEqual({ aktiv: 1, trash: 0 });
  });

  it("löscht nichts, wenn die Sicherung nicht geschrieben werden kann", async () => {
    await fuelle(3);
    // backup/ als Datei statt Ordner: mkdir und Copy schlagen fehl, der Purge darf trotzdem nicht laufen.
    fs.writeFileSync(path.join(dir, "backup"), "blockiert", "utf-8");
    const res = await request(URLE).post("/api/memories/import").send({
      mode: "replace",
      confirm: "replace",
      memories: [{ id: "n1", title: "Neu", content: "Inhalt" }],
    });
    expect(res.status).toBe(500);
    expect(String(res.body.error)).toMatch(/Sicherung|backup/);
    expect(await zaehlen()).toEqual({ aktiv: 3, trash: 0 });
  });

  it("sichert verschlüsselt weiter: keine Klartext-Kopie neben einer verschlüsselten Datenbank", async () => {
    const schluessel = crypto.randomBytes(32);
    const MARKER = "geheimer-satz-fuer-die-backup-pruefung";
    const klarOrdner = fs.mkdtempSync(path.join(tmpdir(), "kepta-ersatz-klar-"));
    const verschluesselt = { ...defaultExtensions(), keys: { keyFor: () => schluessel } };
    const keyed = new KeptaStore(path.join(klarOrdner, "kepta.db"), verschluesselt);
    try {
      const keyedApp = createApp(keyed);
      hoererZ.gebeApp(keyedApp);
      await anlage(await request(URLZ).post("/api/memories").send({ title: "Privat", content: MARKER }), "verschlüsselte Probe-Notiz anlegen");
      const res = await request(URLZ).post("/api/memories/import").send({
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

  it("merge braucht keine Bestätigung und schreibt keine Sicherung", async () => {
    await fuelle(2);
    const res = await request(URLE)
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
    const res = await request(URLE).post("/api/memories/import").send({ memories: [] });
    expect(res.status).toBe(400);
    expect(await zaehlen()).toEqual({ aktiv: 2, trash: 0 });
  });
});

/**
 * Folge des eigenen Befunds: die Sicherung war die Antwort auf "kein Purge ohne
 * Sicherung" — auf einer langen gelebten Installation legt sie aber eine Datei je
 * Volltausch hin. Aufbewahrung ist darum eine Zahl, nicht ein Vorbehalt.
 */
const SICHERUNGEN = () => {
  try {
    // beide Formen: mit Zeitstempel allein (die aelteren Installationen) und mit
    // Zeitstempel + Kurszel (die neuen) — sonst misst der Test an der Realitaet vorbei
    return fs.readdirSync(path.join(dir, "backup")).filter((n) => /^kepta-pre-replace-\d+(-[0-9a-f]{4})?\.db$/.test(n)).sort();
  } catch {
    return [];
  }
};

const pause = () => new Promise((r) => setTimeout(r, 4));

/** Ein bestaetigter Volltausch mit einem Knoten; gibt die Antwort zurueck. */
async function volltausch(markierung: string) {
  await pause();
  return request(URLE).post("/api/memories/import").send({
    mode: "replace",
    confirm: "replace",
    memories: [{ id: `k-${markierung}`, title: `Stand ${markierung}`, content: `Inhalt ${markierung}` }],
  });
}

describe("Q-16 Folge — der Sicherungsordner waechst: Aufbewahrung als Policy mit Zahl", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("hält standardmaessig die letzten fuenf, die aelteste ist nach dem sechsten Lauf weg", async () => {
    await fuelle(1);
    const pfade: string[] = [];
    for (let i = 0; i < 6; i++) {
      const res = await volltausch(`l${i}`);
      expect(res.status).toBe(200);
      pfade.push(String(res.body.backupPath));
    }
    const gehalten = SICHERUNGEN();
    expect(gehalten).toHaveLength(5);
    expect(gehalten).toContain(path.basename(pfade[5]!));
    expect(gehalten).not.toContain(path.basename(pfade[0]!));
  });

  it("die Antwort sagt, was gehalten wird und wie viel geraeumt wurde", async () => {
    await fuelle(1);
    for (let i = 0; i < 5; i++) {
      const lauf = await volltausch(`m${i}`);
      // Solange die Zahl nicht ueberschritten ist, wird nichts entfernt — und die
      // Antwort haelt die Anzahl trotzdem hin, statt ueber den Ordner zu schweigen.
      expect(lauf.body.backupsGehalten).toBe(i + 1);
      expect(lauf.body.backupsEntfernt).toBe(0);
    }
    const sechster = await volltausch("m5");
    expect(sechster.body.backupPath).toBeTruthy();
    expect(sechster.body.backupsGehalten).toBe(5);
    expect(sechster.body.backupsEntfernt).toBe(1);
  });

  it("loescht nie etwas, das nicht selbst geschrieben wurde", async () => {
    await fuelle(1);
    fs.mkdirSync(path.join(dir, "backup"), { recursive: true });
    const fremd = ["wichtig.txt", "kepta.db", "kepta-pre-replace-manuell.db", "alter_ordner.kepta-pre-replace-1.db"];
    for (const n of fremd) fs.writeFileSync(path.join(dir, "backup", n), "nutzerdaten", "utf-8");
    for (let i = 0; i < 7; i++) await volltausch(`f${i}`);
    for (const n of fremd) {
      expect(fs.existsSync(path.join(dir, "backup", n))).toBe(true);
    }
    expect(SICHERUNGEN()).toHaveLength(5);
  });

  it("KEPTA_BACKUP_KEEP=2 haelt genau zwei", async () => {
    vi.stubEnv("KEPTA_BACKUP_KEEP", "2");
    await fuelle(1);
    for (let i = 0; i < 5; i++) await volltausch(`z${i}`);
    expect(SICHERUNGEN()).toHaveLength(2);
  });

  it("KEEP=1: die gehaltene Datei ist genau die neue — geraeumt wird erst nach dem neuen Schreiblauf", async () => {
    vi.stubEnv("KEPTA_BACKUP_KEEP", "1");
    await fuelle(1);
    fs.mkdirSync(path.join(dir, "backup"), { recursive: true });
    // drei aeltere Sicherungen, als waeren sie von frueheren Laeufen
    for (const ms of [Date.now() - 90_000, Date.now() - 60_000, Date.now() - 30_000]) {
      fs.writeFileSync(path.join(dir, "backup", `kepta-pre-replace-${ms}.db`), "alt", "utf-8");
    }
    const res = await volltausch("neu");
    expect(SICHERUNGEN()).toEqual([path.basename(String(res.body.backupPath))]);
    expect(res.body.backupsEntfernt).toBe(3);
    expect(res.body.backupsGehalten).toBe(1);
  });

  it("KEPTA_BACKUP_KEEP=0 behaelt gar nichts — und sagt das ausdruecklich statt still zu schweigen", async () => {
    vi.stubEnv("KEPTA_BACKUP_KEEP", "0");
    await fuelle(3);
    const res = await volltausch("null");
    expect(res.status).toBe(200);
    expect(SICHERUNGEN()).toEqual([]);
    expect(res.body.backupsGehalten).toBe(0);
    expect(String(res.body.warning)).toMatch(/KEPTA_BACKUP_KEEP=0/);
    expect(String(res.body.warning)).toMatch(/nicht wiederherstell|cannot be undone/);
    // Der Volltausch selbst laeuft: der Schutz bleibt die Bestaetigung, nicht die Datei.
    expect(await zaehlen()).toEqual({ aktiv: 1, trash: 0 });
  });

  it("ein unbrauchbarer Wert faellt auf fuenf zurueck und nennt, dass er ignoriert wurde", async () => {
    vi.stubEnv("KEPTA_BACKUP_KEEP", "fünf");
    await fuelle(1);
    for (let i = 0; i < 6; i++) await volltausch(`g${i}`);
    expect(SICHERUNGEN()).toHaveLength(5);
    const letzte = await volltausch("g6");
    expect(String(letzte.body.warning)).toMatch(/KEPTA_BACKUP_KEEP/);
    expect(letzte.body.backupsGehalten).toBe(5);
  });

  it("ein negativer Wert ist kein 'behalt nichts', sondern unbrauchbar", async () => {
    vi.stubEnv("KEPTA_BACKUP_KEEP", "-2");
    await fuelle(1);
    for (let i = 0; i < 6; i++) await volltausch(`n${i}`);
    expect(SICHERUNGEN()).toHaveLength(5);
  });

  it("die Reihenfolge bleibt: ohne geschriebene Sicherung wird nicht purgiert, auch mit KEEP=0", async () => {
    vi.stubEnv("KEPTA_BACKUP_KEEP", "0");
    await fuelle(3);
    fs.writeFileSync(path.join(dir, "backup"), "blockiert", "utf-8");
    const res = await request(URLE).post("/api/memories/import").send({
      mode: "replace",
      confirm: "replace",
      memories: [{ id: "x", title: "Neu", content: "Inhalt" }],
    });
    expect(res.status).toBe(500);
    expect(await zaehlen()).toEqual({ aktiv: 3, trash: 0 });
  });

  /**
   * Der Name traegt die Millisekunde. Zwei bestaetigte Volltausche in derselben
   * Millisekunde schrieben damit denselben Pfad: die zweite Sicherung ueberschrieb
   * die erste, und der Nutzer glaubt, er haette zwei Staende. Der Beweis gefriert
   * die Uhr — "praktisch nicht erreichbar" ist keine Antwort auf einen Zahlfehler.
   */
  it("zwei Volltausche in derselben Millisekunde schreiben zwei Sicherungen, nicht eine ueber die andere", async () => {
    await fuelle(2);
    const uhre = vi.spyOn(Date, "now").mockReturnValue(1_700_000_000_000);
    try {
      const erste = await request(URLE).post("/api/memories/import").send({
        mode: "replace", confirm: "replace",
        memories: [{ id: "gl1", title: "Glatt 1", content: "Erster Stand derselben Millisekunde." }],
      });
      const zweite = await request(URLE).post("/api/memories/import").send({
        mode: "replace", confirm: "replace",
        memories: [{ id: "gl2", title: "Glatt 2", content: "Zweiter Stand derselben Millisekunde." }],
      });
      expect(erste.body.backupPath).toBeTruthy();
      // Der gleiche Pfad in beiden Antworten waere der Ueberschreibbeweis.
      expect(zweite.body.backupPath).not.toBe(erste.body.backupPath);
      expect(fs.existsSync(String(erste.body.backupPath))).toBe(true);
      expect(fs.existsSync(String(zweite.body.backupPath))).toBe(true);
      expect(SICHERUNGEN()).toHaveLength(2);
      expect(zweite.body.backupsGehalten).toBe(2);
    } finally {
      uhre.mockRestore();
    }
  });

  /**
   * Der Name hat ein Suffix bekommen — die Ordner der Installationen, die heute
   * schon laufen, halten Dateien OHNE Suffix. Erkennt die Raumscheibe die alte
   * Form nicht mehr, hoert die Aufbewahrung bei genau den aelteren Staenden auf,
   * die den Ordner voll machen: ein Ruueckschritt, der wie eine Verbesserung aussieht.
   */
  it("alte Sicherung ohne Suffix und neue mit Suffix im selben Ordner: die aeltere weicht", async () => {
    vi.stubEnv("KEPTA_BACKUP_KEEP", "1");
    await fuelle(1);
    fs.mkdirSync(path.join(dir, "backup"), { recursive: true });
    const alt = `kepta-pre-replace-${Date.now() - 120_000}.db`;
    fs.writeFileSync(path.join(dir, "backup", alt), "alte form, kein suffix", "utf-8");
    const res = await volltausch("gemischt");
    const neue = path.basename(String(res.body.backupPath));
    expect(neue).toMatch(/^kepta-pre-replace-\d+-[0-9a-f]{4}\.db$/);
    expect(SICHERUNGEN()).toEqual([neue]);
    expect(fs.existsSync(path.join(dir, "backup", alt))).toBe(false);
    expect(res.body.backupsEntfernt).toBe(1);
    expect(res.body.backupsGehalten).toBe(1);
  });

  it("ein Fremdname, der dem neuen Muster nur aehnlich sieht, bleibt liegen", async () => {
    await fuelle(1);
    fs.mkdirSync(path.join(dir, "backup"), { recursive: true });
    const fremd = [
      "kepta-pre-replace-manuell.db",
      "kepta-pre-replace-1700000000000-ZZZZ.db",
      "kepta-pre-replace-1700000000000-ab1.db",
      "kepta-pre-replace-1700000000000-ffff.db.bak",
    ];
    for (const n of fremd) fs.writeFileSync(path.join(dir, "backup", n), "nutzerdaten", "utf-8");
    for (let i = 0; i < 6; i++) await volltausch(`h${i}`);
    for (const n of fremd) expect(fs.existsSync(path.join(dir, "backup", n))).toBe(true);
    expect(SICHERUNGEN()).toHaveLength(5);
  });

  it("die Zahl der Dateien auf der Platte ist die Zahl in der Antwort — zwoelf Laeufe schnell hintereinander", async () => {
    await fuelle(1);
    let letzte: { body: Record<string, unknown> } | undefined;
    for (let i = 0; i < 12; i++) {
      letzte = await request(URLE).post("/api/memories/import").send({
        mode: "replace", confirm: "replace",
        memories: [{ id: `k${i}`, title: `Schnell ${i}`, content: `Stand ${i} mit Substanz.` }],
      });
      // Die Invariante wird je Lauf geprueft, nicht nur am Ende: ein Lauf, der
      // eine Datei ueberschreibt, macht erst beim naechsten Zaehlen sichtbar.
      expect(SICHERUNGEN()).toHaveLength(Number(letzte.body.backupsGehalten));
    }
    expect(SICHERUNGEN().length).toBeLessThanOrEqual(5);
    // Zwölf bestaetigte Laeufe, aber die Zahl haelt nur, was der Betreiber erlaubte.
    expect(letzte!.body.backupsGehalten).toBe(5);
  });
});
