// Einstellungen ueberleben den Neustart.
//
// Warum es diese Schicht gibt: die Electron-Huelle laesst sich vom
// Betriebssystem einen FREIEN Port geben und laedt das Fenster von
// http://127.0.0.1:<port>. Der Port ist bei jedem Start ein anderer, und
// localStorage haengt am Ursprung — an Schema, Host UND Port. Jeder Neustart
// bekam damit einen frischen, leeren Speicher. Thema, Knotenfarben, KI-Zugang,
// topK, Auto-Lernen, verworfene Duplikate: alles schien verloren. Kaputt war
// nichts, es wurde nur nie wieder nachgesehen.
//
// Die Loesung liegt nicht darin, den Port festzunageln (er kann belegt sein),
// sondern die Einstellungen dorthin zu legen, wo auch das Wissen liegt: in den
// K3PTA-Datenordner. Der Browserspeicher bleibt als schneller Zwischenspeicher
// bestehen — die Komponenten lesen weiter localStorage und muessen nichts
// wissen. Diese Datei spiegelt in beide Richtungen.

import { wendeZoomAn } from "./uiText";
import { coalescedJson, invalidateApiCache } from "./api";

/** Praefixe, die zu K3PTA gehoeren. Alles andere bleibt unberuehrt. */
const UNSERE = ["kepta_", "ki_gehirn_"];
/** Einzelne Schluessel ohne Praefix. */
const EINZELN = ["theme"];

export function gehoertUns(schluessel: string): boolean {
  return UNSERE.some((p) => schluessel.startsWith(p)) || EINZELN.includes(schluessel);
}

function sicherSetzen(k: string, v: string): void {
  try { window.localStorage.setItem(k, v); } catch { /* privates Fenster, blockierte Speicher */ }
}

/**
 * Holt die abgelegten Einstellungen und legt sie in den Browserspeicher —
 * VOR dem ersten Rendern, damit die Komponenten sie beim Aufbau schon sehen.
 *
 * Bereits vorhandene Werte im Browserspeicher gewinnen: wer die Anwendung
 * gerade benutzt hat, soll durch das Nachladen nichts zurueckgesetzt bekommen.
 * Beim allerersten Start nach dieser Aenderung ist der Browserspeicher ohnehin
 * das, was der Nutzer zuletzt eingestellt hat — es geht nichts verloren.
 */
export async function ladeEinstellungen(): Promise<number> {
  if (typeof window === "undefined" || !window.localStorage) return 0;
  try {
    const res = await coalescedJson<Record<string, unknown>>("/api/settings", { ttlMs: 500 });
    if (!res.ok) return 0;
    const daten = res.data ?? {};
    let uebernommen = 0;
    for (const [k, v] of Object.entries(daten ?? {})) {
      if (typeof v !== "string" || !gehoertUns(k)) continue;
      if (window.localStorage.getItem(k) !== null) continue;
      sicherSetzen(k, v);
      uebernommen++;
    }
    return uebernommen;
  } catch {
    // Kein Server erreichbar — dann eben nur der Browserspeicher.
    return 0;
  }
}

let offen: Record<string, string | null> = {};
let geplant: ReturnType<typeof setTimeout> | null = null;

/**
 * Schickt einen Stapel an den Server. Mit `keepalive` kommt er auch dann noch
 * an, wenn das Fenster gerade geschlossen oder neu geladen wird.
 */
function sende(stapel: Record<string, string | null>, keepalive = false): void {
  if (Object.keys(stapel).length === 0) return;
  invalidateApiCache("/api/settings");
  void fetch("/api/settings", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(stapel),
    keepalive,
  }).catch(() => { /* offline: der Browserspeicher haelt es bis zum naechsten Mal */ });
}

/** Sammelt Aenderungen und schickt sie gebuendelt — nicht bei jedem Tastendruck. */
function planeAbgleich(): void {
  if (geplant !== null) return;
  geplant = setTimeout(() => {
    geplant = null;
    const stapel = offen;
    offen = {};
    sende(stapel);
  }, 400);
}

/**
 * Schickt sofort, was noch wartet — beim Schliessen oder Neuladen des Fensters.
 *
 * Der gebuendelte Aufruf wartet 400 ms. Fiel eine Aenderung in dieses Fenster
 * und wurde die Seite davor verlassen, kam sie nie an: beim naechsten Start
 * holte ladeEinstellungen() den alten Wert aus dem Datenordner zurueck.
 */
function jetztAbgleichen(): void {
  if (geplant !== null) {
    clearTimeout(geplant);
    geplant = null;
  }
  const stapel = offen;
  offen = {};
  sende(stapel, true);
}

/**
 * Legt eine Huelle um localStorage, die jede Einstellung mitschreibt.
 *
 * Bewusst als Huelle und NICHT durch Ueberschreiben von localStorage.setItem:
 * Storage ist kein gewoehnliches Objekt. Eine Zuweisung wie
 * `localStorage.setItem = fn` legt in Wirklichkeit einen EINTRAG namens
 * "setItem" an — in jsdom greift die Umleitung dadurch gar nicht, und im
 * Browser landet Datenmuell im Speicher des Nutzers. Beides ist beim Testen
 * aufgefallen und war der Grund, diesen Weg zu verlassen.
 *
 * Ebenfalls Absicht: eine Huelle statt eines Umbaus aller Aufrufstellen. Die
 * elf Einstellungen liegen ueber acht Dateien verstreut; jede einzelne
 * anzufassen hiesse, elf Gelegenheiten zu schaffen, eine zu vergessen.
 */
export function spiegleEinstellungen(): void {
  if (typeof window === "undefined") return;
  const echt = window.localStorage;
  if (!echt) return;
  if ((echt as unknown as { __keptaHuelle?: boolean }).__keptaHuelle) return;

  const huelle = {
    __keptaHuelle: true,
    /** Der echte Speicher darunter — damit sich die Huelle wieder abnehmen laesst. */
    __keptaEcht: echt,
    get length() { return echt.length; },
    key: (i: number) => echt.key(i),
    getItem: (k: string) => echt.getItem(k),
    setItem: (k: string, v: string) => {
      echt.setItem(k, v);
      if (gehoertUns(k)) { offen[k] = String(v); planeAbgleich(); }
    },
    removeItem: (k: string) => {
      echt.removeItem(k);
      if (gehoertUns(k)) { offen[k] = null; planeAbgleich(); }
    },
    clear: () => {
      // Leeren heisst: auch im Datenordner leeren. Vorher raeumte clear() nur
      // den Browserspeicher, und der naechste Start holte alles aus
      // settings.json zurueck — die Gruppierung stand wieder da, und der
      // Einrichtungsassistent blieb aus, weil "abgelehnt" gleich mitkam
      // (Befund F4 aus dem Persona-Durchlauf vom 8.9.2026).
      const unsere: string[] = [];
      for (let i = 0; i < echt.length; i++) {
        const k = echt.key(i);
        if (k !== null && gehoertUns(k)) unsere.push(k);
      }
      echt.clear();
      for (const k of unsere) offen[k] = null;
      if (unsere.length > 0) planeAbgleich();
    },
  } as unknown as Storage;

  try {
    Object.defineProperty(window, "localStorage", { configurable: true, get: () => huelle });
    // Was kurz vor dem Schliessen geaendert wurde, soll trotzdem ankommen.
    window.addEventListener("pagehide", jetztAbgleichen);
  } catch {
    // Laesst sich der Zugriff nicht ersetzen, bleibt der Browserspeicher allein
    // zustaendig — die Anwendung funktioniert, nur ohne dauerhafte Ablage.
  }
}

/** Beides zusammen — einmal beim Start, vor dem ersten Rendern. */
export async function starteEinstellungen(): Promise<number> {
  const n = await ladeEinstellungen();
  spiegleEinstellungen();
  // Die Werte liegen jetzt im Browserspeicher — aber ein Wert, der etwas an das
  // Dokument malt, wirkt erst, wenn ihn jemand anmalt. `ki_gehirn_zoom` überlebt
  // den Neustart seit dieser Datei; die Textgröße selbst wurde nur gesetzt, wenn
  // jemand im Einstellungs-Fenster am Regler drehte. Gemessen 14.10. (Lauf auf
  // 9421 → Neustart auf 9422, frische Origin): Schlüssel „115" wieder da,
  // computed font-size unverändert. Die Fläche sagte 115 % und zeigte 100 %.
  wendeZoomAn();
  return n;
}
