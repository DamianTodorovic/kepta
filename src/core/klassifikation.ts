// Welcher Art ist ein Wissensstueck — Fakt, Ereignis, Anleitung, Beleg?
//
// Bisher entschied das NIEMAND. Der Typ kam ausschliesslich vom Aufrufer, und
// wo keiner ihn setzte, fiel alles auf "semantic" zurueck. In einer echten
// Wissensbasis aus einem Rechner-Scan hiess das: 3071 von 3148 Notizen waren
// "Fact", darunter Dateiausschnitte, Tabellen und Protokolle. Die Einteilung
// beschrieb damit gar nichts.
//
// Hier stehen die Regeln — als Regeln, nicht als Modell. Das ist Absicht:
//   * Sie laufen ohne Netz und ohne LLM, also ueberall gleich.
//   * Sie sind nachlesbar. Zu jeder Zuordnung gehoert ein GRUND, den die
//     Oberflaeche anzeigen kann ("nummerierte Schritte erkannt").
//   * Sie sind pruefbar, und genau das passiert in tests/lib/klassifikation.
//
// Wo nichts greift, bleibt es bei "semantic" — aber dann steht auch das als
// bewusste Entscheidung da und nicht als Rueckfall.

/**
 * Die vier Arten von Wissen.
 *
 * "reference" kam spaeter dazu, und der Grund war messbar: ohne diesen Wert
 * landet jedes uebernommene Dokument als "Fakt" in der Wissensbasis. An einem
 * echten Bestand waren das 2320 von 2421 Notizen — eine Einteilung, die nichts
 * mehr einteilt. Der Preis war ein Umbau der SQLite-Tabelle (siehe
 * erweitereTypBeschraenkung im Speicher), weil CHECK-Bedingungen sich nicht
 * aendern lassen.
 */
export type WissensTyp = "semantic" | "episodic" | "procedural" | "reference";

export interface Zuordnung {
  typ: WissensTyp;
  /** Warum — kurz, fuer die Oberflaeche. */
  grund: string;
}

export interface ZuOrdnendes {
  title: string;
  content: string;
  tags?: readonly string[];
  /** Herkunftspfad, falls die Notiz aus einer Datei stammt. */
  quelle?: string;
}

/** Ueberschriften und Wendungen, die eine Anleitung ankuendigen. */
const ANLEITUNG_WORTE = [
  "anleitung", "howto", "how to", "how-to", "tutorial", "schritt fuer schritt",
  "schritt für schritt", "step by step", "installation", "einrichten", "setup",
  "vorgehen", "ablauf", "checkliste", "checklist", "rezept", "recipe", "playbook",
  "runbook", "leitfaden", "guide",
];

/** Wendungen, die ein Ereignis ankuendigen. */
const EREIGNIS_WORTE = [
  "besprechung", "meeting", "protokoll", "termin", "gespraech", "gespräch",
  "sitzung", "call", "interview", "notiz vom", "tagebuch", "journal",
  "retrospektive", "retro", "standup", "stand-up", "workshop", "konferenz",
];

/** Endungen, bei denen eine Notiz ein Beleg ist und kein formuliertes Wissen. */
const BELEG_ENDUNGEN = [
  ".pdf", ".csv", ".tsv", ".json", ".xml", ".html", ".htm", ".yaml", ".yml",
  ".toml", ".ini", ".cfg", ".conf", ".log", ".rtf", ".tex",
];

const DATUM = /\b(\d{4}-\d{2}-\d{2}|\d{1,2}\.\d{1,2}\.\d{2,4}|\d{1,2}\/\d{1,2}\/\d{2,4})\b/;

function enthaelt(text: string, worte: readonly string[]): string | null {
  for (const w of worte) if (text.includes(w)) return w;
  return null;
}

/** Zaehlt Zeilen, die wie ein nummerierter Schritt aussehen. */
export function nummerierteSchritte(inhalt: string): number {
  let n = 0;
  for (const zeile of inhalt.split(/\r?\n/)) {
    if (/^\s*(\d{1,2}[.)]|schritt\s+\d|step\s+\d)\s+\S/i.test(zeile)) n++;
  }
  return n;
}

/** Zaehlt Aufzaehlungszeilen (-, *, •). */
export function aufzaehlungsZeilen(inhalt: string): number {
  let n = 0;
  for (const zeile of inhalt.split(/\r?\n/)) if (/^\s*[-*•]\s+\S/.test(zeile)) n++;
  return n;
}

/**
 * Wie gross ist der Anteil an Auszeichnung (Markup) am Inhalt?
 *
 * Das ist der Wert, an dem sich zeigt, ob eine Notiz Wissen traegt oder nur
 * das Geruest eines Dokuments. Aus einem echten Bestand: Notizen, die
 * ausschliesslich aus <a name='L420'>420</a> bestanden — Zeilennummern einer
 * HTML-Ansicht von Quelltext, ohne ein einziges inhaltliches Wort.
 */
export function markupAnteil(inhalt: string): number {
  if (inhalt.length === 0) return 0;
  const tags = inhalt.match(/<[^>\n]{1,200}>/g);
  if (!tags) return 0;
  let laenge = 0;
  for (const t of tags) laenge += t.length;
  return laenge / inhalt.length;
}

/** Stammt die Notiz aus einer Datei, deren Endung fuer einen Beleg spricht? */
export function istBelegQuelle(quelle: string | undefined): boolean {
  if (!quelle) return false;
  const q = quelle.toLowerCase();
  return BELEG_ENDUNGEN.some((e) => q.endsWith(e));
}

/**
 * Die Zuordnung. Die Reihenfolge ist Absicht — vom staerksten Beleg zum
 * schwaechsten, damit eine Anleitung mit Datum im Titel eine Anleitung bleibt.
 */
export function klassifiziere(eingabe: ZuOrdnendes): Zuordnung {
  const titel = (eingabe.title ?? "").toLowerCase();
  const inhalt = eingabe.content ?? "";
  const kleinInhalt = inhalt.toLowerCase();
  const tags = (eingabe.tags ?? []).map((t) => t.toLowerCase());

  // 1. Anleitung: nummerierte Schritte sind der deutlichste Beleg ueberhaupt.
  const schritte = nummerierteSchritte(inhalt);
  if (schritte >= 3) {
    return { typ: "procedural", grund: `${schritte} nummerierte Schritte erkannt` };
  }
  const anleitungWort = enthaelt(titel, ANLEITUNG_WORTE) ?? enthaelt(kleinInhalt.slice(0, 400), ANLEITUNG_WORTE);
  if (anleitungWort && (schritte >= 1 || aufzaehlungsZeilen(inhalt) >= 3 || titel.includes(anleitungWort))) {
    return { typ: "procedural", grund: `„${anleitungWort}" im Text` };
  }

  // 2. Ereignis: ein Datum IM TITEL oder eine Wendung, die einen Termin nennt.
  const ereignisWort = enthaelt(titel, EREIGNIS_WORTE);
  if (ereignisWort) return { typ: "episodic", grund: `„${ereignisWort}" im Titel` };
  if (DATUM.test(eingabe.title ?? "")) return { typ: "episodic", grund: "Datum im Titel" };
  if (tags.some((t) => EREIGNIS_WORTE.includes(t))) {
    return { typ: "episodic", grund: "Tag benennt ein Ereignis" };
  }

  // 3. Beleg: ein uebernommenes Dokument, kein selbst formuliertes Wissen.
  if (markupAnteil(inhalt) > 0.25) {
    return { typ: "reference", grund: "ueberwiegend Auszeichnung statt Text" };
  }
  if (istBelegQuelle(eingabe.quelle)) {
    const endung = eingabe.quelle!.slice(eingabe.quelle!.lastIndexOf("."));
    return { typ: "reference", grund: `uebernommen aus ${endung}` };
  }
  if (tags.includes("machine-scan")) {
    return { typ: "reference", grund: "aus dem Rechner-Scan uebernommen" };
  }

  // 4. Alles Uebrige ist formuliertes Wissen.
  return { typ: "semantic", grund: "formulierter Text ohne Ablauf oder Datum" };
}

/**
 * Traegt dieser Inhalt ueberhaupt Wissen — oder ist es nur das Geruest eines
 * Dokuments?
 *
 * Der Anlass ist ein echter Bestand: 448 von 3148 Notizen bestanden
 * ausschliesslich aus HTML-Zeilennummern der Form
 * `<a name='L420'></a><a href='#L420'>420</a>` — die Randspalte einer
 * Quelltextansicht, ohne ein einziges inhaltliches Wort. Sie fluteten die
 * Wissensbasis, machten die Duplikatsuche unbrauchbar (sie AEHNELN einander ja
 * wirklich) und liessen jedes Aufraeumen aussehen, als loesche KEPTA wahllos.
 *
 * Geprueft wird am Eingang. Was hier durchfaellt, wird gar nicht erst zu einer
 * Notiz — statt spaeter muehsam wieder aussortiert zu werden.
 */
export function istUnbrauchbar(inhalt: string): { unbrauchbar: boolean; grund?: string } {
  const roh = (inhalt ?? "").trim();
  if (roh.length < 20) return { unbrauchbar: true, grund: "so gut wie leer" };

  if (markupAnteil(roh) > 0.4) {
    return { unbrauchbar: true, grund: "ueberwiegend Auszeichnung statt Text" };
  }

  const ohneTags = roh.replace(/<[^>\n]{1,200}>/g, " ");
  const woerter = ohneTags.match(/[\p{L}][\p{L}\-']{2,}/gu) ?? [];

  // Wortarmut nur RELATIV zur Laenge.
  //
  // Zuerst stand hier eine absolute Untergrenze von zwoelf Woertern — und die
  // hat an einem echten Bestand prompt drei einwandfreie Notizen verworfen:
  // "Zutaten: Nudeln, Tomaten, Knoblauch, Olivenoel. 15min kochen, al dente
  // servieren." Eine kurze Notiz ist kein Muell. Muell ist, was LANG ist und
  // trotzdem nichts sagt.
  if (roh.length > 300 && woerter.length < 20) {
    return { unbrauchbar: true, grund: "viel Zeichen, kaum Woerter" };
  }

  // Wiederholt sich dieselbe Zeilenform ueber das ganze Dokument? Dann ist es
  // eine Tabelle oder eine Randspalte, kein Text.
  const zeilen = roh.split(/\r?\n/).map((z) => z.trim()).filter(Boolean);
  if (zeilen.length >= 8) {
    const form = (z: string) => z.replace(/\d+/g, "#").replace(/\s+/g, " ").slice(0, 60);
    const zaehler = new Map<string, number>();
    for (const z of zeilen) {
      const f = form(z);
      zaehler.set(f, (zaehler.get(f) ?? 0) + 1);
    }
    const haeufigste = Math.max(...zaehler.values());
    if (haeufigste / zeilen.length > 0.7) {
      return { unbrauchbar: true, grund: "immer dieselbe Zeilenform — Tabelle oder Randspalte" };
    }
  }

  // Ein einziges Wort, das fast alles ausmacht (etwa "420 421 422 …").
  const eindeutige = new Set(woerter.map((w) => w.toLowerCase()));
  if (woerter.length >= 40 && eindeutige.size / woerter.length < 0.12) {
    return { unbrauchbar: true, grund: "kaum verschiedene Woerter" };
  }

  return { unbrauchbar: false };
}

/**
 * Aus einer HTML-Datei den lesbaren Text gewinnen — nicht das Geruest.
 *
 * Vorher wurde HTML roh uebernommen. In einer echten Wissensbasis fuehrte das
 * zu 448 Notizen, die ausschliesslich aus
 * `<a name='L420'></a><a href='#L420'>420</a>` bestanden: der Randspalte
 * einer Quelltextansicht, ohne ein einziges inhaltliches Wort. Sie fluteten
 * die Basis und machten die Duplikatsuche unbrauchbar — sie AEHNELN einander
 * ja wirklich.
 */
/**
 * Navigations- und Boilerplate-Zeilen: "Skip to main content", Menue-Punkte,
 * Cookie-Banner-Reste, Copyright-Zeilen. Genau diese Zeilen standen bisher am
 * Anfang importierter Webseiten und als erster Eindruck in der Kartenliste.
 * GROSS/klein ist egal; eine Zeile muss das Muster VOLL treffen, sonst bleibt
 * echtes Fliesstext stehen (ein Artikel, der mit "Home" anfaengt, ist selten).
 */
// Alle Muster case-insensitive — die Zeilen kommen mit beliebiger
// Schreibweise ("Search", "LOG IN", "Home") aus den Webseiten.
const NAVI_MUSTER: RegExp[] = [
  /^skip to (main )?content$/i,
  /^jump to (content|navigation)$/i,
  /^(main )?(menu|navigation)$/i,
  /^search$/i,
  /^(log ?in|log ?out|sign ?in|sign ?up|register|subscribe|newsletter)$/i,
  /^(home|startseite|impressum|datenschutz|kontakt|contact( us)?|about( us)?|faq|agb|imprint)$/i,
  /^(share|tweet|print|rss|feed)$/i,
  /^(accept all|alle akzeptieren|cookies? (akzeptieren|akzept|settings|erlauben))$/i,
  /^read more$/i, /^weiterlesen$/i, /^mehr lesen$/i,
  /^©/i, /^copyright\b/i,
];

export function entferneNaviZeilen(text: string): string {
  const geblieben = text.split("\n").filter((zeile) => {
    const kern = zeile.trim();
    if (kern.length === 0 || kern.length > 60) return true;
    return !NAVI_MUSTER.some((muster) => muster.test(kern));
  });
  return geblieben.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

export function htmlZuText(roh: string): string {
  return entferneNaviZeilen(roh
    // Was gar keinen Text enthaelt, faellt samt Inhalt weg.
    .replace(/<(script|style|head|noscript|svg)\b[^>]*>[\s\S]*?<\/\1>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    // Blockenden werden zu Zeilenumbruechen, damit Absaetze erhalten bleiben.
    .replace(/<\/(p|div|li|tr|h[1-6]|section|article|blockquote)>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&").replace(/&lt;/gi, "<").replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"').replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_m, d) => String.fromCodePoint(Number(d)))
    .replace(/[ \t]+/g, " ")
    // Leerzeichen unmittelbar an einem Umbruch stammen aus den geoeffneten
    // Tags (<p> wird zu einem Leerzeichen, </p> zum Umbruch).
    .replace(/[ \t]*\n[ \t]*/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim());
}
