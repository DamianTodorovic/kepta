// Claude-Export-Importer — der zweite Chat-Bestand, den ein Nutzer schon hat.
//
// Anthropic legt den Konto-Export als JSON-Array auf (ein Gespräch pro Objekt,
// `chat_messages` mit `sender`/`text`), ein Projekt-Export als Ordner mit einem
// JSON je Gespräch, Claude Code als JSONL mit einer Zeile je Nachricht. Diese
// Datei ließt alle drei Formen und meldet hörbar, wenn sie keine davon erkennt:
// ein Export, dessen Feldernamen nicht passen, dürfen nie als „0 Notizen,
// Exit 0" enden (die Klasse ist bereits in einem anderen Produkt aufgetreten —
// `sender` gegen `role`).
//
// Vier Versprechen, dieselben wie beim ChatGPT-Weg, weil ein Import eins ist:
//   Zeit    — gilt nach dem Datum der Quelle; fehlt es, gilt der Importmoment
//             und die Notiz trägt das Tag `zeit-import`. Nie ein erfundenes
//             Frühjar.
//   Ladung  — jede Ladung hat einen Kennung, mit der sie allein wieder abbestellt
//             werden kann (`ladungVerwerfen`), und einen Quellen-Fußabdruck
//             (`import-claude`), damit zwei Quellen sich nicht gegenseitig löschen.
//   Duplett — derselbe Wortlaut landet einmal; ein Fund gegen den Bestand wird
//             als Kandidat gemeldet (consolidate/contradict), nicht als zweite Notiz.
//   Vorschau — dryRun zählt, was reinkäme, und warum der Rest nicht reinkäme.
//
// Aufruf (Klemme in src/mcp-server.ts trägt die Leitung nach, E4 sitzt dort):
//   npx -y kepta-mcp import claude <conversations.json | ordner> [--dry-run]
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { KeptaStore, normalizeTags } from "./store";
import type { MemoryInput } from "./types";
import { indexMemory } from "./engine";

const QUELLE = "claude";
const MIN_LAENGE = 8;
const ERGEBNIS_KAPPE = 50;
const ERGEBUNG_EILE = 100;

export interface ImportGrund {
  grund: string;
  anzahl: number;
}

export interface Bremse {
  grenze: number;
  bestand: number;
  ueber: boolean;
}

/** Eine Abweisung: was wo liegenblieb und warum. Ein Symlink ist Lesestoff eines anderen Ordners. */
export interface Abweisung {
  ort: string;
  grund: string;
}

export interface ClaudeZusammenfassung {
  quelle: typeof QUELLE;
  ladung: string;
  trocken: boolean;
  dateien: number;
  gespraeche: number;
  nachrichten: number;
  nutzerNachrichten: number;
  assistantUebersprungen: number;
  zuKurz: number;
  imported: number;
  updated: number;
  unveraendert: number;
  wiederhergestellt: number;
  duplikateInDerLadung: number;
  bereitsVorhanden: number;
  /** Wie vielemal eine bestehende private Notiz nicht herabgesetzt wurde. */
  privatGeschuetzt: number;
  /** Zählung der Neu-Knoten, die nicht gegen den Bestand geprüft wurden. */
  pruefungUebersprungen: number;
  /** Der eine Blick durch den bestand: wie lang, und über wievielt knoten. */
  pruefungVorlauf: number | null;
  pruefungVorlaufKnoten: number;
  kandidaten: { neu: string; bestehend: string; grund: string }[];
  gruende: ImportGrund[];
  /** Abweisungen aus der Schleuse (geknappt), abgelehnte die volle Zahl. */
  abgelehnt: Abweisung[];
  abgelehnte: number;
  zeit: { quelle: number; datei: number; import: number };
  bestand: { vorher: number; nachher: number };
  /** Die Bremse wird nicht gefragt, aber sie wird genannt (server.ts, KEPTA_MAX_ACTIVE). */
  bremse: Bremse | null;
  fehler: string[];
}

export interface ClaudeOpts {
  dryRun?: boolean;
  ladung?: string;
  scope?: string;
  /** Duplikatsprüfung gegen den Bestand (default an). Aus = gemeldete Lücke. */
  gegenBestand?: boolean;
  /** Die Schleuse darf erweitern, nie verengen: default Home und System-Temp. */
  erlaubteWurzeln?: string[];
  /** Herzschlag: alle hundert angesehenen Nutzer-Nachrichten und ein letztes Mal am Schluss. */
  fortschritt?: (stand: { verarbeitet: number; gesamt: number }) => void;
}

interface Nachr {
  teilId: string;
  rolle: "nutzer" | "kuenstler";
  text: string;
  zeitMs: number | null;
}

interface Gespr {
  id: string;
  titel: string;
  zeitMs: number | null;
  nachrichten: Nachr[];
}

// ---------- Formen erkennen ----------

function textAus(beitrag: unknown): string {
  if (typeof beitrag === "string") return beitrag.trim();
  if (Array.isArray(beitrag)) return beitrag.map(textAus).filter(Boolean).join("\n").trim();
  if (beitrag && typeof beitrag === "object") {
    const o = beitrag as Record<string, unknown>;
    for (const schluessel of ["text", "content", "parts", "value"] as const) {
      if (o[schluessel] !== undefined) {
        const t = textAus(o[schluessel]);
        if (t) return t;
      }
    }
  }
  return "";
}

/** Sekunden, Millisekunden oder ISO — die drei Formen, die Exporte wirklich schreiben. */
export function epochAus(wert: unknown): number | null {
  if (typeof wert === "number" && Number.isFinite(wert) && wert > 0) {
    return wert < 1e11 ? Math.round(wert * 1000) : Math.round(wert);
  }
  if (typeof wert === "string" && wert.trim()) {
    const t = Date.parse(wert.trim());
    if (!Number.isNaN(t)) return t;
    const alsZahl = Number(wert.trim());
    if (Number.isFinite(alsZahl) && alsZahl > 0) return epochAus(alsZahl);
  }
  return null;
}

function rolleAus(roh: unknown): "nutzer" | "kuenstler" | null {
  let wort = "";
  if (typeof roh === "string") wort = roh;
  else if (roh && typeof roh === "object") wort = String((roh as Record<string, unknown>).role ?? "");
  const k = wort.toLowerCase().trim();
  if (k === "user" || k === "human" || k === "nutzer" || k === "you") return "nutzer";
  if (k === "assistant" || k === "claude" || k === "ai" || k === "bot") return "kuenstler";
  return null;
}

function nachrichtenListe(objekt: Record<string, unknown>): unknown[] | null {
  for (const schluessel of ["chat_messages", "messages", "turns", "conversations"]) {
    const wert = objekt[schluessel];
    if (Array.isArray(wert)) return wert;
  }
  return null;
}

function kennung(von: Record<string, unknown>, ersatz: string): string {
  for (const schluessel of ["uuid", "id", "conversation_id", "chat_uuid"]) {
    const wert = von[schluessel];
    if (typeof wert === "string" && wert.trim()) return wert.trim();
    if (typeof wert === "number") return String(wert);
  }
  return ersatz;
}

/** Ein Gesprächs-Objekt (Konto-Export, Projekt-Export, Zeile in Datei-Form). */
function gespraechAusObjekt(objekt: unknown, herkunft: string, laufnummer: number): Gespr | null {
  if (!objekt || typeof objekt !== "object") return null;
  const o = objekt as Record<string, unknown>;
  const liste = nachrichtenListe(o);
  if (!liste) return null;
  const id = kennung(o, `${herkunft}#${laufnummer}`);
  const titel = ["name", "title", "summary"].map((k) => (typeof o[k] === "string" ? (o[k] as string).trim() : "")).find(Boolean) ?? "";
  const gespraechZeit = epochAus(o.created_at ?? o.create_time ?? o.timestamp ?? o.updated_at);
  const nachrichten: Nachr[] = [];
  let stelle = 0;
  for (const teil of liste) {
    if (!teil || typeof teil !== "object") continue;
    const t = teil as Record<string, unknown>;
    // Claude-Code-Zeilen: { type: "user", message: { role, content } }
    const kern = (t.message && typeof t.message === "object" ? t.message : t) as Record<string, unknown>;
    const rolle = rolleAus(kern.sender ?? kern.author ?? kern.role ?? t.sender ?? t.type ?? t.role);
    if (!rolle) continue;
    const text = textAus(kern.content ?? kern.text ?? t.content ?? t.text);
    if (!text) continue;
    nachrichten.push({
      teilId: kennung(t, kennung(kern, `n${stelle}`)),
      rolle,
      text,
      zeitMs: epochAus(kern.created_at ?? kern.timestamp ?? t.timestamp ?? t.created_at) ?? gespraechZeit,
    });
    stelle++;
  }
  if (nachrichten.length === 0) return null;
  return { id, titel, zeitMs: gespraechZeit, nachrichten };
}

/** JSONL, in dem eine Zeile eine Nachricht ist (Claude Code) — nach Sitzung gruppiert. */
function gespraecheAusNachrichtenstrom(zeilen: Record<string, unknown>[], herkunft: string): Gespr[] {
  const gruppen = new Map<string, Gespr>();
  for (let i = 0; i < zeilen.length; i++) {
    const z = zeilen[i]!;
    const kern = (z.message && typeof z.message === "object" ? z.message : z) as Record<string, unknown>;
    const rolle = rolleAus(kern.role ?? kern.sender ?? z.type ?? z.role);
    if (!rolle) continue;
    const text = textAus(kern.content ?? kern.text ?? z.content ?? z.text);
    if (!text) continue;
    const sitzung = typeof z.sessionId === "string" && z.sessionId ? z.sessionId : typeof z.uuid === "string" && z.uuid ? z.uuid : herkunft;
    let g = gruppen.get(sitzung);
    if (!g) {
      const titel = typeof z.project === "string" ? path.basename(z.project) : "";
      g = { id: sitzung, titel, zeitMs: epochAus(z.timestamp ?? z.created_at), nachrichten: [] };
      gruppen.set(sitzung, g);
    }
    g.nachrichten.push({ teilId: kennung(z, `n${i}`), rolle, text, zeitMs: epochAus(z.timestamp ?? z.created_at) ?? g.zeitMs });
  }
  return [...gruppen.values()].filter((g) => g.nachrichten.length > 0);
}

/**
 * Eine Liste von Knoten in Gespräche verwandeln: erst die Form „ein Objekt je
 * Gespräch", dann die Form „eine Zeile je Nachricht". Beides scheitern lassen
 * heißt: formFremd, und das sagt der Import dem Nutzer statt 0 Notizen zu zählen.
 */
function gespraecheAusListe(liste: unknown[], herkunft: string): { gespraeche: Gespr[]; formFremd: boolean } {
  const out: Gespr[] = [];
  const fusion = (g: Gespr) => {
    const bestehende = out.find((x) => x.id === g.id);
    if (bestehende) bestehende.nachrichten.push(...g.nachrichten);
    else out.push(g);
  };
  for (let i = 0; i < liste.length; i++) {
    const g = gespraechAusObjekt(liste[i], herkunft, i);
    if (g) out.push(g);
  }
  if (out.length > 0) return { gespraeche: out, formFremd: false };
  for (const element of liste) {
    if (!element || typeof element !== "object") continue;
    for (const g of gespraecheAusNachrichtenstrom([element as Record<string, unknown>], herkunft)) fusion(g);
  }
  if (out.length > 0) return { gespraeche: out, formFremd: false };
  return { gespraeche: [], formFremd: liste.length > 0 };
}

function gespraecheAusRoh(daten: unknown, herkunft: string): { gespraeche: Gespr[]; formFremd: boolean } {
  if (Array.isArray(daten)) return gespraecheAusListe(daten, herkunft);
  if (daten && typeof daten === "object") {
    const o = daten as Record<string, unknown>;
    const unter = o.conversations ?? o.chats ?? o.history;
    if (Array.isArray(unter)) return gespraecheAusListe(unter, herkunft);
    const einzeln = gespraechAusObjekt(o, herkunft, 0);
    if (einzeln) return { gespraeche: [einzeln], formFremd: false };
    const strom = gespraecheAusNachrichtenstrom([o], herkunft);
    if (strom.length > 0) return { gespraeche: strom, formFremd: false };
  }
  return { gespraeche: [], formFremd: true };
}

/**
 * Ganze Datei zuerst: ein Konto-Export ist ein JSON-Dokument. Scheitert das,
 * ist die Datei JSONL — eine Zeile je Gespräch oder je Nachricht. Ein zeilenweiser
 * Versuch zuerst hätte ein JSON-Array als „eine Zeile" missdeutet.
 */
function parsText(inhalt: string, herkunft: string): { gespraeche: Gespr[]; formFremd: boolean; fehler: string | null } {
  try {
    return { ...gespraecheAusRoh(JSON.parse(inhalt), herkunft), fehler: null };
  } catch {
    // JSONL: leerzeilenfreie Zeilen, jede ein eigenständiger Wert.
    const zeilen = inhalt
      .split(/\r?\n/)
      .map((z) => z.trim())
      .filter(Boolean)
      .map((z) => {
        try {
          return JSON.parse(z) as unknown;
        } catch {
          return undefined;
        }
      });
    if (zeilen.length === 0 || zeilen.some((z) => z === undefined)) {
      return { gespraeche: [], formFremd: false, fehler: "weder JSON noch JSONL — keine Zeile lies einen Wert" };
    }
    return { ...gespraecheAusListe(zeilen as unknown[], herkunft), fehler: null };
  }
}

// ---------- Notiz-Form ----------

function titelAus(text: string): string {
  const erste = text.split("\n").map((z) => z.trim()).find((z) => z.length > 0) ?? text;
  return erste.replace(/^#+\s*/, "").replace(/[*_`>#]/g, "").slice(0, 120).trim();
}

function kennwort(text: string, laenge = 24): string {
  const k = text
    .toLowerCase()
    .replace(/[^a-z0-9äöüß_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, laenge)
    .replace(/-+$/g, "");
  return k;
}

function normiert(text: string): string {
  return text.toLowerCase().replace(/\s+/g, " ").trim();
}

/**
 * Exakter Wortlaut, schon im Bestand? Die Wortspur liefert die Kandidaten,
 * verglichen wird der normalisierte Volltext — ein BM25-Fund ist ein Vorschlag,
 * keine Gleichheit.
 */
/**
 * Der Wortlaut-Vorrat: EIN Blick durch den Bestand, dann kostet die Prüfung
 * nichts mehr. Pro Knoten die Wortspur zu fragen ist gemessen superlinear —
 * 138 ms je anfrage bei 200.000 knoten (sonde I-08, 10.10.2026 19:54), weil
 * `store.ftsSearch` zweiphasig ist und bei einem neuen wortlaut immer die
 * OR-Union über alle Terme zieht. Der Vorrat liegt in 0,2 s bei 24.000 knoten
 * und vergleicht dazu den wortlaut statt eines BM25-Vorschlags.
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

function eingabeAus(g: Gespr, n: Nachr, opts: ClaudeOpts, ladungsTag: string, zeitImport: number): { input: MemoryInput | null; grund: string | null } {
  const text = n.text.trim();
  if (text.length < MIN_LAENGE) return { input: null, grund: "zu kurz" };
  const zeitMs = n.zeitMs;
  const tags = normalizeTags([
    `import-${QUELLE}`,
    ladungsTag,
    zeitMs !== null ? "zeit-quelle" : "zeit-import",
    g.titel ? `gespraech-${kennwort(g.titel)}` : "",
  ]);
  return {
    input: {
      id: `${QUELLE}:${g.id}:${n.teilId}`,
      scope: opts.scope ?? "local",
      type: undefined,
      title: titelAus(text) || g.titel || "Claude import",
      content: text,
      tags,
      confidence: 0.7,
      validFrom: zeitMs,
      validTo: null,
      createdAt: zeitMs ?? zeitImport,
      updatedAt: zeitMs ?? undefined,
    },
    grund: null,
  };
}

function bremseLesen(bestand: number): Bremse | null {
  const roh = Number(process.env.KEPTA_MAX_ACTIVE);
  const grenze = Number.isFinite(roh) && roh > 0 ? Math.floor(roh) : 5000;
  return { grenze, bestand, ueber: bestand > grenze };
}

// ---------- der Weg ----------

export async function importClaudePfad(store: KeptaStore, pfad: string, opts: ClaudeOpts = {}): Promise<ClaudeZusammenfassung> {
  const ladung = kennwort(opts.ladung ?? new Date().toISOString().replace(/[-:TZ.]/g, "").slice(0, 13)) || `ladung-${Date.now()}`;
  const ladungsTag = `ladung-${ladung}`;
  const zusammenfassung: ClaudeZusammenfassung = {
    quelle: QUELLE,
    ladung: ladung,
    trocken: opts.dryRun === true,
    dateien: 0,
    gespraeche: 0,
    nachrichten: 0,
    nutzerNachrichten: 0,
    assistantUebersprungen: 0,
    zuKurz: 0,
    imported: 0,
    updated: 0,
    unveraendert: 0,
    wiederhergestellt: 0,
    duplikateInDerLadung: 0,
    bereitsVorhanden: 0,
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

  // Die erlaubten Wurzeln müssen dieselbe Blickrichtung haben wie der Zielort:
  // ein aufgelöster. Auf macOS ist /tmp ein Link auf /private/tmp — gegen die
  // un aufgelöste Wurzel geprüft, würde jeder System-Temp-Import abgewiesen.
  const erlaubteRoh = (opts.erlaubteWurzeln ?? [os.homedir(), os.tmpdir()]).map((w) => path.resolve(w));
  // Dieselbe Blickrichtung für beide Seiten: auf macOS ist /var ein Link auf
  // /private/var, und /tmp auf /private/tmp. Gegen die un aufgelöste Wurzel
  // geprüft, würde jeder System-Temp-Import abgewiesen.
  const erlaubte = erlaubteRoh.map((w) => {
    try {
      return fs.realpathSync(w);
    } catch {
      return w;
    }
  });
  const beide = [...new Set([...erlaubteRoh, ...erlaubte])];
  const ziel = path.resolve(pfad);
  // Vorhaltungen, beide vor dem ersten Leseversuch: die angesprochene Lage und
  // die echte Lage nach dem Auflösen. Die Lage zuerst heißt auch: ein Ort
  // außerhalb sagt „dort lies ich nicht", nicht „den Ort gibt es nicht".
  if (!bleibtInDenWurzeln(ziel, beide)) throw new Error(keineErlaubteWurzelText(ziel, erlaubteRoh));
  let wurzelReal: string;
  try {
    if (fs.lstatSync(ziel).isSymbolicLink()) {
      throw new Error(`${ortFürMeldung(ziel)} is a symlink — KEPTA imports the real file or folder. Point the command at the folder the link points to, or copy the export in.`);
    }
    wurzelReal = fs.realpathSync(ziel);
  } catch (e) {
    if (e instanceof Error && e.message.includes("symlink")) throw e;
    throw new Error(`cannot read ${ortFürMeldung(ziel)}: ${e instanceof Error ? e.message : String(e)}`);
  }
  if (!bleibtInDenWurzeln(wurzelReal, erlaubte)) throw new Error(keineErlaubteWurzelText(wurzelReal, erlaubte));
  const { dateien, abgelehnt } = dateienFinden(ziel, wurzelReal);
  zusammenfassung.abgelehnte = abgelehnt.length;
  for (const a of abgelehnt.slice(0, ERGEBNIS_KAPPE)) {
    zusammenfassung.abgelehnt.push(a);
    melde(a.grund);
  }
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

  for (const datei of dateien) {
    zusammenfassung.dateien += 1;
    let inhalt: string;
    try {
      inhalt = fs.readFileSync(datei, "utf8");
    } catch (e) {
      zusammenfassung.fehler.push(`${path.basename(datei)}: ${e instanceof Error ? e.message : String(e)}`);
      continue;
    }
    const { gespraeche, formFremd, fehler } = parsText(inhalt, path.basename(datei));
    if (fehler) {
      zusammenfassung.fehler.push(`${path.basename(datei)}: ${fehler}`);
      continue;
    }
    if (formFremd) melde("kein Gespräch erkannt — weder chat_messages noch messages, weder sender noch role");
    for (const g of gespraeche) {
      zusammenfassung.gespraeche += 1;
      for (const n of g.nachrichten) {
        zusammenfassung.nachrichten += 1;
        if (n.rolle === "kuenstler") {
          zusammenfassung.assistantUebersprungen += 1;
          continue;
        }
        zusammenfassung.nutzerNachrichten += 1;
        if (zusammenfassung.nutzerNachrichten % ERGEBUNG_EILE === 0) {
          opts.fortschritt?.({ verarbeitet: zusammenfassung.nutzerNachrichten, gesamt: zusammenfassung.nutzerNachrichten });
          await ergebung();
        }
        const { input, grund } = eingabeAus(g, n, opts, ladungsTag, importMoment);
        if (!input) {
          zusammenfassung.zuKurz += 1;
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
        if (n.zeitMs !== null) zusammenfassung.zeit.quelle += 1;
        else zusammenfassung.zeit.import += 1;

        const bestehend = store.getMemory(input.id!);
        if (bestehend && bestehend.title === input.title && bestehend.content === input.content && !bestehend.deletedAt) {
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
          // Notiz wird deshalb nur als „privat" gemeldet, nie mit ihrer Lage.
          const privat = store.istPrivat(wortlaut);
          if (zusammenfassung.kandidaten.length < ERGEBNIS_KAPPE) {
            zusammenfassung.kandidaten.push({
              neu: input.id!,
              bestehend: privat ? "privat" : wortlaut,
              grund: privat ? "gleicher wortlaut in einer privaten notiz" : "gleicher wortlaut",
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
          // Eine Datei darf ihren Inhalt ändern, aber eine bestehende private
          // Notiz auf „local" zurückzuschreiben macht etwas privates unprivat.
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
        if (created) zusammenfassung.imported += 1;
        else zusammenfassung.updated += 1;
      }
    }
  }

  opts.fortschritt?.({ verarbeitet: zusammenfassung.nutzerNachrichten, gesamt: zusammenfassung.nutzerNachrichten });

  zusammenfassung.gruende = [...gruende.entries()].map(([grund, anzahl]) => ({ grund, anzahl })).sort((a, b) => b.anzahl - a.anzahl);
  zusammenfassung.bestand.nachher = store.countMemories().active;
  zusammenfassung.bremse = bremseLesen(zusammenfassung.bestand.nachher);
  return zusammenfassung;
}

function ergebung(): Promise<void> {
  return new Promise((ok) => setImmediate(() => ok()));
}

/** Ein Blatt oder ein Ordner — der Ordner ist der Projekt-Export (ein JSON je Gespräch). Die Schleuse oben hat den Ort schon geprüft. */
function dateienFinden(wurzel: string, wurzelReal: string): { dateien: string[]; abgelehnt: Abweisung[] } {
  const abgelehnt: Abweisung[] = [];
  const stat = fs.lstatSync(wurzel);
  if (stat.isFile()) return { dateien: [wurzel], abgelehnt };
  const out: string[] = [];
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
      const relativ = path.relative(wurzel, voll);
      // Q-18, derselbe Weg wie die Inbox: erst der Blick auf den Eintrag selbst
      // (lstat — ein Link ist kein Lesestoff), dann der Blick auf die echte Lage
      // (realpath — sie muss in dem Ordner bleiben, den der Nutzer gezeigt hat).
      // Ein blindes path.resolve ließe beides durch.
      let eintragStat: fs.Stats;
      try {
        eintragStat = fs.lstatSync(voll);
      } catch (e) {
        abgelehnt.push({ ort: relativ, grund: `nicht lesbar: ${e instanceof Error ? e.message : String(e)}` });
        continue;
      }
      if (eintragStat.isSymbolicLink()) {
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
      if (eintragStat.isDirectory()) {
        stapel.push({ ordner: voll, real: echt });
        continue;
      }
      if (!eintragStat.isFile()) {
        abgelehnt.push({ ort: relativ, grund: "weder Datei noch Ordner (FIFO, Socket, Gerät)" });
        continue;
      }
      if (/\.(json|jsonl|ndjson)$/i.test(eintrag.name)) out.push(voll);
    }
  }
  return { dateien: out.sort(), abgelehnt };
}

function ortFürMeldung(pfad: string): string {
  return pfad.replace(/\s+/g, " ").slice(0, 200);
}

function keineErlaubteWurzelText(pfad: string, erlaubte: string[]): string {
  const orte = erlaubte.map((w) => ortFürMeldung(w)).join(", ");
  return `no import from this place: ${ortFürMeldung(pfad)} — KEPTA reads only your home folder and the system temp (${orte}). Next: copy the export into your Downloads folder and run the command again, or name another root with the roots option.`;
}

/** Pfad-relativ, nicht startsWith: „/home/x-anderer" darf nicht durch „/home/x" rutschen. */
function bleibtInDenWurzeln(pfadReal: string, erlaubte: string[]): boolean {
  return erlaubte.some((w) => {
    const rel = path.relative(w, pfadReal);
    return rel !== "" && !rel.startsWith("..") && !path.isAbsolute(rel);
  });
}

/**
 * Eine Ladung abbestellen: nur Knoten, die diese Quelle je geschrieben hat und
 * die den Ladungs-Kenner tragen. Ein Papierkorb-Eintrag, kein endgültiges
 * Löschen — wer sich verschießt, holt zurück.
 */
export function ladungVerwerfen(store: KeptaStore, ladung: string, seitenGroesse = 500): { abgegeben: number; andereQuellen: number } {
  const tag = ladung.startsWith("ladung-") ? ladung : `ladung-${ladung}`;
  // Erst sammeln, dann abbestellen: listMemories sieht nur Aktive, und ein
  // Offset über einer gerade gelichteten Seite würde Knoten überspringen.
  const ids: string[] = [];
  const andereQuellen = { anzahl: 0 };
  for (let seite = 0; ; seite++) {
    const knoten = store.listMemories({ tag, limit: seitenGroesse, offset: seite * seitenGroesse });
    if (knoten.length === 0) break;
    for (const k of knoten) {
      // Eine fremde Quelle trägt denselben Ladungsnamen, wenn der Nutzer ihn
      // wiederverwendet — und bleibt trotzdem unangetastet.
      if (!k.tags.includes(`import-${QUELLE}`)) {
        andereQuellen.anzahl += 1;
        continue;
      }
      ids.push(k.id);
    }
  }
  let abgegeben = 0;
  for (const id of ids) if (store.trashMemory(id)) abgegeben += 1;
  return { abgegeben, andereQuellen: andereQuellen.anzahl };
}

/** Was die Klemme später als Grammatik anbieten muss. */
export const CLAUDE_HINWEIS = "usage: npx -y kepta-mcp import claude <conversations.json | project folder> [--dry-run] [--ladung <name>]";
