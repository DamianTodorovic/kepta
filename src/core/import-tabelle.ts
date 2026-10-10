// Der Tabellen-Weg: CSV und JSONL aus Tabellenkalkulation, Sheets, Notion.
//
// Ein Bestand, der dem Nutzer schon gehört, kommt oft als Tabelle. Was diesen
// Weg von einem blinden CSV-Loader unterscheidet, ist die Ansage: welche Spalten
// er verstanden hat, welche er liegen lässt, und dass er ablehnt, wenn er die
// Inhaltsspalte nicht kennt. Eine still weggelassene Spalte ist ein verlorener
// Datensatz, ein geratenes Textfeld eine erfundene Notiz.
//
// Zeitregel wie in den anderen Wegen: Datum aus der Zelle -> Geltungsbeginn und
// Tag `zeit-quelle`; kein Datum -> Importmoment und Tag `zeit-import`.
// Idempotenz: ID-Spalte, sonst Zeilennummer — `tabelle:<wurzel><zeile>`.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { KeptaStore, normalizeTags } from "./store";
import type { MemoryInput, MemoryType } from "./types";
import { indexMemory } from "./engine";

const QUELLE = "tabelle";
const MIN_LAENGE = 8;
const ERGEBNIS_KAPPE = 50;
const ERGEBUNG_EILE = 100;
const INHALTS_KAPPE = 200_000;
const GUELTIGE_TYPEN = ["semantic", "episodic", "procedural", "reference"] as const;

const WORTE = {
  inhalt: ["content", "inhalt", "text", "notiz", "note", "body", "aussage", "antwort", "zusammenfassung", "beschreibung", "description", "wert", "value"],
  titel: ["title", "titel", "name", "betreff", "subject", "ueberschrift", "überschrift", "kopf"],
  zeit: ["date", "datum", "timestamp", "time", "created", "created_at", "createdat", "erstellt", "erstellt_at", "valid_from", "gilt_seit", "day"],
  tags: ["tags", "tag", "schlagwoerter", "schlagwörter", "labels", "kategorien", "categories", "category"],
  typ: ["type", "typ"],
  id: ["id", "uuid", "kepta_id", "key", "schluessel", "nummer"],
  scope: ["scope", "bereich"],
};

export interface ImportGrund {
  grund: string;
  anzahl: number;
}

export interface Bremse {
  grenze: number;
  bestand: number;
  ueber: boolean;
}

export interface Spaltenplan {
  titel?: string;
  inhalt?: string;
  zeit?: string;
  tags?: string;
  typ?: string;
  id?: string;
  scope?: string;
}

export interface TabelleZusammenfassung {
  quelle: typeof QUELLE;
  ladung: string;
  trocken: boolean;
  /** Zeilen mit Inhalt (Kopfzeile nicht mitgezählt). */
  zeilen: number;
  imported: number;
  updated: number;
  unveraendert: number;
  wiederhergestellt: number;
  duplikateInDerLadung: number;
  bereitsVorhanden: number;
  abgeschnitten: number;
  pruefungUebersprungen: number;
  /** Der eine Blick durch den bestand: wie lang, und über wievielt knoten. */
  pruefungVorlauf: number | null;
  pruefungVorlaufKnoten: number;
  kandidaten: { neu: string; bestehend: string; grund: string }[];
  gruende: ImportGrund[];
  /** Kopfzeile, was davon erkannt wurde, und was liegen blieb. */
  spalten: { kopf: string[]; erkannt: Record<string, string>; trennzeichen: string };
  uebrig: string[];
  zeit: { quelle: number; datei: number; import: number };
  bestand: { vorher: number; nachher: number };
  bremse: Bremse | null;
  fehler: string[];
}

export interface TabelleOpts {
  dryRun?: boolean;
  ladung?: string;
  scope?: string;
  gegenBestand?: boolean;
  erlaubteWurzeln?: string[];
  trennzeichen?: string;
  spalten?: Spaltenplan;
  /** Herzschlag: alle hundert angesehenen Zeilen und ein letztes Mal am Schluss. */
  fortschritt?: (stand: { verarbeitet: number; gesamt: number }) => void;
}

function kennwort(text: string, laenge = 24): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9äöüß_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, laenge)
    .replace(/-+$/g, "");
}

function normiert(text: string): string {
  return text.toLowerCase().replace(/\s+/g, " ").trim();
}

function ortFürMeldung(pfad: string): string {
  return pfad.replace(/\s+/g, " ").slice(0, 200);
}

function bleibtInDenWurzeln(pfadReal: string, erlaubte: string[]): boolean {
  return erlaubte.some((w) => {
    const rel = path.relative(w, pfadReal);
    return rel !== "" && !rel.startsWith("..") && !path.isAbsolute(rel);
  });
}

/** ISO, `dd.MM.yyyy`, `dd/MM/yyyy`, epoch Sekunden wie Millisekunden. */
export function datumAus(wert: unknown): number | null {
  if (typeof wert === "number" && Number.isFinite(wert) && wert > 0) return wert < 1e11 ? Math.round(wert * 1000) : Math.round(wert);
  if (wert === null || wert === undefined) return null;
  const text = String(wert).trim();
  if (!text) return null;
  const deutsch = text.match(/^(\d{1,2})[.](\d{1,2})[.](\d{4})(?:[ ,]+(\d{1,2})[:.](\d{2}))?$/);
  if (deutsch) {
    const [, tag, monat, jahr, stunde, minute] = deutsch;
    const d = Date.UTC(Number(jahr), Number(monat) - 1, Number(tag), Number(stunde ?? 0), Number(minute ?? 0));
    return Number.isNaN(d) ? null : d;
  }
  const slash = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (slash) {
    const d = Date.UTC(Number(slash[3]), Number(slash[2]) - 1, Number(slash[1]));
    return Number.isNaN(d) ? null : d;
  }
  const alsDatum = Date.parse(text);
  if (!Number.isNaN(alsDatum)) return alsDatum;
  const alsZahl = Number(text);
  return Number.isFinite(alsZahl) && alsZahl > 0 ? datumAus(alsZahl) : null;
}

/** RFC-4180-mäßig: Zitat als Escape, Trennzeichen und Umbrüche innerhalb der Zelle. */
export function zeilenLesen(text: string, trennzeichen: string): string[][] {
  const zeilen: string[][] = [];
  let feld = "";
  let reihe: string[] = [];
  let inZitat = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inZitat) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          feld += '"';
          i++;
        } else inZitat = false;
        continue;
      }
      feld += c;
      continue;
    }
    if (c === '"' && feld.trim() === "") {
      inZitat = true;
      continue;
    }
    if (c === trennzeichen) {
      reihe.push(feld);
      feld = "";
      continue;
    }
    if (c === "\r") continue;
    if (c === "\n") {
      reihe.push(feld);
      zeilen.push(reihe);
      reihe = [];
      feld = "";
      continue;
    }
    feld += c;
  }
  if (feld !== "" || reihe.length > 0) {
    reihe.push(feld);
    zeilen.push(reihe);
  }
  return zeilen.map((r) => r.map((z) => z.trim()));
}

function trennzeichenWaehlen(kopfzeile: string): string {
  const moegliche = [",", ";", "\t", "|"];
  let bestes = ",";
  let besteAnzahl = -1;
  for (const k of moegliche) {
    const anzahl = kopfzeile.split(k).length - 1;
    if (anzahl > besteAnzahl) {
      besteAnzahl = anzahl;
      bestes = k;
    }
  }
  return bestes;
}

function spalteFinden(kopf: string[], wanted: string[], vorgabe?: string): string | undefined {
  const norm = (s: string) => s.trim().toLowerCase().replace(/^\uFEFF/, "");
  if (vorgabe) {
    const treffer = kopf.find((k) => norm(k) === norm(vorgabe));
    return treffer;
  }
  for (const wort of wanted) {
    const treffer = kopf.find((k) => norm(k) === wort);
    if (treffer) return treffer;
  }
  return undefined;
}

interface Kopfplan {
  spalten: Spaltenplan;
  uebrig: string[];
}

function planAusKopf(kopf: string[], vorgabe?: Spaltenplan): Kopfplan {
  const benutzte = new Set<string>();
  const spalten: Spaltenplan = {};
  const zuweisen = (feld: keyof Spaltenplan, worter: string[]) => {
    const treffer = spalteFinden(kopf, worter, vorgabe?.[feld]);
    if (treffer !== undefined) {
      spalten[feld] = treffer;
      benutzte.add(treffer);
    }
  };
  // Inhalt zuerst: ohne ihn ist die Datei fremd, und ein Rat dazu erfindet Notizen.
  zuweisen("inhalt", WORTE.inhalt);
  if (!spalten.inhalt) return { spalten, uebrig: kopf };
  zuweisen("titel", WORTE.titel);
  zuweisen("zeit", WORTE.zeit);
  zuweisen("tags", WORTE.tags);
  zuweisen("typ", WORTE.typ);
  zuweisen("id", WORTE.id);
  zuweisen("scope", WORTE.scope);
  return { spalten, uebrig: kopf.filter((k) => !benutzte.has(k)) };
}

function zellenAusZeile(reihe: string[], kopf: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (let i = 0; i < kopf.length; i++) out[kopf[i]!] = reihe[i] ?? "";
  return out;
}

function wertAlsText(wert: unknown): string {
  if (typeof wert === "string") return wert.trim();
  if (typeof wert === "number" || typeof wert === "boolean") return String(wert);
  if (Array.isArray(wert)) return wert.map(wertAlsText).filter(Boolean).join("; ");
  if (wert && typeof wert === "object") return Object.entries(wert as Record<string, unknown>).map(([k, v]) => `${k}: ${wertAlsText(v)}`).join("; ");
  return "";
}

/**
 * Der Wortlaut-Vorrat: EIN Blick durch den Bestand, dann kostet die Prüfung
 * nichts mehr. Pro Knoten die Wortspur fragen ist gemessen superlinear —
 * 138 ms je anfrage bei 200.000 knoten (sonde I-08, 10.10.2026 19:54) — und
 * findet einen zwilling ohnehin nur, wenn die wortspur terme übriglässt.
 */
async function wortlautVorrat(store: KeptaStore): Promise<{
  finden: (inhalt: string, eigeneId: string) => string | null;
  legeAn: (inhalt: string, id: string) => void;
  ms: number;
  knoten: number;
}> {
  const start = performance.now();
  const wortlaute = new Map<string, string>();
  for (let seite = 0; ; seite++) {
    const knoten = store.listMemories({ limit: 5000, offset: seite * 5000 });
    if (knoten.length === 0) break;
    for (const k of knoten) {
      const schluessel = normiert(k.content);
      if (!wortlaute.has(schluessel)) wortlaute.set(schluessel, k.id);
    }
    await ergebung();
  }
  return {
    finden(inhalt: string, eigeneId: string): string | null {
      const treffer = wortlaute.get(normiert(inhalt));
      return treffer && treffer !== eigeneId ? treffer : null;
    },
    legeAn(inhalt: string, id: string): void {
      const schluessel = normiert(inhalt);
      if (!wortlaute.has(schluessel)) wortlaute.set(schluessel, id);
    },
    ms: Math.round(performance.now() - start),
    knoten: wortlaute.size,
  };
}

function bremseLesen(bestand: number): Bremse {
  const roh = Number(process.env.KEPTA_MAX_ACTIVE);
  const grenze = Number.isFinite(roh) && roh > 0 ? Math.floor(roh) : 5000;
  return { grenze, bestand, ueber: bestand > grenze };
}

function ergebung(): Promise<void> {
  return new Promise((ok) => setImmediate(() => ok()));
}

/** Kopfzeile und Zeilen einer Datei — CSV, TSV, Semikolon, oder JSONL. */
function einlesen(text: string, trennzeichenVorgabe?: string): { kopf: string[]; reihen: Record<string, string>[]; trennzeichen: string; fehler: string | null } {
  const jsonl = text
    .split(/\r?\n/)
    .map((z) => z.trim())
    .filter(Boolean);
  const alsObjekte: unknown[] = [];
  let jsonlTauglich = jsonl.length > 0;
  for (const zeile of jsonl) {
    try {
      const wert = JSON.parse(zeile);
      if (!wert || typeof wert !== "object" || Array.isArray(wert)) {
        jsonlTauglich = false;
        break;
      }
      alsObjekte.push(wert);
    } catch {
      jsonlTauglich = false;
      break;
    }
  }
  if (jsonlTauglich) {
    const kopf = [...new Set(alsObjekte.flatMap((o) => Object.keys(o as Record<string, unknown>)))];
    const reihen = alsObjekte.map((o) => {
      const aus: Record<string, string> = {};
      for (const k of kopf) aus[k] = wertAlsText((o as Record<string, unknown>)[k]);
      return aus;
    });
    return { kopf, reihen, trennzeichen: "jsonl", fehler: null };
  }
  const kopfzeile = text.split(/\r?\n/)[0] ?? "";
  const trennzeichen = trennzeichenVorgabe ?? trennzeichenWaehlen(kopfzeile);
  const zeilen = zeilenLesen(text, trennzeichen);
  if (zeilen.length === 0) return { kopf: [], reihen: [], trennzeichen, fehler: "keine Zeile in der Datei" };
  const kopf = (zeilen[0] ?? []).map((k) => k.replace(/^\uFEFF/, "").trim());
  const reihen = zeilen.slice(1).map((r) => zellenAusZeile(r, kopf));
  return { kopf, reihen, trennzeichen, fehler: null };
}

/**
 * Eine Tabelle in Notizen verwandeln. Asynchron: 1500 Zeilen dürfen den Lauf
 * nicht für alles andere stillstellen, also gibt er alle hundert ab.
 */
export async function importTabelle(store: KeptaStore, pfad: string, opts: TabelleOpts = {}): Promise<TabelleZusammenfassung> {
  const ladung = kennwort(opts.ladung ?? new Date().toISOString().replace(/[-:TZ.]/g, "").slice(0, 13)) || `zeit${Date.now()}`;
  const ladungsTag = `ladung-${ladung}`;
  const zusammenfassung: TabelleZusammenfassung = {
    quelle: QUELLE,
    ladung,
    trocken: opts.dryRun === true,
    zeilen: 0,
    imported: 0,
    updated: 0,
    unveraendert: 0,
    wiederhergestellt: 0,
    duplikateInDerLadung: 0,
    bereitsVorhanden: 0,
    abgeschnitten: 0,
    pruefungUebersprungen: 0,
    pruefungVorlauf: null,
    pruefungVorlaufKnoten: 0,
    kandidaten: [],
    gruende: [],
    spalten: { kopf: [], erkannt: {}, trennzeichen: "" },
    uebrig: [],
    zeit: { quelle: 0, datei: 0, import: 0 },
    bestand: { vorher: store.countMemories().active, nachher: 0 },
    bremse: null,
    fehler: [],
  };
  const meldeMappe = new Map<string, number>();
  const melde = (grund: string) => meldeMappe.set(grund, (meldeMappe.get(grund) ?? 0) + 1);

  const erlaubteRoh = (opts.erlaubteWurzeln ?? [os.homedir(), os.tmpdir()]).map((w) => path.resolve(w));
  const erlaubte = erlaubteRoh.map((w) => {
    try {
      return fs.realpathSync(w);
    } catch {
      return w;
    }
  });
  const beide = [...new Set([...erlaubteRoh, ...erlaubte])];
  const ziel = path.resolve(pfad);
  if (!bleibtInDenWurzeln(ziel, beide)) {
    throw new Error(`no import from this place: ${ortFürMeldung(ziel)} — KEPTA reads only your home folder and the system temp (${erlaubteRoh.join(", ")}). Next: copy the table into your Downloads folder and run the command again, or name another root with the roots option.`);
  }
  // Q-18, dieselbe Schleuse wie die Inbox: erst der Blick auf den Eintrag selbst
  // (ein Link ist kein Lesestoff), dann die echte Lage. Der Ort oben ist schon
  // gegen die erlaubten Wurzeln geprüft — ein Symlink zeigt aus ihnen hinaus.
  let eintrag: fs.Stats;
  try {
    eintrag = fs.lstatSync(ziel);
  } catch (e) {
    throw new Error(`cannot read ${ortFürMeldung(ziel)}: ${e instanceof Error ? e.message : String(e)}`);
  }
  if (eintrag.isSymbolicLink()) {
    throw new Error(`${ortFürMeldung(ziel)} is a symlink — KEPTA imports the real file. Point the command at the file the link points to, or copy it in.`);
  }
  if (!eintrag.isFile()) {
    throw new Error(`${ortFürMeldung(ziel)} is not a file — this command reads one .csv or .jsonl table`);
  }
  let text: string;
  try {
    text = fs.readFileSync(fs.realpathSync(ziel), "utf8");
  } catch (e) {
    throw new Error(`cannot read ${ortFürMeldung(ziel)}: ${e instanceof Error ? e.message : String(e)}`);
  }
  const wurzel8 = wurzelKennung(path.dirname(ziel));
  const { kopf, reihen, trennzeichen, fehler } = einlesen(text, opts.trennzeichen);
  zusammenfassung.spalten.trennzeichen = trennzeichen;
  zusammenfassung.spalten.kopf = kopf;
  if (fehler) {
    zusammenfassung.fehler.push(`${path.basename(ziel)}: ${fehler}`);
    zusammenfassung.gruende = [{ grund: fehler, anzahl: 1 }];
    zusammenfassung.bestand.nachher = store.countMemories().active;
    zusammenfassung.bremse = bremseLesen(zusammenfassung.bestand.nachher);
    return zusammenfassung;
  }
  const plan = planAusKopf(kopf, opts.spalten);
  for (const [feld, spalte] of Object.entries(plan.spalten)) if (spalte !== undefined) zusammenfassung.spalten.erkannt[feld] = spalte;
  zusammenfassung.uebrig = plan.uebrig;
  if (!plan.spalten.inhalt) {
    melde(`inhaltsspalte nicht erkannt — Kopfzeile: ${kopf.join(", ") || "leer"}. KEPTA kennt: ${WORTE.inhalt.join(", ")}. Nenne die Spalte ausdruecklich, statt sie zu raten.`);
    zusammenfassung.gruende = [...meldeMappe.entries()].map(([grund, anzahl]) => ({ grund, anzahl }));
    zusammenfassung.bestand.nachher = store.countMemories().active;
    zusammenfassung.bremse = bremseLesen(zusammenfassung.bestand.nachher);
    return zusammenfassung;
  }

  const gegenBestand = opts.gegenBestand !== false;
  const vorrat = gegenBestand ? await wortlautVorrat(store) : null;
  if (vorrat) {
    zusammenfassung.pruefungVorlauf = vorrat.ms;
    zusammenfassung.pruefungVorlaufKnoten = vorrat.knoten;
  }
  const importMoment = Date.now();
  const inDerLadung = new Set<string>();

  for (let nummer = 0; nummer < reihen.length; nummer++) {
    const reihe = reihen[nummer]!;
    zusammenfassung.zeilen += 1;
    if (zusammenfassung.zeilen % ERGEBUNG_EILE === 0) {
      opts.fortschritt?.({ verarbeitet: zusammenfassung.zeilen, gesamt: reihen.length });
      await ergebung();
    }
    const content = (reihe[plan.spalten.inhalt] ?? "").trim();
    if (!content) {
      melde("leere zeile");
      continue;
    }
    if (content.length < MIN_LAENGE) {
      melde("zu kurz");
      continue;
    }
    const zeitMs = plan.spalten.zeit ? datumAus(reihe[plan.spalten.zeit]) : null;
    const zeit: "quelle" | "import" = zeitMs !== null ? "quelle" : "import";
    const kopftitel = plan.spalten.titel ? (reihe[plan.spalten.titel] ?? "").trim() : "";
    const ersteZeile = content.split("\n").map((z) => z.trim()).find(Boolean) ?? content;
    const title = kopftitel || ersteZeile.replace(/^#+\s*/, "").replace(/[*_`>#]/g, "").slice(0, 120).trim() || `Zeile ${nummer + 1}`;
    const idWert = plan.spalten.id ? kennwort(reihe[plan.spalten.id] ?? "") : "";
    const tagsRoh = plan.spalten.tags ? (reihe[plan.spalten.tags] ?? "") : "";
    const tags = normalizeTags([
      ...tagsRoh.split(/[;|]/g).map((t) => t.trim()),
      `import-${QUELLE}`,
      ladungsTag,
      `zeit-${zeit}`,
    ]);
    const typWert = plan.spalten.typ ? (reihe[plan.spalten.typ] ?? "").trim().toLowerCase() : "";
    const input: MemoryInput = {
      id: `${QUELLE}:${wurzel8}:${path.basename(ziel).replace(/\.[^.]+$/, "").slice(0, 24)}:${idWert || `zeile-${nummer + 1}`}`,
      scope: opts.scope ?? (plan.spalten.scope ? reihe[plan.spalten.scope]?.trim() || undefined : undefined) ?? "local",
      type: (GUELTIGE_TYPEN as readonly string[]).includes(typWert) ? (typWert as MemoryType) : undefined,
      title: title.slice(0, 200),
      content,
      tags,
      confidence: 0.7,
      validFrom: zeitMs,
      validTo: null,
      createdAt: zeitMs ?? importMoment,
      updatedAt: undefined,
    };

    const schluessel = normiert(input.content);
    if (inDerLadung.has(schluessel)) {
      zusammenfassung.duplikateInDerLadung += 1;
      melde("derselbe wortlaut schon in dieser ladung");
      continue;
    }
    inDerLadung.add(schluessel);
    zusammenfassung.zeit[zeit] += 1;

    const bestehend = store.getMemory(input.id!);
    if (bestehend && !bestehend.deletedAt && bestehend.title === input.title && bestehend.content === input.content) {
      zusammenfassung.unveraendert += 1;
      continue;
    }
    const wortlaut = vorrat?.finden(input.content, input.id!) ?? null;
    if (!vorrat) zusammenfassung.pruefungUebersprungen += 1;
    if (wortlaut) {
      zusammenfassung.bereitsVorhanden += 1;
      if (zusammenfassung.kandidaten.length < ERGEBNIS_KAPPE) {
        zusammenfassung.kandidaten.push({ neu: input.id!, bestehend: wortlaut, grund: "gleicher wortlaut" });
      }
      melde("gleicher wortlaut bereits im bestand");
      continue;
    }
    if (zusammenfassung.trocken) {
      zusammenfassung.imported += 1;
      continue;
    }
    if (bestehend?.deletedAt) {
      store.restoreMemory(input.id!);
      zusammenfassung.wiederhergestellt += 1;
    }
    const { record, created } = store.upsertMemory(input);
    indexMemory(store, record.id);
    vorrat?.legeAn(input.content, record.id);
    if (record.content.length < input.content.length) zusammenfassung.abgeschnitten += 1;
    if (created) zusammenfassung.imported += 1;
    else zusammenfassung.updated += 1;
  }

  opts.fortschritt?.({ verarbeitet: zusammenfassung.zeilen, gesamt: reihen.length });

  zusammenfassung.gruende = [...meldeMappe.entries()].map(([grund, anzahl]) => ({ grund, anzahl })).sort((a, b) => b.anzahl - a.anzahl);
  zusammenfassung.bestand.nachher = store.countMemories().active;
  zusammenfassung.bremse = bremseLesen(zusammenfassung.bestand.nachher);
  return zusammenfassung;
}

function wurzelKennung(pfad: string): string {
  return crypto.createHash("sha256").update(pfad).digest("hex").slice(0, 8);
}

/**
 * Eine Ladung abbestellen — nur Knoten dieser Quelle mit diesem Ladungs-Kenner,
 * in den Papierkorb, nicht weg.
 */
export function ladungVerwerfen(store: KeptaStore, ladung: string, seitenGroesse = 500): { abgegeben: number; andereQuellen: number } {
  const tag = ladung.startsWith("ladung-") ? ladung : `ladung-${ladung}`;
  const ids: string[] = [];
  let andereQuellen = 0;
  for (let seite = 0; ; seite++) {
    const knoten = store.listMemories({ tag, limit: seitenGroesse, offset: seite * seitenGroesse });
    if (knoten.length === 0) break;
    for (const k of knoten) {
      if (!k.tags.includes(`import-${QUELLE}`)) {
        andereQuellen += 1;
        continue;
      }
      ids.push(k.id);
    }
  }
  let abgegeben = 0;
  for (const id of ids) if (store.trashMemory(id)) abgegeben += 1;
  return { abgegeben, andereQuellen };
}

export const TABELLE_HINWEIS = "usage: npx -y kepta-mcp import tabelle <datei.csv | datei.jsonl> [--dry-run] [--ladung <name>] [--spalte titel=...]";
