// P48 / #47 — Punkt 4 (kein Fehler, der sich selbst auf die Flaeche schreibt).
//
// Hausregel seit P4-2310 (c): nach aussen ein fester Satz, der Grund bleibt beim
// Betreiber. `server/app.ts` (`EXPOSE_TEXTE`) haelt sich daran, die Flaeche tat es an
// 27 Stellen nicht. Eine ist in 3.2.130 geheilt (der Import-Knopf im Dashboard, gefunden
// vom Fensterlauf `scripts/pfade-im-fenster.mjs`); diese Wache haelt die Klasse.
//
// Sie ist am QUELLTEXT gelesen, nicht gefahren — 25 Absagen im echten Fenster zu induzieren
// waere ein eigener Auftrag. Der Befund, der sie ausgeloesst hat, war ein Bild: bei 820 px
// stand der Wortlaut einer von mir geworfenen Ausnahme mitten im Fenster, samt Pfad.
//
// Erwartung VOR der Umstellung: rot, mit der Liste der Dateien, die noch auspacken.
// Erwartung NACH der Umstellung: gruen, und die eine erlaubte Datei nennt ihren Grund.
//
// 3.2.152 (Fehler-Feger #31) — zwei Aenderungen an der Wache selbst, beide von ihr verlangt:
//
// 1. Die letzte Erlaubnis ist ausgelaufen. Settings trennte die zwei Faelle mit eignen Worten
//    und las dafuer den Ausnahmewortlaut; beide Stellen gehen jetzt durch `antwortKlausel`.
//    Die Wache meldete das selbst ("die Regel kann weg"), also ist `ERLAUBT` leer, und ihre
//    Selbstkontrolle haengt nicht mehr an einem lebenden Verstoss, sondern an einer Probe-Zeile
//    und an der geheilten Form. Ein Muster, das die Welt nicht schreibt, meldete sonst
//    Sauberkeit fuer Ungelesenes.
// 2. Der Blick war auf src/components beschraenkt. Die beiden Zeugen in src/lib/store.ts
//    erreichen die Flaeche ueber Dashboard.tsx:115/117 und :692 — dieselbe Klasse, ausserhalb
//    des Blicks. Er liegt jetzt ueber den Komponenten und der eigner Tuer-Schicht.
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const MUSTER = /instanceof Error \? [a-zA-Z]+\.message/g;

/**
 * Dateien, die eine Ausnahmemeldung lesen, und was sie damit tun.
 *
 * Leer seit 3.2.152: die letzte Datei, die es mit ihrem Grund tat, ist geheilt. Wer hier einen
 * Eintrag zuruecksetzt, muss seine Zaehlung und seine Trennung gleich mitsetzen — die beiden
 * Faelle unten ("zaehlt je erlaubte Datei", "traegt die Erlaubnis nur, wo...") sind darum nicht
 * geloescht, sondern ruhen. Die eigene Zeile prueft, dass die Liste wirklich leer ist.
 */
const ERLAUBT: Record<string, { anzahl: number; grund: string; zugehoerig: string }> = {};

/** Komponenten und die eigne Tuer-Schicht — beide malen auf die Flaeche. */
const flaechen = (): string[] => {
  const liste = (rel: string, end: string) => readdirSync(path.join(process.cwd(), rel)).filter((n) => n.endsWith(end));
  return [...liste(path.join("src", "components"), ".tsx"), ...liste(path.join("src", "lib"), ".ts")].sort();
};

const lies = (name: string) => readFileSync(path.join(process.cwd(), "src", "components", name), "utf-8");
const liesLib = (name: string) => readFileSync(path.join(process.cwd(), "src", "lib", name), "utf-8");
const textVon = (name: string) => (name.endsWith(".tsx") ? lies(name) : liesLib(name));

/** Die Kommentare raus, den Code laesst die Sonde: ein Verbot in einem Kommentar ist kein Verstoss. */
function ohneKommentare(text: string): string {
  return text.replace(/\/\/[^\n]*/g, "");
}

type Treffer = { datei: string; zeilen: number[]; text: string };

const ausgepackt = (): Treffer[] => {
  const treffer: Treffer[] = [];
  for (const name of flaechen()) {
    const text = textVon(name);
    const zeilen: number[] = [];
    text.split("\n").forEach((zeile, i) => {
      for (let k = (zeile.match(MUSTER) || []).length; k > 0; k--) zeilen.push(i + 1);
    });
    if (zeilen.length) treffer.push({ datei: name, zeilen, text });
  }
  return treffer;
};

describe("P47/#47: eine Ausnahme verlaesst die Flaeche im Wortlaut nie allein", () => {
  const treffer = ausgepackt();

  it("liest etwas — die Sonde ist nicht blind fuer ihre eigne Welt", () => {
    // Kontrollgruppe fuer die Sonde selbst: die Form, die die Welt bis 3.2.151 schrieb, muss
    // das Muster weiter treffen. Ohne diese Zeile meldete eine leere Trefferliste Sauberkeit
    // fuer Ungelesenes — derselbe Befund, den diese Wache an ihrem ersten Muster korrigierte.
    expect(MUSTER.test("const grund = err instanceof Error ? err.message : String(err);"),
      "das Muster trifft die Form nicht mehr, die die App schrieb").toBe(true);
    expect(flaechen().length, "die Sonde liest zu wenige Dateien, um ein Urteil zu fuehren").toBeGreaterThan(40);
    // Ein zweiter, lebender Zeuge: die geheilte Form steht in Settings — zwei Zeilen, beide
    // durch den Helfer. Fehlt eine, schlaegt diese Zeile ein, auch wenn die Trefferliste leer bleibt.
    expect(lies("Settings.tsx").split("antwortKlausel(err)").length - 1,
      "die beiden Einstellungs-Zeilen gehen nicht mehr durch den Helfer").toBe(2);
  });

  it("laesst keine Datei auspacken — was eine Erlaubnis braucht, nennt sie", () => {
    const funde = treffer.map((t) => t.datei).sort();
    const erlaubt = Object.keys(ERLAUBT).sort();
    expect(
      funde,
      `diese Dateien schreiben einer Ausnahme ihren Wortlaut direkt in einen Flaechen-Zustand: ${treffer
        .map((t) => `${t.datei}:${t.zeilen.join(",")}`)
        .join(" ")} — Vorgang: absage(satz, e) oder antwortKlausel(e) aus src/lib/absage.ts, das den Grund ins console legt und den festen Satz zurueckgibt`,
    ).toEqual(erlaubt);
  });

  it("haelt die Erlaubnis leer — ein Eintrag hier ist eine Decke, die verdient sein will", () => {
    // Seit 3.2.152 gibt es keine Ausnahmemeldung mehr, die auf die Flaeche darf. Ein Eintrag
    // waere ein neuer Fall, der sich selbst erlaubt; er muss darum durch diesen Schlag hoeren.
    expect(Object.entries(ERLAUBT), `diese Dateien sind wieder erlaubt: ${Object.keys(ERLAUBT).join(",")} — nur mit Zaehlung, Grund und Trennung, und die beiden ruhenden Faelle unten muessen zurueck`).toEqual([]);
  });

  it("zaehlt je erlaubte Datei genau die gemeldeten Stellen — eine mehr ist ein neuer Fall", () => {
    for (const [name, regel] of Object.entries(ERLAUBT)) {
      const t = treffer.find((x) => x.datei === name);
      expect(t, `${name} steht in der Erlaubnis, hat aber gar keinen Treffer mehr — die Regel kann weg`).toBeTruthy();
      expect(
        t!.zeilen.length,
        `${name} packt ${t!.zeilen.length} mal aus, erlaubt sind ${regel.anzahl} (${regel.grund}) — Zeilen ${t!.zeilen.join(",")}`,
      ).toBe(regel.anzahl);
    }
  });

  it("traegt die Erlaubnis nur, wo die beiden Faelle wirklich getrennt werden", () => {
    for (const [name, regel] of Object.entries(ERLAUBT)) {
      const t = treffer.find((x) => x.datei === name);
      if (!t) continue;
      const zeilen = t.text.split("\n");
      for (const nr of t.zeilen) {
        const umfeld = zeilen.slice(nr - 1, nr + 6).join("\n");
        expect(
          umfeld.includes(regel.zugehoerig),
          `${name}:${nr} liest eine Ausnahmemeldung, aber die naechsten Zeilen trennen die beiden Faelle nicht (${regel.zugehoerig}) — ohne diese Trennung ist die Erlaubnis eine Decke fuer rohen Wortlaut`,
        ).toBe(true);
      }
    }
  });

  it("hat den Helfer, und er legt den Grund hin, statt ihn wegzuwerfen", () => {
    const helfer = readFileSync(path.join(process.cwd(), "src", "lib", "absage.ts"), "utf-8");
    expect(helfer.includes("console.error"), "der Grund muss beim Betreiber landen").toBe(true);
    expect(/\.message/.test(helfer), "der Helfer darf der Flaeche keine Ausnahmemeldung geben").toBe(false);
    expect(helfer.includes("export function absage"), "ein Helfer, den niemand exportiert, ist ein Text").toBe(true);
    // P4-15/16/17: zwei Faelle, zwei Worte. Das eine Wort fuehrt die Klammer, das andre nicht.
    expect(helfer.includes("export function antwortKlausel"), "ohne Helfer setzen die Zeilen die Trennung selbst").toBe(true);
    expect(helfer.includes('"did not answer"'), "die Stille hat ihr Wort").toBe(true);
    expect(helfer.includes("refused it ("), "die Abweisung hat ihres").toBe(true);
    expect(helfer.includes("export function flaechenGrund"), "Zeugen, die den Grund merken, brauchen denselben Schnitt").toBe(true);
  });

  it("laesst die zwei Zeugen im Speicher nur durch die Herkunfts-Kante", () => {
    // Fundstelle #31: store.ts merkt den Grund, Dashboard malt ihn. Der Grund einer Seite
    // (store.ts:150) und der der Liste (:216) war der rohe Wortlaut des Werfers, und
    // Dashboard.tsx:692 wickelte den gemerkten String in einen `ApiFehler` — damit bekam
    // jeder Fremde das Passier-Recht der eignen Unterschrift. Beide Wege sind hier verriegelt.
    const speicher = liesLib("store.ts");
    expect(speicher.includes("letzterSeitenfehler = flaechenGrund(err)"),
      "die Seiten-Absage geht nicht durch die Kante").toBe(true);
    expect(speicher.includes("letzterLadefehler = flaechenGrund(err)"),
      "die Listen-Absage geht nicht durch die Kante").toBe(true);
    expect(speicher.includes("tuerSatz(data?.error"),
      "das Antwort-Feld der Behauptungen geht nicht durch die Formpruefung").toBe(true);
    expect(/new ApiFehler\(\s*grund\s*\)/.test(ohneKommentare(lies("Dashboard.tsx"))),
      "Dashboard wickelt einen gemerkten Grund wieder in einen ApiFehler und gibt ihm Passier-Recht").toBe(false);
  });

  it("kennt auch die Ausweichform — ein String der Ausnahme direkt in einen Zustand", () => {
    // Die erste Sonde war zu eng: sie fand nur `instanceof Error ? x.message`. Ein
    // `setFehler(String(err))` oder `setFehler(err.message)` derselben Klasse waere
    // durchgeschluepft. Diese Zeile zaehlt die Form, die kein Muster der ersten Fassung ist.
    const AUSWEICH = /set[A-Za-z]+\([^)]*(?:\b(?:e|err|error|ex|exception)\.message|String\((?:e|err|error|ex|exception)\))/;
    const funde: string[] = [];
    for (const name of flaechen()) {
      textVon(name).split("\n").forEach((zeile, i) => {
        if (AUSWEICH.test(zeile) && !zeile.includes("absage(")) funde.push(`${name}:${i + 1}`);
      });
    }
    expect(funde, `diese Stellen schreiben einen Ausnahme-String direkt in einen Zustand: ${funde.join(" ")} — auch hier: absage(satz, e)`).toEqual([]);
  });

  it("laesst einen Leib-Koerper nur durch die Formpruefung der Tuer", () => {
    // Gefunden von der Sonde selbst: ein Feld im Antwort-Koerper (`d.message`, `d.error`)
    // ist kein Ausnahme-Wortlaut, aber derselben Klasse — ein Hoerer ohne unsre Unterschrift
    // kann dort einen Pfad ablegen. Vorgeschrieben ist tuerSatz (src/lib/api.ts).
    const LEIB = /set[A-Za-z]+\(\{?[^)]*\b\w+\.(?:message|error)\b/;
    const funde: string[] = [];
    for (const name of flaechen()) {
      textVon(name).split("\n").forEach((zeile, i) => {
        if (LEIB.test(zeile) && !zeile.includes("tuerSatz(")) funde.push(`${name}:${i + 1}`);
      });
    }
    expect(funde, `diese Stellen legen ein Antwort-Feld ungeprueft in einen Zustand: ${funde.join(" ")} — Vorgang: tuerSatz(feld, falltext)`).toEqual([]);
  });
});
