// Gruppen, die ein Mensch selbst aus einem Tag baut — eine Rechnung, zwei Flaechen.
//
// Warum dieses Stueck eine eigne Datei ist und nicht noch ein Band in `baueRegal`: der Gang
// (G-74, G-72 zweite Haelfte) und das Regal muessen **dieselbe Zahl** nennen. Dafuer darf es
// nur eine Zaehlung geben. Die Zaehlung der Marken im Bestand ist `markenHaeufigkeit`
// (`src/lib/graphHierarchy.ts:197`) — trimmen, kleinschreiben, je Notiz entdoppeln — und sie
// ist die einzige Quelle, aus der hier Gruppenzahlen kommen. Ein Fall in
// `tests/lib/farbgruppen.test.ts` haelt genau das: die Zahl einer Gruppe ist gleich dem Wert, den
// der Zensus fuer dieselbe Marke nennt.
//
// Eine Zeile stellt der Wiederholung trotzdem ins Wort: die Marken-Eigenschaft einer einzelnen
// Notiz muss mit derselben Regel gelesen werden wie der Zensus, und die Regel steht hier
// nachgestellt, weil `graphHierarchy.ts` in diesem Schlag nicht angefasst wird (Schnitt der
// Leitung: neue Datei plus `GraphRegal.tsx`). Der Gleichheits-Fall oben ist die Klammer
// darunter — aendert jemand eine der beiden Zeilen ohne die andre, wird er rot.
//
// Was ein Mensch bauen kann: eine Gruppe ist ein Tag, das er setzt. Sie bleibt stehen, auch
// wenn sie auf nichts trifft — ein leerer Korb, der seine Null sagt, ist ehrlicher als eine
// Zeile, die verschwindet. Die Farbe ist pro Gruppe gesetzt und liegt bei der Gruppe, nicht
// bei ihrem Platz: wer eine Gruppe loescht, faerbt die andern nicht neu um.
import { markenHaeufigkeit, gruppenVonNotiz } from "./graphHierarchy";
import type { Memory } from "../types";

/** Hausform: ein Schluessel mit `kepta_`-Praefix wird von `src/lib/settings.ts` ueber den
 *  Praefix gespiegelt, die Gruppe ueberlebt damit Port-Wechsel und Neustart. */
export const GRUPPEN_SCHLUESSEL = "kepta_tag_gruppen";

/** Wie viele Marken das Regal als Bau-Vorschlag nennt — die Kappe steht da, wo sie steht,
 *  damit eine Liste von 64 Faelern nicht als Angebot gilt. */
export const GRUPPEN_ANGEBOT = 12;

/** Acht Huegel, weit genug auseinander fuer ein dunkles und ein helles Bild, und keiner der
 *  vier Art-Farben gleich: eine Gruppe soll nicht aussehen wie eine Wissensart. */
export const GRUPPEN_PALETTE = [
  "#e2703a", // gebranntes Orange
  "#3fbfa8", // Tuerkis
  "#c65b8c", // Beere
  "#7a9b3f", // Moos
  "#5b7fd4", // Stahlblau
  "#d4b23f", // Messing
  "#9a6fd0", // Lavendel
  "#4fae63", // Gruen
] as const;

export interface GruppenEinstellung {
  marken: string[];
  farben: Record<string, string>;
}

export interface FarbGruppe {
  /** Die Marke, wie der Bestand sie fuehrt — kleingeschrieben, ohne `#`. */
  marke: string;
  farbe: string;
  notizen: number;
  prozent: number;
}

export interface FarbGruppen {
  bestand: number;
  gruppen: FarbGruppe[];
  /** Wie viel Bestand in KEINER Gruppe liegt — als Zahl, nicht als Schweigen. */
  ohneGruppe: number;
  /** Wie viele Stuecke in zwei oder mehr Gruppen liegen. Ohne diese Zahl ist die Summe der
   *  Gruppen eine Luege, weil sie dieselbe Notiz zweimal zaehlt. */
  mehrfach: number;
  /** Marken im Bestand, die noch keine Gruppe sind — haeufigste zuerst, gekappt. */
  baubar: { marke: string; notizen: number }[];
}

/** Die Griffe, die eine Flaeche ansetzen kann. Ohne sie zeigt das Regal Zahlen ohne Knöpfe. */
export interface GruppenSteuerung {
  baue: (marke: string) => void;
  entferne: (marke: string) => void;
  farbe: (marke: string, farbe: string) => void;
}

const LEER: GruppenEinstellung = { marken: [], farben: {} };

/** `#Client-X `, `##md`, ` Shop ` — was ein Mensch tippt, ist nicht das, was der Bestand fuehrt. */
export function normaliereMarke(roh: string): string {
  return String(roh ?? "").trim().replace(/^#+/, "").trim().toLowerCase();
}

/** Dieselbe Regel wie `markenHaeufigkeit`: trimmen, kleinschreiben, je Notiz entdoppeln. */
function markenVon(m: Memory): Set<string> {
  return new Set((m.tags ?? []).map((t) => String(t).trim().toLowerCase()).filter(Boolean));
}

/** Der Default, wenn eine Gruppe nie eine Farbe gesetzt bekam: an der Marke fest, nicht an
 *  ihrer Stelle in der Liste — sonst faerbt ein Loeschen die Nachbarn um. */
function palettenFarbe(marke: string): string {
  let h = 2166136261;
  for (let i = 0; i < marke.length; i++) {
    h ^= marke.codePointAt(i) ?? 0;
    h = Math.imul(h, 16777619);
  }
  return GRUPPEN_PALETTE[Math.abs(h) % GRUPPEN_PALETTE.length];
}

function speicher(): Storage | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null; // privates Fenster, blockierter Speicher
  }
}

function traegt(s: string): boolean {
  return /^#[0-9a-fA-F]{6}$/.test(s);
}

/** Die persisted Einstellung — kaputte Werte zaehlen als keine, nicht als Fehler. */
export function leseEinstellung(): GruppenEinstellung {
  const ort = speicher();
  if (!ort) return { ...LEER, farben: {} };
  let roh: string | null = null;
  try {
    roh = ort.getItem(GRUPPEN_SCHLUESSEL);
  } catch {
    return { ...LEER, farben: {} };
  }
  if (!roh) return { ...LEER, farben: {} };
  try {
    const d = JSON.parse(roh) as Partial<GruppenEinstellung>;
    const marken = Array.isArray(d?.marken)
      ? [...new Set(d.marken.map((m) => normaliereMarke(String(m))).filter(Boolean))]
      : [];
    const farben: Record<string, string> = {};
    if (d?.farben && typeof d.farben === "object") {
      for (const [k, v] of Object.entries(d.farben)) {
        const marke = normaliereMarke(String(k));
        if (marke && typeof v === "string" && traegt(v)) farben[marke] = v.toLowerCase();
      }
    }
    return { marken, farben };
  } catch {
    return { ...LEER, farben: {} };
  }
}

/** Schreiben ist die einzige Stelle, die die Ordnung haelt: unbekannte Farben raus,
 *  Farben ohne Gruppe auch. */
export function schreibeEinstellung(e: GruppenEinstellung): GruppenEinstellung {
  const marken = [...new Set((e.marken ?? []).map((m) => normaliereMarke(String(m))).filter(Boolean))];
  const farben: Record<string, string> = {};
  for (const m of marken) {
    const f = e.farben?.[m];
    if (typeof f === "string" && traegt(f)) farben[m] = f.toLowerCase();
  }
  const ordentlich: GruppenEinstellung = { marken, farben };
  try {
    speicher()?.setItem(GRUPPEN_SCHLUESSEL, JSON.stringify(ordentlich));
  } catch {
    /* ohne Speicher gilt die Einstellung fuer diesen Lauf — sie ist nicht verloren, nur kurz */
  }
  return ordentlich;
}

/** DIE eine Rechnung. Regal und Gang rufen denselben Aufruf auf demselben Bestand. */
export function zaehleGruppen(
  memories: readonly Memory[],
  einstellung: GruppenEinstellung = leseEinstellung(),
): FarbGruppen {
  const zensus = markenHaeufigkeit(memories as Memory[]);
  const bestand = memories.length;
  const marken = [...new Set((einstellung.marken ?? []).map((m) => normaliereMarke(String(m))).filter(Boolean))];
  const menge = new Set(marken);
  const gruppen: FarbGruppe[] = marken.map((marke) => {
    const notizen = zensus.get(marke) ?? 0;
    return {
      marke,
      farbe: einstellung.farben?.[marke] ?? palettenFarbe(marke),
      notizen,
      prozent: bestand > 0 ? (100 * notizen) / bestand : 0,
    };
  });
  let ohneGruppe = 0;
  let mehrfach = 0;
  for (const m of memories) {
    let treffer = 0;
    for (const t of markenVon(m)) if (menge.has(t)) treffer++;
    if (treffer === 0) ohneGruppe++;
    else if (treffer > 1) mehrfach++;
  }
  const baubar = [...zensus.entries()]
    .filter(([k]) => !menge.has(k))
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, GRUPPEN_ANGEBOT)
    .map(([marke, notizen]) => ({ marke, notizen }));
  return { bestand, gruppen, ohneGruppe, mehrfach, baubar };
}

/** Der Gang liest dasselbe; dieser Name ist der Ruf, den die Flaeche kennt. */
export function baueFarbGruppen(
  memories: readonly Memory[],
  einstellung: GruppenEinstellung = leseEinstellung(),
): FarbGruppen {
  return zaehleGruppen(memories, einstellung);
}

/**
 * Der Satz ueber der Achse — EIN Text fuer beide Flaechen.
 *
 * Das Regal setzt ihn ueber sein Band, der Gang neben seinen Knopf. Zwei Flaechen, die eine
 * Sache in zwei Worten sagen, sind die zwei Vokabulare, die Damian am Bild von 19:02 kritisiert;
 * dieser Funktionsaufruf ist der Grund, warum sie nicht auseinanderlaufen koennen.
 *
 * Die Bestandsgroesse steht einmal im Satz, und eine Null bleibt nicht ohne Grund: trifft eine
 * gesetzte Gruppe nichts, sagt der Satz, warum.
 */
export function achsenSatz(achsen: Achsen, gruppen: FarbGruppen): string {
  const band = achsen.baender.find((b) => b.id === "arbeit");
  if (!band) return "";
  const zahl = (n: number) => n.toLocaleString("en-US");
  const teile = [
    band.frage,
    `${zahl(band.notizen)} of ${zahl(achsen.bestand)} notes carry a group you made`,
  ];
  if (band.notizen === 0) teile.push("no note carries it yet");
  else {
    if (gruppen.ohneGruppe > 0) teile.push(`${zahl(gruppen.ohneGruppe)} carry none`);
    if (gruppen.mehrfach > 0) teile.push(`${zahl(gruppen.mehrfach)} carry two`);
  }
  teile.push(band.klick);
  return teile.join(" · ");
}

/** Die drei Achsen in Menschensprache — EIN Wortvorrat fuer zwei Flaechen.
 *
 * Das Regal nennt seine Baender nicht nach dem Speicher (Notiz / Datei / Code), sondern nach
 * den drei Fragen, die ein Mensch stellt: woran gearbeitet, von wem, wann. Der Gang muss
 * dieselben drei Worte brauchen, sonst hat das Produkt zwei Vokabulare fuer eine Sache — und
 * der Leser raeumt eines davon weg.
 *
 * `klick` ist eine Handlung, keine Beschreibung: ein Band, das nicht sagt, was ein Klick
 * oeffnet, ist eine Zahl mit Schmuck.
 */
export const ACHSEN = [
  {
    id: "arbeit",
    frage: "what you work on",
    klick: "click a name to open the notes you filed under it",
  },
  {
    id: "menschen",
    frage: "who it is about",
    klick: "click the count to open the people named in these notes",
  },
  { id: "zeit", frage: "when", klick: "click a span of time to open the notes from it" },
] as const;

export type AchsenId = (typeof ACHSEN)[number]["id"];

export interface AchsenBand {
  id: AchsenId;
  /** Die Frage in Menschensprache, so wie beide Flaechen sie nennen. */
  frage: string;
  /** Was ein Klick oeffnet — ein Verb, keine Fachkategorie. */
  klick: string;
  notizen: number;
  prozent: number;
  facher: { name: string; notizen: number }[];
}

export interface Achsen {
  bestand: number;
  baender: AchsenBand[];
}

/**
 * Die Achse ueber dem Bestand — gerechnet aus den Quellen, die es schon gibt, in EINEM Durchgang:
 *   arbeit   = die Gruppen, die `zaehleGruppen` schon deckt (kein zweites Zaehlen)
 *   menschen = die Themen-Ebene aus `gruppenVonNotiz` (gepuffert je Notiz, dieselbe Rechnung wie
 *              die About-Chips im Dashboard)
 *   zeit     = die Koerbe, die `baueRegal` schon zaehlt — hier nur weitergegeben
 *
 * `wann` ist ein Pflichtteil: ohne die fertigen Koerbe zu uebergeben muesste diese Funktion
 * selbst koerben, und dann stuenden zwei Zahlen derselben Menge im Haus.
 */
export function achseFuerMenschen(
  memories: readonly Memory[],
  gruppen: FarbGruppen,
  wann: { name: string; notizen: number }[],
): Achsen {
  const bestand = memories.length;
  const anteil = (n: number) => (bestand > 0 ? (100 * n) / bestand : 0);
  const gedeckt = gruppen.bestand - gruppen.ohneGruppe;
  let menschen = 0;
  for (const m of memories) if (gruppenVonNotiz(m).themen.includes("people")) menschen++;
  const zeitSumme = wann.reduce((n, k) => n + k.notizen, 0);
  const baender: AchsenBand[] = ACHSEN.map((a) => {
    if (a.id === "arbeit") {
      return {
        id: a.id, frage: a.frage, klick: a.klick, notizen: gedeckt, prozent: anteil(gedeckt),
        facher: gruppen.gruppen.map((g) => ({ name: g.marke, notizen: g.notizen })),
      };
    }
    if (a.id === "menschen") {
      return { id: a.id, frage: a.frage, klick: a.klick, notizen: menschen, prozent: anteil(menschen), facher: [] };
    }
    return {
      id: a.id, frage: a.frage, klick: a.klick, notizen: zeitSumme, prozent: anteil(zeitSumme),
      facher: wann.map((k) => ({ name: k.name, notizen: k.notizen })),
    };
  });
  return { bestand, baender };
}

/**
 * Welcher Knoten zu welcher Gruppe gehoert — als Bild `id -> marke`, in derselben
 * Form, die der Gang schon fuer die Herkunft kennt (`herkunft.träger`). Die Marke
 * ist die erste getroffene in der Reihenfolge der Wahl, damit ein Knoten, der zwei
 * Gruppen traegt, nicht zwei Farben bekommt.
 *
 * Diese Funktion zaehlt nichts: sie verteilt nur, was `zaehleGruppen` schon weiss.
 * Ein zweiter Zyklus ueber den Bestand waere die zweite Zahl, die der Auftrag
 * verbietet.
 */
export function gruppenBild(memories: readonly Memory[], gruppen: FarbGruppen): Map<string, string> {
  const aus = new Map<string, string>();
  const marken = gruppen.gruppen.map((g) => g.marke);
  if (marken.length === 0) return aus;
  for (const m of memories) {
    if (!m.id) continue;
    const eigene = markenVon(m);
    for (const marke of marken) {
      if (eigene.has(marke)) {
        aus.set(m.id, marke);
        break;
      }
    }
  }
  return aus;
}

/**
 * Das Farb-Bild des Kanals: Marke -> Hex, und fuer alles ohne Gruppe das neutrale
 * Register. Kommt aus der Einstellung, nicht aus der Zaehlung — der Kanal braucht
 * die Farben, die Zahl holt sich die Flaeche aus `baueFarbGruppen`.
 */
export function gruppenFarbenVon(einstellung: GruppenEinstellung, neutral: string): Record<string, string> {
  const aus: Record<string, string> = { neutral };
  for (const marke of [...new Set((einstellung.marken ?? []).map((m) => normaliereMarke(String(m))).filter(Boolean))]) {
    aus[marke] = einstellung.farben?.[marke] ?? palettenFarbe(marke);
  }
  return aus;
}

/** Eine Gruppe bauen: gesetzt wird die Marke, und ihre Farbe wird gleich mitgelegt, damit sie
 *  spaeter nicht an ihrem Platz in der Liste haengt. */
export function gruppeHinzufuegen(marke: string, einstellung: GruppenEinstellung = leseEinstellung()): GruppenEinstellung {
  const m = normaliereMarke(marke);
  if (!m) return einstellung;
  const e = { marken: [...einstellung.marken], farben: { ...einstellung.farben } };
  if (e.marken.includes(m)) return schreibeEinstellung(e);
  e.marken.push(m);
  const belegt = new Set(Object.values(e.farben).map((f) => String(f).toLowerCase()));
  const frei = GRUPPEN_PALETTE.find((f) => !belegt.has(f.toLowerCase())) ?? palettenFarbe(m);
  e.farben[m] = frei.toLowerCase();
  return schreibeEinstellung(e);
}

export function gruppeEntfernen(marke: string, einstellung: GruppenEinstellung = leseEinstellung()): GruppenEinstellung {
  const m = normaliereMarke(marke);
  const e = { marken: einstellung.marken.filter((x) => normaliereMarke(x) !== m), farben: { ...einstellung.farben } };
  delete e.farben[m];
  return schreibeEinstellung(e);
}

export function gruppenFarbeSetzen(
  marke: string,
  farbe: string,
  einstellung: GruppenEinstellung = leseEinstellung(),
): GruppenEinstellung {
  const m = normaliereMarke(marke);
  if (!m || !traegt(String(farbe)) || !einstellung.marken.includes(m)) return einstellung;
  return schreibeEinstellung({ marken: [...einstellung.marken], farben: { ...einstellung.farben, [m]: farbe.toLowerCase() } });
}
