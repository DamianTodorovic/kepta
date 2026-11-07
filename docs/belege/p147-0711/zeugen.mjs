/* P147 — der Zeuge fuer einen Satz ueber die Zeit vor 3.1.5.

   README.md:357 behauptet, die App habe bis 3.1.4 gez ae hlt, und das Zaehlen habe "places to
   hide the tally" gebraucht: einen authentifizierten Zustand in der Datenbank, einen
   Schluesselbund-Anker, eine versteckte Datei. Fuer eine Aussage ueber eine fruehere
   Quelltext-Fassung ist kein Test ein zulassiger Zeuge, sondern nur der Quelltext selbst --
   also dieser Lauf durch `git show` auf den Eltern-Commit der Heilung.

   Der Heilungs-Commit ist `c7cde55` (09.10.2026 01:41, "3.1.5: die app zaehlt nicht mehr --
   kein schluessel, keine grenzen, kein upgrade-panel"), und er LOESCHT die Module, ueber die
   der Satz spricht: `server/helfer/planzustand.ts` (376 Zeilen), `plan-schluesselbund.ts` (98),
   `probetag.ts` (31), `freemium.ts` (99), `server/router/license.ts` (105). Gelesen wird ihr
   Stand unmittelbar davor, `113093c`.

   Aufruf: `node docs/belege/p147-0711/zeugen.mjs` -- schreibt `zaehler-vor-3-1-5.log.txt`
   byte-neben der Zeitangabe reproduzierbar; die Zeilennummern stammen aus dem Blob, nicht aus
   einem heutigen Blatt. */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const REV = "113093c";
const HEILUNG = "c7cde55";
const ORDNER = path.dirname(new URL(import.meta.url).pathname);
export const ZIEL = path.join(ORDNER, "zaehler-vor-3-1-5.log.txt");

const zeigt = (rev, pfad) => execFileSync("git", ["show", `${rev}:${pfad}`], { encoding: "utf8" });
const nummer = (rev, pfad, muster) =>
  zeigt(rev, pfad)
    .split("\n")
    .map((z, i) => [i + 1, z])
    .filter(([, z]) => muster.test(z) && !/^\s*\/\//.test(z))
    .map(([i, z]) => `    ${pfad}:${i}  ${z.trim().slice(0, 118)}`);

const ZEILEN = [
  `Beleg P147 -- der Zaehler und seine drei Verstecke, im Quelltext unmittelbar vor der Heilung`,
  `Gezogen {Zeit} mit: node docs/belege/p147-0711/zeugen.mjs`,
  `Gelesener Stand: ${REV} (Eltern von ${HEILUNG}, "3.1.5: die app zaehlt nicht mehr -- kein schluessel, keine grenzen, kein upgrade-panel")`,
  ``,
  `Was der Heilungs-Commit loescht (git show --numstat ${HEILUNG}, Zeilen, die auf 0 fallen):`,
  ...execFileSync("git", ["show", "--numstat", "--format=", HEILUNG], { encoding: "utf8" })
    .split("\n")
    .map((z) => z.split("\t"))
    .filter(([zu, weg, pfad]) => zu === "0" && Number(weg) > 0 && /helfer\/(plan|freemium|probetag)|router\/license|ProUpgrade|lizenz-api|probetag\.test/.test(pfad || ""))
    .sort((a, b) => Number(b[1]) - Number(a[1]))
    .map(([, weg, pfad]) => `    ${pfad}  --  ${weg} Zeilen entfernt`),
  ``,
  `Schicht 1 -- der Zustand liegt authentifiziert in der Datenbank (Einstellungen der Wissensbasis):`,
  ...nummer(REV, "server/helfer/planzustand.ts", /ZUSTAND_SCHLUESSEL|AES-256-GCM|createCipheriv|settings|einstellung/i),
  ``,
  `Schicht 2 -- der Anker liegt im Schluesselbund (macOS security, Linux Secret Service, Windows DPAPI):`,
  ...nummer(REV, "server/helfer/plan-schluesselbund.ts", /find-generic-password|add-generic-password|secret-tool|service/),
  ...nummer(REV, "server/helfer/planzustand.ts", /PLAN_ZIEL|ANKER_ZIEL|app\.kepta\.plan/),
  ``,
  `Schicht 3 -- der Erststart liegt zusaetzlich in einer Datei in einem versteckten Benutzerordner:`,
  ...nummer(REV, "server/helfer/planzustand.ts", /trial-anchor|homedir|APPDATA|writeFileSync/),
  ``,
  `Und was der Satz "It was never a lock" traegt: das Modul hat nie eine Funktion verriegelt,`,
  `es hat gezaehlt und den Erststand gemerkt. Die Kappe selbst lag an den Werkzeug-Wegen;`,
  `gelesen in ${HEILUNG}: dasselbe Commit entfernt Routen, Zaehler und Schluesselfeld.`,
];

const text = ZEILEN.join("\n").replace("{Zeit}", new Date().toLocaleString("de-DE", { timeZone: "Europe/Berlin", hour12: false }) + " MEZ");
fs.writeFileSync(ZIEL, text + "\n");
console.log(`geschrieben: ${ZIEL}`);
console.log(`Bytes: ${fs.statSync(ZIEL).size}`);
console.log(text);
