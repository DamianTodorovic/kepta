/* P156 — die Auslieferungs-Wortlatte: was dem ausgelieferten Objekt verboten ist, darf nicht
   schon im Quelltext stehen.

   scripts/pruefe-asar-inhalt.cjs haelt 324 erwartete und 95 verbotene Ketten — gegen das
   gebaute app.asar. Er laeuft bei der Landung, also spaetestens da, wo der Bau schon laeuft
   und eine falsche Wortwahl langst im Quelltext sitzt. Diese Wache zieht die Pruefung nach
   vorn: sie haelt dieselben Listen gegen die Flaeche (src/, server/, index.html, electron.js)
   in JEDEM Suite-Lauf, und sie braucht keinen Bau.

   Zwei Regeln, beide gemessen (11:00:49 und 11:04:55 MEZ am heutigen Stand):
     1. Rueckkehr — keine verbotene Prosa-Kette darf in der Flaeche stehen. Gemessen: 0.
        Ein Treffer ist keine Formalie: er sagt, dass ein Wortlaut, den eine fruehere Fassung
        schon los war, zurueck ins Produkt geschrieben wurde, und zwar 150 Bauschritte bevor
        jemand es am Objekt merken wuerde.
     2. Erlaeschen — jede erwartete Prosa-Kette (drei Woerter oder mehr) muss die Flaeche noch
        beschreiben. Gemessen: 0, nachdem der Hauptprozess (electron.js) in die Flaeche kam:
        die CSP-Kette lebt dort, nicht in src/. Eine erloeschene Kette ist ein Pruefer, der ins
        Leere faengt — er meldet Erfolg fuer einen Wortlaut, den es nicht mehr gibt.

   Zwei Formen, die der Baum zu Recht nicht Buchstabe fuer Buchstabe fuehrt, sind ausgenommen
   und gezaehlt: Kurzketten (Klassennamen wie `data-abschnitt`, ein CSS-Selector) beschreibt der
   Bundling-Schritt um, und non-ASCII schreibt der Buendler als `\u2014`, waehrend der Quelltext
   das echte Zeichen traegt — die Wache vergleicht beide Richtungen, nicht eine. */
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { auslieferungsBefunde, formTeilen, oberflaecheDateien, wortKetten } from "../scripts/helfer/auslieferungs-wort.mjs";

const WURZEL = path.resolve(import.meta.dirname, "..");
const CHECKER = path.join(WURZEL, "scripts", "pruefe-asar-inhalt.cjs");

function inKapsel<T>(bau: (ordner: string) => T): T {
  const ordner = fs.mkdtempSync(path.join(os.tmpdir(), "auslieferungs-wort-"));
  try {
    return bau(ordner);
  } finally {
    fs.rmSync(ordner, { recursive: true, force: true });
  }
}

/** Kapsel: ein Checker mit beiden Listen und eine Flaeche, die zu ihm passt. */
function kapsel(bau: (ordner: string) => void) {
  return inKapsel((ordner) => {
    fs.mkdirSync(path.join(ordner, "src"), { recursive: true });
    fs.mkdirSync(path.join(ordner, "server"), { recursive: true });
    fs.writeFileSync(
      path.join(ordner, "scripts-checker.cjs"),
      [
        "const erwartet = [",
        '  ["data-abschnitt", 1],',
        '  ["the panel names the window it drew", 1],',
        '];',
        "const verboten = [",
        '  "the whole result fits in this page",',
        "];",
        "",
      ].join("\n"),
    );
    fs.writeFileSync(path.join(ordner, "src", "Flaeche.tsx"), 'export const x = "the panel names the window it drew";\n');
    fs.writeFileSync(path.join(ordner, "server", "weg.ts"), 'const f = "data-abschnitt";\n');
    fs.writeFileSync(path.join(ordner, "index.html"), "<html><body>leer</body></html>\n");
    fs.writeFileSync(path.join(ordner, "electron.js"), "// Hauptprozess ohne Prosatext\n");
    bau(ordner);
    return ordner;
  });
}

describe("P156, die Auslieferungs-Wortlatte: verbotene Wortlaete duerfen nicht in die Flaechenquelle", () => {
  it("eine ehrliche Kapsel meldet nichts, und beide Listen werden gelesen", () => {
    kapsel((ordner) => {
      const ketten = wortKetten(path.join(ordner, "scripts-checker.cjs"));
      expect(ketten.erwartet, "erwartete Ketten fehlgelesen").toEqual(["data-abschnitt", "the panel names the window it drew"]);
      expect(ketten.verboten, "verbotene Ketten fehlgelesen").toEqual(["the whole result fits in this page"]);
      expect(auslieferungsBefunde(ordner, path.join(ordner, "scripts-checker.cjs"))).toEqual([]);
    });
  });

  it("eine verbotene Kette zurueck in der Flaechenquelle ist ein Befund, mit Datei und Kette", () => {
    kapsel((ordner) => {
      fs.writeFileSync(path.join(ordner, "src", "Rueckfall.tsx"), 'export const t = "the whole result fits in this page";\n');
      const funde = auslieferungsBefunde(ordner, path.join(ordner, "scripts-checker.cjs"));
      expect(funde.length, `die Rueckkehr blieb ungemeldet: ${JSON.stringify(funde)}`).toBe(1);
      expect(funde[0], funde[0]).toContain("Rueckfall.tsx");
      expect(funde[0], funde[0]).toContain("the whole result fits in this page");
    });
  });

  it("eine erwartete Prosa-Kette, die die Flaeche nicht mehr beschreibt, ist ein Befund", () => {
    kapsel((ordner) => {
      fs.writeFileSync(path.join(ordner, "src", "Flaeche.tsx"), 'export const x = "the panel names something else entirely";\n');
      const funde = auslieferungsBefunde(ordner, path.join(ordner, "scripts-checker.cjs"));
      expect(funde.length, `der erloeschene Marker blieb ungemeldet: ${JSON.stringify(funde)}`).toBe(1);
      expect(funde[0], funde[0]).toContain("the panel names the window it drew");
    });
  });

  it("der Buendler-Strich: erwartet als \\u2014, die Flaeche traegt das echte Zeichen — kein Befund", () => {
    kapsel((ordner) => {
      const checker = path.join(ordner, "scripts-checker.cjs");
      fs.writeFileSync(
        checker,
        ['const erwartet = [', '  ["claims nothing yet \\\\u2014 the graph draws only mentions", 1],', "];", "const verboten = [", '  "alt und vorbei",', "];", ""].join("\n"),
      );
      fs.writeFileSync(path.join(ordner, "src", "Flaeche.tsx"), 'export const x = "claims nothing yet — the graph draws only mentions";\n');
      expect(auslieferungsBefunde(ordner, checker), "die Escape-Form der Kette wurde als erloeschen gemeldet").toEqual([]);
    });
  });

  it("Kurzketten wie Klassen- und Selector-Namen werden nicht gefordert, aber ausgezaehlt", () => {
    kapsel((ordner) => {
      // data-abschnitt steht nur in server/weg.ts, der Selector gar nicht in der Flaeche:
      fs.writeFileSync(path.join(ordner, "server", "weg.ts"), 'const f = "andere Sache";\n');
      const checker = path.join(ordner, "scripts-checker.cjs");
      fs.writeFileSync(
        checker,
        ["const erwartet = [", '  ["graph-farbgruppe", 1],', '  ["the panel names the window it drew", 1],', "];", "const verboten = [", '  "alt und vorbei",', "];", ""].join("\n"),
      );
      const funde = auslieferungsBefunde(ordner, checker);
      expect(funde.length, `eine Kurzkette wurde gefordert: ${JSON.stringify(funde)}`).toBe(0);
      const ketten = wortKetten(checker);
      expect(ketten.erwartet.filter((k: string) => k.trim().split(/\s+/).length < 3).length).toBe(1);
    });
  });

  it("der Hauptprozess gehoert zur Flaechenquelle: ohne electron.js faengt die Wache ins Leere", () => {
    kapsel((ordner) => {
      const checker = path.join(ordner, "scripts-checker.cjs");
      fs.writeFileSync(
        checker,
        ["const erwartet = [", '  ["Server started in main process via require", 1],', '  ["the panel names the window it drew", 1],', "];", "const verboten = [", '  "alt und vorbei",', "];", ""].join("\n"),
      );
      fs.writeFileSync(path.join(ordner, "electron.js"), 'console.log("Server started in main process via require");\n');
      expect(auslieferungsBefunde(ordner, checker), "electron.js zaehlt nicht zur Flaeche").toEqual([]);
      expect(oberflaecheDateien(ordner).some((p: string) => p.endsWith("electron.js")), "die Flaeche laesst den Hauptprozess weg").toBe(true);
    });
  });

  it("eine Bundler-Syntaxkette wird nicht gefordert, aber beim Namen gezaehlt", () => {
    kapsel((ordner) => {
      const checker = path.join(ordner, "scripts-checker.cjs");
      fs.writeFileSync(
        checker,
        [
          "const erwartet = [",
          '  [\'img-src \\\'self\\\' data: http://localhost:*; connect-src\', 1],',
          '  ["the panel names the window it drew", 1],',
          "];",
          "const verboten = [",
          '  "alt und vorbei",',
          "];",
          "",
        ].join("\n"),
      );
      // Die Quelltext-Form der Direktive steht mit Leerzeichen und andrer Reihenfolge:
      fs.writeFileSync(path.join(ordner, "src", "Flaeche.tsx"), 'export const x = "the panel names the window it drew";\n');
      const geteilt = formTeilen(wortKetten(checker).erwartet);
      expect(geteilt.syntax.length, "die Direktive wurde nicht als Syntaxform erkannt").toBe(1);
      expect(geteilt.prosa.length, "die Prosa-Kette wurde in die Syntax geworfen").toBe(1);
      expect(auslieferungsBefunde(ordner, checker), "eine Syntaxkette wurde gegen die Quelle gefordert").toEqual([]);
    });
  });

  it("Leerlauf in der Quelle tauscht der Bundler: ohne Vergleich beider Formen waere das erloeschen", () => {
    kapsel((ordner) => {
      const checker = path.join(ordner, "scripts-checker.cjs");
      fs.writeFileSync(
        checker,
        ["const erwartet = [", '  ["the strip names  both numbers shown", 1],', "];", "const verboten = [", '  "alt und vorbei",', "];", ""].join("\n"),
      );
      // Die Quelle schreibt den Wortlaut mit einem Leerlauf, der Pruefer-Marker mit zwei:
      fs.writeFileSync(path.join(ordner, "src", "Flaeche.tsx"), 'export const t = "the strip names both numbers shown";\n');
      const funde = auslieferungsBefunde(ordner, checker);
      expect(funde, `der Leerlauf meldete erloeschen, wo die Quelle den Wortlaut haelt: ${JSON.stringify(funde)}`).toEqual([]);
      // Biss: andert die Quelle den Wortlaut wirklich, muss der Befund wieder da sein.
      fs.writeFileSync(path.join(ordner, "src", "Flaeche.tsx"), 'export const t = "the strip hides both numbers now";\n');
      expect(auslieferungsBefunde(ordner, checker).length, "der echte Wortlauttausch blieb ungemeldet").toBe(1);
    });
  });

  it("ein Kommentar im Checker ist keine Kette, und ein escaptes Anfuehrungszeichen gehoert dazu", () => {
    kapsel((ordner) => {
      const checker = path.join(ordner, "scripts-checker.cjs");
      fs.writeFileSync(
        checker,
        [
          "const erwartet = [",
          '  // "eine Zeile im Kommentar, die wie eine Kette aussieht", 1],',
          '  ["say \\"hi\\" and name the window", 1],',
          "];",
          "const verboten = [",
          '  "alt und vorbei",',
          "];",
          "",
        ].join("\n"),
      );
      const ketten = wortKetten(checker);
      expect(ketten.erwartet.some((k: string) => k.includes("Kommentar")), "der Kommentar wurde zur Kette").toBe(false);
      expect(ketten.erwartet[0], 'das escapte Anfuehrungszeichen ging verloren').toBe('say "hi" and name the window');
    });
  });

  it("Biss am gelieferten Listenstand: eine echte verbotene Kette in einer Flaeche ist ein Befund", () => {
    inKapsel((ordner) => {
      fs.mkdirSync(path.join(ordner, "src"), { recursive: true });
      const ketten = wortKetten(CHECKER);
      const eine = formTeilen(ketten.verboten).prosa[0];
      expect(typeof eine, "die verboten-Liste liefert keine Prosa-Kette").toBe("string");
      fs.writeFileSync(path.join(ordner, "src", "Flaeche.tsx"), `export const t = ${JSON.stringify(eine)};\n`);
      const funde = auslieferungsBefunde(ordner, CHECKER);
      const rueckkehren = funde.filter((f: string) => f.startsWith("Rueckkehr:"));
      expect(rueckkehren.length, `die echte Kette ${JSON.stringify(eine.slice(0, 40))} wurde nicht als Rueckkehr gemeldet`).toBe(1);
      expect(rueckkehren.join("\n"), "der Befund nennt die Kette nicht").toContain(eine.slice(0, 40));
    });
  });

  it("am echten Stand: die Wortlatte haelt, und die gelesenen Zahlen sind die des Checkers", () => {
    const ketten = wortKetten(CHECKER);
    const geteilt = formTeilen(ketten.erwartet);
    const verbotenGeteilt = formTeilen(ketten.verboten);
    const text = fs.readFileSync(CHECKER, "utf8");
    // Sonstkontrolle: ein fehlgelesener Block wuerde die Wache stumm machen. Untergrenzen aus
    // der Messung 11:10:00 MEZ (erwartet 327 Ketten, davon 206 Prosa; verboten 95, davon 70
    // Prosa; Flaeche 155 Dateien) — mit Atemraum nach unten, nicht an den Fall angepasst.
    expect(ketten.erwartet.length, "der erwartet-Block wurde nicht vollstaendig gelesen").toBeGreaterThan(250);
    expect(ketten.verboten.length, "der verboten-Block wurde nicht vollstaendig gelesen").toBeGreaterThan(70);
    expect(geteilt.prosa.length, "nur 206 Prosa-Marker erwartet? geaendert: " + geteilt.prosa.length).toBeGreaterThan(150);
    expect(verbotenGeteilt.prosa.length).toBeGreaterThan(50);
    expect(text.includes("const erwartet = ["), "der erwartet-Block ist nicht mehr als Block geschrieben").toBe(true);
    expect(text.includes("const verboten = ["), "der verboten-Block ist nicht mehr als Block geschrieben").toBe(true);

    const funde = auslieferungsBefunde(WURZEL, CHECKER);
    expect(funde, `Wortlatte in der Flaechenquelle nicht gehalten:\n` + funde.map((f: string) => `  ${f}`).join("\n")).toEqual([]);

    const flaechen = oberflaecheDateien(WURZEL);
    expect(flaechen.length, "die Flaechenliste ist leer — die Wache prueft nichts").toBeGreaterThan(120);
    expect(flaechen.some((p: string) => p.endsWith("/electron.js")), "der Hauptprozess fehlt in der Flaeche").toBe(true);
    expect(flaechen.some((p: string) => p.includes("/src/components/")), "die Komponenten-Quelltexte fehlen in der Flaeche").toBe(true);
    // Die zwei Ausnahmen, benannt in Zahlen: Syntaxketten und Kurzketten fordert nur das Objekt.
    expect(geteilt.syntax.length + geteilt.kurz.length + verbotenGeteilt.syntax.length + verbotenGeteilt.kurz.length).toBeGreaterThan(100);
  });
});
