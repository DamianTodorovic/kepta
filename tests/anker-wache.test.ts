/* P154 — die Anker-Wache: ein `Datei:Zeile`-Zeuge muss zeigen, was er sagt.

   Drei Nächte lang war der häufigste eigne Fehler das Setzen von Ankern aus dem Kopf:
   P151 schrieb `tests/belege-siegel.test.ts:158` (gemessen :137 und :165), P152 setzte
   `tests/aussendungs-riss.test.ts:131` (gemessen :132), P153 heilte einen Anker und verschob
   damit einen andern (`messregel.mjs:15` zeigte auf :143, der describe sitzt auf :158). Und die
   Wache fand am ersten Lauf zwei tote Zeiger in der Aussendung: README.md:145 nennt
   `graph-fit-390-keine-verlust.test.ts:73`, die Datei heißt `.test.tsx`, und README.md:261 nannte
   `src/core/store.ts:1201` für das SQLCipher-Pragma — gemessen eine Leerzeile.

   Geprüft wird jede Anker-Nennung in den sechs Aussendungs-Blättern, in drei Formen:
   `pfad:Zeile`, die Kurzform `:Zeile` am nächsten Vorbild derselben Zeile, und der Blob-Anker
   `Commit:pfad:Zeile` für Aussagen über eine frühere Fassung. Jeder muss eine Datei treffen,
   eine Zeile innerhalb ihrer Länge nennen und dort Inhalt finden — keine Leerzeile, kein nackter
   Schluss-Strich. Bei einem Bereich gilt der Anfang; das Ende darf den Block schließen.
   Bewusste Zeiger auf eine Mock- oder Deklarationszeile sind erlaubt: verlangt wird Inhalt,
   nicht ein Fallanfang.

   Zwei blinde Stellen nennt die Wache beim Namen, statt sie zu verschweigen: eine Kurzform ohne
   auflösbares Vorbild in derselben Zeile (gezählt, gedeckelt) und ein Pfad, der aus diesem Baum
   herauszeigt (absolut, `~`, `../`) — für ihn ist hier kein Zeuge zu holen. */
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { ankerFunde, ankerInText, kurzformVerwaisungen } from "../scripts/helfer/anker.mjs";

const WURZEL = path.resolve(import.meta.dirname, "..");
// Die Blaetter, deren Zeugen ein Kunde oeffnen koennen muss. `docs/graph-kosten.md` ist bewusst
// nicht dabei: es zitiert den eingefrorenen Export ausserhalb dieses Baums
// (`../Desktop/ki gehirn/NOTFALL-SICHERUNG-22-9/…`, Zeile 236) — diese Anker sind von hier nicht
// pruefbar, und sie in die Wache zu nehmen, fuellte sie mit Rauschen statt mit Befunden.
const BELEGBLAETTER = [
  "README.md",
  "SECURITY.md",
  "ROADMAP.md",
  ".github/release-notes.md",
  "docs/belege/REGISTER.md",
  "docs/aussendung-und-ablage.md",
];

/** Eine Kapsel mit eigner Baumstruktur, damit die Bisse nie den echten Repo anfassen. */
function inKapsel<T>(bau: (ordner: string) => T): T {
  const ordner = fs.mkdtempSync(path.join(os.tmpdir(), "anker-wache-"));
  try {
    return bau(ordner);
  } finally {
    fs.rmSync(ordner, { recursive: true, force: true });
  }
}

/** Eine Kapsel mit echtem git-Baum, damit der Blob-Anker eine echte Historie hinter sich hat. */
function inGitKapsel<T>(bau: (ordner: string, rev: string) => T): T {
  return inKapsel((ordner) => {
    const git = (...args: string[]) => execFileSync("git", ["-C", ordner, ...args], { stdio: ["ignore", "pipe", "pipe"] });
    git("init", "-q");
    git("-c", "user.email=wache@kepta.lokal", "-c", "user.name=Anker-Wache", "commit", "-q", "--allow-empty", "-m", "Keim");
    fs.mkdirSync(path.join(ordner, "tests"), { recursive: true });
    fs.writeFileSync(
      path.join(ordner, "tests", "alt.test.ts"),
      ['describe("damals", () => {', '  it("ein Fall", () => {', "    expect(1).toBe(1);", "", "  });", "});", ""].join("\n"),
    );
    git("add", "tests/alt.test.ts");
    git("-c", "user.email=wache@kepta.lokal", "-c", "user.name=Anker-Wache", "commit", "-q", "-m", "der alte Stand");
    const rev = git("rev-parse", "HEAD").toString().trim();
    // derselbe Name im Arbeitsbaum, aber zwei Zeilen kuerzer: der Blob-Anker darf nicht ihn meinen
    fs.writeFileSync(path.join(ordner, "tests", "alt.test.ts"), 'it("heute", () => {});\n');
    return bau(ordner, rev);
  });
}

describe("P154, der Anker: jede Zeilen-Nennung muss ins Inhaltliche zeigen", () => {
  it("ein ehrlicher Anker und seine Kurzform melden nichts", () => {
    inKapsel((ordner) => {
      fs.mkdirSync(path.join(ordner, "tests"), { recursive: true });
      fs.writeFileSync(
        path.join(ordner, "tests", "a.test.ts"),
        ['describe("drinnen", () => {', '  it("ein Fall", () => {', "    expect(1).toBe(1);", "  });", "});", ""].join("\n"),
      );
      const text = "Der Fall sitzt in `tests/a.test.ts:2` und die Behauptung auf `:3`.";
      expect(ankerInText(text).length, "die Sonde sieht die beiden Anker nicht").toBe(2);
      expect(ankerFunde(ordner, text), "ein ehrlicher Anker wurde gemeldet").toEqual([]);
    });
  });

  it("eine genannte Datei, die nicht da ist, ist ein Befund", () => {
    inKapsel((ordner) => {
      const text = "Zeuge in `tests/es-gibt-sie-nicht.test.ts:7`.";
      const funde = ankerFunde(ordner, text);
      expect(funde.length).toBe(1);
      expect(funde[0], `der Befund nennt nicht die fehlende Datei: ${funde[0]}`).toContain("kennt die Datei nicht");
    });
  });

  it("eine Zeile jenseits der Dateilaenge ist ein Befund, mit der wahren Laenge", () => {
    inKapsel((ordner) => {
      fs.mkdirSync(path.join(ordner, "tests"), { recursive: true });
      fs.writeFileSync(path.join(ordner, "tests", "kurz.test.ts"), 'it("einzige", () => {});\n');
      const funde = ankerFunde(ordner, "Zeuge in `tests/kurz.test.ts:41`.");
      expect(funde.length).toBe(1);
      expect(funde[0], `der Befund nennt nicht die Laenge: ${funde[0]}`).toContain("hat 1");
    });
  });

  it("ein Anker auf eine Leerzeile oder einen nackten Schluss-Strich ist ein Befund", () => {
    inKapsel((ordner) => {
      fs.mkdirSync(path.join(ordner, "tests"), { recursive: true });
      fs.writeFileSync(
        path.join(ordner, "tests", "verrutscht.test.ts"),
        ["describe(\"d\", () => {", "  it(\"Fall\", () => {", "    expect(1).toBe(1);", "", "  });", "});", ""].join("\n"),
      );
      const funde = ankerFunde(ordner, "Zeuge in `tests/verrutscht.test.ts:4` und `:5`.");
      expect(funde.length, `beide Drift-Formen sollten melden: ${JSON.stringify(funde)}`).toBe(2);
      expect(funde[0], funde[0]).toContain("leer");
      expect(funde[1], funde[1]).toContain("Schluss");
    });
  });

  it("die Kurzform erbt den Pfad ihrer Zeile und wird damit selbst geprueft", () => {
    inKapsel((ordner) => {
      fs.mkdirSync(path.join(ordner, "tests"), { recursive: true });
      fs.writeFileSync(path.join(ordner, "tests", "erbe.test.ts"), ['it("Fall", () => {', "", "  expect(1).toBe(1);", "});", ""].join("\n"));
      const funde = ankerFunde(ordner, "Der Fall in `tests/erbe.test.ts:1` und die Zeile darauf `:2`.");
      expect(funde.length, `die Kurzform entschaerpft: ${JSON.stringify(funde)}`).toBe(1);
      expect(funde[0], funde[0]).toContain("erbe.test.ts:2");
      expect(kurzformVerwaisungen("Der Fall in `tests/erbe.test.ts:1` und `:2`."), "eine Kurzform mit Vorbild gilt nicht als verwaist").toBe(0);
      expect(kurzformVerwaisungen("| `tests/erbe.test.ts:1` | Fall `:2` |"), "eine Kurzform hinter einer Zellgrenze ist verwaist").toBe(1);
    });
  });

  it("ein Bereich darf auf dem Schluss-Strich enden, aber nicht auf einer Leerzeile beginnen", () => {
    inKapsel((ordner) => {
      fs.mkdirSync(path.join(ordner, "tests"), { recursive: true });
      fs.writeFileSync(
        path.join(ordner, "tests", "bereich.test.ts"),
        ["", 'it("Fall", () => {', "  expect(1).toBe(1);", "});", ""].join("\n"),
      );
      expect(ankerFunde(ordner, "Die Wache `tests/bereich.test.ts:2-4` haelt die Zeilen."), "ein Bereich bis zum Schluss-Strich wurde gemeldet").toEqual([]);
      const funde = ankerFunde(ordner, "Die Wache `tests/bereich.test.ts:1-4` haelt die Zeilen.");
      expect(funde.length, `ein Bereich, der leer anfaengt, sollte melden: ${JSON.stringify(funde)}`).toBe(1);
      expect(funde[0], funde[0]).toContain("leere Zeile");
    });
  });

  it("ein Blob-Anker wird gegen die Historie geprueft, nicht gegen den Arbeitsbaum", () => {
    inGitKapsel((ordner, rev) => {
      const kurz = rev.slice(0, 7);
      const nen = (t: string) => "`" + t + "`";

      const ehrlich = `Damals ${nen(`${kurz}:tests/alt.test.ts:3`)} und ${nen(":1")}.`;
      expect(ankerInText(ehrlich).length, "die Sonde sieht den Blob-Anker und seine Kurzform nicht").toBe(2);
      expect(ankerFunde(ordner, ehrlich), "ein ehrlicher Blob-Anker wurde gemeldet").toEqual([]);

      // derselbe Name im Arbeitsbaum ist seitdem zwei Zeilen kuerzer: der Blob-Anker meint ihn nicht
      expect(ankerFunde(ordner, `Heute ${nen("tests/alt.test.ts:3")}.`).length, "der Baum-Anker sieht die gekuerzte Datei nicht").toBe(1);

      expect(ankerFunde(ordner, `Damals ${nen(`${kurz}:tests/alt.test.ts:9`)}.`).length, "ein Blob-Anker jenseits der Blob-Laenge meldet nicht").toBe(1);

      const fremd = ankerFunde(ordner, `Damals ${nen("deadbeef:tests/alt.test.ts:3")}.`);
      expect(fremd.length, "ein Blob aus einer Kennung, die dieser Baum nicht hat, meldet nicht").toBe(1);
      expect(fremd[0], fremd[0]).toContain("diesen Blob gibt es in diesem Baum nicht");

      expect(ankerFunde(ordner, `Damals ${nen(`${kurz}:tests/alt.test.ts:4`)} — gemessen eine Leerzeile.`).length, "ein Blob-Anker auf einer Leerzeile meldet nicht").toBe(1);
    });
  });

  it("ein Pfad ausserhalb dieses Baums wird nicht gefordert, weil die Wache ihn nicht kennt", () => {
    inKapsel((ordner) => {
      const text =
        "Beleg aus einer andern Mappe: `/Users/example/notation/NOTFALL.md:12`, `~/kepta-core/README.md:83` und `../andere/src/index.ts:4`.";
      expect(ankerInText(text).length, "die Sonde sieht die drei fremden Anker nicht").toBe(3);
      expect(ankerFunde(ordner, text), "ein fremder Pfad wurde gemeldet, obwohl er hier pruefbar ist").toEqual([]);
    });
  });

  it("am echten Stand: kein Anker der sechs Aussendungs-Blaetter zeigt ins Leere", () => {
    const funde: string[] = [];
    const gepraeft: string[] = [];
    const waisungen = new Map<string, [number, number]>();
    for (const blaett of BELEGBLAETTER) {
      const text = fs.readFileSync(path.join(WURZEL, blaett), "utf8");
      waisungen.set(blaett, [ankerInText(text).length, kurzformVerwaisungen(text)]);
      for (const f of ankerFunde(WURZEL, text)) funde.push(`${blaett} ${f}`);
    }
    const summe = (stelle: 0 | 1) => [...waisungen.values()].reduce((a, k) => a + k[stelle], 0);
    expect(ankerInText(fs.readFileSync(path.join(WURZEL, "README.md"), "utf8")).length, "README nennt keine Anker?").toBeGreaterThan(20);
    expect(funde, `tote Anker in der Aussendung (${[...waisungen].map(([b, [n, w]]) => `${b}=${n}Anker/${w}Kurz`).join(", ")}):\n` + funde.map((f) => "  " + f).join("\n")).toEqual([]);

    // Die blinde Stelle hat zwei Halter, weil die beiden Papierarten verschieden wachsen.
    // (a) Die fuenf Aussendungs-Blaetter: gemessen 29 verwaiste Kurzformen (README 13, SECURITY 5,
    //     ROADMAP 1, release-notes 0, REGISTER 10) am 07.11. 10:44:43 MEZ, von demselben Fall
    //     gezaehlt, der die Befunde sucht. Das ist eine Decke: wer Texte expliziter macht, senkt
    //     sie; wer beilaeufige Kurzformen mehrt, hebt sie nicht — der Fall geht rot.
    const aussen = ["README.md", "SECURITY.md", "ROADMAP.md", ".github/release-notes.md", "docs/belege/REGISTER.md"];
    const waisungenAussen = aussen.reduce((a, b) => a + (waisungen.get(b)?.[1] ?? 0), 0);
    expect(waisungenAussen, `${waisungenAussen} verwaiste Kurzformen in den fuenf Aussendungs-Blaettern — die Decke ist 29`).toBeLessThanOrEqual(29);

    // (b) Das eigne Arbeitsblatt: es waechst jeden Schlag, eine Zahl als Decke waere dort
    //     Buchfuehrung statt Latte. Gehalten wird der Anteil — gemessen 129 von 296 Ankern
    //     (43,6 %) am selben Augenblick; die Latte 0,44 faellt erst, wenn der Text schludriger
    //     wird, nicht wenn er laenger wird.
    const [ankerLedger, waisungenLedger] = waisungen.get("docs/aussendung-und-ablage.md") ?? [0, 0];
    expect(waisungenLedger / ankerLedger, `${waisungenLedger} von ${ankerLedger} Ankern im Arbeitsblatt sind Kurzformen ohne Vorbild — Anteil ueber 0,44`).toBeLessThanOrEqual(0.44);
    expect(summe(1), `${summe(1)} verwaiste Kurzformen ueber alle sechs Blaetter — gemessen 158, und der Wert nennt seine zwei Halter`).toBeLessThanOrEqual(158);
  });
});
