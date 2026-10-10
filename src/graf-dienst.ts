// Der Graf-Dienst: fuellt das Kuvert aus src/core/graf-vertrag.ts aus dem Store
// und bedient GET /api/graph/bild (A9 §6/§8 Schritt 6).
//
// Dieser Datei-Zweig liegt bewusst NICHT in src/core: tests/core/boundary.test.ts
// haelt den Kern auf Node-Bordmittel, src/core und SQLite — ein HTTP-Anliegen mit
// ETag, Cache und Kuvert darf die presentationsschicht (src/ui/graph.ts) nicht
// von innen nach aussen anfassen. Die Rechnung bleibt Kernlogik (graf-vertrag,
// graf-terms, graf-kraft), die Verdrahtung ist Serverlogik.
//
// Drei Dinge halten diesen Pfad bezahlbar und ehrlich:
//   1. Er haengt an store.datenGeneration() — jede Mutation wirft das Bild, ohne
//      Mutation kostet das Oeffnen nichts (dasselbe Muster wie die semantische
//      Karte der App, server/helfer/semantik.ts:12-27).
//   2. Der Privatheits-Floor ist aus src/core/mcp.ts:531-551 hierher *kopiert*,
//      nicht daraus herausgezogen: beide Tueren sollen dieselbe Welt zeigen, und
//      die MCP-Tuer hat eigene Eigentümer (F1), die darf dieser Pfad nicht umbauen.
//   3. Eine Rechnung, die zwei Anfragen deckt, ist ein Cache-Treffer und wird als
//      einer gemeldet (stempel.berechent). Weil der ganze Pfad synchron ist
//      (SQLite schreibt synchron), koennen sich zwei Rechnungen nie ueberschneiden
//      — der Single-Flight ist hier der Laufzeit-Modell-Mechanismus, kein Wächter.
import crypto from "node:crypto";
import type { KeptaStore } from "./core/store";
import {
  GRAF_VERTRAG,
  KAPPE,
  LAYOUT_VERSION,
  WELT_GROESSE,
  type GrafAntwort,
  type GrafKante,
  type GrafKnoten,
  type GrafKuerzung,
  type GrafSicht,
} from "./core/graf-vertrag";
import { baueNotizBild, type NotizKnoten, type NotizVektor } from "./ui/graph";
import { berechneWelt, type KraftKante } from "./core/graf-kraft";

/** Seitengroesse des Bestand-Durchlaufs (listMemories kappt selbst bei 5000). */
const NOTIZ_SEITE = 500;
/** Obergrenze des Durchlaufs; was darueber liegt, meldet die Bilanz als uebrig. */
const NOTIZ_MAX = 20_000;

export interface GrafParameter {
  sicht: GrafSicht;
  entitaet?: string;
  tiefe: number;
  knoten: number;
  kanten: number;
  layout: boolean;
}

export type GrafErgebnis =
  | { status: 200; etag: string; antwort: GrafAntwort }
  | { status: 304; etag: string }
  | { status: 400; error: string };

const ERLAUBT: readonly string[] = ["sicht", "entitaet", "tiefe", "knoten", "kanten", "layout"];

function ganzeZahl(wert: unknown, name: string, min: number, max: number, fallback: number): { wert: number } | { fehler: string } {
  if (wert === undefined) return { wert: fallback };
  const text = String(wert);
  if (!/^\d+$/.test(text)) return { fehler: `${name} takes a whole number between ${min} and ${max}` };
  const zahl = Number(text);
  if (zahl < min || zahl > max) return { fehler: `${name} takes a whole number between ${min} and ${max}` };
  return { wert: zahl };
}

/**
 * Liest die Query. Ein unbekannter Parameter ist eine Antwort mit Grund, kein
 * Ignorieren: `?width=1200` wurde frueher still verschluckt, waehrend die
 * CHANGELOG dem Pfad ein serverseitiges Layout in Breite und Hoehe zuschrieb
 * (A9 B-1/B-2, Ziel A9-G10).
 */
export function leseParameter(query: Record<string, unknown>): GrafParameter | { fehler: string } {
  for (const schluessel of Object.keys(query)) {
    if (!ERLAUBT.includes(schluessel)) {
      return { fehler: `unknown parameter '${schluessel}' — this endpoint reads only ${ERLAUBT.join(", ")}. Nothing was calculated.` };
    }
  }
  const sichtRoh = query.sicht === undefined ? "konzept" : String(query.sicht);
  if (sichtRoh !== "konzept" && sichtRoh !== "notiz") return { fehler: "sicht takes exactly one of konzept, notiz" };
  const layoutRoh = query.layout === undefined ? "1" : String(query.layout);
  if (layoutRoh !== "1" && layoutRoh !== "0") return { fehler: "layout takes exactly one of 1, 0" };
  const tiefe = ganzeZahl(query.tiefe, "tiefe", 1, 4, 2);
  if ("fehler" in tiefe) return tiefe;
  const knoten = ganzeZahl(query.knoten, "knoten", 1, 2000, KAPPE.knoten);
  if ("fehler" in knoten) return knoten;
  const kanten = ganzeZahl(query.kanten, "kanten", 1, 8000, KAPPE.kanten);
  if ("fehler" in kanten) return kanten;
  let entitaet: string | undefined;
  if (query.entitaet !== undefined) {
    const text = String(query.entitaet).trim();
    if (text.length === 0 || text.length > 200) return { fehler: "entitaet takes 1 to 200 characters" };
    entitaet = text;
  }
  return {
    sicht: sichtRoh,
    entitaet,
    tiefe: tiefe.wert,
    knoten: knoten.wert,
    kanten: kanten.wert,
    layout: layoutRoh === "1",
  };
}

/** sha256 ueber die Parameterfolge — der Erkennungsname einer Ansicht. */
export function parameterHash(p: GrafParameter): string {
  const kanonisch = `sicht=${p.sicht}|entitaet=${p.entitaet ?? ""}|tiefe=${p.tiefe}|knoten=${p.knoten}|kanten=${p.kanten}|layout=${p.layout ? 1 : 0}`;
  return crypto.createHash("sha256").update(kanonisch).digest("hex");
}

// ---------------------------------------------------------------- Vorrat aus dem Store

/**
 * PROVISORISCH — A9 §8 Schritt 3 stellt das nach src/core/store.ts:
 *   graphBestand(): { knoten: number; kanten: number }
 *     SELECT COUNT(*) FROM entities · SELECT COUNT(*) FROM relations
 * Ohne diese beiden Zahlen ist `bestand` nicht die ganze Wahrheit, sondern die
 * gelieferte Menge, und die Rechenpflicht (bestand = Bild + uebrig) eine
 * Behauptung. Zwei COUNTs auf indizierten Tabellen, kein Scan ueber Inhalte.
 */
function bestandDerBegriffe(store: KeptaStore): { knoten: number; kanten: number } {
  const knoten = (store.db.prepare("SELECT COUNT(*) AS n FROM entities").get() as { n: number }).n;
  const kanten = (store.db.prepare("SELECT COUNT(*) AS n FROM relations").get() as { n: number }).n;
  return { knoten: Number(knoten), kanten: Number(kanten) };
}

/**
 * PROVISORISCH — gehoert nach store.ts als `graphTraegerSchluessel():
 * Map<string, { privat: boolean; geloescht: boolean }>`. Ein einziger Scan ueber
 * id, scope, deleted_at — ohne Inhalt, ohne Entschluesselung. Der Begriffs-Pfad
 * braucht drei Flags je Traeger-Notiz und darf dafuer nicht tausend Notiztexte
 * durch die Verschluesselung ziehen.
 */
function schluesselDerTraeger(store: KeptaStore): Map<string, { privat: boolean; geloescht: boolean }> {
  const zeilen = store.db
    .prepare("SELECT id, scope, deleted_at FROM memories")
    .all() as { id: string; scope: string; deleted_at: number | null }[];
  const out = new Map<string, { privat: boolean; geloescht: boolean }>();
  for (const z of zeilen) out.set(z.id, { privat: z.scope === "private", geloescht: z.deleted_at !== null });
  return out;
}

/** Alle aktiven Notizen, seitenweise — die Grundlage von df, g(t) und den Links. */
function notizenDesBestands(store: KeptaStore): { notizen: NotizKnoten[]; gesamt: number } {
  const privaten = store.privateMemoryIds();
  const out: NotizKnoten[] = [];
  let gesamt = 0;
  for (let offset = 0; offset < NOTIZ_MAX; offset += NOTIZ_SEITE) {
    const seite = store.listMemories({ limit: NOTIZ_SEITE, offset });
    gesamt += seite.length;
    for (const m of seite) {
      out.push({
        id: m.id,
        titel: m.title,
        inhalt: m.content,
        tags: m.tags,
        art: m.type,
        privat: privaten.has(m.id),
      });
    }
    if (seite.length < NOTIZ_SEITE) break;
  }
  return { notizen: out, gesamt };
}

/**
 * Abschnitt-Vektoren je Notiz, an der Generation gecacht. Zwei Modelle sind zwei
 * Massstaebe — verglichen wird nur innerhalb desselben (A9 §2 Regel 2).
 */
interface VektorFund { map: Map<string, NotizVektor[]>; ohneVektor: number }
const vektorenCache = new WeakMap<KeptaStore, { generation: number; fund: VektorFund }>();

function vektorenDesBestands(store: KeptaStore): VektorFund {
  const generation = store.datenGeneration();
  const alt = vektorenCache.get(store);
  if (alt && alt.generation === generation) return alt.fund;
  const map = new Map<string, NotizVektor[]>();
  const stats = store.embeddingStats();
  if (stats.embedded > 0) {
    for (const c of store.allEmbeddableChunks()) {
      const vektor: NotizVektor = { vektor: c.embedding, modell: c.model };
      const liste = map.get(c.memoryId);
      if (liste) liste.push(vektor); else map.set(c.memoryId, [vektor]);
    }
  }
  const fund: VektorFund = { map, ohneVektor: stats.chunksOhneVektor };
  vektorenCache.set(store, { generation, fund });
  return fund;
}

/**
 * Die Kantenmenge eines Knotens als Schluessel. Unveraenderter Schluessel ⇒
 * unveraenderter Platz (A9 §1 Regel 3).
 */
function knotenSignaturen(kanten: readonly GrafKante[]): Map<string, string> {
  const nachbarn = new Map<string, string[]>();
  for (const k of kanten) {
    const wert = k.maess.wert === null ? "" : k.maess.wert.toFixed(6);
    for (const [ende, other] of [[k.quelle, k.ziel] as const, [k.ziel, k.quelle] as const]) {
      const eintrag = `${other}|${k.sorte}|${k.belege}|${wert}`;
      const liste = nachbarn.get(ende);
      if (liste) liste.push(eintrag); else nachbarn.set(ende, [eintrag]);
    }
  }
  const out = new Map<string, string>();
  for (const [ende, liste] of nachbarn) out.set(ende, [...liste].sort().join(";"));
  return out;
}

// ---------------------------------------------------------------- Cache

interface CacheEintrag {
  generation: number;
  layoutVersion: number;
  parameterHash: string;
  stellen: Map<string, { x: number; y: number }>;
  signaturen: Map<string, string>;
  antwort: GrafAntwort;
}

const bildCache = new WeakMap<KeptaStore, Map<string, CacheEintrag>>();
/** Nicht unbegrenzt: ein Client koennte sonst so viele Ansichten halten, wie er will. */
const CACHE_PLATZE = 8;
const layoutsGezaehlt = new WeakMap<KeptaStore, number>();

/** Fuer die Kosten-Wache in tests/graf-kosten.test.ts: Zahl der Kraftrechnungen je Store. */
export function layoutsBerechnet(store: KeptaStore): number {
  return layoutsGezaehlt.get(store) ?? 0;
}

/** Nur fuer Tests: Bild-Cache und Zaehler eines Stores leeren. */
export function cacheZuruecksetzen(store: KeptaStore): void {
  bildCache.delete(store);
  layoutsGezaehlt.set(store, 0);
}

function cacheDes(storte: KeptaStore, hash: string): Map<string, CacheEintrag> {
  let map = bildCache.get(storte);
  if (!map) {
    map = new Map();
    bildCache.set(storte, map);
  }
  while (map.size >= CACHE_PLATZE && !map.has(hash)) {
    const aeltester = map.keys().next().value as string | undefined;
    if (aeltester === undefined) break;
    map.delete(aeltester);
  }
  return map;
}

// ---------------------------------------------------------------- Signaturen (Anker-Regel)

/**
 * Die Kantenmenge eines Knotens als Schluessel. Unveraenderter Schluessel ⇒
 * unveraenderter Platz (A9 §1 Regel 3).
 */
// ---------------------------------------------------------------- Konzept-Sicht

interface BegriffRang {
  id: number;
  name: string;
  kraft: number;
  traegerOffen: string[];
  ohneBeweis: boolean;
}

/**
 * Der Begriffs-Pfad: store.getGraph (unveraendert, inklusive seiner Kappen),
 * dann dieselbe Privatheitsgrenze wie die MCP-Tuer — ein Begriff faellt erst,
 * wenn ALLE seine Traeger-Notizen privat sind.
 */
function baueKonzeptBild(store: KeptaStore, p: GrafParameter): {
  knoten: GrafKnoten[]; kanten: GrafKante[]; kuerzung: GrafKuerzung; bestand: GrafAntwort["bestand"];
} {
  const kuerzung: GrafKuerzung = {
    kappe: { knoten: p.knoten, kanten: p.kanten, paarPruefungen: 0 },
    uebrig: { knoten: 0, kanten: 0, paare: 0, begriffe: 0 },
    grund: [],
    gefiltert: { privat: 0, papierkorb: 0 },
    verwaiste: { knoten: 0, kanten: 0 },
    vollstaendig: true,
  };
  const total = bestandDerBegriffe(store);
  const aktive = store.countMemories();
  const g = store.getGraph(p.entitaet, p.tiefe);
  const schluessel = schluesselDerTraeger(store);
  const traeger = store.memoryIdsByEntity(g.entities.map((e) => e.id));

  // Floor je Begriff.
  const gehalten = new Map<number, { name: string; offen: string[]; privat: number; geloescht: number; ohne: boolean }>();
  for (const e of g.entities) {
    const ids = traeger.get(e.id) ?? [];
    let privat = 0;
    let geloescht = 0;
    const offen: string[] = [];
    for (const id of ids) {
      const s = schluessel.get(id);
      if (!s) continue;
      if (s.privat) { privat++; continue; }
      if (s.geloescht) { geloescht++; continue; }
      offen.push(id);
    }
    if (ids.length > 0 && offen.length === 0 && geloescht === 0 && privat > 0) {
      kuerzung.gefiltert.privat++;
      continue;
    }
    if (ids.length > 0 && offen.length === 0 && geloescht > 0) {
      kuerzung.gefiltert.papierkorb++;
      continue;
    }
    gehalten.set(e.id, { name: e.name, offen, privat, geloescht, ohne: ids.length === 0 });
  }
  // Was store.getGraph selbst nicht lieferte (eigene Kappe), ist nicht sichtbar.
  kuerzung.uebrig.knoten = Math.max(0, total.knoten - gehalten.size);
  if (kuerzung.uebrig.knoten > 0) kuerzung.grund.push("knoten");

  // Lebende Behauptungen: beide Enden gehalten, Traeger vorhanden, offen, aktiv.
  interface Kante { id: string; quelle: string; ziel: string; relation: string; validFrom: number | null; validTo: number | null }
  const lebend: Kante[] = [];
  for (const r of g.relations) {
    if (!gehalten.has(r.sourceId) || !gehalten.has(r.targetId)) { kuerzung.uebrig.kanten++; continue; }
    if (!r.memoryId || !schluessel.has(r.memoryId)) { kuerzung.verwaiste.kanten++; continue; }
    const s = schluessel.get(r.memoryId)!;
    if (s.privat) { kuerzung.uebrig.kanten++; kuerzung.grund.push("privat"); continue; }
    if (s.geloescht) { kuerzung.uebrig.kanten++; kuerzung.grund.push("papierkorb"); continue; }
    lebend.push({
      id: `r-${r.id}`,
      quelle: `e-${Math.min(r.sourceId, r.targetId)}`,
      ziel: `e-${Math.max(r.sourceId, r.targetId)}`,
      relation: r.relation,
      validFrom: r.validFrom,
      validTo: r.validTo,
    });
  }

  // Auswahl nach Wert: Begriffe mit den meisten lebenden Behauptungen zuerst.
  const kraft = new Map<string, number>();
  for (const k of lebend) {
    kraft.set(k.quelle, (kraft.get(k.quelle) ?? 0) + 1);
    kraft.set(k.ziel, (kraft.get(k.ziel) ?? 0) + 1);
  }
  const rang: BegriffRang[] = [...gehalten.entries()]
    .map(([id, e]) => ({
      id,
      name: e.name,
      kraft: kraft.get(`e-${id}`) ?? 0,
      traegerOffen: e.offen,
      ohneBeweis: e.ohne,
    }))
    .sort((a, b) => b.kraft - a.kraft || a.id - b.id);
  const fenster = rang.slice(0, p.knoten).sort((a, b) => a.id - b.id);
  const imBild = new Set(fenster.map((r) => `e-${r.id}`));
  const durchKappe = rang.length > p.knoten;
  kuerzung.uebrig.knoten += rang.length - fenster.length;
  if (durchKappe) kuerzung.grund.push("knoten");
  if (p.entitaet !== undefined && kuerzung.uebrig.knoten > 0) kuerzung.grund.push("tiefe");
  kuerzung.verwaiste.knoten = fenster.filter((r) => r.ohneBeweis).length;

  // Kantenkappe: nach Belegen, dann id. Enden ausserhalb des Fensters zahlen mit.
  const geordnet = [...lebend].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const kanten: GrafKante[] = [];
  const versteckteNachbarn = new Map<string, number>();
  for (const k of geordnet) {
    const aussenOhne = !imBild.has(k.quelle) || !imBild.has(k.ziel);
    if (aussenOhne) {
      kuerzung.uebrig.kanten++;
      for (const ende of [k.quelle, k.ziel]) {
        if (imBild.has(ende)) versteckteNachbarn.set(ende, (versteckteNachbarn.get(ende) ?? 0) + 1);
      }
      continue;
    }
    if (kanten.length >= p.kanten) {
      kuerzung.uebrig.kanten++;
      for (const ende of [k.quelle, k.ziel]) {
        if (imBild.has(ende)) versteckteNachbarn.set(ende, (versteckteNachbarn.get(ende) ?? 0) + 1);
      }
      continue;
    }
    kanten.push({
      id: k.id,
      quelle: k.quelle,
      ziel: k.ziel,
      sorte: "echt",
      maess: { wert: null, basis: "verlinkt", gemessen: true },
      feder: 0.5,
      belege: 1,
      erklaerung: { gemeinsame: [k.relation], art: "titel" },
      validFrom: k.validFrom,
      validTo: k.validTo,
    });
  }

  const gradEcht = new Map<string, number>();
  for (const k of kanten) {
    gradEcht.set(k.quelle, (gradEcht.get(k.quelle) ?? 0) + k.belege);
    gradEcht.set(k.ziel, (gradEcht.get(k.ziel) ?? 0) + k.belege);
  }
  const knoten: GrafKnoten[] = fenster.map((r) => ({
    id: `e-${r.id}`,
    titel: r.name,
    art: "begriff",
    gradEcht: gradEcht.get(`e-${r.id}`) ?? 0,
    gradVermutet: 0,
    versteckteNachbarn: versteckteNachbarn.get(`e-${r.id}`) ?? 0,
    traeger: r.traegerOffen.length,
    traegerIds: r.traegerOffen.slice(0, 20),
  }));

  // Nach Vertrag: vollstaendig heisst nichts anderes als `uebrig` ist leer.
  // Was der Floor zurueckhielt, steht in gefiltert — eine Erklaerung, keine Zahl
  // in der Summe.
  kuerzung.vollstaendig =
    kuerzung.uebrig.knoten === 0 &&
    kuerzung.uebrig.kanten === 0 &&
    kuerzung.uebrig.paare === 0 &&
    kuerzung.uebrig.begriffe === 0;

  return {
    knoten,
    kanten,
    kuerzung,
    bestand: { notizen: aktive.active, knoten: total.knoten, kanten: total.kanten },
  };
}

// ---------------------------------------------------------------- Kuvert

function kuvertAus(
  p: GrafParameter,
  bestand: GrafAntwort["bestand"],
  kuerzung: GrafKuerzung,
  knoten: GrafKnoten[],
  kanten: GrafKante[],
  stellen: Map<string, { x: number; y: number }> | null,
  stempel: GrafAntwort["stempel"]
): GrafAntwort {
  if (stellen) {
    for (const k of knoten) {
      const platz = stellen.get(k.id);
      if (!platz) continue;
      k.x = platz.x;
      k.y = platz.y;
    }
  }
  return {
    vertrag: GRAF_VERTRAG,
    sicht: p.sicht,
    bestand,
    kuerzung,
    // Das Weltformat ist eines; ob Plaetze mitreisen, sagt der Client an den
    // Feldern x/y — herkunft benennt, wie sie gerechnet wurden.
    welt: { einheit: "welt", groesse: WELT_GROESSE, herkunft: "kraft" },
    stempel,
    knoten,
    kanten,
  };
}

/**
 * Das Bild fuer einen Parameter — Cache-Treffer ohne Rechnung, sonst eine
 * Rechnung mit Anker an das letzte Bild derselben Ansicht.
 */
export function grafBild(store: KeptaStore, query: Record<string, unknown>, ifNoneMatch?: string): GrafErgebnis {
  const gelesen = leseParameter(query);
  if ("fehler" in gelesen) return { status: 400, error: gelesen.fehler };
  const p = gelesen;
  const generation = store.datenGeneration();
  const hash = parameterHash(p);
  const etag = `"${hash}-${generation}-v${LAYOUT_VERSION}"`;
  if (ifNoneMatch === etag) return { status: 304, etag };

  const cache = cacheDes(store, hash);
  const alt = cache.get(hash);
  const nutzbar = alt && alt.generation === generation && alt.layoutVersion === LAYOUT_VERSION;
  if (nutzbar) {
    return {
      status: 200,
      etag,
      antwort: { ...alt.antwort, stempel: { ...alt.antwort.stempel, berechent: "cache" } },
    };
  }

  // Bild rechnen.
  const stempel = { generation, layoutVersion: LAYOUT_VERSION, parameterHash: hash, berechent: "neu" as const };
  let bestand: GrafAntwort["bestand"];
  let kuerzung: GrafKuerzung;
  let knoten: GrafKnoten[];
  let kanten: GrafKante[];
  if (p.sicht === "konzept") {
    const geb = baueKonzeptBild(store, p);
    bestand = geb.bestand;
    kuerzung = geb.kuerzung;
    knoten = geb.knoten;
    kanten = geb.kanten;
  } else {
    const vorrat = notizenDesBestands(store);
    const vektoren = vektorenDesBestands(store);
    for (const n of vorrat.notizen) {
      const fund = vektoren.map.get(n.id);
      if (fund?.length) n.vektoren = fund;
    }
    const bild = baueNotizBild(vorrat.notizen, { knoten: p.knoten, kanten: p.kanten });
    const aktive = store.countMemories().active;
    // Ein Bestand ueber dem Durchlauf ist keine stille Kante: Das Bild erklaert
    // sich nur, wenn der Scan den Bestand ganz sah.
    bild.kuerzung.vollstaendig = bild.kuerzung.vollstaendig && vorrat.notizen.length === aktive;
    bestand = { notizen: aktive, knoten: bild.bestand.knoten, kanten: bild.bestand.kanten };
    kuerzung = bild.kuerzung;
    knoten = bild.knoten;
    kanten = bild.kanten;
  }

  // Weltbild, zwei Klassen: der Platz, den ein Mensch sich gemerkt hat, bleibt;
  // was sich geaendert hat, orientiert sich — aber begrenzt.
  //
  // 1. Knoten mit unveraenderter Kantenmenge (Signaturen gleich) werden fest-
  //    gehalten: bitgleicher Platz, `verankert: true`.
  // 2. Jeder andere bestehende Knoten faellt in die Wander-Grenze von
  //    WANDER_GRENZE Welteinheiten um seinen alten Platz — 2 % der Diagonalen,
  //    dieselbe Groessenordnung, die A9 §1 als Messehre verspricht. Ohne diese
  //    Grenze warfen 197 von 80 Bestehende ihre Plaetze, wenn ein Neuling sich
  //    mit allen verband (gemessen 337 WE = 23,85 %); mit ihr bleibt der Rest
  //    liegen, ohne dass die Geometrie luegt.
  // 3. Neue Knoten sind frei — sonst findet ein Neuling keinen Platz an seinen
  //    Partnern (gemessen: 459 WE Abstand zur eigenen [[Link]]-Zielnote, als
  //    alle Bestehenden fest genagelt waren).
  let stellen: Map<string, { x: number; y: number }> | null = null;
  let signaturen = new Map<string, string>();
  if (p.layout) {
    const federn: KraftKante[] = kanten.map((k) => ({ quelle: k.quelle, ziel: k.ziel, sorte: k.sorte, feder: k.feder }));
    const geruest = alt && alt.layoutVersion === LAYOUT_VERSION ? alt.stellen : undefined;
    signaturen = knotenSignaturen(kanten);
    let gehalten: Set<string> | undefined;
    if (geruest) {
      gehalten = new Set(
        knoten
          .filter((k) => geruest.has(k.id) && alt!.signaturen.get(k.id) === signaturen.get(k.id))
          .map((k) => k.id)
      );
    }
    const welt = berechneWelt({
      knoten: knoten.map((k) => ({ id: k.id })),
      kanten: federn,
      vorher: geruest,
      unveraendert: gehalten,
    });
    layoutsGezaehlt.set(store, (layoutsGezaehlt.get(store) ?? 0) + 1);
    stellen = new Map([...welt].map(([id, platz]) => [id, { x: platz.x, y: platz.y }]));
    for (const k of knoten) if (gehalten?.has(k.id)) k.verankert = true;
  }

  const antwort = kuvertAus(p, bestand, kuerzung, knoten, kanten, stellen, stempel);
  cache.set(hash, { generation, layoutVersion: LAYOUT_VERSION, parameterHash: hash, stellen: stellen ?? new Map(), signaturen, antwort });
  return { status: 200, etag, antwort };
}
