/* P156 — die Auslieferungs-Wortlatte: die Ketten des Auslieferungspruefers gegen die Flaeche.

   scripts/pruefe-asar-inhalt.cjs haelt 324 erwartete und 95 verbotene Ketten und laeuft gegen
   das gebaute app.asar — also spaet. Diese Wache zieht dieselben Listen nach vorn und haelt sie
   gegen die Flaechenquelle: src/, server/, index.html und der Hauptprozess electron.js. Ein
   verbotener Wortlaut, der zurueck ins Produkt geschrieben wird, ist hier schon sichtbar, bevor
   jemand einen Bau anfasst; ein erwarteter Marker, der nichts mehr beschreibt, faengt ins Leere
   und meldet Erfolg fuer einen Text, den es nicht mehr gibt.

   Drei Formen sind Absicht, nicht Nachlaessigkeit:
   - Die Listen werden NICHT mit RegExp gelesen. Ein String-Literal mit escaptem
     Anfuehrungszeichen (say \"hi\") oder einem `\\u2014` ist regexfest nicht korrekt zu holen;
     der Block wird als JS ausgewertet. Wirft er, wirft die Wache — ein Pruefer, der seine eigne
     Lesebloecke als "nichts gefunden" ausgibt, ist schaedlicher als keiner.
   - Kurzketten (unter drei Woertern: `data-abschnitt`, `graph-farbgruppe`, CSS-Selector) werden
     nicht gefordert. Der Bundler schreibt Klassen um, und ein Marker auf eine umgeschriebene
     Form ist eine Pruefung, die wegen einer bewussten Aenderung schlaegt.
   - Non-ASCII vergleicht die Wache in beide Richtungen: der Buendler schreibt den Gedankenstrich
     als \u2014, der Quelltext traegt das echte Zeichen. Beide Formen sind derselbe Wortlaut. */
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";

/** Endungen, die zur Flaechenquelle gehoeren — gebaute Baeume (dist*, release/) bleiben draussen. */
const ENDE = /\.(ts|tsx|js|mjs|cjs|css|html|json)$/;
const WURZELN = ["src", "server"];
const AUSNAHME_ORDNER = new Set(["node_modules", ".git", "dist", "release", "test-results", "coverage"]);

/** Ein Block `const NAME = [ ... ];` als Literaltext, inkl. der Klammern. */
function blockLiteral(text, name) {
  const anfang = text.indexOf(`const ${name} = [`);
  if (anfang < 0) throw new Error(`kein Block "const ${name} = [" in diesem Pruefer`);
  const start = text.indexOf("[", anfang);
  const ende = text.indexOf("\n];", start);
  if (ende < 0) throw new Error(`der Block "${name}" schliesst nicht mit ]; — die Wache liest ihn nicht`);
  return text.slice(start, ende + 2);
}

/** Die Ketten eines Pruefers, als echte Werte (Escapes Aufloesung durch den JS-Auswerter). */
export function wortKetten(prueferPfad) {
  const text = fs.readFileSync(prueferPfad, "utf8");
  const liest = (name) => {
    const literal = blockLiteral(text, name);
    const wert = vm.runInNewContext(`(${literal})`, Object.create(null), { timeout: 2000, filename: prueferPfad });
    if (!Array.isArray(wert)) throw new Error(`"${name}" ist kein Array`);
    return wert.map((eintrag) => (Array.isArray(eintrag) ? eintrag[0] : eintrag)).filter((k) => typeof k === "string" && k.length > 0);
  };
  return { erwartet: liest("erwartet"), verboten: liest("verboten") };
}

/** Die Dateien der Flaechenquelle: Wurzeln flach und tief, plus index.html und electron.js. */
export function oberflaecheDateien(wurzel) {
  const out = [];
  const durchsuche = (ordner) => {
    let eintraege;
    try {
      eintraege = fs.readdirSync(ordner, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of eintraege) {
      if (AUSNAHME_ORDNER.has(e.name) || e.name.startsWith("dist-")) continue;
      const p = path.join(ordner, e.name);
      if (e.isDirectory()) durchsuche(p);
      else if (ENDE.test(e.name)) out.push(p);
    }
  };
  for (const w of WURZELN) durchsuche(path.join(wurzel, w));
  for (const einzeln of ["index.html", "electron.js"]) {
    const p = path.join(wurzel, einzeln);
    if (fs.existsSync(p)) out.push(p);
  }
  return out;
}

/** Ein `\\uXXXX`-Wortlaut des Bundlers als echte Zeichen, damit beide Formen vergleichbar sind. */
function entschluesseln(kette) {
  return kette.replace(/\\u([0-9a-fA-F]{4})/g, (_, hex) => String.fromCharCode(Number.parseInt(hex, 16)));
}

/**
 * Syntaxform: die Kette beschreibt Buendler-Ausgabe (CSS-Direktive, Objekt-Property, Selector),
 * nicht einen Wortlaut der Flaeche. Sie wird nicht gefordert — eine Forderung auf sie koennte
 * nie schlagen, weil der Quelltext sie andrerisch schreibt. Der Bundler setzt `maxHeight: "…"`
 * ohne Leerzeichen, und eine CSP-Zeile fuegt Stuecke zusammen.
 */
const SYNTAX = /[:;{}()=]|\s--/;
const istSyntax = (kette) => SYNTAX.test(kette);

/** Wortanzahl fuer die Prosa-Schwelle, nach der Entschluesselung — sonst zaehlt \u2014 mit. */
const istProsa = (kette) => entschluesseln(kette).trim().split(/\s+/).length >= 3;

/** Aufteilen, was die Flaeche beschreiben muss und was nur das Objekt. */
export function formTeilen(ketten) {
  const prosa = ketten.filter((k) => istProsa(k) && !istSyntax(k));
  return { prosa, syntax: ketten.filter((k) => istProsa(k) && istSyntax(k)), kurz: ketten.filter((k) => !istProsa(k)) };
}

/**
 * Befunde ueber die Wortlatte eines Pruefers in der Flaechenquelle; ein leeres Feld ist das
 * saubere Urteil. Regel 1: verbotene Prosa-Ketten duerfen nicht zurueck ins Produkt.
 * Regel 2: erwartete Prosa-Ketten muessen die Quelle noch beschreiben. Verglichen wird
 * Buchstabe fuer Buchstabe und ohne Leerlauf, weil der Bundler Leerzeichen anders setzt.
 */
export function auslieferungsBefunde(wurzel, prueferPfad) {
  const { erwartet, verboten } = wortKetten(prueferPfad);
  const dateien = oberflaecheDateien(wurzel);
  const inhalte = dateien.map((p) => {
    const roh = fs.readFileSync(p, "utf8");
    return { relativ: path.relative(wurzel, p), roh, glatt: roh.replace(/\s+/g, "") };
  });
  const fund = (kette) => {
    const echt = entschluesseln(kette);
    const glatt = echt.replace(/\s+/g, "");
    return inhalte.filter((e) => e.roh.includes(echt) || e.glatt.includes(glatt)).map((e) => e.relativ);
  };
  const funde = [];
  for (const kette of formTeilen(verboten).prosa) {
    const where = fund(kette);
    if (where.length) {
      funde.push(
        `Rueckkehr: ${where.slice(0, 3).join(", ")} schreibt die verbotene Kette ${JSON.stringify(kette.slice(0, 90))} — das ausgelieferte Objekt war sie los`,
      );
    }
  }
  for (const kette of formTeilen(erwartet).prosa) {
    if (!fund(kette).length) {
      funde.push(`erloeschener Marker: die erwartete Kette ${JSON.stringify(kette.slice(0, 90))} beschreibt keine Flaechenquelle mehr`);
    }
  }
  return funde;
}
