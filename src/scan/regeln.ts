// Was darf ein Rechner-Scan lesen — und was niemals?
//
// K3PTA soll auf Wunsch den ganzen Rechner durchsehen und Wissen einsammeln.
// Alles bleibt dabei auf dem Geraet; es gibt keine Cloud und der Kern hat keinen
// Netzzugang. Trotzdem ist das die eingriffsstaerkste Funktion der Anwendung,
// aus einem Grund, der leicht uebersehen wird: was einmal in der Wissensbasis
// steht, koennen ANGESCHLOSSENE KI-AGENTEN ueber MCP lesen. Ein eingesammelter
// Zugangsschluessel ist damit nicht mehr nur eine Datei auf der Platte.
//
// Deshalb gilt hier eine feste Trennung:
//   * Ordner und Dateien mit Geheimnissen werden NIE gelesen — das laesst sich
//     in der Oberflaeche auch nicht abschalten.
//   * Alles Uebrige laeuft ueber eine ausdrueckliche Bestaetigung des Nutzers,
//     mit Vorschau, bevor irgendetwas gespeichert wird.
//
// Die Regeln stehen bewusst als eigene, testbare Einheit: eine Luecke hier ist
// keine Unbequemlichkeit, sondern ein Datenleck.

/** Ordnernamen, die nie betreten werden — Geheimnisse, Zugangsdaten, Schluessel. */
export const GEHEIME_ORDNER: readonly string[] = [
  ".ssh", ".gnupg", ".gpg", ".aws", ".azure", ".kube", ".docker", ".chef",
  ".password-store", ".pki", ".cert", ".certs", ".secrets", ".vault",
  "keychains", "keyrings", "1password", "keepass", "bitwarden", "lastpass",
  "electrum", "exodus", ".ethereum", ".bitcoin", "wallets",
  "cookies", "credentials", "logindata",
];

/** Ordner ohne Erkenntniswert oder mit fremden Datenbanken. */
export const UEBERSPRUNGENE_ORDNER: readonly string[] = [
  // Entwicklung
  ".git", ".hg", ".svn", "node_modules", "bower_components", "vendor",
  "venv", ".venv", "env", "__pycache__", ".mypy_cache", ".pytest_cache",
  "target", "build", "dist", "out", ".next", ".nuxt", ".parcel-cache",
  // Generierte Testberichte: vitest/istanbul schreiben coverage/ und darin
  // lcov-report/ bei jedem Lauf neu. Ein Rechner-Scan nahm auf einer echten
  // Wissensbasis 950 Teile aus 62 solchen Seiten mit — Quelltextansichten mit
  // Zeilennummern, kein Wissen.
  "coverage", "lcov-report", "htmlcov",
  "deriveddata", "pods", ".gradle", ".m2", ".cargo", ".rustup", ".npm", ".yarn",
  // Zwischenspeicher
  ".cache", "cache", "caches", "tmp", "temp", ".tmp", "logs",
  // Systemnah / Anwendungsdaten
  "appdata", "programdata", "windows", "program files", "program files (x86)",
  "system32", "syswow64", "$recycle.bin", ".trash", "trash", ".local/share/trash",
  "library", "containers", "system", "private", "applications", "volumes",
  // Browserprofile enthalten Sitzungen und Verlaeufe
  "chrome", "chromium", "firefox", ".mozilla", "safari", "edge", "brave",
  ".thunderbird", "mail",
  // Transit und Medien (#73, gemessen am echten Heim, 14.10.2026): ein einziger
  // heruntergeladener Projektordner brachte 16 Dateien ein, ein Videoschnitt-
  // Programm 50 JSON-Projektdateien. Diese Ordner sind Durchgang, kein Bestand.
  // Eine ausdruecklich gewaehlte Wurzel bleibt davon unberuehrt — wer seine
  // Belege aus ~/Downloads holen will, kann ~/Downloads als Ziel angeben.
  "downloads", "movies", "pictures", "music",
];

/**
 * Die Marke, an der ein Ordner als K3PTAs eigener Datenordner zu erkennen ist.
 *
 * Nicht am Ordnernamen — Sicherungskopien heißen wie ihr Besitzer sie tauft
 * (`K3PTA-datensicherung-vor-3.2.1-2026-10-12`, `mein-archiv`, was auch immer).
 * Am Dateinamen der Datenbank erkennt der Scan jede Kopie seines eigenen
 * Bestands. Gemessen am echten Heim 14.10.: 7.300 von 13.616 Dateien eines
 * Erstlaufs (53,6 %) kamen aus vier solchen Kopien, darunter `profile.json`,
 * `scan-config.json` und `endpoint.json` — genau die Dateien, die der Server
 * verschluesselt ablegt und im Quelltext als „sensible Metadaten" fuehrt.
 *
 * Der Name steht in src/core/store.ts (defaultDbPath); eine Wache in
 * tests/scan/regeln.test.ts vergleicht beide, damit eine Umbenennung hier nicht
 * still gueltig bleibt.
 */
export const DATENBANK_MARKE = "kepta.db";

/** Traegt dieser Ordner (seine Eintragliste) K3PTAs eigene Datenbank? */
export function istKeptaDatenordner(eintraege: readonly { name: string; istOrdner: boolean }[]): boolean {
  return eintraege.some((e) => !e.istOrdner && e.name.toLowerCase() === DATENBANK_MARKE);
}

/**
 * Dateinamen und Endungen, die nie geoeffnet werden. Die Muster greifen auf dem
 * KLEINGESCHRIEBENEN Dateinamen.
 */
export const GEHEIME_DATEIMUSTER: readonly RegExp[] = [
  /^\.env(\..*)?$/,
  /^\.netrc$/, /^\.npmrc$/, /^\.pypirc$/, /^\.git-credentials$/, /^\.htpasswd$/,
  /^known_hosts$/, /^authorized_keys$/,
  /^id_(rsa|dsa|ecdsa|ed25519)(\..*)?$/,
  /^credentials(\..*)?$/, /^secrets?(\..*)?$/, /^\.?passwo?rds?(\..*)?$/,
  /\.(pem|key|p12|pfx|jks|keystore|kdbx|kdb|asc|gpg|ppk|crt|cer|der)$/,
  /\.(keychain|keychain-db|wallet)$/,
  /(^|[^a-z])(secret|token|apikey|api-key|passwd|password|private-?key)([^a-z]|$)/,
];

/** Endungen, aus denen sich Text gewinnen laesst. */
export const LESBARE_ENDUNGEN: readonly string[] = [
  ".txt", ".md", ".markdown", ".mdx", ".rst", ".org", ".text",
  ".json", ".yaml", ".yml", ".toml", ".ini", ".cfg", ".conf",
  ".csv", ".tsv", ".html", ".htm", ".xml", ".rtf", ".tex", ".pdf",
];

/** Groesste Datei, die noch gelesen wird. Darueber ist es kein Wissen mehr. */
export const MAX_DATEI_BYTES = 2_000_000;
/** Obergrenze fuer einen Durchlauf — schuetzt vor einer Wissensbasis aus Muell. */
export const MAX_DATEIEN = 20_000;
/** Wie tief der Scan in Ordnerbaeume hineingeht. */
export const MAX_TIEFE = 12;

export type Ablehnungsgrund =
  | "geheim"
  | "systemordner"
  | "versteckt"
  | "format"
  | "zu-gross"
  | "leer"
  | "abgewaehlt";

export interface Urteil {
  aufnehmen: boolean;
  grund?: Ablehnungsgrund;
}

/**
 * Was der Nutzer am Scan einstellen darf.
 *
 * Die Trennung ist die wichtigste Aussage dieser Datei: einstellbar ist, was
 * WEITER eingeschraenkt. Die harten Sperren — Schluessel, Zugangsdaten,
 * Browserprofile, Schluesselbunde, Wallets — lassen sich hierueber NICHT
 * oeffnen. Sie stehen in GEHEIME_ORDNER und GEHEIME_DATEIMUSTER und gelten
 * immer, weil eine Luecke dort kein Komfortverlust waere, sondern ein Leck:
 * was in der Wissensbasis steht, koennen angeschlossene Agenten ueber MCP lesen.
 */
export interface ScanEinstellungen {
  /** Endungen, die gelesen werden. Ohne Angabe: LESBARE_ENDUNGEN. */
  endungen?: readonly string[];
  /** Groesste Datei in Bytes. Ohne Angabe: MAX_DATEI_BYTES. */
  maxDateiBytes?: number;
  /** Zusaetzliche Ordnernamen, die der Nutzer aussen vor lassen will. */
  zusaetzlichAusgelassen?: readonly string[];
}

/** Kleingeschriebener Basisname ohne Pfad. */
function basis(pfad: string): string {
  const teile = pfad.split(/[\\/]/);
  return teile[teile.length - 1].toLowerCase();
}

/**
 * Der Teil eines Pfades UNTERHALB der Wurzel, in Bestandteile zerlegt.
 *
 * Ohne diese Einschraenkung wurden die Ordnerregeln auf den ganzen absoluten
 * Pfad angewandt — und ein Heimverzeichnis unter /private/tmp/... oder
 * /home/build/... fiel komplett durch, weil "private", "tmp" und "build" auf
 * der Ueberspringen-Liste stehen. Was OBERHALB der gewaehlten Wurzel liegt,
 * hat der Nutzer nicht ausgewaehlt und darf sein Urteil nicht bestimmen.
 */
export function teileUnterWurzel(pfad: string, wurzel?: string): string[] {
  let rest = pfad;
  if (wurzel) {
    const w = wurzel.replace(/[\\/]+$/, "");
    if (pfad === w) rest = "";
    else if (pfad.startsWith(w + "/") || pfad.startsWith(w + "\\")) rest = pfad.slice(w.length + 1);
  }
  return rest.toLowerCase().split(/[\\/]/).filter(Boolean);
}

/** Enthaelt der Pfad einen Ordner, der Geheimnisse beherbergt? */
export function istGeheimerPfad(pfad: string, wurzel?: string): boolean {
  const teile = teileUnterWurzel(pfad, wurzel);
  // Der letzte Teil ist die Datei selbst — Ordner sind alles davor.
  for (let i = 0; i < teile.length - 1; i++) {
    if (GEHEIME_ORDNER.includes(teile[i])) return true;
  }
  return false;
}

/** Traegt der Ordnername einen Namen, den der Scan nicht betritt? */
export function istUebersprungenerOrdner(name: string): boolean {
  const n = name.toLowerCase();
  if (GEHEIME_ORDNER.includes(n)) return true;
  if (UEBERSPRUNGENE_ORDNER.includes(n)) return true;
  // Versteckte Ordner bleiben aussen vor: dort liegt Werkzeugzustand, kein Wissen.
  return n.startsWith(".") && n !== "." && n !== "..";
}

/** Ist der Dateiname eines, das Geheimnisse tragen koennte? */
export function istGeheimeDatei(name: string): boolean {
  const n = name.toLowerCase();
  return GEHEIME_DATEIMUSTER.some((m) => m.test(n));
}

/** Laesst sich aus dieser Endung Text gewinnen? */
export function istLesbaresFormat(name: string, erlaubte: readonly string[] = LESBARE_ENDUNGEN): boolean {
  const n = name.toLowerCase();
  const punkt = n.lastIndexOf(".");
  if (punkt <= 0) return false;
  return erlaubte.includes(n.slice(punkt));
}

/**
 * Das Urteil ueber eine einzelne Datei. Die Reihenfolge ist Absicht: erst die
 * Ausschlussgruende, die Schaden verhindern, dann die, die nur Muell fernhalten.
 */
export function beurteileDatei(
  pfad: string,
  groesse: number,
  wurzel?: string,
  ein: ScanEinstellungen = {}
): Urteil {
  const name = basis(pfad);
  // Zuerst die Sperren, die sich NICHT einstellen lassen.
  if (istGeheimerPfad(pfad, wurzel) || istGeheimeDatei(name)) return { aufnehmen: false, grund: "geheim" };
  const teile = teileUnterWurzel(pfad, wurzel);
  const zusaetzlich = (ein.zusaetzlichAusgelassen ?? []).map((o) => o.toLowerCase());
  for (let i = 0; i < teile.length - 1; i++) {
    if (UEBERSPRUNGENE_ORDNER.includes(teile[i])) return { aufnehmen: false, grund: "systemordner" };
    if (zusaetzlich.includes(teile[i])) return { aufnehmen: false, grund: "abgewaehlt" };
  }
  if (name.startsWith(".")) return { aufnehmen: false, grund: "versteckt" };
  // Der Nutzer darf die Auswahl EINSCHRAENKEN, nicht erweitern.
  const erlaubte = (ein.endungen ?? LESBARE_ENDUNGEN).filter((e) => LESBARE_ENDUNGEN.includes(e));
  if (!istLesbaresFormat(name, erlaubte)) return { aufnehmen: false, grund: "format" };
  const grenze = Math.min(ein.maxDateiBytes ?? MAX_DATEI_BYTES, MAX_DATEI_BYTES);
  if (groesse > grenze) return { aufnehmen: false, grund: "zu-gross" };
  if (groesse <= 0) return { aufnehmen: false, grund: "leer" };
  return { aufnehmen: true };
}

/** Klartext fuer die Oberflaeche — der Nutzer soll sehen, WARUM etwas fehlt. */
export function grundLabel(g: Ablehnungsgrund): string {
  switch (g) {
    case "geheim": return "Keys, passwords and credentials";
    case "systemordner": return "System, cache and build folders";
    case "versteckt": return "Hidden files";
    case "format": return "Not a readable document";
    case "zu-gross": return "Larger than 2 MB";
    case "leer": return "Empty";
    case "abgewaehlt": return "In a folder you excluded";
  }
}
