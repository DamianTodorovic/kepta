import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from "vitest";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import request from "supertest";
import { KeptaStore } from "../src/core/store";
import { createApp } from "../server/app";
import { aufnahme, vergleicheHeim, STANDARD_PFADE } from "../scripts/heim-wache.mjs";

// Jede Testdatei, die `createApp` baut, zieht damit die ganze Server-Schicht an —
// und die löst ihren Datenordner so auf (server/app.ts:120):
//
//   const datenOrdner = process.env.KEPTA_DATA_DIR || path.join(os.homedir(), ".kepta");
//
// Ohne gesetzte Variable schreibt also ein Test in den ECHTEN ~/.kepta des
// Rechners: Profil, Einstellungen, Inbox-Konfiguration. Passiert am 13.10.:
// `~/.kepta/profile.json` trägt {"beruf":"Anwältin"} — eine Zeichenkette, die im
// ganzen Produkt nirgends vorkommt, nur in tests/keine-grenzen.test.ts. Die Datei
// schrieb 14:29:48, der Suite-Bericht test-results/vitest.json 14:31 Uhr.
//
// Diese Wache hält die Regel, die der Fall gelehrt hat: wer den Server baut,
// baut ihn in eine eigene Ecke. Ableitbar, nicht abgeschrieben — der nächste
// Fall dieser Art fällt von selbst rein.

const ORDNER = path.join(process.cwd(), "tests");

// Die Ausnahmeliste ist leer — und das ist ihr Entwurf. Gestanden hat hier
// `tests/server-profil-merge.test.ts` (#52, gemeldet 13.10. 19:53). Beim vollen
// Suite-Lauf um 22:32 meldete der vierte Fall: „die Datei kapselt inzwischen —
// Ausnahme streichen“. #52 hat gekapselt, die Liste ist abgeräumt.
//
// So muss es laufen: eine Ausnahme, die niemand mehr streicht, wäre ein Schrank
// voll leerer Mappen. Der vierte Fall prüft deshalb gegen, dass jede Zeile hier
// noch nötig ist.
const GEMELDET: Record<string, string> = {};

function dateienMitServer(): string[] {
  const raus: string[] = [];
  for (const e of fs.readdirSync(ORDNER, { withFileTypes: true })) {
    if (!e.isFile() || !/\.test\.tsx?$/.test(e.name)) continue;
    const text = fs.readFileSync(path.join(ORDNER, e.name), "utf-8");
    if (/createApp\s*\(/.test(text)) raus.push(e.name);
  }
  return raus;
}

function ohne(setz: RegExp): string[] {
  return dateienMitServer().filter((name) => !setz.test(text_liest(name)));
}

function text_liest(name: string): string {
  return fs.readFileSync(path.join(ORDNER, name), "utf-8");
}

describe("Testkapsel: kein Suite-Lauf schreibt in den echten Datenordner", () => {
  const bauen = dateienMitServer();

  it("es gibt überhaupt Dateien, die den Server bauen — sonst prüft das hier nichts", () => {
    expect(bauen.length, "keine einzige Testdatei baut createApp — die Wache ist blind").toBeGreaterThan(0);
  });

  it("jede davon setzt KEPTA_DATA_DIR", () => {
    const fehlen = ohne(/process\.env\.KEPTA_DATA_DIR\s*=/).filter((n) => !(n in GEMELDET));
    expect(fehlen, `${fehlen.length} Dateien bauen den Server ohne eigenen Datenordner → ${fehlen.join(", ")}`).toEqual([]);
  });

  it("und jede davon kapselt zusätzlich HOME — sonst findet os.homedir() den Nutzer", () => {
    const fehlen = ohne(/process\.env\.HOME\s*=/).filter((n) => !(n in GEMELDET));
    expect(fehlen, `HOME nicht umgebogen in: ${fehlen.join(", ")}`).toEqual([]);
  });

  it("jede gemeldete Ausnahme ist noch nötig — sonst ist die Liste ein Schrank voll leerer Mappen", () => {
    for (const name of Object.keys(GEMELDET)) {
      const pfad = path.join(ORDNER, name);
      if (!fs.existsSync(pfad)) {
        throw new Error(`${GEMELDET[name]}: ${name} gibt es nicht mehr — Ausnahme streichen`);
      }
      const text = fs.readFileSync(pfad, "utf-8");
      const nochOhneKapsel = !/process\.env\.KEPTA_DATA_DIR\s*=/.test(text) || !/process\.env\.HOME\s*=/.test(text);
      expect(nochOhneKapsel, `${GEMELDET[name]}: die Datei kapselt inzwischen — Ausnahme streichen`).toBe(true);
    }
  });

  // Dritte Prüfung war zu streng und ist zurückgenommen: 14 Dateien setzen
  // KEPTA_DATA_DIR ohne es am Ende zurückzugeben. Vitest fährt jede Datei in
  // eigenem Worker, die Leckage bleibt also in der Datei — die Prüfung hätte
  // fünfzehn fremde Dateien rot gemacht, ohne echten Schaden zu verhindern.
  // Die vier Dateien, die diese Scheibe kapselt, geben beide Variablen zurück.
});

// Die lebende Tripwire. Die Fälle oben prüfen das Skript; diese Zeilen prüfen
// den Lauf, in dem sie selbst mitfahren: beim Start die echte Anmeldung
// ablesen, am Ende vergleichen. Vitest fährt die Dateien in parallelen
// Workern — schreibt also irgendeine Datei im Baum den Datenordner nicht
// gekapselt, steht ihr Fund hier, und zwar in der Datei, die nichts davon weiß.
//
// Beabsichtigt eng gefasst: nur die Dateien, die eine Route schreibt.
// `kepta.db` und seine WAL-/SHM-Nachbarn fehlen bewusst, weil eine live
// laufende KEPTA-App sie fortlaufend anfasst — das ist Betrieb, kein
// Testfehler, und eine Wache, die dafür rot wird, wird abgeschaltet.
//
// Ausnahmefall für die Leitung: `KEPTA_HEIMWACHE=aus` lässt die Tripwire
// schweigen, `KEPTA_HEIM=<wurzel>` verschiebt sie in eine Sandkiste.
const WACHE_WURZEL = process.env.KEPTA_HEIM ?? os.homedir();
const WACHE_PFADE = [
  ".kepta/profile.json",
  ".kepta/settings.json",
  ".kepta/scan-config.json",
  ".kepta/sync-journal.jsonl",
  ".kepta/endpoint.json",
];
const WACHE_AUS = process.env.KEPTA_HEIMWACHE === "aus";
let beiStart: ReturnType<typeof aufnahme> | null = null;

beforeAll(() => {
  if (!WACHE_AUS) beiStart = aufnahme(WACHE_WURZEL, WACHE_PFADE);
});

afterAll(() => {
  if (WACHE_AUS || !beiStart) return;
  const funde = vergleicheHeim(beiStart, aufnahme(WACHE_WURZEL, WACHE_PFADE));
  if (funde.length) {
    throw new Error(
      `SCHREIBLAUF unter ${WACHE_WURZEL} während dieses Laufs — ${funde.length} Fund${funde.length === 1 ? "" : "e"}:\n` +
      funde.map((z) => "  " + z).join("\n") +
      `\nUrsache ist eine Testdatei, die createApp ohne KEPTA_DATA_DIR und HOME baut. Regel und Liste: tests/testkapsel.test.ts, Werkzeug: scripts/heim-wache.mjs.`
    );
  }
});

describe("Heim-Tripwire: ihr own Lauf ist die eigentliche Prüfung", () => {
  it("beobachtet genau die Dateien, die ein Server schreibt — nicht die Datenbank", () => {
    expect(WACHE_PFADE).toContain(".kepta/profile.json");
    expect(WACHE_PFADE.some((p) => /kepta\.db/.test(p)), "die Datenbank würde jede live laufende App melden").toBe(false);
  });

  it("hat eine Ausstiegsklappe, die die Leitung setzen kann", () => {
    // Ohne Klappe wird die Wache bei jedem Parallelbetrieb eines echten KEPTA
    // rot — und eine Wache, die im Weg steht, wird aus dem Takt genommen.
    expect(/KEPTA_HEIMWACHE/.test(fs.readFileSync(path.join(ORDNER, "testkapsel.test.ts"), "utf-8"))).toBe(true);
    expect(/KEPTA_HEIM\b/.test(fs.readFileSync(path.join(ORDNER, "testkapsel.test.ts"), "utf-8"))).toBe(true);
  });
});

// Die Wache oben liest Quelltext. Das hier fährt die zwei Türen wirklich:
// POST /api/profile schreibt dorthin, wo die Variablen zeigen — und in keine
// andere. Bewiesen wird beides in einem Lauf, weil ein Test, der nur die
// Heilung zeigt, auch dann grün bliebe, wenn die Route überallhin schriebe.
describe("Testkapsel: die zwei Türen schreiben wirklich in die Kapsel", () => {
  let wurzel = "";
  let vorherHeim: string | undefined;
  let vorherDaten: string | undefined;
  let store: KeptaStore | undefined;

  beforeEach(() => {
    wurzel = fs.mkdtempSync(path.join(os.tmpdir(), "kepta-kapselbeweis-"));
    vorherHeim = process.env.HOME;
    vorherDaten = process.env.KEPTA_DATA_DIR;
    process.env.KEPTA_NO_AUTOSTART = "1";
    process.env.KEPTA_ENCRYPTION = "off";
  });

  afterEach(() => {
    store?.close();
    store = undefined;
    if (vorherHeim === undefined) delete process.env.HOME;
    else process.env.HOME = vorherHeim;
    if (vorherDaten === undefined) delete process.env.KEPTA_DATA_DIR;
    else process.env.KEPTA_DATA_DIR = vorherDaten;
    fs.rmSync(wurzel, { recursive: true, force: true });
  });

  async function profilSetzen(): Promise<void> {
    store = new KeptaStore(path.join(wurzel, "kapsel.db"));
    const app = createApp(store);
    const res = await request(app).post("/api/profile").send({ beruf: "Anwältin" });
    expect(res.status, "die Route nahm das Profil nicht an — der Beweis hinge ins Leere").toBe(200);
  }

  it("KEPTA_DATA_DIR ist die erste Tür: die Datei liegt in der Kapsel", async () => {
    process.env.KEPTA_DATA_DIR = wurzel;
    await profilSetzen();
    const text = fs.readFileSync(path.join(wurzel, "profile.json"), "utf-8");
    expect(JSON.parse(text)).toEqual({ beruf: "Anwältin" });
  });

  it("ohne KEPTA_DATA_DIR ist HOME die zweite Tür: die Datei liegt in HOME/.kepta", async () => {
    process.env.HOME = path.join(wurzel, "heim");
    await profilSetzen();
    const text = fs.readFileSync(path.join(wurzel, "heim", ".kepta", "profile.json"), "utf-8");
    expect(JSON.parse(text)).toEqual({ beruf: "Anwältin" });
  });

  it("und die echte Anmeldung bleibt unberührt: nirgends außer der Kapsel", async () => {
    // Der Fall am 13.10.: ~/.kepta/profile.json trug „beruf" von einer Testdatei.
    // Geprüft wird der Weg, nicht Damians Bestand: die echte Datei wird nur
    // gelesen, nie geschrieben. Vorher lesen ist nötig, weil os.homedir() auf
    // macOS HOME folgt — ist HOME erst umgebogen, nennt es die Kapsel und der
    // Beweis vergliche sich selbst.
    const echteDatei = path.join(process.env.HOME ?? os.homedir(), ".kepta", "profile.json");
    const vorher = fs.existsSync(echteDatei) ? fs.readFileSync(echteDatei, "utf-8") : null;
    process.env.KEPTA_DATA_DIR = wurzel;
    process.env.HOME = path.join(wurzel, "heim");
    await profilSetzen();
    const nachher = fs.existsSync(echteDatei) ? fs.readFileSync(echteDatei, "utf-8") : null;
    expect(nachher, "der Lauf hat in den echten ~/.kepta geschrieben").toBe(vorher);
    // In der Kapsel liegt, was der Fall hinterließ — nur am richtigen Ort, und
    // die zweite Tür bleibt zu, wenn die erste offen ist.
    expect(fs.existsSync(path.join(wurzel, "profile.json"))).toBe(true);
    expect(fs.existsSync(path.join(wurzel, "heim", ".kepta", "profile.json"))).toBe(false);
  });
});

// Die zweite Tür, die die Leitung am 13.10. 21:2x bestellt hat: **melden, wenn
// unter $HOME etwas geschrieben wird.** Der Anlass ist gemessen, nicht erfunden —
// die echte profile.json auf diesem Rechner trug um 14:29:48 {"beruf":"Anwältin"}
// aus einer Testdatei, und um 20:59:46 hatte sie 6.272 Bytes in einem
// KEPTA-NEBEN1-Umschlag. Zwei Schreibläufe in Damians Datenordner an einem Tag,
// keiner von dieser Scheibe.
describe("Heim-Wache: schreibt ein Lauf unter $HOME, wird es gemeldet", () => {
  let heim = "";
  beforeEach(() => {
    heim = fs.mkdtempSync(path.join(os.tmpdir(), "kepta-heimwache-"));
    fs.mkdirSync(path.join(heim, ".kepta"), { recursive: true });
    fs.writeFileSync(path.join(heim, ".kepta", "kepta.db"), "bestand");
  });
  afterEach(() => fs.rmSync(heim, { recursive: true, force: true }));

  it("meldet eine neue Datei unter der Wurzel, mit Name", () => {
    const vorher = aufnahme(heim, STANDARD_PFADE);
    fs.writeFileSync(path.join(heim, ".kepta", "profile.json"), '{"beruf":"Anwaeltin"}');
    const zeilen = vergleicheHeim(vorher, aufnahme(heim, STANDARD_PFADE));
    expect(zeilen.length, "ein Schreiblauf wurde nicht gemeldet").toBe(1);
    expect(zeilen[0]).toMatch(/profile\.json/);
    expect(zeilen[0]).toMatch(/neu/i);
  });

  it("meldet eine geaenderte Datei (Groesse oder Zeit), nicht nur eine neue", () => {
    const vorher = aufnahme(heim, STANDARD_PFADE);
    fs.writeFileSync(path.join(heim, ".kepta", "kepta.db"), "bestand mit deutlich mehr Inhalt als vorher");
    const zeilen = vergleicheHeim(vorher, aufnahme(heim, STANDARD_PFADE));
    expect(zeilen.length).toBe(1);
    expect(zeilen[0]).toMatch(/kepta\.db/);
  });

  it("meldet, wenn etwas verschwindet", () => {
    const vorher = aufnahme(heim, STANDARD_PFADE);
    fs.rmSync(path.join(heim, ".kepta", "kepta.db"));
    const zeilen = vergleicheHeim(vorher, aufnahme(heim, STANDARD_PFADE));
    expect(zeilen.length).toBe(1);
    expect(zeilen[0]).toMatch(/kepta\.db/);
  });

  it("meldet nichts, wenn unter der Wurzel nichts angeruehrt wurde", () => {
    const vorher = aufnahme(heim, STANDARD_PFADE);
    expect(vergleicheHeim(vorher, aufnahme(heim, STANDARD_PFADE))).toEqual([]);
  });

  it("meldet nichts, wenn ausserhalb der beobachteten Pfade geschrieben wird", () => {
    const vorher = aufnahme(heim, STANDARD_PFADE);
    fs.writeFileSync(path.join(heim, "andere-mappe.txt"), "nicht beobachtet");
    expect(vergleicheHeim(vorher, aufnahme(heim, STANDARD_PFADE))).toEqual([]);
  });

  it("der CLI-Durchgang meldet mit Exit 1, ein ruhiger Lauf mit Exit 0", () => {
    const skript = path.join(process.cwd(), "scripts", "heim-wache.mjs");
    const spur = path.join(heim, "aufnahme.json");
    const rufe = (...arg: string[]) => {
      try {
        return { aus: execFileSync(process.execPath, [skript, ...arg], { encoding: "utf-8" }), exit: 0 };
      } catch (e: unknown) {
        const f = e as { stdout?: string; stderr?: string; status?: number };
        return { aus: `${f.stdout ?? ""}${f.stderr ?? ""}`, exit: f.status ?? -1 };
      }
    };

    const start = rufe("aufnahme", "--heim", heim, "--nach", spur);
    expect(start.exit, start.aus).toBe(0);
    expect(rufe("vergleich", "--heim", heim, "--von", spur).exit).toBe(0);

    fs.writeFileSync(path.join(heim, ".kepta", "settings.json"), "geschrieben");
    const laute = rufe("vergleich", "--heim", heim, "--von", spur);
    expect(laute.exit, "ein Schreiblauf wurde nicht gemeldet").toBe(1);
    expect(laute.aus).toMatch(/settings\.json/);
  });

  it("die Standardpfade treffen den Fall von heute: .kepta liegt drin", () => {
    expect(STANDARD_PFADE).toContain(".kepta");
  });
});
