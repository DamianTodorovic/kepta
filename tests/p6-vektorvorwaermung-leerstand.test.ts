// @vitest-environment node
//
// Punkt 6, 25.10.2026 — die Vektor-Spur soll beim ersten Leerlauf gebaut werden, nicht an der
// Boot-Achse und nicht an der ersten Suche des Menschen (Zelle der Leitung, 25.10. 13:06
// MEZ (+0100), Schlag (a)).
//
// Gemessen, bevor diese Datei existierte (Blatt p6-104-vektorspur-2510.md, eigne Kapsel,
// Fassung 3.2.57, Head d3a1cd1): zwei echte Kaltstarts — Boot 0,568 s und 0,654 s, erster
// semantischer Griff 1 462,26 ms und 1 493,81 ms, Dauer-RSS +475,0 MiB und +477,8 MiB, warmer
// Vektorpfad 58,19 bis 74,65 ms. Die Boot-Achse traegt die Vektorlast nicht — sie liegt
// vollstaendig an der ersten Suche. Wer sie vor die Tuer zieht, macht den Boot von 0,57 s auf
// rund 2,1 s und legt 477 MiB vor jedem ersten Griff hin.
//
// Ein Vorlauf beim Start waere eine Einmalgabe. `store.datenGeneration()` steigt bei JEDEM
// Schreibfall — und der Trigger auf den Chunks (src/core/store.ts:969) hat keine WHEN-Klausel,
// also zaehlt auch jeder Einbettungs-Nachschub der Hintergrund-Queue. Die Folge: der erste
// Schreibfall nach dem Boot wirft die gebaute Spur weg, und die naechste semantische Suche zahlt
// die 1,5 Sekunden erneut. Fall 5 haelt diesen Nachweis, Fall 6 die Heilung, Fall 9 die
// Beruhigung, die eine Vorwaermung mitten im Schreibstorm verbietet, Fall 8 den Schutz vor dem
// heissen Wiederholen.
//
// WAS HEUTE ROT IST: `waermeVektorSpur`, `vektorSpurStatistik`, `vektorSpurSteht` und der
// Leerlauf-Helfer existieren nicht, und `/api/health` nennt keine Vektor-Spur. Alle zwoelf Faelle
// fallen genau daran — bestellte Erwartung, kein Defekt dieser Datei.
//
// DIE GEGENPROBE (Fall 12) ist der zweite Teil des Auftrags: ein Boot, der auf die Vektor-Spur
// *wartet*, wird nicht schneller. Darum huetet diese Datei die Boot-Achse am Quelltext und weist
// ihren Biss an fuenf gebauten Texten nach — ein Hueter, der nur gruen sein kann, waere kein Zeugnis.
import { EventEmitter } from "node:events";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { KeptaStore } from "../src/core/store";
import { defaultExtensions } from "../src/core/extensions";
import { schluesselbundKeyProvider } from "../src/core/schluessel";
import { indexMemory, DEFAULT_EMBED_MODEL } from "../src/core/engine";
import { createApp } from "../server/app";
import { lauscht, niederlegen } from "./helfer/lauscher";

const NOTIZEN = 200;
const DIM = 64;
const PORT = 8839;

// Ein Query-Vektor aus derselben Welt wie die geschriebenen Abschnitte. Ohne diese Decke griffe
// `embedQuery` ins Loopback-Ollama: ohne Anbieter kommt null zurueck, die Vektor-Spur wuerde nie
// gebaut, und der Fall fiele aus einem Grund, der nicht sein Gegenstand ist. Deterministisch und
// ohne Ausgang.
vi.mock("../src/core/embeddings", async (importOriginal) => {
  const echt = await importOriginal<typeof import("../src/core/embeddings")>();
  return {
    ...echt,
    embedQuery: async () => {
      const v = new Float32Array(DIM);
      for (let i = 0; i < DIM; i++) v[i] = (i % 7) - 3;
      return v;
    },
  };
});

interface Statistik {
  vorwaermungen: number;
  suchbauten: number;
  zeilen: number;
}

type Engine = {
  waermeVektorSpur: (s: KeptaStore) => number;
  vektorSpurStatistik: Statistik;
  vektorSpurSteht: (s: KeptaStore) => { generation: number; veraltet: boolean };
  searchMemories: typeof import("../src/core/engine")["searchMemories"];
};

const engine = async (): Promise<Engine> => (await import("../src/core/engine")) as never;

function kapsel(): { home: string; schluessel: string; entfernen: () => void } {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "p6-vorwaerm-"));
  const schluessel = Array.from({ length: 64 }, () => "0123456789abcdef"[Math.floor(Math.random() * 16)]).join("");
  return { home, schluessel, entfernen: () => fs.rmSync(home, { recursive: true, force: true }) };
}

/** Ein Vektor je Zeile, nur aus der Kennung abgeleitet — es geht um Last, nicht um Trefferqualitaet. */
function zeilenVektor(kennung: string): Float32Array {
  const v = new Float32Array(DIM);
  let x = 2166136261;
  for (const ch of kennung) x = ((x ^ ch.charCodeAt(0)) * 16777619) >>> 0;
  let norm = 0;
  for (let i = 0; i < DIM; i++) {
    x = (x * 1664525 + 1013904223) >>> 0;
    const w = (x / 0xffffffff) * 2 - 1;
    v[i] = w;
    norm += w * w;
  }
  const n = Math.sqrt(norm) || 1;
  for (let i = 0; i < DIM; i++) v[i]! /= n;
  return v;
}

/** Bestand mit Abschnitten UND Vektoren: ein Import legt embedding=NULL an, hier fuellt die eigne Hand. */
function fuelleMitVektoren(home: string, schluessel: string): KeptaStore {
  const vorherHeim = process.env.HOME;
  const vorherKey = process.env.KEPTA_DB_KEY;
  const vorherDaten = process.env.KEPTA_DATA_DIR;
  process.env.HOME = home;
  // Ohne den ausdruecklichen Datenordner faellt legacyJsonPaths() auf ~/.kepta zurueck und
  // der Lauf saugt Damians echte Notizen ein. Die Wache in tests/testkapsel.test.ts hielt
  // bisher zwei Umgebungen fest, die Kapsel braucht drei.
  process.env.KEPTA_DATA_DIR = path.join(home, ".kepta");
  process.env.KEPTA_DB_KEY = schluessel;
  try {
    const store = new KeptaStore(undefined, {
      ...defaultExtensions(),
      keys: schluesselbundKeyProvider(path.join(home, ".kepta")),
    });
    for (let i = 0; i < NOTIZEN; i++) {
      const titel = `Vorrat ${String(i).padStart(4, "0")}`;
      const inhalt = `Haltestelle ${i} nennt die Frist und den Wert ${i * 7}. Der Anbieter haelt die Stufe ${i % 5}.`;
      indexMemory(store, store.createMemory({ title: titel, content: inhalt, tags: [`thema${i % 20}`] }).id);
    }
    for (const c of store.chunksNeedingEmbedding(10_000, DEFAULT_EMBED_MODEL)) {
      store.setEmbedding(c.memoryId, c.seq, zeilenVektor(`${c.memoryId}:${c.seq}`), DEFAULT_EMBED_MODEL);
    }
    return store;
  } finally {
    process.env.HOME = vorherHeim ?? "";
    if (vorherDaten === undefined) delete process.env.KEPTA_DATA_DIR;
    else process.env.KEPTA_DATA_DIR = vorherDaten;
    if (vorherKey === undefined) delete process.env.KEPTA_DB_KEY;
    else process.env.KEPTA_DB_KEY = vorherKey;
  }
}

/** Die eine Aenderung, die den Unterschied macht: ein Schreibfall, kein Text, keine Suchwort-Arbeit. */
function schreibFall(store: KeptaStore): void {
  const record = store.createMemory({ title: "Nachtrag", content: "Ein Nachtrag, der die Generation weiterstellt.", tags: ["nachtrag"] });
  indexMemory(store, record.id);
}

const sucheMitVektor = async (store: KeptaStore) => {
  const { searchMemories } = await engine();
  return searchMemories(store, { query: "Haltestelle", limit: 10, tracks: { vector: true } } as never);
};

/**
 * Die Klammer um einen Aufruf, Klammer fuer Klammer gezaehlt — eine faule Regex schnitte die
 * Klammer des helfenden Objekts selbst ab und verwerfe damit den guten Text.
 */
function reichweiteDesAufrufs(quelle: string, marke: string): [number, number] | null {
  const anfang = quelle.indexOf(`${marke}(`);
  if (anfang < 0) return null;
  let tiefe = 0;
  for (let i = anfang + marke.length; i < quelle.length; i++) {
    const ch = quelle[i];
    if (ch === "(") tiefe += 1;
    else if (ch === ")") {
      tiefe -= 1;
      if (tiefe === 0) return [anfang, i + 1];
    }
  }
  return null; // offene Klammer: der Hueter meldet "nicht geprueft" statt Erfolg
}

/**
 * Die Huete ueber der Boot-Achse, in einer Funktion, damit ihr Biss selbst geprueft werden kann
 * (Fall 10) statt als Behauptung im Kommentar zu stehen.
 */
function haelteBootAchse(quelle: string): { ok: boolean; grund: string } {
  if (!quelle.includes("beimLeerstand(")) return { ok: false, grund: "keine Vorwaermung am Leerlauf verankert" };
  if (/await\s+waermeVektorSpur\b/.test(quelle)) return { ok: false, grund: "der Boot wartet auf die Vektor-Spur" };
  const reichweite = reichweiteDesAufrufs(quelle, "beimLeerstand");
  if (!reichweite) return { ok: false, grund: "der Leerlauf-Aufruf ist nicht auszugleichen — nicht geprueft" };
  const [anfang, ende] = reichweite;
  if (/waermeVektorSpur\s*\(/.test(quelle.slice(0, anfang) + quelle.slice(ende))) {
    return { ok: false, grund: "Vorwaermung liegt ausserhalb des Leerlauf-Helfers, also in der Boot-Achse" };
  }
  return { ok: true, grund: "die Vektor-Spur wird nur beim Leerlauf gebaut" };
}

const bootQuelle = (): string => fs.readFileSync(path.join(process.cwd(), "server/bootstrap.ts"), "utf8");

describe("P6-105 — die Vektor-Spur beim ersten Leerlauf", () => {
  let k = kapsel();
  let store: KeptaStore | undefined;
  let hoerer: import("node:http").Server | undefined;

  beforeEach(() => {
    k = kapsel();
  });
  afterEach(async () => {
    if (hoerer) await niederlegen(hoerer);
    hoerer = undefined;
    store?.close();
    store = undefined;
    k.entfernen();
    vi.useRealTimers();
  });
  afterAll(() => {
    vi.useRealTimers();
  });

  it("zaehlt die Vorwaermung, und die Vorwaermung allein baut die Spur", async () => {
    store = fuelleMitVektoren(k.home, k.schluessel);
    const erwarteteZeilen = store.allEmbeddableChunks().filter((c) => c.model === DEFAULT_EMBED_MODEL).length;
    expect(erwarteteZeilen).toBeGreaterThan(0);

    const e = await engine();
    expect(typeof e.waermeVektorSpur).toBe("function");
    const laeufeVorher = e.vektorSpurStatistik.vorwaermungen;

    expect(e.waermeVektorSpur(store)).toBe(erwarteteZeilen);
    expect(e.vektorSpurStatistik.vorwaermungen).toBe(laeufeVorher + 1);
    expect(e.vektorSpurStatistik.zeilen).toBe(erwarteteZeilen);
    // Die Vorwaermung ist kein Suchlauf: sie darf nirgends eine Such-Baustelle melden.
    expect(e.vektorSpurStatistik.suchbauten).toBe(0);
  });

  it("haelt die Koste: ohne Vorwaermung zahlt die erste semantische Suche den Spur-Aufbau", async () => {
    store = fuelleMitVektoren(k.home, k.schluessel);
    const { vektorSpurStatistik } = await engine();
    const bautenVorher = vektorSpurStatistik.suchbauten;

    const ergebnis = await sucheMitVektor(store);
    expect(ergebnis.hits.length).toBeGreaterThan(0);
    expect(vektorSpurStatistik.suchbauten).toBe(bautenVorher + 1);
  });

  it("nach der Vorwaermung zahlt die erste Suche den Aufbau nicht mehr", async () => {
    store = fuelleMitVektoren(k.home, k.schluessel);
    const e = await engine();
    e.waermeVektorSpur(store);
    const bautenVorher = e.vektorSpurStatistik.suchbauten;

    const ergebnis = await sucheMitVektor(store);
    expect(ergebnis.hits.length).toBeGreaterThan(0);
    expect(e.vektorSpurStatistik.suchbauten).toBe(bautenVorher);
  });

  it("sieht die Tuer, wann immer die Datenwelt ihre Spur weggenommen hat", async () => {
    store = fuelleMitVektoren(k.home, k.schluessel);
    const e = await engine();
    expect(e.vektorSpurSteht(store).veraltet).toBe(true); // noch gar nicht gebaut
    e.waermeVektorSpur(store);
    expect(e.vektorSpurSteht(store).veraltet).toBe(false);
    schreibFall(store);
    expect(e.vektorSpurSteht(store).veraltet).toBe(true); // ein Schreibfall, und die Spur ist fort
  });

  it("haelt fest: ein Schreibfall nach dem Boot wirft die Spur, und die naechste Suche zahlt erneut", async () => {
    store = fuelleMitVektoren(k.home, k.schluessel);
    const e = await engine();
    e.waermeVektorSpur(store);
    const bautenNachVorlauf = e.vektorSpurStatistik.suchbauten;

    await sucheMitVektor(store);
    expect(e.vektorSpurStatistik.suchbauten).toBe(bautenNachVorlauf); // der Vorlauf hat gehalten

    schreibFall(store);
    await sucheMitVektor(store);
    // Ohne den wiederholten Auftrag waere das die Zahl, die der Mensch sieht: 1,5 s an der
    // zweiten Suche des Tages, nur weil dazwischen etwas gespeichert wurde.
    expect(e.vektorSpurStatistik.suchbauten).toBe(bautenNachVorlauf + 1);
  });

  it("und die Vorwaermung nach dem Schreibfall holt den Aufbau zurueck in die Stille", async () => {
    store = fuelleMitVektoren(k.home, k.schluessel);
    const e = await engine();
    e.waermeVektorSpur(store);
    schreibFall(store);
    const laeufeVorher = e.vektorSpurStatistik.vorwaermungen;

    expect(e.waermeVektorSpur(store)).toBeGreaterThan(0);
    expect(e.vektorSpurStatistik.vorwaermungen).toBe(laeufeVorher + 1);

    const bautenVorher = e.vektorSpurStatistik.suchbauten;
    await sucheMitVektor(store);
    expect(e.vektorSpurStatistik.suchbauten).toBe(bautenVorher);
  });

  it("der Leerlauf-Laeufer laesst genau einmal los, und nur in der Stille", async () => {
    const { beimLeerstand, LEERLAUF_FENSTER_MS } = await import("../server/helfer/leerstand");
    vi.useFakeTimers();

    let laeufe = 0;
    let offen = true;
    let stille = 0; // freie Millisekunden, von der Hand gefuehrt
    const steuer = beimLeerstand({
      bedarf: () => offen,
      freieSeitMs: () => stille,
      fensterMs: LEERLAUF_FENSTER_MS,
      pruefMs: 250,
      tun: () => { laeufe += 1; offen = false; },
    });

    // Beschaefigt: der Laeufer darf nicht anfangen, egal wie oft die Uhr weiterlaeuft.
    vi.advanceTimersByTime(20 * LEERLAUF_FENSTER_MS);
    expect(laeufe).toBe(0);

    // Erste Stille, die lang genug ist: genau ein Lauf, und der Auftrag ist erfuellt.
    stille = LEERLAUF_FENSTER_MS;
    vi.advanceTimersByTime(4 * LEERLAUF_FENSTER_MS);
    expect(laeufe).toBe(1);

    // Und es bleibt bei einem — die Spur wird nicht in jeder stillen Sekunde neu gebaut.
    vi.advanceTimersByTime(40 * LEERLAUF_FENSTER_MS);
    expect(laeufe).toBe(1);

    // Ein neuer Auftrag (ein Schreibfall) wirkt ohne Neustart: beim naechsten Leerlauf erneut.
    offen = true;
    vi.advanceTimersByTime(4 * LEERLAUF_FENSTER_MS);
    expect(laeufe).toBe(2);
    steuer.abbrechen();
  });

  it("ein Wurf im Vorlauf beendet den Laeufer, und die Maschine holt nicht jede Sekunde neu aus", async () => {
    const { beimLeerstand } = await import("../server/helfer/leerstand");
    vi.useFakeTimers();

    let versuche = 0;
    let grund: unknown;
    const steuer = beimLeerstand({
      bedarf: () => true, // die Vorwaermung gelingt nie, der Auftrag bliebe offen
      freieSeitMs: () => 10_000,
      fensterMs: 1_000,
      pruefMs: 250,
      tun: () => { versuche += 1; throw new Error("Platte gesperrt"); },
      fehler: (e) => { grund = e; },
    });

    vi.advanceTimersByTime(40 * 250);
    expect(versuche).toBe(1);
    expect((grund as Error).message).toBe("Platte gesperrt");
    steuer.abbrechen();
  });

  it("die Beruhigung gilt erst, wenn die Generation stillsteht — nicht mitten im Schreibstorm", async () => {
    const { ruheAuftrag } = await import("../server/helfer/leerstand");
    let generation = 7;
    let veraltet = true;
    const bedarf = ruheAuftrag({ stehe: () => ({ veraltet, generation }) });

    expect(bedarf()).toBe(false); // erster Takt: noch kein stillstandiger Zeuge
    generation = 8;
    expect(bedarf()).toBe(false); // die Generation wechselt zwischen den Takten — Sturm, kein Auftrag
    expect(bedarf()).toBe(true); // zweimal derselbe Stand, und die Spur ist doch weg
    veraltet = false;
    expect(bedarf()).toBe(false); // gebaut: nichts mehr zu holen
  });

  it("die Tuer meldet ihre Vorwaermung im selben Leib, den die Messung liest", async () => {
    store = fuelleMitVektoren(k.home, k.schluessel);
    const horcher = await lauscht(createApp(store), PORT);
    hoerer = horcher.server;

    const antwort = await fetch(`${horcher.urle}/api/health`);
    expect(antwort.status).toBe(200);
    const leib = await antwort.json() as { vektorSpur?: Statistik };
    expect(leib.vektorSpur).toBeDefined();
    expect(typeof leib.vektorSpur!.vorwaermungen).toBe("number");
    expect(typeof leib.vektorSpur!.suchbauten).toBe("number");
    expect(typeof leib.vektorSpur!.zeilen).toBe("number");
  });

  it("zaehlt die Mittelware die offenen Antworten, und hoert sie wieder auf", async () => {
    const { leerstandsmittelware, laeuftAnfragen, freieSeitMs, leerstandZuruecksetzen } =
      await import("../server/helfer/leerstand");
    leerstandZuruecksetzen();

    const res = new EventEmitter();
    let weiter = 0;
    leerstandsmittelware({} as never, res as never, () => { weiter += 1; });
    expect(weiter).toBe(1);
    expect(laeuftAnfragen()).toBe(1);
    expect(freieSeitMs()).toBe(0); // eine laufende Antwort ist keine Stille

    res.emit("finish");
    expect(laeuftAnfragen()).toBe(0);
    expect(freieSeitMs()).toBeLessThan(10_000);

    // Derselbe Abschluss ein zweites Mal (finish und close auf einer Antwort): kein Unterzaehlen.
    res.emit("close");
    expect(laeuftAnfragen()).toBe(0);
    leerstandZuruecksetzen();
  });

  it("die Huete ueber der Boot-Achse gilt, und sie hat Biss", () => {
    expect(haelteBootAchse(bootQuelle()).ok).toBe(true);

    // Gegenprobe an gebauten Texten — derselbe Hueter, beide Richtungen:
    // (1) synchron neben dem Helfer, (2) wartend, (3) gar nicht verankert, (4) ungeglichen.
    expect(haelteBootAchse(`beimLeerstand({ tun: () => {} }); waermeVektorSpur(store); const server = app.listen(PORT);`).ok).toBe(false);
    expect(haelteBootAchse(`beimLeerstand({ tun: () => {} }); await waermeVektorSpur(store);`).ok).toBe(false);
    expect(haelteBootAchse(`console.log("nichts vorwaermt");`).ok).toBe(false);
    expect(haelteBootAchse(`beimLeerstand({ tun: () => { waermeVektorSpur(store); `).ok).toBe(false);
    // Und der gute Text: dieselbe Zeile, aber innerhalb des Helfers.
    expect(haelteBootAchse(`beimLeerstand({ bedarf: () => true, tun: () => { waermeVektorSpur(store); } });`).ok).toBe(true);
  });
});
