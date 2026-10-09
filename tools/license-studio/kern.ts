// KEPTA License Studio — die Logik ohne Fenster.
//
// Ausstellen, prüfen, sperren, die fertige Nachricht an den Kunden und die
// Liste der ausgestellten Lizenzen. Signiert und geprüft wird mit
// src/core/lizenz.ts — demselben Code, der auch die Prüfung eines Schlüssels
// kennt. Der private Schlüssel kommt als Argument herein; woher, entscheidet
// main.ts. Jede Lizenz bekommt eine eigene Nummer; wird ein Schlüssel
// weitergegeben, kommt seine Nummer auf die Sperrliste (src/core/sperrliste.ts)
// und gilt bei jeder weiteren Prüfung als gesperrt.
//
// Ausgestellt wird nur KEPTA Enterprise (Vertrag, persönlich). Die App selbst
// hat seit 10.10.2026 kein Schlüssel-Feld mehr und läuft unbegrenzt — ein
// Schlüssel weist den Vertrag aus, er schaltet nichts frei.
import fs from "node:fs";
import path from "node:path";
import { type Edition, type Stufe, EDITIONEN, EDITIONS_LABEL, OEFFENTLICHER_SCHLUESSEL, ausGruppen, formatiereNummer, normalisiere, pruefeSchluessel, signiere } from "../../src/core/lizenz";

export { EDITIONEN, EDITIONS_LABEL };
export type { Edition, Stufe };

export const DOWNLOAD = "https://github.com/DamianTodorovic/kepta/releases/latest";

export type Sprache = "de" | "en";

export interface Eintrag {
  nummer: number;
  name: string;
  key: string;
  notiz: string;
  /** Zeitpunkt als ISO-Text */
  ausgestelltAm: string;
  /** Die Stufe des Schlüssels; „alt" = die frühere Einzelstufe der App. */
  edition?: Stufe;
  /** Business: die gekaufte Seat-Zahl. */
  seats?: number;
  /** Weitergegeben — steht auf der Sperrliste. */
  gesperrt?: boolean;
}

export interface Pruefung {
  gueltig: boolean;
  nummer: number | null;
  gesperrt: boolean;
  /** Passt der Schlüssel nicht, steht er aber in der Liste: für diesen Namen und diese Nummer wurde er ausgestellt. */
  gehoertZu: { name: string; nummer: number } | null;
}

const KEINE_SPERRE: ReadonlySet<number> = new Set();

/** Der Name, wie er beim Kunden steht: eine Unicode-Form, einfache Leerzeichen, Schreibweise wie eingegeben. */
export function anzeigeName(name: string): string {
  return name.normalize("NFC").trim().replace(/\s+/g, " ");
}

export function vorname(name: string): string {
  return anzeigeName(name).split(" ")[0] ?? "";
}

/** Passt der private Schlüssel zum Prüfschlüssel? Sonst wäre jeder ausgestellte Schlüssel wertlos. */
export function passtZurApp(privat: string, oeffentlich: string = OEFFENTLICHER_SCHLUESSEL): boolean {
  const probe = "KEPTA License Studio — Selbsttest";
  try {
    return pruefeSchluessel(probe, signiere(probe, 1, privat, "enterprise"), oeffentlich, KEINE_SPERRE).gueltig;
  } catch {
    return false;
  }
}

/**
 * Stellt einen Schlüssel für Name, Nummer und Stufe aus — und prüft ihn sofort
 * so, wie die Prüfung es tut. Ed25519 ist deterministisch: derselbe Name mit
 * derselben Nummer und Stufe ergibt immer denselben Schlüssel.
 */
export function stelleAus(
  name: string,
  nummer: number,
  privat: string,
  oeffentlich: string = OEFFENTLICHER_SCHLUESSEL,
  edition: Edition,
  seats?: number,
): string {
  const n = anzeigeName(name);
  if (!n) throw new Error("Bitte den Namen des Kunden eingeben.");
  if (n.length > 200) throw new Error("Der Name ist zu lang (höchstens 200 Zeichen).");
  const key = signiere(n, nummer, privat, edition, seats);
  if (!pruefeSchluessel(n, key, oeffentlich, KEINE_SPERRE).gueltig) {
    throw new Error("Dieser Schlüssel würde nicht bestehen — der Signaturschlüssel im Schlüsselbund passt nicht zum Prüfschlüssel.");
  }
  return key;
}

/** Worauf beim Namen zu achten ist — der Kunde muss ihn genau so eingeben. */
export function hinweise(name: string): string[] {
  const n = anzeigeName(name);
  const h: string[] = [];
  if (!n) return h;
  if (/[^\x20-\x7E]/.test(n)) h.push("Umlaute oder Sonderzeichen: der Kunde muss sie genauso eingeben — „ü“ ist nicht „ue“.");
  if (/[0-9@,;()]/.test(n)) h.push("Ziffern, Kommas, Klammern oder @ im Namen: auch die muss der Kunde genauso eingeben.");
  if (!n.includes(" ")) h.push("Nur ein Wort — ist das der volle Name, so wie er auf der Rechnung steht?");
  return h;
}

/** Die nächste freie Lizenznummer: eins über der höchsten bisher vergebenen. */
export function naechsteNummer(liste: Eintrag[]): number {
  return liste.reduce((hoechste, e) => Math.max(hoechste, e.nummer), 0) + 1;
}

/** Die gesperrten Nummern der Liste, aufsteigend. */
export function gesperrteNummern(liste: Eintrag[]): number[] {
  return [...new Set(liste.filter((e) => e.gesperrt).map((e) => e.nummer))].sort((a, b) => a - b);
}

/** Prüft wie die App — und sagt beim Support dazu, für wen und mit welcher Nummer ein Schlüssel ausgestellt wurde. */
export function pruefe(
  name: string,
  key: string,
  liste: Eintrag[],
  oeffentlich: string = OEFFENTLICHER_SCHLUESSEL,
  gesperrt: ReadonlySet<number> = new Set(gesperrteNummern(liste)),
): Pruefung {
  const p = pruefeSchluessel(name, key, oeffentlich, gesperrt);
  if (p.gueltig || p.gesperrt) return { ...p, gehoertZu: null };
  const bytes = ausGruppen(key);
  const treffer = bytes ? liste.find((e) => ausGruppen(e.key)?.equals(bytes)) : undefined;
  return { ...p, gehoertZu: treffer ? { name: treffer.name, nummer: treffer.nummer } : null };
}

/**
 * Die Stufe, wie sie in einer Datei oder Nachricht steht. „pro" war die
 * Einzelstufe der App, und die allerersten Einträge tragen gar keine Stufe —
 * beides heißt heute „alt" und bleibt erhalten.
 */
function stufeAusJson(x: unknown): Stufe | undefined {
  if (x === "alt" || x === "pro") return "alt";
  return EDITIONEN.includes(x as Edition) ? (x as Edition) : undefined;
}

/** Die Stufe eines Eintrags — ohne Angabe zählt die Altstufe. */
export function editionVon(eintrag: Pick<Eintrag, "edition">): Stufe {
  return stufeAusJson(eintrag.edition) ?? "alt";
}

/** Die fertige Nachricht an den Kunden. */
export function nachricht(name: string, nummer: number, key: string, sprache: Sprache, edition: Stufe, seats?: number): string {
  const n = anzeigeName(name);
  const nr = formatiereNummer(nummer);
  const produkt = EDITIONS_LABEL[edition];
  const stufeZeilen = sprache === "en"
    ? edition === "business"
      ? [`This is a KEPTA Enterprise license for your team, covering ${seatsFuerAnzeige(seats)} seats — one seat per person, personal keys only.`]
      : edition === "enterprise"
        ? ["This is a KEPTA Enterprise license. The scope and terms are the ones we agreed with your organization individually."]
        : ["This is a KEPTA license from before today's Enterprise plans — for you personally. It stays as a record; KEPTA itself runs unlimited."]
    : edition === "business"
      ? [`Das ist eine KEPTA-Enterprise-Lizenz für euer Team mit ${seatsFuerAnzeige(seats)} Seats — ein Platz pro Person, bitte nur persönliche Schlüssel.`]
      : edition === "enterprise"
        ? ["Das ist eine KEPTA-Enterprise-Lizenz. Umfang und Konditionen sind die, die wir mit eurer Organisation individuell vereinbart haben."]
        : ["Das ist eine KEPTA-Lizenz aus der Zeit vor den heutigen Enterprise-Verträgen — für dich persönlich. Sie bleibt als Nachweis stehen; KEPTA selbst läuft unbegrenzt."];
  const zeilen = sprache === "en"
    ? [
        `Hi ${vorname(n)},`,
        "",
        `thank you for choosing ${produkt}. Here is everything you need:`,
        "",
        `1. Download: ${DOWNLOAD}`,
        "   Apple silicon (M1 and later): KEPTA-…-mac-arm64.dmg · Intel: KEPTA-…-mac-x64.dmg",
        "2. Open the DMG and drag KEPTA into Applications. The first time, macOS says it cannot verify the developer:",
        "   System Settings → Privacy & Security → \"Open Anyway\".",
        "3. Your key is issued for:",
        "",
        `   Name:        ${n}`,
        `   License key: ${key}`,
        "",
        "KEPTA needs no key to run: every tool is unlimited. This key records your agreement, nothing leaves your Mac.",
        `This is license no. ${nr}. ${stufeZeilen[0]} So please keep the key to yourself.`,
        "",
        "If anything is unclear, just reply here.",
        "",
        "Best,",
        "Damian",
      ]
    : [
        `Hallo ${vorname(n)},`,
        "",
        `danke, dass du dich für ${produkt} entscheidest. Hier ist alles, was du brauchst:`,
        "",
        `1. Herunterladen: ${DOWNLOAD}`,
        "   Apple Silicon (M1 und neuer): KEPTA-…-mac-arm64.dmg · Intel: KEPTA-…-mac-x64.dmg",
        "2. DMG öffnen und KEPTA in „Programme“ ziehen. Beim ersten Öffnen meldet macOS, dass der Entwickler nicht überprüft werden kann:",
        "   Systemeinstellungen → Datenschutz & Sicherheit → „Dennoch öffnen“.",
        "3. Dein Schlüssel ist ausgestellt auf:",
        "",
        `   Name:            ${n}`,
        `   Lizenzschlüssel: ${key}`,
        "",
        "KEPTA braucht keinen Schlüssel, um zu laufen: jedes Werkzeug ist unbegrenzt. Der Schlüssel weist euren Vertrag aus, und nichts verlässt deinen Mac.",
        `Das ist Lizenz Nr. ${nr}. ${stufeZeilen[0]} Bitte gib den Schlüssel nicht weiter.`,
        "",
        "Wenn etwas unklar ist, antworte einfach hier.",
        "",
        "Viele Grüße",
        "Damian",
      ];
  return zeilen.join("\n");
}

/** Seats für die Anzeige — fehlt die Zahl (alter Eintrag), zählt ein Seat. */
function seatsFuerAnzeige(seats?: number): number {
  return seats ?? 1;
}

const SPERRLISTE_KOPF = [
  "// Gesperrte Lizenznummern — Schlüssel, die weitergegeben oder öffentlich",
  "// geworden sind. KEPTA License Studio trägt sie hier ein („Sperren“). Mit dem",
  "// nächsten Update gelten diese Schlüssel nicht mehr, auch nicht auf Rechnern,",
  "// die schon aktiviert waren.",
  "//",
  "// Das Studio schreibt diese Datei neu: eine Nummer je Zeile, aufsteigend.",
];

/** Der Inhalt von src/core/sperrliste.ts für diese Nummern — aufsteigend, ohne Doppel. */
export function sperrlisteQuelle(nummern: readonly number[]): string {
  const sortiert = [...new Set(nummern)].filter((n) => Number.isInteger(n) && n >= 1).sort((a, b) => a - b);
  return [...SPERRLISTE_KOPF, "export const GESPERRTE_LIZENZEN: readonly number[] = [", ...sortiert.map((n) => `  ${n},`), "];", ""].join("\n");
}

/** Die Nummern aus einer src/core/sperrliste.ts. */
export function leseSperrliste(quelle: string): number[] {
  const block = /GESPERRTE_LIZENZEN[^=]*=\s*\[([\s\S]*?)\]/.exec(quelle)?.[1] ?? "";
  return [...block.matchAll(/\d+/g)].map((m) => Number(m[0]));
}

function istEintrag(x: unknown): x is Eintrag {
  const e = x as Eintrag | null;
  return !!e && Number.isInteger(e.nummer) && e.nummer >= 1 && typeof e.name === "string" && typeof e.key === "string"
    && typeof e.notiz === "string" && typeof e.ausgestelltAm === "string"
    && (e.edition === undefined || stufeAusJson(e.edition) !== undefined)
    && (e.seats === undefined || (Number.isInteger(e.seats) && e.seats >= 0))
    && (e.gesperrt === undefined || typeof e.gesperrt === "boolean");
}

/** Fehlt die Datei, ist die Liste leer. Ist sie kaputt, gibt es einen Fehler — und nichts wird überschrieben. */
export function ladeListe(datei: string): Eintrag[] {
  let roh: string;
  try {
    roh = fs.readFileSync(datei, "utf8");
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw e;
  }
  const kaputt = new Error(`Die Liste ${datei} ist beschädigt — sie bleibt, wie sie ist.`);
  let daten: unknown;
  try {
    daten = JSON.parse(roh);
  } catch {
    throw kaputt;
  }
  if (!Array.isArray(daten)) throw kaputt;
  // Jeder Eintrag bleibt stehen; eine alte Stufenangabe wird in die heutige
  // überführt („pro" und „fehlend" → „alt").
  return daten.filter(istEintrag).map((e) => ({ ...e, edition: editionVon(e) }));
}

/** Schreibt atomar (erst eine Nebendatei, dann umbenennen) und nur für den eigenen Benutzer lesbar. */
export function speichereListe(datei: string, liste: Eintrag[]): void {
  fs.mkdirSync(path.dirname(datei), { recursive: true });
  const neben = `${datei}.${process.pid}.tmp`;
  fs.writeFileSync(neben, JSON.stringify(liste, null, 2) + "\n", { mode: 0o600 });
  fs.renameSync(neben, datei);
}

/**
 * Stellt eine Lizenz aus und trägt sie ein, die neueste oben — mit der nächsten
 * freien Nummer. Hat derselbe Name schon eine gültige Lizenz derselben Stufe,
 * bleibt es bei ihr; eine andere Stufe ist ein neuer Vertrag und bekommt eine
 * neue Nummer. War seine Lizenz gesperrt, bekommt er eine neue Nummer.
 */
export function trageEin(
  datei: string,
  name: string,
  notiz: string,
  privat: string,
  oeffentlich: string = OEFFENTLICHER_SCHLUESSEL,
  jetzt: Date = new Date(),
  edition: Edition,
  seats?: number,
): { eintrag: Eintrag; neu: boolean } {
  const liste = ladeListe(datei);
  const n = anzeigeName(name);
  const vorhanden = liste.find((e) => !e.gesperrt && normalisiere(e.name) === normalisiere(n) && editionVon(e) === edition);
  if (vorhanden) return { eintrag: vorhanden, neu: false };
  const nummer = naechsteNummer(liste);
  const key = stelleAus(n, nummer, privat, oeffentlich, edition, seats);
  const eintrag: Eintrag = { nummer, name: n, key, notiz: notiz.trim().slice(0, 500), ausgestelltAm: jetzt.toISOString(), edition, ...seats !== undefined ? { seats } : {} };
  speichereListe(datei, [eintrag, ...liste]);
  return { eintrag, neu: true };
}

/** Sperrt eine Nummer — oder hebt die Sperre auf. Gibt die neue Liste zurück. */
export function sperre(datei: string, nummer: number, gesperrt: boolean): Eintrag[] {
  const liste = ladeListe(datei);
  const e = liste.find((x) => x.nummer === nummer);
  if (!e) throw new Error(`Lizenz Nr. ${formatiereNummer(nummer)} steht nicht in der Liste.`);
  if (gesperrt) e.gesperrt = true;
  else delete e.gesperrt;
  speichereListe(datei, liste);
  return liste;
}
