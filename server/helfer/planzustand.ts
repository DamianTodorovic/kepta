// Der Plan-Zustand: alles, was begrenzt ist, zählt hier — die Tageszähler des
// Free-Plans und der Erststart des Pro-Tags. Drei Schutzschichten gegen die
// drei klassischen Umgehungen:
//
//   1. Neustart hilft nicht: der Zustand lebt in den Einstellungen der
//      Wissensbasis, nicht im Prozessspeicher.
//   2. Uhr zurückdrehen hilft nicht: der Zustand kennt die höchste je gesehene
//      Zeit; eine Uhr, die vor sie fällt, ist eine Anomalie — der Pro-Tag
//      verfällt. (Licence-Inhaber laufen ohnehin an dieser Logik vorbei.)
//   3. Datenbank bearbeiten hilft nicht: der Zustand ist verschlüsselt UND
//      authentisiert (AES-256-GCM) mit einem eigenen Schlüsselbund-Eintrag,
//      der NICHT der Wiederherstellungsschlüssel ist und nirgends angezeigt
//      wird. Jede Änderung am Blob fällt auf: Manipulation → Pro-Tag verfällt.
//      Das Löschen des Blobs hilft ebenso wenig: der Erststart steht zusätzlich
//      im Schlüsselbund — existiert der Anker, war da schon eine Installation.
//
// Hermetik (22.9.-Lektion): Tests berühren nie den echten Schlüsselbund —
// KEPTA_PLAN_KEY (Zustandsschlüssel, 64 Hex) und KEPTA_PROTAG_ANKER
// (Erststart, ms) ersetzen beide Einträge in Tests und Server-Setups.
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { KeptaStore } from "../../src/core/store";
import { schluesselbundFuer, holeOderErzeugeSchluessel, istSchluessel, type SchluesselbundZiel } from "../../src/core/schluessel";

export const PROBETAG_LAENGE_MS = 24 * 60 * 60 * 1000;

const ZUSTAND_SCHLUESSEL = "plan_zustand";
const ANKER_SCHLUESSEL = "probetag_start";
const VERFALLEN_SCHLUESSEL = "probetag_verfallen";
const PLAN_ZIEL: SchluesselbundZiel = { dienst: "app.kepta.plan", konto: "kepta", label: "KEPTA plan state" };
const ANKER_ZIEL: SchluesselbundZiel = { dienst: "app.kepta.plan", konto: "probetag", label: "KEPTA trial day" };
/** Wie viel Uhr-Schrägheit eine normale Korrektur haben darf. */
const SCHRÄGHEIT_MS = 2 * 60 * 1000;

export interface PlanZustand {
  schema: 1;
  /** Lokaler Tag (YYYY-MM-DD) der letzten Zählung. */
  tag: string;
  /** feature → Anzahl am `tag`. */
  verbraucht: Record<string, number>;
  /** Der Erststart des Pro-Tags (ms) — gespiegelt aus dem Anker. */
  protagStart: number | null;
  /** Höchste je gesehene Zeit (ms) — der Monotonie-Anker. */
  zuletztGesehen: number;
  /** Manipulation oder Zeitanomalie festgestellt: der Pro-Tag ist endgültig vorbei. */
  protagVerfallen: boolean;
}

function frisch(jetzt: number): PlanZustand {
  return { schema: 1, tag: lokalerTag(jetzt), verbraucht: {}, protagStart: null, zuletztGesehen: jetzt, protagVerfallen: false };
}

export function lokalerTag(jetzt: number): string {
  const d = new Date(jetzt);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// ---------- Der Zustandsschlüssel: eigener Bund-Eintrag, nie angezeigt ----------

let zustandsSchluesselCache: Buffer | null = null;

function zustandsSchluessel(datenordner: string): Buffer | null {
  if (zustandsSchluesselCache) return zustandsSchluesselCache;
  const ausUmgebung = process.env.KEPTA_PLAN_KEY?.trim();
  if (ausUmgebung) {
    if (!istSchluessel(ausUmgebung)) throw new Error("KEPTA_PLAN_KEY must be 64 hexadecimal characters (256 bits).");
    zustandsSchluesselCache = Buffer.from(ausUmgebung, "hex");
    return zustandsSchluesselCache;
  }
  // Hermetik: KEPTA_ENCRYPTION=off (Tests, rohes SQLite) berührt nie den
  // Schlüsselbund — der Zustand liegt dann als Klartext-JSON in der DB
  // (dokumentierte Server-Ausnahme, s. u.).
  if (process.env.KEPTA_ENCRYPTION === "off") return null;
  // Dasselbe Muster wie beim Datenbankschlüssel: zweimal lesen, bevor etwas
  // angelegt wird; anlegen ja, überschreiben nie (22.9.-Lektion).
  const bund = schluesselbundFuer(process.platform, datenordner, undefined, PLAN_ZIEL);
  if (!bund) return null; // kein Schlüsselbund (Server) → Zustand bleibt im Klartext der DB
  const vorhanden = bund.lesen();
  if (vorhanden && istSchluessel(vorhanden)) {
    zustandsSchluesselCache = Buffer.from(vorhanden, "hex");
    return zustandsSchluesselCache;
  }
  const zweiterVersuch = bund.lesen();
  if (zweiterVersuch && istSchluessel(zweiterVersuch)) {
    zustandsSchluesselCache = Buffer.from(zweiterVersuch, "hex");
    return zustandsSchluesselCache;
  }
  const neu = crypto.randomBytes(32).toString("hex");
  bund.ablegen(neu);
  if (bund.lesen() !== neu) throw new Error(`The new plan-state key could not be read back from the ${bund.name}.`);
  zustandsSchluesselCache = Buffer.from(neu, "hex");
  return zustandsSchluesselCache;
}

// ---------- Verschlüsseln/Authentisieren (AES-256-GCM) ----------

function verschluessle(zustand: PlanZustand, schluessel: Buffer): string {
  const iv = crypto.randomBytes(12);
  const chiffer = crypto.createCipheriv("aes-256-gcm", schluessel, iv);
  const text = Buffer.from(JSON.stringify(zustand), "utf8");
  const dicht = Buffer.concat([chiffer.update(text), chiffer.final()]);
  return Buffer.concat([iv, dicht, chiffer.getAuthTag()]).toString("base64");
}

function entschluessle(blob: string, schluessel: Buffer): PlanZustand | null {
  try {
    const roh = Buffer.from(blob, "base64");
    const iv = roh.subarray(0, 12);
    const tag = roh.subarray(roh.length - 16);
    const dicht = roh.subarray(12, roh.length - 16);
    const chiffer = crypto.createDecipheriv("aes-256-gcm", schluessel, iv);
    chiffer.setAuthTag(tag);
    const text = Buffer.concat([chiffer.update(dicht), chiffer.final()]).toString("utf8");
    const zustand = JSON.parse(text) as PlanZustand;
    if (zustand.schema !== 1 || typeof zustand.tag !== "string" || typeof zustand.verbraucht !== "object") return null;
    return zustand;
  } catch {
    return null; // Auth-Fehler oder kaputt — das IST die Manipulationsmeldung
  }
}

// ---------- Laden/Speichern ----------

export interface GeladenerPlan {
  zustand: PlanZustand;
  /** Der gespeicherte Zustand war unlesbar/editiert — der Pro-Tag gilt als verfallen. */
  manipuliert: boolean;
}

export function ladePlanZustand(store: KeptaStore, datenordner: string): GeladenerPlan {
  const einstellungen = store.einstellungen();
  const blob = einstellungen[ZUSTAND_SCHLUESSEL];
  const schluessel = zustandsSchluessel(datenordner);
  if (!blob) {
    // Kein Blob: nur dann "frisch", wenn der Erststart-Anker fehlt — der Anker
    // (Schlüsselbund/Umgebung) ist der Beleg, dass hier schon eine Installation
    // war. Sein Blobleeren nützt also nichts. Der Klartext-Stempel aus 2.13.5
    // zählt bewusst NICHT als Beleg: er ist die legitime Migrationsquelle.
    const spurVorhanden = liesAnker(datenordner) != null;
    if (spurVorhanden) {
      const jetzt = Date.now();
      return { zustand: { ...frisch(jetzt), protagVerfallen: true }, manipuliert: true };
    }
    return { zustand: frisch(Date.now()), manipuliert: false };
  }
  if (!schluessel) {
    // Ohne Schlüssel (Server ohne Bund) ist der Blob Klartext-JSON — schwächer,
    // aber das ist die dokumentierte Ausnahme für Server-Setups.
    try {
      return { zustand: JSON.parse(blob) as PlanZustand, manipuliert: false };
    } catch {
      return { zustand: frisch(Date.now()), manipuliert: true };
    }
  }
  const zustand = entschluessle(blob, schluessel);
  if (!zustand) return { zustand: frisch(Date.now()), manipuliert: true };
  return { zustand, manipuliert: false };
}

export function speicherePlanZustand(store: KeptaStore, datenordner: string, zustand: PlanZustand): void {
  const schluessel = zustandsSchluessel(datenordner);
  const wert = schluessel ? verschluessle(zustand, schluessel) : JSON.stringify(zustand);
  store.setzeEinstellungen({ [ZUSTAND_SCHLUESSEL]: wert });
}

// ---------- Der Erststart-Anker: Schlüsselbund + verborgene Ankerdatei ----------

/**
 * Zwei Beweisorte für „dieser Rechner hatte schon eine Installation":
 * der Schlüsselbund-Eintrag und eine verborgene Ankerdatei außerhalb des
 * Datenordners (~/Library/Application Support bzw. %APPDATA% bzw.
 * ~/.config). Wer die Datenbank UND den Schlüsselbund löscht, um sich einen
 * neuen Probetag zu erschleichen, übersieht die Datei — und wer sie findet,
 * muss sie gezielt fälschen, was die Tamper-Erkennung als Anomalie wertet.
 * Beide Orte sind reine Lokaldaten; nichts verlässt den Rechner.
 */
import os from "node:os";

function ankerDateiPfad(): string {
  const plattform = process.platform;
  if (plattform === "darwin") return path.join(os.homedir(), "Library", "Application Support", "KEPTA", "trial-anchor");
  if (plattform === "win32") return path.join(process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming"), "KEPTA", "trial-anchor");
  return path.join(os.homedir(), ".config", "KEPTA", "trial-anchor");
}

/** Für Tests/Werkzeuge: wo die verborgene Ankerdatei liegt (plattformrichtig). */
export function ankerDateiPfadFuer(): string {
  return ankerDateiPfad();
}

interface AnkerWert {
  start: number;
  verfallen: boolean;
  /** Datei vorhanden, aber unlesbar/fremd verändert — gilt als Anomalie. */
  kaputt?: boolean;
}

function liesAnkerDatei(): AnkerWert | null {
  const datei = ankerDateiPfad();
  let roh: string;
  try {
    roh = fs.readFileSync(datei, "utf8").trim();
  } catch {
    return null; // fehlt — das ist der Normalfall einer echten Erstinstallation
  }
  const verfallen = roh.endsWith("|V");
  const start = Number(verfallen ? roh.slice(0, -2) : roh);
  if (!Number.isFinite(start) || start <= 0) return { start: 0, verfallen: false, kaputt: true };
  return { start, verfallen };
}

function schreibeAnkerDatei(wert: string): void {
  const datei = ankerDateiPfad();
  try {
    fs.mkdirSync(path.dirname(datei), { recursive: true });
    fs.writeFileSync(datei, wert, { encoding: "utf8", flag: "wx" }); // nie überschreiben
  } catch (e) {
    if ((e as { code?: string }).code !== "EEXIST") {
      // Kein Schreibrecht auf den Beweisort: der Schlüsselbund-Anker trägt allein weiter.
    }
  }
  // |V nachziehen: die Datei existiert schon — nur das Verfalls-Märke anfügen.
  if (wert.endsWith("|V")) {
    try {
      const roh = fs.readFileSync(datei, "utf8").trim();
      if (!roh.endsWith("|V")) fs.writeFileSync(datei, `${roh}|V`, "utf8");
    } catch { /* die alte Datei bleibt, wie sie ist */ }
  }
}

/**
 * Liest den Erststart-Anker als Konsens beider Beweisorte — oder null.
 * Umgebung vor allem (Tests/Server). Diskrepanz oder Kaputt = Anomalie.
 */
export function liesAnker(datenordner: string): AnkerWert | null {
  const ausUmgebung = process.env.KEPTA_PROTAG_ANKER?.trim();
  let roh: string | null = null;
  if (ausUmgebung) {
    roh = ausUmgebung;
  } else if (process.env.KEPTA_PLAN_KEY || process.env.KEPTA_ENCRYPTION === "off") {
    // Hermetik: Tests/Server mit Umgebungsschlüssel oder KEPTA_ENCRYPTION=off
    // berühren nie den Schlüsselbund — die Ankerdatei (unter dem Test-HOME)
    // bleibt als Beweisort aktiv.
    roh = null;
  } else {
    const bund = schluesselbundFuer(process.platform, datenordner, undefined, ANKER_ZIEL);
    if (bund) {
      try {
        roh = bund.lesen();
      } catch {
        roh = null; // ein flüchtiger Bund-Fehler darf den Plan nicht zerstören
      }
    }
  }
  const datei = liesAnkerDatei();
  if (datei?.kaputt) return { start: 0, verfallen: false, kaputt: true };
  const quelle = ausUmgebung ? roh : roh ?? (datei ? String(datei.start) + (datei.verfallen ? "|V" : "") : null);
  if (!quelle) return null;
  const verfallenRo = quelle.endsWith("|V");
  const start = Number(verfallenRo ? quelle.slice(0, -2) : quelle);
  if (!Number.isFinite(start) || start <= 0) return { start: 0, verfallen: false, kaputt: true };
  // Konsens: weichen die Beweisorte ab, ist das eine Manipulation.
  const abweichung = datei && !datei.kaputt && datei.start !== start;
  return { start, verfallen: verfallenRo || datei?.verfallen === true || !!abweichung };
}

/**
 * Sichert den Anker an BEIDEN Beweisorten, wenn dort noch keiner steht; nie
 * überschreiben. Verfall ist ein einseitiger Zustand und wird an beiden
 * Orten nachgetragen.
 */
export function sichereAnker(datenordner: string, start: number, verfallen: boolean): void {
  if (process.env.KEPTA_PROTAG_ANKER) return; // Tests/Server: Anker kommt aus der Umgebung
  const vorhanden = liesAnker(datenordner);
  if (vorhanden && !vorhanden.kaputt && vorhanden.start !== start) verfallen = true; // Diskrepanz = Anomalie

  // Datei-Anker: anlegen, wenn er fehlt; Verfall nachtragen.
  const datei = liesAnkerDatei();
  if (!datei) schreibeAnkerDatei(`${start}${verfallen ? "|V" : ""}`);
  else if (verfallen && !datei.verfallen) schreibeAnkerDatei(`${datei.start}|V`);

  // Schlüsselbund-Anker: derselbe Vertrag (hermetische Modi berühren ihn nie).
  if (process.env.KEPTA_PLAN_KEY || process.env.KEPTA_ENCRYPTION === "off") return;
  const bund = schluesselbundFuer(process.platform, datenordner, undefined, ANKER_ZIEL);
  if (!bund) return;
  try {
    const roh = bund.lesen();
    if (roh == null) {
      bund.ablegen(`${start}${verfallen ? "|V" : ""}`);
    } else if (verfallen && !roh.endsWith("|V")) {
      bund.ablegen(`${roh}|V`);
    }
  } catch { /* der Datei-Anker trägt allein weiter */ }
}

// ---------- Probetag: Sichern + Status ----------

/**
 * Sichert den Erststart: Anker (Schlüsselbund), Spiegel im Plan-Zustand und
 * der Klartext-Einstellung müssen zusammenpassen — jede Diskrepanz ist eine
 * Manipulation und verfällt. Liefert den gültigen Erststart (oder null ohne
 * jeden Bund — reine Server-Umgebungen).
 */
export function protagStartSichern(store: KeptaStore, datenordner: string, jetzt = Date.now()): number | null {
  const geladen = ladePlanZustand(store, datenordner);
  const zustand = geladen.zustand;
  const anker = liesAnker(datenordner);
  const klartext = Number(store.einstellungen()[ANKER_SCHLUESSEL]);

  let start: number | null = anker?.start ?? (Number.isFinite(klartext) && klartext > 0 ? klartext : null);
  let verfallen = geladen.manipuliert || zustand.protagVerfallen || anker?.verfallen === true || anker?.kaputt === true;

  if (start === null && !geladen.manipuliert && zustand.protagStart === null) {
    // Wahrhaft erste Installation: ab jetzt gibt es keinen zweiten Pro-Tag —
    // der Anker liegt im Schlüsselbund UND in der verborgenen Ankerdatei.
    start = jetzt;
  }

  if (start !== null && anker && klartext > 0 && klartext !== anker.start) verfallen = true;
  if (start !== null && zustand.protagStart !== null && zustand.protagStart !== start) verfallen = true;
  if (start !== null && jetzt < start - SCHRÄGHEIT_MS) verfallen = true; // Uhr vor dem Erststart
  if (zustand.zuletztGesehen && jetzt < zustand.zuletztGesehen - SCHRÄGHEIT_MS) verfallen = true; // Uhr zurückgedreht

  if (start !== null && zustand.protagStart === null) zustand.protagStart = start;
  if (start === null && zustand.protagStart !== null) start = zustand.protagStart;
  zustand.protagVerfallen = verfallen;
  zustand.zuletztGesehen = Math.max(zustand.zuletztGesehen, jetzt);
  if (start !== null) sichereAnker(datenordner, start, verfallen); // füllt beide Beweisorte, nie überschreibend
  speicherePlanZustand(store, datenordner, zustand);
  if (start !== null && !Number.isFinite(klartext)) {
    store.setzeEinstellungen({ [ANKER_SCHLUESSEL]: String(start) });
  }
  return start;
}

/** Läuft der Pro-Tag noch? Persistenter Zustand, Anker-Konsens, Monotonie. */
export function probetagVon(store: KeptaStore, datenordner: string, jetzt = Date.now()): { aktiv: boolean; restMs: number; start: number | null } {
  const start = protagStartSichern(store, datenordner, jetzt);
  const { zustand } = ladePlanZustand(store, datenordner);
  if (start === null || zustand.protagVerfallen) return { aktiv: false, restMs: 0, start };
  const restMs = start + PROBETAG_LAENGE_MS - jetzt;
  return { aktiv: restMs > 0, restMs: Math.max(0, restMs), start };
}

// ---------- Tageszähler ----------

export function verbrauchtFuer(store: KeptaStore, datenordner: string, feature: string, jetzt = Date.now()): number {
  const { zustand } = ladePlanZustand(store, datenordner);
  if (zustand.tag !== lokalerTag(jetzt)) return 0;
  return zustand.verbraucht[feature] ?? 0;
}

export function zaehleFuer(store: KeptaStore, datenordner: string, feature: string, jetzt = Date.now()): void {
  const { zustand, manipuliert } = ladePlanZustand(store, datenordner);
  const tag = lokalerTag(jetzt);
  if (zustand.tag !== tag) {
    zustand.tag = tag;
    zustand.verbraucht = {};
  }
  zustand.verbraucht[feature] = (zustand.verbraucht[feature] ?? 0) + 1;
  zustand.zuletztGesehen = Math.max(zustand.zuletztGesehen, jetzt);
  zustand.protagVerfallen = zustand.protagVerfallen || manipuliert;
  speicherePlanZustand(store, datenordner, zustand);
}

/** Für Werkzeuge/Tests: den Klartext-Verfall-Marker setzen (wird vom Anker gelesen). */
export function markiereVerfallen(store: KeptaStore, datenordner: string): void {
  const start = protagStartSichern(store, datenordner);
  if (start !== null) sichereAnker(datenordner, start, true);
  store.setzeEinstellungen({ [VERFALLEN_SCHLUESSEL]: "1" });
  const { zustand } = ladePlanZustand(store, datenordner);
  zustand.protagVerfallen = true;
  speicherePlanZustand(store, datenordner, zustand);
}
