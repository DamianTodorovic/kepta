// Der Ordner-Weg: ein ganzer Bestand eigener Markdown- und Textdateien.
//
// Was dieser Weg gegenüber `src/core/obsidian.ts` anders macht — alles gemessen
// am 10.10. mit einer Sonde, nicht am Quelltext erraten:
//   - obsidian.ts kennt als Datum nur `created:`/`valid_from:` im Frontmatter.
//     Eine Datei ohne Frontmatter bekam `created_at = jetzt`; ihr Plattendatum
//     (mtime) wurde nie gelesen: in asOf(2020) war eine Notiz von 2019 nicht da.
//   - Tags blieben leer: keine Quellen-Kennung, keine Ladungs-Kennung, also
//     weder zu finden noch abbestellbar.
//   - confidence 1 für fremde Dateien: „verifiziert" für etwas, das nur hier
//     durchgewandert ist.
//
// Zeitregel (entschieden, weil die Alternative eine Erfindung wäre):
//   Frontmatter-Datum  -> Geltungsbeginn, Tag `zeit-quelle`
//   Plattendatum       -> Anlagezeit, Geltungsbeginn bleibt offen, Tag `zeit-datei`
//   gar kein Datum     -> Importmoment, Tag `zeit-import`
// Ein Plattendatum außerhalb eines glaubhaften Bereichs (vor 1990, in der
// Zukunft) ist kein Datum, sondern ein Umtausch-Artefakt und zählt als Import.
//
// Die Schleuse folgt dem Weg, den Q-18 für die Inbox härtete: `lstat` auf den
// Eintrag selbst und `fs.realpath` auf die echte Lage statt einem blinden
// `path.resolve` — sonst läuft ein Link aus dem erlaubten Ordner hinaus und
// schreibt einen fremden Baum in die eigene verschlüsselte Datenbank.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { KeptaStore, normalizeTags } from "./store";
import type { MemoryInput, MemoryType } from "./types";
import { indexMemory } from "./engine";
import { parseFrontmatter } from "./obsidian";

const QUELLE = "datei";
const ENDUNGEN = /\.(md|markdown|txt)$/i;
const MIN_LAENGE = 8;
const ERGEBNIS_KAPPE = 50;
const ERGEBUNG_EILE = 100;
const GROESSEN_KAPPE = 25 * 1024 * 1024;
const GLAUBHAFT_AB = Date.parse("1990-01-01T00:00:00Z");
/** Der Deckel des Speichers: store.ts kappt den Inhalt auf 200.000 Zeichen. */
const INHALTS_KAPPE = 200_000;
const GUELTIGE_TYPEN = ["semantic", "episodic", "procedural", "reference"] as const;

export interface Abweisung {
  ort: string;
  grund: string;
}

export interface ImportGrund {
  grund: string;
  anzahl: number;
}

export interface Bremse {
  grenze: number;
  bestand: number;
  ueber: boolean;
}

export interface OrdnerZusammenfassung {
  quelle: typeof QUELLE;
  ladung: string;
  trocken: boolean;
  /** Gelesene Dateien — was liegenblieb, steht in gruende und abgelehnt. */
  dateien: number;
  imported: number;
  updated: number;
  unveraendert: number;
  wiederhergestellt: number;
  duplikateInDerLadung: number;
  bereitsVorhanden: number;
  /** Notizen, deren Wortlaut die Speicher-Kappe gekappt hat — nie still. */
  abgeschnitten: number;
  /** Wie vielemale eine bestehende private Notiz nicht herabgesetzt wurde. */
  privatGeschuetzt: number;
  pruefungUebersprungen: number;
  /** Der eine Blick durch den bestand: wie lang, und über wievielt knoten. */
  pruefungVorlauf: number | null;
  pruefungVorlaufKnoten: number;
  kandidaten: { neu: string; bestehend: string; grund: string }[];
  gruende: ImportGrund[];
  abgelehnt: Abweisung[];
  abgelehnte: number;
  zeit: { quelle: number; datei: number; import: number };
  bestand: { vorher: number; nachher: number };
  bremse: Bremse | null;
  fehler: string[];
}

export interface OrdnerOpts {
  dryRun?: boolean;
  ladung?: string;
  scope?: string;
  gegenBestand?: boolean;
  erlaubteWurzeln?: string[];
  /** Dateien über dieser Größe bleiben liegen und werden gemeldet (default 25 MB). */
  dateiGroesse?: number;
  /**
   * Herzschlag für lange Ladungen: wird alle hundert angesehenen Dateien gerufen
   * und ein letztes Mal am Schluss. `gesamt` ist, was der Lauf weiß — bei einem
   * Strom ohne vorab bekannte Zahl ist das die Zahl der bisher gesehenen.
   */
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

function keineErlaubteWurzelText(pfad: string, erlaubte: string[]): string {
  return `no import from this place: ${ortFürMeldung(pfad)} — KEPTA reads only your home folder and the system temp (${erlaubte.join(", ")}). Next: copy the folder into your Downloads folder and run the command again, or name another root with the roots option.`;
}

/** Pfad-relativ, nicht startsWith: „/home/x-anderer" darf nicht durch „/home/x" rutschen. */
function bleibtInDenWurzeln(pfadReal: string, erlaubte: string[]): boolean {
  return erlaubte.some((w) => {
    const rel = path.relative(w, pfadReal);
    return rel !== "" && !rel.startsWith("..") && !path.isAbsolute(rel);
  });
}

function wurzelKennung(pfad: string): string {
  return crypto.createHash("sha256").update(pfad).digest("hex").slice(0, 8);
}

function epochAus(wert: unknown): number | null {
  if (typeof wert === "number" && Number.isFinite(wert) && wert > 0) return wert < 1e11 ? Math.round(wert * 1000) : Math.round(wert);
  if (typeof wert === "string" && wert.trim()) {
    const t = Date.parse(wert.trim());
    return Number.isNaN(t) ? null : t;
  }
  return null;
}

interface Dateieintrag {
  /** Relativer Pfad innerhalb des Wurzelordners, immer mit „/". */
  relativ: string;
  absolut: string;
  /** Plattendatum in Epoch-ms, schon auf Glaubwürdigkeit geprüft. */
  mtime: number | null;
  groesse: number;
}

/**
 * Der Baum, so wie er da steht — mit der Schleuse aus Q-18: erst `lstat` auf den
 * Eintrag selbst (ein Link ist kein Lesestoff), dann `realpath` auf die echte
 * Lage (sie muss in dem Ordner bleiben, den der Nutzer gezeigt hat). Ein blindes
 * `path.resolve` ließe beides durch, und ein Ordner-Vollzug würde den Inhalt
 * eines fremden Baums in die eigene verschlüsselte Datenbank schreiben.
 */
function dateienFinden(wurzel: string, wurzelReal: string): { dateien: Dateieintrag[]; abgelehnt: Abweisung[] } {
  const abgelehnt: Abweisung[] = [];
  const out: Dateieintrag[] = [];
  const stapel: { ordner: string; real: string }[] = [{ ordner: wurzel, real: wurzelReal }];
  while (stapel.length > 0) {
    const oben = stapel.pop()!;
    let einträge: fs.Dirent[];
    try {
      einträge = fs.readdirSync(oben.ordner, { withFileTypes: true });
    } catch (e) {
      abgelehnt.push({ ort: path.relative(wurzel, oben.ordner) || ".", grund: `ordner nicht lesbar: ${e instanceof Error ? e.message : String(e)}` });
      continue;
    }
    for (const eintrag of einträge) {
      if (eintrag.name.startsWith(".") || eintrag.name === "node_modules") continue;
      const voll = path.join(oben.ordner, eintrag.name);
      const relativ = path.relative(wurzel, voll).split(path.sep).join("/");
      let stat: fs.Stats;
      try {
        stat = fs.lstatSync(voll);
      } catch (e) {
        abgelehnt.push({ ort: relativ, grund: `nicht lesbar: ${e instanceof Error ? e.message : String(e)}` });
        continue;
      }
      if (stat.isSymbolicLink()) {
        abgelehnt.push({ ort: relativ, grund: "symlink — the import does not follow links out of the folder" });
        continue;
      }
      let echt: string;
      try {
        echt = fs.realpathSync(voll);
      } catch (e) {
        abgelehnt.push({ ort: relativ, grund: `nicht auflösbar: ${e instanceof Error ? e.message : String(e)}` });
        continue;
      }
      const relZurWurzel = path.relative(wurzelReal, echt);
      if (relZurWurzel.startsWith("..") || path.isAbsolute(relZurWurzel)) {
        abgelehnt.push({ ort: relativ, grund: `liegt nach dem Auflösen außerhalb des Ordners (${ortFürMeldung(echt)})` });
        continue;
      }
      if (stat.isDirectory()) {
        stapel.push({ ordner: voll, real: echt });
        continue;
      }
      if (!stat.isFile()) {
        abgelehnt.push({ ort: relativ, grund: "weder Datei noch Ordner (FIFO, Socket, Gerät)" });
        continue;
      }
      if (!ENDUNGEN.test(eintrag.name)) {
        abgelehnt.push({ ort: relativ, grund: `endung nicht dabei (.${(eintrag.name.split(".").pop() ?? "").toLowerCase()})` });
        continue;
      }
      const mtime = stat.mtimeMs;
      out.push({
        relativ,
        absolut: voll,
        mtime: mtime >= GLAUBHAFT_AB && mtime <= Date.now() ? Math.round(mtime) : null,
        groesse: stat.size,
      });
    }
  }
  return { dateien: out.sort((a, b) => a.relativ.localeCompare(b.relativ)), abgelehnt };
}

/**
 * Der Wortlaut-Vorrat: EIN Blick durch den Bestand, dann kostet die Prüfung
 * nichts mehr. Die Alternative — pro Knoten die Wortspur fragen — ist gemessen
 * superlinear: 2,6 ms je knoten bei 8.000 bestand, 6,8 ms bei 16.000, 11,3 ms
 * bei 24.000 (sonde I-05, 10.10.2026 19:47), weil `store.ftsSearch` zweiphasig
 * ist: bleibt die AND-Phase dünn, zieht sie die OR-Union über alle Terme — und
 * bei einem neuen Wortlaut bleibt sie immer dünn. Der Vorrat liegt bei 24.000
 * knoten in 0,2 s (sonde I-07) und ist dazu exakter: verglichen wird der
 * Wortlaut, nicht ein BM25-Vorschlag.
 *
 * Die Seiten werden zwischendurch abgegeben — 200.000 knoten vorlesen dauert
 * 13,7 s und darf den Lauf nicht stillstellen.
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

/** Eine Datei auf der Platte -> MemoryInput, mit ihrer Zeit an der richtigen Stelle. */
function eingabeAus(
  eintrag: Dateieintrag,
  inhalt: string,
  wurzel8: string,
  ladungsTag: string,
  importMoment: number,
  opts: OrdnerOpts
): { input: MemoryInput | null; grund: string | null; zeit: "quelle" | "datei" | "import" } {
  if (eintrag.groesse > (opts.dateiGroesse ?? GROESSEN_KAPPE)) {
    return { input: null, grund: `zu groß (über ${Math.round((opts.dateiGroesse ?? GROESSEN_KAPPE) / 1024 / 1024)} MB)`, zeit: "import" };
  }
  if (inhalt.includes("\u0000")) return { input: null, grund: "binär — ein speicherabbild, keine schrift", zeit: "import" };
  const { meta, body } = parseFrontmatter(inhalt);
  const pfadOhneEndung = eintrag.relativ.replace(/\.(md|markdown|txt)$/i, "");
  const basis = pfadOhneEndung.split("/").pop()!.trim();
  const metaTitel = typeof meta.title === "string" && !/\{\{|<%/.test(meta.title) ? meta.title.trim() : "";
  const title = metaTitel || basis || "Untitled";
  const content = body.trim();
  // Eine leere Datei bekommt keinen Inhalt aus ihrem Namen — obsidian.ts tat das
  // (`body || title`) und legte damit eine Notiz an, die nur aus dem Titel der
  // Vorlage bestand. Hier fehlt der Grundtext, also fehlt die Notiz.
  if (!content) return { input: null, grund: "leere datei", zeit: "import" };
  if (content.length < MIN_LAENGE) return { input: null, grund: "zu kurz", zeit: "import" };

  const quellZeit = epochAus(meta.valid_from) ?? epochAus(meta.created);
  const zeit: "quelle" | "datei" | "import" = quellZeit !== null ? "quelle" : eintrag.mtime !== null ? "datei" : "import";
  const frontmatterTags = Array.isArray(meta.tags) ? (meta.tags as unknown[]).filter((t): t is string => typeof t === "string") : [];
  const tags = normalizeTags([
    ...frontmatterTags,
    `import-${QUELLE}`,
    ladungsTag,
    `zeit-${zeit}`,
    eintrag.relativ.includes("/") ? `ordner-${kennwort(path.posix.dirname(eintrag.relativ))}` : "",
  ]);
  return {
    input: {
      id: `${QUELLE}:${wurzel8}:${eintrag.relativ}`,
      scope: opts.scope ?? (typeof meta.scope === "string" && meta.scope ? meta.scope : "local"),
      type: (GUELTIGE_TYPEN as readonly string[]).includes(String(meta.type)) ? (meta.type as MemoryType) : undefined,
      title,
      content,
      tags,
      confidence: typeof meta.confidence === "number" ? meta.confidence : 0.7,
      validFrom: quellZeit,
      validTo: epochAus(meta.valid_to),
      createdAt: quellZeit ?? eintrag.mtime ?? importMoment,
      updatedAt: epochAus(meta.updated) ?? undefined,
    },
    grund: null,
    zeit,
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

/**
 * Ein Ordner voller eigener Dateien in den Bestand verwandeln. Asynchron, weil
 * ein Lauf über zehntausend Dateien den Prozess nicht für alles andere
 * stillstellen darf: alle hundert Notizen gibt er den Lauf ab.
 */
export async function importOrdner(store: KeptaStore, pfad: string, opts: OrdnerOpts = {}): Promise<OrdnerZusammenfassung> {
  const ladung = kennwort(opts.ladung ?? new Date().toISOString().replace(/[-:TZ.]/g, "").slice(0, 13)) || `zeit${Date.now()}`;
  const ladungsTag = `ladung-${ladung}`;
  const zusammenfassung: OrdnerZusammenfassung = {
    quelle: QUELLE,
    ladung,
    trocken: opts.dryRun === true,
    dateien: 0,
    imported: 0,
    updated: 0,
    unveraendert: 0,
    wiederhergestellt: 0,
    duplikateInDerLadung: 0,
    bereitsVorhanden: 0,
    abgeschnitten: 0,
    privatGeschuetzt: 0,
    pruefungUebersprungen: 0,
    pruefungVorlauf: null,
    pruefungVorlaufKnoten: 0,
    kandidaten: [],
    gruende: [],
    abgelehnt: [],
    abgelehnte: 0,
    zeit: { quelle: 0, datei: 0, import: 0 },
    bestand: { vorher: store.countMemories().active, nachher: 0 },
    bremse: null,
    fehler: [],
  };
  const gruende = new Map<string, number>();
  const melde = (grund: string) => gruende.set(grund, (gruende.get(grund) ?? 0) + 1);

  const erlaubteRoh = (opts.erlaubteWurzeln ?? [os.homedir(), os.tmpdir()]).map((w) => path.resolve(w));
  // Dieselbe Blickrichtung für beide Seiten: auf macOS ist /tmp ein Link auf
  // /private/tmp, und /var einer auf /private/var.
  const erlaubte = erlaubteRoh.map((w) => {
    try {
      return fs.realpathSync(w);
    } catch {
      return w;
    }
  });
  const beide = [...new Set([...erlaubteRoh, ...erlaubte])];
  const ziel = path.resolve(pfad);
  if (!bleibtInDenWurzeln(ziel, beide)) throw new Error(keineErlaubteWurzelText(ziel, erlaubteRoh));
  let wurzelReal: string;
  try {
    if (fs.lstatSync(ziel).isSymbolicLink()) {
      throw new Error(`${ortFürMeldung(ziel)} is a symlink — KEPTA imports the real folder. Point the command at the folder the link points to, or copy it in.`);
    }
    wurzelReal = fs.realpathSync(ziel);
  } catch (e) {
    if (e instanceof Error && e.message.includes("symlink")) throw e;
    throw new Error(`cannot read ${ortFürMeldung(ziel)}: ${e instanceof Error ? e.message : String(e)}`);
  }
  if (!bleibtInDenWurzeln(wurzelReal, erlaubte)) throw new Error(keineErlaubteWurzelText(wurzelReal, erlaubte));
  if (!fs.statSync(wurzelReal).isDirectory()) throw new Error(`${ortFürMeldung(ziel)} is not a folder — this command reads a folder of .md and .txt files`);

  const wurzel8 = wurzelKennung(wurzelReal);
  const { dateien, abgelehnt } = dateienFinden(ziel, wurzelReal);
  zusammenfassung.abgelehnte = abgelehnt.length;
  for (const a of abgelehnt.slice(0, ERGEBNIS_KAPPE)) zusammenfassung.abgelehnt.push(a);
  for (const a of abgelehnt) melde(a.grund.startsWith("endung") ? "endung nicht dabei" : a.grund);

  const gegenBestand = opts.gegenBestand !== false;
  // Der Blick durch den Bestand kostet O(Bestand) und wird nur gebraucht, wenn
  // wirklich ein neuer Wortlaut eintrifft. Ein Lauf, der nichts ändert, kehrt
  // deshalb den Bestand nicht um — `pruefungVorlauf` bleibt dann null.
  let vorrat: Awaited<ReturnType<typeof wortlautVorrat>> | null = null;
  const besorgeVorrat = async () => {
    if (!vorrat) {
      vorrat = await wortlautVorrat(store);
      zusammenfassung.pruefungVorlauf = vorrat.ms;
      zusammenfassung.pruefungVorlaufKnoten = vorrat.knoten;
    }
    return vorrat;
  };
  const importMoment = Date.now();
  const inDerLadung = new Set<string>();

  for (const eintrag of dateien) {
    zusammenfassung.dateien += 1;
    if (zusammenfassung.dateien % ERGEBUNG_EILE === 0) {
      opts.fortschritt?.({ verarbeitet: zusammenfassung.dateien, gesamt: dateien.length });
      await ergebung();
    }
    let inhalt: string;
    try {
      inhalt = fs.readFileSync(eintrag.absolut, "utf8");
    } catch (e) {
      zusammenfassung.fehler.push(`${eintrag.relativ}: ${e instanceof Error ? e.message : String(e)}`);
      continue;
    }
    const { input, grund, zeit } = eingabeAus(eintrag, inhalt, wurzel8, ladungsTag, importMoment, opts);
    if (!input) {
      melde(grund!);
      continue;
    }
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
    const wortlaut = gegenBestand ? (await besorgeVorrat()).finden(input.content, input.id!) : null;
    if (!gegenBestand) zusammenfassung.pruefungUebersprungen += 1;
    if (wortlaut) {
      zusammenfassung.bereitsVorhanden += 1;
      // Privatheits-Floor, derselbe Grund wie bei findDuplicateForNew
      // (engine.ts:745-752): der Fund nennt eine id, und die Zusammenfassung
      // liest ein Mensch oder — über die MCP-Tür — ein Agent. Eine private
      // Notiz wird deshalb nur als „privat" gemeldet; die Aussage bleibt stecken.
      const privat = store.istPrivat(wortlaut);
      if (zusammenfassung.kandidaten.length < ERGEBNIS_KAPPE) {
        zusammenfassung.kandidaten.push({
          neu: input.id!,
          bestehend: privat ? "privat" : wortlaut,
          grund: privat ? "gleicher wortlaut in einer privaten notiz" : "gleicher wortlaut bereits im bestand",
        });
      }
      melde(privat ? "gleicher wortlaut in einer privaten notiz" : "gleicher wortlaut bereits im bestand");
      continue;
    }
    if (zusammenfassung.trocken) {
      zusammenfassung.imported += 1;
      continue;
    }
    if (bestehend && store.istPrivat(bestehend.id) && input.scope !== "private") {
      // Eine Datei darf ihren Inhalt ändern, aber eine bestehende private Notiz
      // auf „local" zurückzuschreiben macht etwas privates unprivat. Die
      // Reichweite bleibt, was der Bestand schon wusste, und der Lauf sagt es.
      input.scope = undefined;
      zusammenfassung.privatGeschuetzt += 1;
    }
    if (bestehend?.deletedAt) {
      store.restoreMemory(input.id!);
      zusammenfassung.wiederhergestellt += 1;
    }
    const { record, created } = store.upsertMemory(input);
    indexMemory(store, record.id);
    if (gegenBestand) (await besorgeVorrat()).legeAn(input.content, record.id);
    if (record.content.length < input.content.length) zusammenfassung.abgeschnitten += 1;
    // Wiki-Links -> Entitäten, derselbe Ausbau, den der Vault-Weg schon liefert.
    const verweise = [...input.content.matchAll(/\[\[([^[\]]{2,80})\]\]/g)].map((m) => m[1]!.split("|")[0]!.trim().toLowerCase()).filter(Boolean);
    const einde = [...new Set(verweise)];
    if (einde.length > 0) {
      store.linkEntities(record.id, [...einde, record.title.trim().toLowerCase()]);
      const notiz = record.title.trim().toLowerCase();
      for (const zielEntity of einde) if (zielEntity !== notiz) store.addRelation(notiz, zielEntity, "references", record.id, record.validFrom ?? null);
    }
    if (created) zusammenfassung.imported += 1;
    else zusammenfassung.updated += 1;
  }

  opts.fortschritt?.({ verarbeitet: zusammenfassung.dateien, gesamt: dateien.length });

  zusammenfassung.gruende = [...gruende.entries()].map(([grund, anzahl]) => ({ grund, anzahl })).sort((a, b) => b.anzahl - a.anzahl);
  zusammenfassung.bestand.nachher = store.countMemories().active;
  zusammenfassung.bremse = bremseLesen(zusammenfassung.bestand.nachher);
  return zusammenfassung;
}

/**
 * Eine Ladung abbestellen: nur Knoten dieser Quelle mit diesem Ladungs-Kenner.
 * Papierkorb, kein endgültiges Löschen — wer sich verschießt, holt zurück.
 */
export function ladungVerwerfen(store: KeptaStore, ladung: string, seitenGroesse = 500): { abgegeben: number; andereQuellen: number } {
  const tag = ladung.startsWith("ladung-") ? ladung : `ladung-${ladung}`;
  const ids: string[] = [];
  let andereQuellen = 0;
  // Erst sammeln, dann abbestellen: listMemories sieht nur Aktive, ein Offset
  // über eine gerade gelichtete Seite würde Knoten überspringen.
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

export const ORDNER_HINWEIS = "usage: npx -y kepta-mcp import ordner <ordner mit .md und .txt> [--dry-run] [--ladung <name>]";
