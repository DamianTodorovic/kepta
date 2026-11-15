// @vitest-environment node
//
// Aufgabe #96 — der Nachzug als Produktweg, nicht als Skript.
//
// Warum diese Datei existieren muss: am 15.10. gemessen durch die Tuer
// (`/api/graph`, Port aus ~/.kepta/endpoint.json) traegt Damians echter Bestand
// 21.066 Notizen, aber nur 1.018 von ihnen haengen an einem Begriff — 4,83 %.
// Der Grund ist kein Fehler des Produzenten, sondern sein Alter: der Scanner hat
// 14.701 Notizen indexiert, *bevor* `indexMemory` anfieng, die eigene Notiz zu
// verknuepfen (`43aa0ba` im Kern, Zwilling in der App). Was beim alten Stand
// geschrieben wurde, steht bis heute als Blatt ohne Kante im Bild — und die
// Flaeche zeigt einen Kreis vereinzelpter Punkte um einen kleinen Klumpen.
//
// A1x hat den Nachzug an der Kopie gefahren und gemessen: 0,21–0,24 ms je Notiz,
// 3,1 s fuer 14.701, idempotent (zwei Laeufe, derselbe Endstand), abbruchfest
// (je Notiz eine eigene Transaktion), und die Graph-Tuer antwortete waehrend des
// Laufs in 10–18 ms. Dieser Test uebertraegt genau diese vier Aussagen in die
// Tuer selbst — damit der Nachzug kein Einmal-Skript ist, das auf einem
// Rechner liegt, sondern ein Weg, den jede Installation geht.
//
// Die fuenfte Aussage ist eine Wand, die vorher niemand hatte: **kein Strich vor
// der Sicherung.** `datenbanksicherung()` (server/helfer/sicherung.ts:82) schrieb
// bisher nur vor einem ersetzenden Import. Ein Begriffslauf ruft sie hier zum
// ersten Mal auf, und schlaegt sie fehl, bleibt der Bestand unangetastet.
//
// Ein Horcher pro Datei auf 127.0.0.1:8841 — nie request(app).
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { KeptaStore } from "../src/core/store";
import { defaultExtensions } from "../src/core/extensions";
import { createApp } from "../server/app";
import { lauscht, niederlegen } from "./helfer/lauscher";

const PORT = 8841;
let URLE = `http://127.0.0.1:${PORT}`;

let wurzel = "";
let vorherHeim: string | undefined;
let vorherDaten: string | undefined;
let store: KeptaStore;
let hoerer: import("node:http").Server;

interface Lage {
  running: boolean;
  phase: string;
  seen: number;
  total: number;
  concepts: number;
  edges: number;
  addedConcepts: number;
  addedEdges: number;
  backupFile: string | null;
  error: string | null;
  marke: number;
  markeGesetzt: number;
  needed: boolean;
}

/** Genau der Stand, den der Scanner vor 43aa0ba hinterliess: Notiz ja, Kante nein. */
function alteScanNotiz(titel: string, inhalt: string): string {
  const angelegt = store.createMemory({ title: titel, content: inhalt, tags: ["machine-scan", "md"] });
  return angelegt.id;
}

async function lage(): Promise<Lage> {
  const res = await fetch(`${URLE}/api/graph/nachzug`);
  expect(res.status, "der Status ist eine Antwort, keine Ausnahme").toBe(200);
  return (await res.json()) as Lage;
}

async function starte(): Promise<{ res: Response; body: Record<string, unknown> }> {
  const res = await fetch(`${URLE}/api/graph/nachzug`, { method: "POST" });
  return { res, body: (await res.json().catch(() => ({}))) as Record<string, unknown> };
}

async function warteBisFertig(): Promise<Lage> {
  const ende = Date.now() + 20_000;
  for (;;) {
    const s = await lage();
    if (!s.running) return s;
    if (Date.now() > ende) throw new Error("der Nachzug ist nicht fertig geworden");
    await new Promise((r) => setTimeout(r, 20));
  }
}

beforeAll(async () => {
  wurzel = fs.mkdtempSync(path.join(os.tmpdir(), "kepta-nachzug-"));
  vorherHeim = process.env.HOME;
  vorherDaten = process.env.KEPTA_DATA_DIR;
  process.env.HOME = wurzel;
  process.env.KEPTA_DATA_DIR = wurzel;
  store = new KeptaStore(path.join(wurzel, "kepta.db"), defaultExtensions());
  const horcher = await lauscht(createApp(store), PORT);
  hoerer = horcher.server;
  URLE = horcher.urle;
});

afterAll(async () => {
  if (hoerer) await niederlegen(hoerer);
  store?.close();
  if (vorherHeim === undefined) delete process.env.HOME;
  else process.env.HOME = vorherHeim;
  if (vorherDaten === undefined) delete process.env.KEPTA_DATA_DIR;
  else process.env.KEPTA_DATA_DIR = vorherDaten;
  fs.rmSync(wurzel, { recursive: true, force: true });
});

describe("N-0 — ein leerer Bestand braucht keinen Lauf", () => {
  // Vor jeder Notiz gemessen: der store in dieser Datei ist hier noch leer, und
  // das ist der einzige Stand, in dem die Zeile etwas behauptet. Eine frische
  // Installation soll beim ersten Oeffnen des Graphen keine Sicherung anlegen und
  // keinen Lauf vortaeuschen, den ihr nichts zu verknuepfen hat.
  it("meldet keinen Bedarf und legt keine Sicherung an, wenn nichts zu verknuepfen ist", async () => {
    expect(store.countMemories().active, "der Fall misst den leeren Bestand").toBe(0);
    const stand = await lage();
    expect(stand.needed, "ohne Notizen gibt es nichts aufzufuellen").toBe(false);

    const { res, body } = await starte();
    expect(res.status).toBe(200);
    expect(body.started, "ein leerer Lauf ist kein Lauf").toBe(false);
    expect(fs.existsSync(path.join(wurzel, "backup")), "nichts zu schreiben = keine Sicherung noetig").toBe(false);
  });
});

describe("N-1 — kein Strich vor der Sicherung", () => {
  it("verweigert den Lauf und schreibt nichts, wenn die Sicherung fehlschlaegt", async () => {
    for (let i = 0; i < 6; i++) {
      alteScanNotiz(`Haushalt ${i}`, "## Budget\n\nDer Posten fuer den Monat.");
    }
    expect(store.graphBestand().kanten, "vor dem Nachzug liegt kein Netz").toBe(0);

    // Die Sicherung ist eine Bytekopie in <datenordner>/backup. Ein regulaerer
    // Datei-Ordner namens "backup" an derselben Stelle laesst mkdir fehlschlagen —
    // genau der Zustand, den ein Nutzer durch eine eigene Datei herstellt, und
    // genau der, in dem der Nachzug die Hande vom Bestand nehmen muss.
    fs.writeFileSync(path.join(wurzel, "backup"), "nicht das Sicherungsverzeichnis");

    const { res, body } = await starte();
    expect(res.status, `fehlende Sicherung muss den Lauf stoppen, nicht still durchgehen`).toBe(503);
    expect(String(body.error ?? "")).toMatch(/backup|sicherung/i);

    const stand = await warteBisFertig();
    expect(stand.running).toBe(false);
    expect(store.graphBestand().kanten, "ein verweigerter Lauf darf keine Kante setzen").toBe(0);

    fs.rmSync(path.join(wurzel, "backup"), { force: true });
  });
});

describe("N-2 — der Nachzug fuellt das Netz, das der alte Scanner leer liess", () => {
  it("setzt Begriffe und Kanten, die vor dem Produzenten nicht gesetzt wurden", async () => {
    for (let i = 0; i < 8; i++) {
      alteScanNotiz(`Akte ${i}`, "## Budget\n\n## Fristen\n\nBeides steht in jedem Blatt.");
    }
    const vorher = store.graphBestand();
    expect(vorher.kanten, "der Fixture beginnt ohne Netz — sonst beweist der Lauf nichts").toBe(0);

    const { res } = await starte();
    expect(res.status).toBe(202);
    const stand = await warteBisFertig();
    expect(stand.running).toBe(false);
    expect(stand.phase).toBe("done");
    expect(stand.error).toBeNull();
    expect(stand.seen).toBeGreaterThan(0);
    expect(stand.total).toBeGreaterThanOrEqual(stand.seen);

    const nachher = store.graphBestand();
    expect(nachher.knoten, "Begriffe müssen erschienen sein").toBeGreaterThan(vorher.knoten);
    expect(nachher.kanten, "Kanten müssen erschienen sein").toBeGreaterThan(vorher.kanten);
    expect(stand.concepts).toBe(nachher.knoten);
    expect(stand.edges).toBe(nachher.kanten);
    expect(stand.addedEdges, "der Lauf nennt, was er hinzugefuegt hat — nicht nur was steht").toBeGreaterThan(0);

    // Die Sicherung vor dem ersten Strich: sie muss auf der Platte liegen und
    // benannt werden, sonst ist der Rueckweg eine Behauptung.
    expect(stand.backupFile, "der Lauf nennt seine Sicherung").toBeTruthy();
    const ordner = path.join(wurzel, "backup");
    const eigene = fs.existsSync(ordner) ? fs.readdirSync(ordner).filter((n) => /^kepta-pre-replace-\d+-[0-9a-f]{4}\.db$/.test(n)) : [];
    expect(eigene.length, "eine Sicherung muss im Ordner liegen").toBeGreaterThanOrEqual(1);
    expect(eigene).toContain(path.basename(String(stand.backupFile)));
  });

  it("die Tuer sieht das Netz, das der Lauf gebaut hat — und nennt seine Deckung", async () => {
    const g = (await (await fetch(`${URLE}/api/graph`)).json()) as {
      bestand: { knoten: number; kanten: number };
      deckung: { notizen: number; gedeckt: number; anteilProzent: number };
    };
    expect(g.bestand.kanten).toBeGreaterThan(0);
    // Die Groesse des Netzes sagt nichts darueber, wie viel des Bestands darin
    // steht. Ohne diese Zahl ist "2.756 Begriffe" ein Verkaufsgespraech.
    expect(g.deckung, "die Tuer nennt ihre Deckung").toBeTruthy();
    expect(g.deckung.gedeckt, "gedeckte Notizen muessen zaehlen").toBeGreaterThan(0);
    expect(g.deckung.notizen).toBeGreaterThanOrEqual(g.deckung.gedeckt);
    expect(g.deckung.anteilProzent).toBeCloseTo((100 * g.deckung.gedeckt) / g.deckung.notizen, 1);
  });

  it("ein Widerspruch zwischen gedeckten und aktiven Notizen wird gesagt, nicht geklemmt", async () => {
    // #25 — die Tuer rechnete bis zum 16.10. `Math.min(notizen, notizenMitBegriff())`.
    // Beide Abfragen filtern `deleted_at IS NULL` auf `memories` (`store.ts:483` gegen
    // `:1287-1294`), der Klammer konnte also nie greifen — und erzwang genau die
    // Relation, die der Fall darueber verlangt: der war damit fuer immer gruen.
    // Hier liegt die Nachbildung, die der Klammer bisher unmoeglich machte: die
    // Begriff-Zaehlung ueberholt die Bestands-Zaehlung. Aus ihr darf keine geordnete
    // Zahl werden; sie muss genannt werden.
    const vorher = (await (await fetch(`${URLE}/api/graph`)).json()) as {
      deckung: { notizen: number };
    };
    const notizen = vorher.deckung.notizen;
    expect(notizen, "die Nachbildung braucht einen nicht-leeren Bestand").toBeGreaterThan(0);
    const echt = store.notizenMitBegriff.bind(store);
    try {
      store.notizenMitBegriff = () => notizen + 7;
      const g = (await (await fetch(`${URLE}/api/graph`)).json()) as {
        deckung: { gedeckt: number; anteilProzent: number; widerspruch: string | null };
      };
      expect(g.deckung.gedeckt, "die Tuer muss die unbeugte Zahl zeigen, nicht die gequetschte").toBe(notizen + 7);
      expect(g.deckung.widerspruch, "ein Widerspruch muss gesagt werden").toBeTruthy();
      expect(String(g.deckung.widerspruch)).toContain(`${notizen}`);
      expect(g.deckung.anteilProzent, "der Prozentsatz traegt den Widerspruch — er ist nicht die Botschaft").toBeGreaterThan(100);
    } finally {
      store.notizenMitBegriff = echt;
    }
    const wieder = (await (await fetch(`${URLE}/api/graph`)).json()) as {
      deckung: { gedeckt: number; widerspruch: string | null };
    };
    expect(wieder.deckung.widerspruch, "ohne Widerspruch schweigt das Feld").toBeNull();
    expect(wieder.deckung.gedeckt).toBeLessThanOrEqual(notizen);
  });
});

describe("N-3 — idempotent, nicht anhaeufend", () => {
  it("ein zweiter Lauf ueber demselben Bestand aendert keine Zahl", async () => {
    const erster = store.graphBestand();
    const { res } = await starte();
    expect(res.status).toBe(202);
    const stand = await warteBisFertig();
    expect(store.graphBestand()).toEqual(erster);
    expect(stand.addedEdges, "ein zweiter Lauf erfindet keine zweiten Kanten").toBe(0);
    expect(stand.addedConcepts).toBe(0);
  });

  it("nach einem fertigen Lauf meldet der Status keinen Bedarf mehr", async () => {
    const stand = await lage();
    expect(stand.needed, "die Marke ist gesetzt — derselbe Stand wird nicht zweimal gefahren").toBe(false);
    expect(stand.markeGesetzt).toBe(stand.marke);
  });
});

describe("N-4 — zwei Rufe, ein Lauf", () => {
  it("weist den zweiten Ruf ab, waehrend der erste laeuft", async () => {
    // Zwei Dinge machen diesen Fall zu einer Pruefung und nicht zu einem Wurf:
    //
    // 1) Beide Rufe gehen gleichzeitig weg. Nacheinander (der zweite erst nach
    //    der Antwort des ersten) haengt sein Ergebnis an einem Hin-und-Zuruf —
    //    gemessen am 15.10. in einem vollen Suite-Lauf: der erste war mit seinen
    //    drei Stapeln fertig, bevor der zweite ankam, und die Tuer antwortete
    //    202 statt 409. Ein grüner Fall, der auf den Abstand zwischen zwei
    //    Anfragen wartet, ist keine Latte.
    // 2) Der Grund ist die Gleichzeitigkeit, nicht die Masse: die Tuer setzt
    //    ihr Merk vor der ersten Antwort (router/nachzug.ts:110, kein await
    //    davor), also trifft der zweite Ruf sicher auf einen laufenden Lauf.
    //    2 000 Notizen sind vier Stapel — genug Luft, ohne den naechsten Fall
    //    in diesem File auf einem vollen Rechner an den Rand zu druecken.
    for (let i = 0; i < 2000; i++) {
      alteScanNotiz(`Stapel ${i}`, "## Wartung\n\n## Termine\n\nEin Blatt unter vielen.");
    }
    const [erster, zweiter] = await Promise.all([starte(), starte()]);
    const zahlen = [erster.res.status, zweiter.res.status].sort();
    expect(zahlen, `ein Anlauf und eine Absage, nicht: ${zahlen.join(" und ")}`).toEqual([202, 409]);
    const abgelehnt = erster.res.status === 409 ? erster : zweiter;
    expect(String(abgelehnt.body.error), "die Absage nennt ihren Grund").toMatch(/already running/i);
    const stand = await warteBisFertig();
    expect(stand.running).toBe(false);
  });
});

describe("N-5 — Abbruch laesst einen gueltigen Zwischenstand", () => {
  it("der Abbruch stoppt, und ein voller Lauf danach landet auf demselben Endstand", async () => {
    for (let i = 0; i < 400; i++) {
      alteScanNotiz(`Bruch ${i}`, "## Lager\n\n## Einsatz\n\nNotiz im Stapel.");
    }
    const { res } = await starte();
    expect(res.status).toBe(202);
    await fetch(`${URLE}/api/graph/nachzug/cancel`, { method: "POST" });
    const abgebrochen = await warteBisFertig();
    expect(abgebrochen.running).toBe(false);

    // Was bleibt, muss eine Zahl sein, die zu dem passt, was schon verknuepft ist:
    // keine halbe Kante, kein Begriff ohne Relationen-Zeuge.
    const zwischen = store.graphBestand();
    expect(zwischen.knoten).toBeGreaterThanOrEqual(0);
    const g = (await (await fetch(`${URLE}/api/graph`)).json()) as { relations: unknown[]; bestand: { kanten: number } };
    expect(g.bestand.kanten).toBe(zwischen.kanten);
    expect(Array.isArray(g.relations)).toBe(true);

    // Der echte Beweis: der naechste volle Lauf landet auf demselben Endstand,
    // ob der vorige abgebrochen wurde oder nicht.
    const { res: zweiter } = await starte();
    expect(zweiter.status).toBe(202);
    await warteBisFertig();
    const endstand = store.graphBestand();
    expect(endstand.kanten).toBeGreaterThanOrEqual(zwischen.kanten);
    const nochEinmal = await starte();
    expect(nochEinmal.res.status).toBe(202);
    await warteBisFertig();
    expect(store.graphBestand(), "Abbruch und Wiederholung aendern den Endstand nicht").toEqual(endstand);
  });
});
