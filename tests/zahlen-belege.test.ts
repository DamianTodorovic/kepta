import { describe, it, expect, afterEach, vi } from "vitest";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  normalisiereZahl,
  zahlAusMaschine,
  zweiteLesart,
  findeBehauptungen,
  werteAusArtefakt,
  imArtefakt,
  loeseZitat,
  suchBasis,
  pruefeDoku,
  liesAusnahmen,
  hauptfunktion,
  mdDateien,
  AUFPFLICHTUNGEN,
  UMLEITUNGEN,
} from "../scripts/zahlen-belege.mjs";

// Diese Suite haelt die Prosa-Zahlenwache: sie beweist, dass die Wache die vier
// Fundstellen des 12.10. sieht (Fixture `schlecht`), einen geheilten Stand in Ruhe
// durchlaesst (Fixture `gut`), und dass ihre Ausnahmen — Soll-Werte, Umleitungen,
// Papierbelege — sich nicht als Freifahrt anfühlen, sondern selbst Belege verlangen.
//
// Die Fixtures stehen unter tests/fixtures/zahlen-belege/ und enthalten Kopien der
// echten Mess-Logs (byte-identisch ueber pruefe nach `md5`). Damit laeuft die Wache
// auch auf einem Runner, der die Arbeitsmappe nicht kennt. GFs Papiere (CHANGELOG.md,
// README.md, README.de.md) werden hier NICHT geprueft — ihre Prosa ist eine andere
// Scheibe, und ein Test, der fremdemoving prose anfasst, macht fremde Aenderungen rot.

const FIXTUREN = path.join(process.cwd(), "tests/fixtures/zahlen-belege");
const KRATZER: string[] = [];

/** Ein eigener Scratch-Baum pro Fall — die Wache oeffnet Dateien, die muss man setzen koennen. */
function kratzer(struktur: Record<string, string>) {
  const wurzel = fs.mkdtempSync(path.join(os.tmpdir(), "zahlen-belege-"));
  KRATZER.push(wurzel);
  for (const [rel, inhalt] of Object.entries(struktur)) {
    const ziel = path.join(wurzel, rel);
    fs.mkdirSync(path.dirname(ziel), { recursive: true });
    fs.writeFileSync(ziel, inhalt, "utf8");
  }
  return wurzel;
}

function lese(datei: string) {
  return fs.readFileSync(path.join(FIXTUREN, datei), "utf8");
}

/** hauptfunktion schreibt Befunde auf die Console — fuer Exit-Vergleiche muss sie zuhoeren. */
function stumm(argv: string[]) {
  const log = console.log;
  const fehler = console.error;
  console.log = () => {};
  console.error = () => {};
  try {
    return hauptfunktion(argv);
  } finally {
    console.log = log;
    console.error = fehler;
  }
}

/** Ein Befund ist ein Satz, kein Objekt — verglichen wird Art und Wert, nicht die Reihenfolge. */
function schluessel(befunde: { art: string; zahl: string }[]) {
  return befunde.map((b) => `${b.art}|${normalisiereZahl(b.zahl)}`).sort();
}

afterEach(() => {
  for (const ort of KRATZER.splice(0)) fs.rmSync(ort, { recursive: true, force: true });
});

describe("zahlen-belege: die Zahl selbst", () => {
  it("normalisiert jede Schreibweise, die in einem Papier steht", () => {
    expect(normalisiereZahl("7 044")).toBe("7044");
    expect(normalisiereZahl("1 019")).toBe("1019");
    expect(normalisiereZahl("19 684")).toBe("19684");
    expect(normalisiereZahl("120,4")).toBe("120.4");
    expect(normalisiereZahl("6.986")).toBe("6986");
    expect(normalisiereZahl("98,6")).toBe("98.6");
    expect(normalisiereZahl("0,662")).toBe("0.662");
    // Maschinenschreibweise auch im Papier: "0.662" ist eine Zahl zwischen null und eins,
    // nicht sechshundertzweiundsechzig. Der Punkt als Tausenderzeichen gilt nur, wenn die
    // erste Gruppe nicht Null ist oder mehrere Gruppen stehen.
    expect(normalisiereZahl("0.662")).toBe("0.662");
    expect(normalisiereZahl("1.019")).toBe("1019");
    expect(normalisiereZahl("1.000.000")).toBe("1000000");
    expect(normalisiereZahl("1,019.25")).toBe("1019.25");
    expect(normalisiereZahl("85,91")).toBe("85.91");
    expect(normalisiereZahl("3 000")).toBe("3000");
    expect(normalisiereZahl("745")).toBe("745");
    // Komma ist hier das Dezimalzeichen: 1,019 ist 1.019, nicht tausendneunzehn.
    expect(normalisiereZahl("1,019")).toBe("1.019");
    expect(zweiteLesart("1,019")).toBe("1019");
    expect(zweiteLesart("745")).toBeNull();
    // Ein Artefakt groupiert nie: sein Punkt ist immer ein Dezimalzeichen.
    expect(zahlAusMaschine("0.662")).toBe("0.662");
    expect(zahlAusMaschine("6986.42")).toBe("6986.42");
    expect(zahlAusMaschine("1 019")).toBe("1019");
  });

  it("findet Zahlen mit Messgroesse und Serien, aber keine Datumssplitter", () => {
    const funde = findeBehauptungen(
      "Geometry 58 / 427 / 1 289 ms at 400 nodes, ratio **0,662 / 0,674 / 0,699**, `x/y.log` and 12/10/2026.\n"
    );
    const zahlen = funde.map((f) => f.zahl);
    expect(zahlen).toContain("58");
    expect(zahlen).toContain("1289");
    expect(zahlen).toContain("0.662");
    expect(zahlen).toContain("400");
    expect(zahlen).not.toContain("2026");
    expect(funde.every((f) => f.zeile === 1)).toBe(true);
    expect(funde.every((f) => f.zitate.join() === "x/y.log")).toBe(true);
  });

  it("kennt die Grenze: eine Zahl, die im Artefakt vorkommt, gilt — auch an anderer Stelle", () => {
    // Dokumentierte Schwaeche, nicht vergessen: 427 ist in diesem Log die Kontrollpaar-Zahl,
    // die Papierrechnung meint aber die Geometrie. Die Wache winkt das durch, weil sie
    // "steht im Beleg" prueft und nicht "steht in der richtigen Zeile". Ein falsches Glied
    // einer Serie faellt trotzdem, wenn ein zweites fehlt — so sind die vier Fundstellen gefangen.
    const ort = kratzer({
      "beleg/ruhe.log": "[ruhe] knoten=400 ms=1296 kontrollpaar=427\n",
      "CHANGELOG.md": "Geometry 58 / 427 / 1 289 ms (`beleg/ruhe.log`).\n",
    });
    const { befunde, inventar } = pruefeDoku({
      wurzel: ort,
      datei: "CHANGELOG.md",
      text: fs.readFileSync(path.join(ort, "CHANGELOG.md"), "utf8"),
      suche: [ort],
    });
    expect([...befunde.map((b) => normalisiereZahl(b.zahl))].sort()).toEqual(["1289", "58"]);
    expect(inventar.mitBeleg).toBeGreaterThan(0);
  });
});

describe("zahlen-belege: Artefakte lesen", () => {
  it("ein Beleg zweiter Hand ausser Haus deckt keinen Befund zu", () => {
    // Das Loch sass am 12.10. in der Wache selbst und liess 38 Behauptungen der
    // CHANGELOG-Zeile 15 durch: ein .md-Papier ausserhalb des Baums enthielt die Zahl,
    // also galt sie als bestaetigt — auf meinem Tisch, fuer jeden Runner unsichtbar.
    const baum = kratzer({
      "README.md": "Gemessen sind **77 %** Deckung (`audit/FIX.md`, Zeile 3).\n",
      "beleg/inland.log": "deckung=12.0%\n",
    });
    const draussen = kratzer({ "audit/FIX.md": "| 3 000 | **77 %** |\n" });
    const scharf = pruefeDoku({
      wurzel: baum,
      datei: "README.md",
      text: fs.readFileSync(path.join(baum, "README.md"), "utf8"),
      suche: [baum, draussen],
    });
    expect(scharf.befunde.map((b) => b.art), "das Papier draussen darf nicht mehr freigeben").toEqual(["beleg-nicht-im-repo"]);
    expect(scharf.inventar.zweitbeleg, "und Zaehlung zweiter Hand darf es nicht sein").toBe(0);
    // Gegenprobe: dasselbe Papier, aber im Baum — dann ist es sehr wohl ein Beleg zweiter Hand.
    fs.mkdirSync(path.join(baum, "audit"), { recursive: true });
    fs.writeFileSync(path.join(baum, "audit/FIX.md"), "| 3 000 | **77 %** |\n", "utf8");
    const imBaum = pruefeDoku({
      wurzel: baum,
      datei: "README.md",
      text: fs.readFileSync(path.join(baum, "README.md"), "utf8"),
      suche: [baum],
    });
    expect(imBaum.befunde).toEqual([]);
    expect(imBaum.inventar.zweitbeleg).toBe(1);
    // Widerspruchprobe: ein Inlands-Artefakt, das der Zahl widerspricht, meldet sie —
    // die Wache darf also weder zu still noch zu freigiebig sein.
    fs.writeFileSync(path.join(baum, "README.md"), "Gemessen sind **77 %** Deckung (`beleg/inland.log`).\n", "utf8");
    const widerspruch = pruefeDoku({
      wurzel: baum,
      datei: "README.md",
      text: fs.readFileSync(path.join(baum, "README.md"), "utf8"),
      suche: [baum],
    });
    expect(widerspruch.befunde.map((b) => b.art)).toEqual(["zahl-nicht-im-beleg"]);
  });

  it("ein leerer Nachbarpfad macht die Wohnung nicht zur Suchbasis", () => {
    // Zweites Loch, same day: KEPTA_NACHBARN="" ergab path.join(home, "") = home, und ein
    // Index ueber ~ loeste audit-Pfade dort auf — die CI-Simulation hatte einen Baum, den
    // es in der CI nicht gibt.
    const echt = process.env;
    const wohnung = kratzer({ "kepta-andere/rohdaten/y.log": "ms=41\n" });
    const baum = kratzer({ "README.md": "Der Lauf brauchte **41 ms** (`rohdaten/y.log`).\n" });
    try {
      process.env = { ...echt, HOME: wohnung, KEPTA_NACHBARN: "", KEPTA_ARBEITSMAPPE: "" };
      const basis = suchBasis(wohnung);
      expect(basis.includes(wohnung), "die leeren Felder tragen nichts bei").toBe(true);
      expect(basis.some((p) => p === path.join(wohnung, "kepta-andere")), "und die Nachbarschaft wird nicht erfunden").toBe(false);
      const ergebnis = pruefeDoku({
        wurzel: baum,
        datei: "README.md",
        text: fs.readFileSync(path.join(baum, "README.md"), "utf8"),
        suche: [baum],
      });
      expect(ergebnis.befunde.map((b) => b.art), "ohne Basis-Trick ist der Pfad einfach weg").toEqual(["pfad-existiert-nicht"]);
    } finally {
      process.env = echt;
    }
  });

  it("rundet auf die Stellenzahl des Papiers und rechnet Sekunden in Millisekunden", () => {
    const ort = kratzer({ "latenz.json": JSON.stringify({ suche: { p50: 6986.42, p95: 7155.84 }, abfragen: 300 }) });
    const artefakt = werteAusArtefakt(path.join(ort, "latenz.json"));
    expect(imArtefakt(artefakt, { zahl: "7.16", dezimalen: 2, einheit: "s" })).toBe(true);
    expect(imArtefakt(artefakt, { zahl: normalisiereZahl("6.986"), dezimalen: 0, einheit: "ms" })).toBe(true);
    expect(imArtefakt(artefakt, { zahl: "7155.8", dezimalen: 1, einheit: "ms" })).toBe(true);
    expect(imArtefakt(artefakt, { zahl: "7.17", dezimalen: 2, einheit: "s" })).toBe(false);
    expect(imArtefakt(artefakt, { zahl: "7044", dezimalen: 0, einheit: "pairs" })).toBe(false);
  });

  it("meldet ein unlesbares Artefakt, statt es zu ueberschlagen", () => {
    const ort = kratzer({ "kaputt.json": "{ \"p50\": ", "CHANGELOG.md": "Der Lauf brauchte **31 ms** (`kaputt.json`).\n" });
    const { befunde } = pruefeDoku({
      wurzel: ort,
      datei: "CHANGELOG.md",
      text: fs.readFileSync(path.join(ort, "CHANGELOG.md"), "utf8"),
      suche: [ort],
    });
    expect(befunde.map((b) => b.art)).toContain("artefakt-unlesbar");
  });

  it("haelt ein mehrdeutiges Zitat an, statt den ersten Kandidaten zu raten", () => {
    const ort = kratzer({
      "zweig-a/rohdaten/x.log": "ms=10\n",
      "zweig-b/rohdaten/x.log": "ms=20\n",
      "CHANGELOG.md": "Gemessen sind **10 ms** (`rohdaten/x.log`).\n",
    });
    const { befunde } = pruefeDoku({
      wurzel: ort,
      datei: "CHANGELOG.md",
      text: fs.readFileSync(path.join(ort, "CHANGELOG.md"), "utf8"),
      suche: [ort],
    });
    expect(befunde.map((b) => b.art)).toContain("zitat-mehrdeutig");
    expect(loeseZitat("rohdaten/x.log", [ort], new Map()).length).toBe(2);
  });

  it("findet die Fixture-Logs wieder, ohne die Arbeitsmappe zu brauchen", () => {
    const wurzel = path.join(FIXTUREN, "schlecht");
    expect(loeseZitat("beleg/vorher-gleich-12-10.log.txt", [wurzel], new Map())).toHaveLength(1);
    const vorher = werteAusArtefakt(path.join(wurzel, "beleg/vorher-gleich-12-10.log.txt"));
    // Die geheilten Zahlen — dieselben, die GFs Papiere jetzt nennen — stehen in der Kopie.
    for (const zahl of ["7134", "5236", "745", "818", "98.6"]) {
      expect(vorher.werte.has(zahl), `vorher-gleich-12-10.log fuehrt ${zahl}`).toBe(true);
    }
    const welt = werteAusArtefakt(path.join(wurzel, "beleg/welt-stufe.log.txt"));
    for (const zahl of ["2051", "4312", "1213"]) expect(welt.werte.has(zahl), `welt-stufe.log fuehrt ${zahl}`).toBe(true);
    const ruhe = werteAusArtefakt(path.join(wurzel, "beleg/ruhe-mit-anteil-1444.log.txt"));
    for (const zahl of ["57", "424", "1296", "0.662", "0.368"]) expect(ruhe.werte.has(zahl), `ruhe.log fuehrt ${zahl}`).toBe(true);
    // Und was die Wache *nicht* als Doku liest: die eigene Fixture fuehrt ihr absichtlich
    // Fehler vor (seit 31a5ac0 committet) — als Live-Papier waere sie elf permanente Befunde.
    const dateien = mdDateien(process.cwd());
    expect(dateien.some((d) => d.includes("fixtures"))).toBe(false);
    expect(dateien).toEqual(expect.arrayContaining(["README.md", "README.de.md", "CHANGELOG.md"]));

    // Und was ein frisches Auspacken sieht: ein Artefakt, das nur auf der Platte liegt,
    // ist fuer jeden anderen ein toter Link. Beweis in beide Richtungen — ein eigens
    // angelegter Scratch-Repo (unsere drei Repos bleiben, wie sie sind; kein git am Baum).
    const repo = kratzer({
      "README.md": "Der Lauf brauchte **44 ms** (`beleg/x.log.txt`).\n",
      "beleg/x.log.txt": "ms=44\n",
    });
    const git = (...args: string[]) => execFileSync("git", args, { cwd: repo, encoding: "utf8" });
    git("init", "-q");
    git("add", "README.md");
    git("-c", "user.email=wache@lokal", "-c", "user.name=Wache", "commit", "-q", "-m", "nur das Papier");
    const ohneCommit = pruefeDoku({ wurzel: repo, datei: "README.md", text: fs.readFileSync(path.join(repo, "README.md"), "utf8"), suche: [repo] });
    expect(ohneCommit.befunde.map((b) => b.art), "ein ungetrackter Beleg ist ein Befund").toEqual(["beleg-nicht-getrackt"]);
    git("add", "beleg/x.log.txt");
    git("-c", "user.email=wache@lokal", "-c", "user.name=Wache", "commit", "-q", "-m", "Beleg dazu");
    const mitCommit = pruefeDoku({ wurzel: repo, datei: "README.md", text: fs.readFileSync(path.join(repo, "README.md"), "utf8"), suche: [repo] });
    expect(mitCommit.befunde, "derselbe Satz ist gruen, sobald der Beleg im Commit ist").toEqual([]);
  });
});

describe("zahlen-belege: die vier Fundstellen", () => {
  const schlecht = () => {
    const wurzel = path.join(FIXTUREN, "schlecht");
    return pruefeDoku({
      wurzel,
      datei: "CHANGELOG.md",
      text: lese("schlecht/CHANGELOG.md"),
      suche: [wurzel],
      pflicht: true,
    });
  };

  it("sieht jede der vier Fundstellen — und sagt, was die Datei wirklich hat", () => {
    const { befunde } = schlecht();
    expect(schluessel(befunde)).toEqual([
      "pfad-existiert-nicht|15",
      "pflicht-ohne-zitat|1234",
      "pflicht-ohne-zitat|13.4",
      "pflicht-ohne-zitat|42",
      "zahl-nicht-im-beleg|1019",
      "zahl-nicht-im-beleg|11",
      "zahl-nicht-im-beleg|1289",
      "zahl-nicht-im-beleg|22",
      "zahl-nicht-im-beleg|33",
      "zahl-nicht-im-beleg|58",
      "zahl-nicht-im-beleg|614",
      "zahl-nicht-im-beleg|7044",
      "zahl-nicht-im-beleg|7325",
      "zahl-nicht-im-beleg|743",
    ]);
    const paare = befunde.find((b) => normalisiereZahl(b.zahl) === "7044");
    expect(paare?.sageDieDatei).toContain("7134");
    expect(paare?.zitat).toContain("vorher-gleich-12-10.log");
    const zeit = befunde.find((b) => normalisiereZahl(b.zahl) === "1289");
    expect(zeit?.sageDieDatei).toContain("1296");
  });

  it("sind alle Glieder einer Serie falsch, sind alle rot — eines genuegt schon", () => {
    const zeile = 16;
    const { befunde } = schlecht();
    expect(befunde.filter((b) => b.zeile === zeile).map((b) => normalisiereZahl(b.zahl)).sort()).toEqual(["11", "22", "33"]);
    // Gegenprobe an derselben Art Zahl: in Fixture-Zeile 11 stehen zwei richtige Glieder
    // neben 7 044, und die Wache meldet nur das falsche — ein fehlendes Glied reicht.
    expect(befunde.filter((b) => b.zeile === 11).map((b) => normalisiereZahl(b.zahl)).sort()).toEqual(["614", "7044", "743"]);
  });

  it("blaekt die Zahl, die in derselben Datei eine andere Zeile meint — bekannte Grenze", () => {
    // Fixture-Zeile 17 behauptet "427 pairs at rest" und zitiert welt-stufe.log, wo 427 die
    // KNOTENZAHL der ersten Zeile ist, keine Paarzahl. Die Wache winkt durch (Global-Vorkommen),
    // und dieser Fall haelt das als Bewusstheit fest, nicht als Fehlerverheimlung.
    const { befunde, inventar } = schlecht();
    expect(befunde.filter((b) => b.zeile === 17)).toEqual([]);
    expect(inventar.mitBeleg).toBeGreaterThan(0);
    // Die gleiche Zahl, an der richtigen Stelle, wird dagegen gesehen: 58/427/1 289 ms —
    // 427 geht durch, 58 und 1 289 sind rot.
    expect(befunde.filter((b) => b.zeile === 13).map((b) => normalisiereZahl(b.zahl)).sort()).toEqual(["1289", "58"]);
  });

  it("laesst den geheilten Stand durch — gruen ist keine Gleichgueltigkeit", () => {
    const wurzel = path.join(FIXTUREN, "gut");
    const { befunde, inventar } = pruefeDoku({
      wurzel,
      datei: "CHANGELOG.md",
      text: lese("gut/CHANGELOG.md"),
      suche: [wurzel],
      pflicht: true,
    });
    expect(befunde).toEqual([]);
    // Dieselbe Wache, dieselben Saetze: 61 Zahlen bestaetigt, eine ist ein Soll, und die
    // Serie mit allen drei richtigen Gliedern geht natuerlich auch durch.
    expect(inventar.mitBeleg).toBe(61);
    expect(inventar.behauptungen).toBe(62);
    expect(inventar.sollwert).toBe(1);
    expect(hauptfunktion([`--wurzel=${wurzel}`, "--datei=CHANGELOG.md"])).toBe(0);
  });

  it("meldet die Pflicht ohne Zitat von sich aus — die Erfassung ist die Ausnahme", () => {
    const wurzel = path.join(FIXTUREN, "schlecht");
    const text = lese("schlecht/CHANGELOG.md");
    const defaultFall = pruefeDoku({ wurzel, datei: "CHANGELOG.md", text, suche: [wurzel] });
    expect(defaultFall.befunde.filter((b) => b.art === "pflicht-ohne-zitat").map((b) => normalisiereZahl(b.zahl)).sort()).toEqual(["1234", "13.4", "42"]);
    expect(defaultFall.befunde).toHaveLength(14);
    expect(defaultFall.inventar.pflichtOhneZitat).toBe(3);

    const milde = pruefeDoku({ wurzel, datei: "CHANGELOG.md", text, suche: [wurzel], pflicht: false });
    expect(milde.befunde.map((b) => b.art)).not.toContain("pflicht-ohne-zitat");
    expect(milde.befunde).toHaveLength(11);
    // Gezaehlt bleibt es trotzdem — die Erfassung verliert nichts, sie urteilt nur nicht.
    expect(milde.inventar.pflichtOhneZitat).toBe(3);

    // CLI-Modi. Die Fixture hat neben den Pflicht-Zahlen auch echte Fehler, deshalb bleibt
    // sie rot, auch ohne Pflicht — der scharfe Beweis ist die Scratch-Datei darunter.
    expect(stumm([`--wurzel=${wurzel}`, "--datei=CHANGELOG.md"])).toBe(1);
    expect(stumm([`--wurzel=${wurzel}`, "--datei=CHANGELOG.md", "--ohne-pflicht"])).toBe(1);
    expect(stumm([`--wurzel=${wurzel}`, "--datei=CHANGELOG.md", "--inventar"])).toBe(0);

    const nurPflicht = kratzer({ "README.md": "Der Lauf brauchte **42 ms** fuer 7 Treffer.\n" });
    expect(stumm([`--wurzel=${nurPflicht}`, "--datei=README.md"])).toBe(1);
    expect(stumm([`--wurzel=${nurPflicht}`, "--datei=README.md", "--ohne-pflicht"])).toBe(0);

    // Die Pflichtliste selbst, dateischarf: beide READMEs drauf, mit Grund, ohne wildcard.
    expect(AUFPFLICHTUNGEN.map((a) => a.datei)).toEqual(["CHANGELOG.md", "README.md", "README.de.md"]);
    for (const eintrag of AUFPFLICHTUNGEN) {
      expect(eintrag.grund.length, `${eintrag.datei} nennt keinen Grund`).toBeGreaterThan(20);
      expect(eintrag.datei).not.toMatch(/[*?]/);
    }
    expect(AUFPFLICHTUNGEN.find((a) => a.datei === "README.md")?.grund).toContain("Flaeche");
  });

  it("ein Querverweis auf ein anderes Papier ist kein Messbeleg", () => {
    // CHANGELOG.md:25 der Kern-Doku: "The same sentence stands in
    // kepta-app/docs/graph-kosten.md" — ein Verweis, nicht die Quelle der 13,4 ms. Haelt
    // die Wache dafuer, werden sechs Querverweise zu sechs "Zahl trifft ihr Zitat nicht"
    // (von der Leitung an mir gefunden, 12.10. 19:5x). Hier: Inventar, kein Befund.
    const { befunde } = schlecht();
    const verweis = befunde.find((b) => normalisiereZahl(b.zahl) === "13.4");
    expect(verweis?.art).toBe("pflicht-ohne-zitat");
  });

  it("ein Datum ist eine Serie mit Jahreszahl, nicht jede Dreiergruppe", () => {
    const funde = findeBehauptungen("Lauf 12/10/2026 mit 11 / 22 / 33 pairs und 7 / 13 / 2025.\n");
    const zahlen = funde.map((f) => f.zahl);
    expect(zahlen).not.toContain("2026");
    expect(zahlen).toContain("11");
    expect(zahlen).toContain("22");
    expect(zahlen).toContain("33");
    // 2025 im letzten Glied ist eine Jahreszahl: die Gruppe bleibt ein Datum.
    expect(zahlen).not.toContain("2025");
  });

  it("verliert keine Behauptung: jede Zahl landet in genau einem Korb", () => {
    const zahlKorb = (wurzel: string, datei: string, text: string) => {
      const ergebnis = pruefeDoku({ wurzel, datei, text, suche: [wurzel], pflicht: true });
      const { behauptungen, mitBeleg, ohneZitat, sollwert, umgeleitet, zweitbeleg } = ergebnis.inventar;
      // Befunde zaehlen doppelt, wenn eine Zahl zwei Quellen nicht trifft — Koerbe sind
      // Zahlen, keine Befunde. Deshalb die eindeutigen (Zeile, Wert)-Paare.
      const rot = new Set(ergebnis.befunde.filter((b) => b.art !== "pflicht-ohne-zitat").map((b) => `${b.zeile}:${normalisiereZahl(b.zahl)}`)).size;
      return { behauptungen, mitBeleg, ohneZitat, sollwert, umgeleitet, zweitbeleg, rot, befunde: ergebnis.befunde };
    };
    const funde = zahlKorb(path.join(FIXTUREN, "schlecht"), "CHANGELOG.md", lese("schlecht/CHANGELOG.md"));
    expect(funde.behauptungen).toBe(funde.mitBeleg + funde.ohneZitat + funde.sollwert + funde.umgeleitet + funde.zweitbeleg + funde.rot);
    expect(funde.behauptungen).toBe(63);
    expect(funde.rot).toBe(11);
    expect(funde.ohneZitat).toBe(3);
    expect(funde.sollwert).toBe(1);
    const heiler = zahlKorb(path.join(FIXTUREN, "gut"), "CHANGELOG.md", lese("gut/CHANGELOG.md"));
    expect(heiler.rot).toBe(0);
    expect(heiler.behauptungen).toBe(heiler.mitBeleg + heiler.ohneZitat + heiler.sollwert);
    expect(heiler.behauptungen).toBe(62);
  });
});

describe("zahlen-belege: Ausnahmen sind keine Freifaehrt", () => {
  it("weist eine Umleitung zurueck, deren eigener Beleg den Wert nicht hergibt", () => {
    const zahl = UMLEITUNGEN[0];
    const ort = kratzer({
      [zahl.belegtIn]: "FLAECHE knoten=400 | anteil min 0.000%\n",
      "CHANGELOG.md": `Die app malt ${zahl.zahl} % (${zahl.belegtIn}).\n`,
    });
    // Die Zeile nennt ein Artefakt, das die Zahl nicht hat, und die Ausnahme behauptet sie
    // in einer Datei, die sie auch nicht hergibt — das ist rot, nicht "Ausnahme getroffen".
    const paper = pruefeDoku({ wurzel: ort, datei: "CHANGELOG.md", text: fs.readFileSync(path.join(ort, "CHANGELOG.md"), "utf8"), suche: [ort] });
    expect(paper.befunde.map((b) => b.art)).toContain("ausnahme-ohne-beleg");
  });

  it("laesst eine Umleitung gelten, wenn die andere Maschine denselben Wert haelt", () => {
    const zahl = UMLEITUNGEN[0];
    const ort = kratzer({
      [zahl.belegtIn]: "FLAECHE knoten=400 | anteil min 0.932% median 0.932%\n",
      "beleg/kern.log": "[ruhe] knoten=400 anteil=0.769%\n",
      "CHANGELOG.md": `Die Flaeche des Kerns nennt ${zahl.zahl} % (\`beleg/kern.log\`).\n`,
    });
    const { befunde, inventar } = pruefeDoku({
      wurzel: ort,
      datei: "CHANGELOG.md",
      text: fs.readFileSync(path.join(ort, "CHANGELOG.md"), "utf8"),
      suche: [ort],
    });
    expect(befunde).toEqual([]);
    expect(inventar.umgeleitet).toBe(1);
  });

  it("prueft einen Papierbeleg nach, statt ihn zu glauben", () => {
    const ort = kratzer({
      "beleg/x.log": "anteil=4%\n",
      "audit/FIX.md": "| 3 000 | **118 %** |\n",
      "CHANGELOG.md": "Die freigegebene Notiz nennt **118 %** Weltdeckung (`beleg/x.log`, `audit/FIX.md`, Zeile 3).\n",
    });
    const { befunde, inventar } = pruefeDoku({
      wurzel: ort,
      datei: "CHANGELOG.md",
      text: fs.readFileSync(path.join(ort, "CHANGELOG.md"), "utf8"),
      suche: [ort],
    });
    expect(befunde).toEqual([]);
    expect(inventar.zweitbeleg).toBe(1);

    const leer = kratzer({
      "beleg/x.log": "anteil=4%\n",
      "audit/FIX.md": "| 3 000 | **4 %** |\n",
      "CHANGELOG.md": "Die freigegebene Notiz nennt **118 %** Weltdeckung (`beleg/x.log`, `audit/FIX.md`, Zeile 3).\n",
    });
    const zweite = pruefeDoku({ wurzel: leer, datei: "CHANGELOG.md", text: fs.readFileSync(path.join(leer, "CHANGELOG.md"), "utf8"), suche: [leer] });
    expect(zweite.befunde.map((b) => b.art)).toContain("zahl-nicht-im-beleg");
    expect(zweite.befunde[0].sageDieDatei).toContain("FIX.md");
  });

  it("verwirft jede wildcard-Ausnahme und jede Ausnahme ohne Grund", () => {
    expect(() => liesAusnahmen([{ datei: "*.md", grund: "ganzer Baum" }])).toThrow(/wildcard/i);
    expect(() => liesAusnahmen([{ datei: "README.md" }])).toThrow(/ohne Datei oder Grund/);
    expect(() => liesAusnahmen([{ datei: "CHANGELOG.md", zahl: "1", einheit: "%", grund: "x" }])).toThrow(/genauen Belegpfad/);
    expect(() => liesAusnahmen([{ datei: "CHANGELOG.md", zahl: "1", einheit: "%", grund: "x", belegtIn: "a/*.log" }])).toThrow(/genauen Belegpfad/);
    expect(() => liesAusnahmen([...AUFPFLICHTUNGEN, ...UMLEITUNGEN])).not.toThrow();
  });

  it("haelt ein Soll fuer eine Latte und eine Messung fuer eine Messung", () => {
    const ort = kratzer({
      "beleg/x.log": "anteil=0.769%\n",
      "CHANGELOG.md": "The disc must stay at or above **0,3 %** (`beleg/x.log`), and the app paints **0,877 %** (`beleg/x.log`).\n",
    });
    const { befunde, inventar } = pruefeDoku({
      wurzel: ort,
      datei: "CHANGELOG.md",
      text: fs.readFileSync(path.join(ort, "CHANGELOG.md"), "utf8"),
      suche: [ort],
    });
    expect(inventar.sollwert).toBe(1);
    expect(befunde.map((b) => normalisiereZahl(b.zahl))).toEqual(["0.877"]);
    expect(befunde[0].art).toBe("zahl-nicht-im-beleg");
  });
});

describe("zahlen-belege: die Console luegt nicht ueber ihren Exit-Code", () => {
  it("gibt 1 fuer jeden Befund und 0 fuer einen gruenen Baum", () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const fehler = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      expect(hauptfunktion([`--wurzel=${path.join(FIXTUREN, "schlecht")}`, "--datei=CHANGELOG.md"])).toBe(1);
      expect(hauptfunktion([`--wurzel=${path.join(FIXTUREN, "gut")}`, "--datei=CHANGELOG.md"])).toBe(0);
      expect(hauptfunktion([`--wurzel=${path.join(FIXTUREN, "gut")}`, "--datei=CHANGELOG.md", "--inventar"])).toBe(0);
      const meldung = fehler.mock.calls.map((c) => String(c[0])).join("\n");
      expect(meldung).toContain("zahl-nicht-im-beleg");
      expect(meldung).toContain("7 044");
    } finally {
      log.mockRestore();
      fehler.mockRestore();
    }
  });
});
