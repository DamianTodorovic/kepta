/* P155 — das Zitat-Fenster: ein woertlich zitierter Satz muss der genannte Zeile gehoeren.

   Die Anker-Wache (P154) prueft Existenz und Inhalt einer Zeile, nicht Sinn. Genau darin blieb
   die Klasse unsichtbar, die in derselben Nacht zweimal passierte: ein Anker wandert um zwei
   Zeilen und trifft andern Inhalt — oder, hier gemessen, ein Blatt zitiert einen Satz aus einem
   andern Blatt und laesst Woerter weg, ohne die Luecke zu zeigen.

   Der gemessene Befund vor dem Bau (10:19:01 MEZ, docs/aussendung-und-ablage.md): drei von neun
   gezuegelten Zitaten treffen ihren Zeugen nicht. Zeile 1676 zitiert README.md:355 als "runs
   without bound: chat", die Zeile sagt "runs without bound by a licence: chat". Zeile 1677
   zitiert .github/release-notes.md:12 als "is metered: no day count", dort steht "is metered by
   a key: no day count". Zeile 1678 ebenso auf Deutsch ("ist begrenzt: kein Tageszaehler" gegen
   "ist begrenzt durch eine Lizenz: kein Tageszaehler"). Weggelassene Woerter mitten im Zitat
   veraendern die Aussage — und hier machen sie das Eingestaendnis einer falschen Verkaufszeile
   noch absoluter, als diese Zeile war.

   Geuegelt heisst: das Zitat folgt dem Anker innerhalb von 60 Zeichen, ohne Zellgrenze (|)
   dazwischen, und haelt mindestens drei Woerter. Ferne Zitate in derselben Zeile gehoeren dem
   Anker nicht (README.md:128: das :76-Beispiel und "show everything" stehen 300 Zeichen
   auseinander); ein Ein-Wort-Zitat ist ein Begriff, kein Satz ("encrypted", "no tests").

   Das Fenster nach Klassen, weil die Blaetter es so schreiben: ein Markdown-Zeuge muss im
   genannten Satz stehen (genannte Zeile plus 5 fuer Absatz-Fortschreibung), ein Code-Zeuge in
   dem Fall, den die genannte Zeile oeffnet (gemessener ehrlicher Abstand 27 Zeilen in
   tests/components/Dashboard.test.tsx, deshalb plus 30). Ein Zitat, das eine fruehere Fassung
   zitiert, ist kein toter Zeuge: die Marker-Woerter des Blatts ("berichtigt zu", "Jetzt:",
   "bis heute", "hiess", "frueher") weisen ein Zitat als Vorher-Zitat aus, wenn der Marker hinter
   ihm steht; ihre Zahl wird genannt statt verschwiegen. */
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { ankerInText, zitatBondungen, zitatFunde } from "../scripts/helfer/anker.mjs";

const WURZEL = path.resolve(import.meta.dirname, "..");
const BELEGBLAETTER = [
  "README.md",
  "SECURITY.md",
  "ROADMAP.md",
  ".github/release-notes.md",
  "docs/belege/REGISTER.md",
  "docs/aussendung-und-ablage.md",
];

function inKapsel<T>(bau: (ordner: string) => T): T {
  const ordner = fs.mkdtempSync(path.join(os.tmpdir(), "zitat-fenster-"));
  try {
    return bau(ordner);
  } finally {
    fs.rmSync(ordner, { recursive: true, force: true });
  }
}

/** Kapsel mit einem Markdown-Zeugen (Zeile 3) und einem Code-Zeugen (it ab Zeile 2). */
function kapselMitZeugen(bau: (ordner: string) => void) {
  return inKapsel((ordner) => {
    fs.mkdirSync(path.join(ordner, "docs"), { recursive: true });
    fs.mkdirSync(path.join(ordner, "tests"), { recursive: true });
    fs.writeFileSync(
      path.join(ordner, "docs", "zeugen.md"),
      ["# Blatt", "", "- **Ehrlich** — the panel says one thing and the guard proves it.", "", "leere Zeile", "", "und noch ein Absatz, der nichts zu melden hat.", ""].join("\n"),
    );
    fs.writeFileSync(
      path.join(ordner, "tests", "fall.test.tsx"),
      [
        'describe("d", () => {',
        '  it("der Fall", async () => {',
        "    const a = 1;",
        "",
        "    expect(a).toBe(1);",
        "    expect(screen.textContent).toMatch(/3 of 7 hits/);",
        "  });",
        "",
        '  it("der naechste Fall", async () => {',
        "    expect(2).toBe(2);",
        "  });",
        "});",
        "",
      ].join("\n"),
    );
    bau(ordner);
    return ordner;
  });
}

describe("P155, das Zitat-Fenster: der woertlich zitierte Satz muss in der genannten Zeile stehen", () => {
  it("ein ehrliches Zitat auf den genannten Markdown-Satz meldet nichts", () => {
    kapselMitZeugen((ordner) => {
      const text = 'Das Blatt sagt in `docs/zeugen.md:3` "the panel says one thing and the guard proves it".';
      expect(zitatBondungen(text).length, "die Sonde sieht die Bondung nicht").toBe(1);
      expect(zitatFunde(ordner, text), "ein ehrliches Zitat wurde gemeldet").toEqual([]);
    });
  });

  it("Backticks und Leerlauf in der Quelle traegt die Sonde ab, das Zitat bleibt echt", () => {
    kapselMitZeugen((ordner) => {
      fs.appendFileSync(path.join(ordner, "docs", "zeugen.md"), "- **Text size** — `100`, `115` or `130 %`, under *Settings*.\n");
      const text = 'In `docs/zeugen.md:8` „Text size — 100, 115 or 130 %" steht die Stufe.';
      expect(zitatBondungen(text).length, "die deutsche An fuerung wurde nicht erkannt").toBe(1);
      expect(zitatFunde(ordner, text), "Backticks in der Quelle wurden als Drift gemeldet").toEqual([]);
    });
  });

  it("ein Zitat, das Woerter aus der Quelle laesst ohne die Luecke zu zeigen, ist ein Befund", () => {
    kapselMitZeugen((ordner) => {
      const text = 'Zeile `docs/zeugen.md:3` sagt "the panel says the guard proves it" — ohne Luecke.';
      const funde = zitatFunde(ordner, text);
      expect(funde.length, `das still weggelassene "one thing and" blieb ungemeldet: ${JSON.stringify(funde)}`).toBe(1);
      expect(funde[0], funde[0]).toContain("zeugen.md:3");
    });
  });

  it("ein Zitat mit Auslassungszeichen darf Luecken haben, jede Haelfte muss treffen", () => {
    kapselMitZeugen((ordner) => {
      const sauber = 'Zeile `docs/zeugen.md:3` sagt "the panel says one thing … the guard proves it".';
      const teils = 'Zeile `docs/zeugen.md:3` sagt "the panel says one thing … the guard never proves it".';
      expect(zitatFunde(ordner, sauber), "die markierte Auslassung wurde gemeldet").toEqual([]);
      expect(zitatFunde(ordner, teils).length, "die zweite Haelfte traf nicht und blieb ungemeldet").toBe(1);
    });
  });

  it("ein Code-Zeuge gilt im Fall, den die genannte Zeile oeffnet — 4 Zeilen tief ist ehrlich", () => {
    kapselMitZeugen((ordner) => {
      const text = 'Der Fall `tests/fall.test.tsx:2` liest "3 of 7 hits" ab und behauptet sie.';
      expect(zitatBondungen(text).length).toBe(1);
      expect(zitatFunde(ordner, text), "der Beleg im selben Fall (Zeile 7) wurde als Drift gemeldet").toEqual([]);
    });
  });

  it("jenseits des Falls ist auch der Code-Zeuge ein Befund", () => {
    kapselMitZeugen((ordner) => {
      const fuell = ['describe("weit", () => {', '  it("der erste Fall", async () => {'];
      for (let i = 0; i < 40; i += 1) fuell.push(`  // Fuelle ${i}`);
      fuell.push("    expect(screen.textContent).toMatch(/3 of 7 hits/);", "  });", "});", "");
      fs.writeFileSync(path.join(ordner, "tests", "weit.test.tsx"), fuell.join("\n"));
      const funde = zitatFunde(ordner, 'Der Fall `tests/weit.test.tsx:2` liest "3 of 7 hits" ab.');
      expect(funde.length, `ein Anker auf den Fall-Anfang, der Beleg 40 Zeilen spaeter: ${JSON.stringify(funde)}`).toBe(1);
    });
  });

  it("ferne Zitate in derselben Zeile gehoeren dem Anker nicht, und ein Einzelwort ist kein Satz", () => {
    kapselMitZeugen((ordner) => {
      const fern = 'Zeuge `docs/zeugen.md:3` nennt den Halt, und hundertfuenfzig Zeichen spaeter, nachdem noch etliche Woerter ueber die Bindung gelaufen sind, steht erst "the panel says one thing and the guard proves it" in diesem Satz hier.';
      const wort = 'Zeuge `docs/zeugen.md:3` nennt dafuer nur " Ehrlich " und sonst nichts.';
      expect(zitatBondungen(fern).length, "ein 200-Zeichen-fernes Zitat wurde gezuegelt").toBe(0);
      expect(zitatBondungen(wort).length, "ein Einzelwort wurde als Satz gezaehlt").toBe(0);
      expect(zitatFunde(ordner, fern + wort)).toEqual([]);
    });
  });

  it("eine Tabellenzelle und ihr Anker sind zwei Welten: ueber die Zellgrenze wird nicht gezuegelt", () => {
    kapselMitZeugen((ordner) => {
      const text = '| `docs/zeugen.md:99` | „the panel says one thing and the guard proves it" |\n';
      expect(zitatBondungen(text).length, "die Zellgrenze wurde uebersehen").toBe(0);
      expect(zitatFunde(ordner, text)).toEqual([]);
    });
  });

  it("ein Vorher-Zitat in der Anklage-Ueberschrift wird nicht gefordert, aber gezaehlt", () => {
    kapselMitZeugen((ordner) => {
      const text = '### `docs/zeugen.md:3` — „the panel said another thing entirely"\n';
      const funde = zitatFunde(ordner, text);
      expect(funde, `ein Ueberschriften-Zitat wurde gemeldet: ${JSON.stringify(funde)}`).toEqual([]);
      const bondungen = zitatBondungen(text);
      expect(bondungen.length, "die Ueberschriften-Bondung fehlte").toBe(1);
      expect(bondungen[0].historisch, "der Ueberschriften-Zweig wurde nicht ausgewiesen").toBe(true);
    });
  });

  it("ein Zitat aus dem Lauf-Protokoll (Uhrzeit davor) ist kein Satz aus der Datei", () => {
    kapselMitZeugen((ordner) => {
      const text = 'Pin `docs/zeugen.md:3` erst rot (03:36:11: "the panel said another thing entirely"), dann gruen.\n';
      expect(zitatFunde(ordner, text), "ein Protokoll-Zitat wurde als Drift gemeldet").toEqual([]);
      expect(zitatBondungen(text)[0].historisch, "der Protokoll-Zweig wurde nicht ausgewiesen").toBe(true);
    });
  });

  it("ein Blob-Zitat trifft die genannte Zeile von Damals — und faellt, wenn es sie nicht trifft", () => {
    inKapsel((ordner) => {
      fs.mkdirSync(path.join(ordner, "docs"), { recursive: true });
      fs.writeFileSync(path.join(ordner, "docs", "alt.md"), "- Der Satz hiess: every tool runs without bound — chat, clipper.\n");
      execFileSync("git", ["-C", ordner, "init", "-q"], { stdio: "ignore" });
      execFileSync("git", ["-C", ordner, "add", "docs/alt.md"], { stdio: "ignore" });
      execFileSync("git", ["-C", ordner, "-c", "user.email=a@b", "-c", "user.name=k", "commit", "-qm", "alt"], { stdio: "ignore" });
      const kurz = execFileSync("git", ["-C", ordner, "rev-parse", "--short", "HEAD"], { encoding: "utf8" }).trim();
      fs.writeFileSync(path.join(ordner, "docs", "alt.md"), "- Der Satz lautet heute: every tool runs under a licence — chat, clipper.\n");
      execFileSync("git", ["-C", ordner, "add", "docs/alt.md"], { stdio: "ignore" });
      execFileSync("git", ["-C", ordner, "-c", "user.email=a@b", "-c", "user.name=k", "commit", "-qm", "neu"], { stdio: "ignore" });

      const ehrlich = zitatFunde(ordner, `Zeile \`${kurz}:docs/alt.md:1\` sagte "every tool runs without bound" — heute anders.`);
      expect(ehrlich, `ein Blob-Zitat, das die Damals-Zeile trifft, wurde gemeldet: ${JSON.stringify(ehrlich)}`).toEqual([]);

      const unehrlich = zitatFunde(ordner, `Zeile \`docs/alt.md:1\` sagte "every tool runs without bound" — heute anders.`);
      expect(unehrlich.length, "das gleiche Zitat am heutigen Stand meldete nichts — esprangt ueber die Damals-Fassung").toBe(1);
    });
  });

  it("ein Anker im Zitatleib ist nicht sein eigener Zeuge", () => {
    kapselMitZeugen((_ordner) => {
      const text = 'Zeile `docs/zeugen.md:3` sagt "the panel says one thing, drawn in `docs/zeugen.md:99`"; die 99 nennt sie nur im Zitat.';
      const bondungen = zitatBondungen(text);
      expect(bondungen.length, "der Anker im Zitatleib wurde als Bondung gelesen").toBe(1);
      expect(bondungen[0].zeile, `die Bondung erbte den inneren Anker: ${bondungen[0].zeile}`).toBe(3);
    });
  });

  it("am echten Stand: die sechs Blaetter zitieren ihre Zeugen, und kein Zitat zeigt daneben", () => {
    const funde: string[] = [];
    let bondungen = 0;
    let historisch = 0;
    let geprueft = 0;
    for (const blaett of BELEGBLAETTER) {
      const text = fs.readFileSync(path.join(WURZEL, blaett), "utf8");
      for (const b of zitatBondungen(text)) {
        bondungen += 1;
        if (b.historisch) historisch += 1;
        else geprueft += 1;
        if (ankerInText(`x ${b.nennung}:${b.zeile}`).length !== 1) throw new Error(`Bondung verliert ihren Anker: ${b.nennung}`);
      }
      for (const f of zitatFunde(WURZEL, text)) funde.push(`${blaett}: ${f}`);
    }
    expect(bondungen, "das Zitat-Fenster sieht in den sechs Blaettern keine einzige Bondung").toBeGreaterThanOrEqual(8);
    // Die Ausnahmen duerfen die Wache nicht leer fressen: mindestens fuenf Bondungen stehen in Pruefung.
    expect(geprueft, `nur ${geprueft} von ${bondungen} Bondungen geprueft (${historisch} historisch) — die Ausnahme frisst die Wache`).toBeGreaterThanOrEqual(5);
    expect(funde, `Zitate, die nicht ihre genannte Zeile treffen:\n` + funde.map((f) => `  ${f}`).join("\n")).toEqual([]);
  });
});
