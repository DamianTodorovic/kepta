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
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const MUSTER = /instanceof Error \? [a-zA-Z]+\.message/g;

/**
 * Dateien, die eine Ausnahmemeldung lesen, und was sie damit tun.
 *
 * `erlaubt` zaehlt mit Grund: Settings trennt zwei Faelle, die zwei Worte brauchen
 * (P4-15/P4-16) — `HTTP <status>` heisst "die Tuer hat geantwortet und abgelehnt", eine
 * TypeError heisst "sie hat nicht geantwortet". Der Grund steht dort in Klammern in einem
 * festen Satz, und die naechsten Zeilen entscheiden, welcher Satz es wird. Diese Wache
 * laesst das nur, wenn sie genau diese Trennung in der Datei findet — sonst ist die
 * Erlaubnis eine Decke, die sich ueber rohen Wortlaut legen laesst.
 */
const ERLAUBT: Record<string, { anzahl: number; grund: string; zugehoerig: string }> = {
  "Settings.tsx": {
    anzahl: 2,
    grund:
      "P4-15/P4-16: zwei Faelle, zwei Worte — der Grund steht in Klammern in einem festen Satz",
    zugehoerig: "/^HTTP \\d{3}$/.test(grund)",
  },
};

const flaechen = () =>
  readdirSync(path.join(process.cwd(), "src", "components"))
    .filter((n) => n.endsWith(".tsx"))
    .sort();

type Treffer = { datei: string; zeilen: number[]; text: string };

const ausgepackt = (): Treffer[] => {
  const treffer: Treffer[] = [];
  for (const name of flaechen()) {
    const text = readFileSync(path.join(process.cwd(), "src", "components", name), "utf-8");
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
    // Kontrollgruppe fuer die Sonde selbst: Settings muss immer getroffen werden, weil
    // seine zwei Stellen durch die Erlaubnis gesetzt sind. Ein Muster, das die Welt nicht
    // schreibt, meldete sonst Sauberkeit fuer Ungelesenes.
    expect(treffer.some((t) => t.datei === "Settings.tsx"), "die Sonde findet nicht einmal die beiden bekannten Stellen in Settings.tsx — Muster oder Pfad ist kaputt").toBe(true);
    expect(flaechen().length).toBeGreaterThan(20);
  });

  it("laesst nur die Dateien auspacken, die es mit ihrem Grund tun", () => {
    const funde = treffer.map((t) => t.datei).sort();
    const erlaubt = Object.keys(ERLAUBT).sort();
    expect(
      funde,
      `diese Dateien schreiben einer Ausnahme ihren Wortlaut direkt in einen Flaechen-Zustand: ${treffer
        .map((t) => `${t.datei}:${t.zeilen.join(",")}`)
        .join(" ")} — Vorgang: aufrufen von absage(satz, e) aus src/lib/absage.ts, das den Grund ins console legt und den festen Satz zurueckgibt`,
    ).toEqual(erlaubt);
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
  });

  it("kennt auch die Ausweichform — ein String der Ausnahme direkt in einen Zustand", () => {
    // Die erste Sonde war zu eng: sie fand nur `instanceof Error ? x.message`. Ein
    // `setFehler(String(err))` oder `setFehler(err.message)` derselben Klasse waere
    // durchgeschluepft. Diese Zeile zaehlt die Form, die kein Muster der ersten Fassung ist.
    const AUSWEICH = /set[A-Za-z]+\([^)]*(?:\b(?:e|err|error|ex|exception)\.message|String\((?:e|err|error|ex|exception)\))/;
    const funde: string[] = [];
    for (const name of flaechen()) {
      const text = readFileSync(path.join(process.cwd(), "src", "components", name), "utf-8");
      text.split("\n").forEach((zeile, i) => {
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
      const text = readFileSync(path.join(process.cwd(), "src", "components", name), "utf-8");
      text.split("\n").forEach((zeile, i) => {
        if (LEIB.test(zeile) && !zeile.includes("tuerSatz(")) funde.push(`${name}:${i + 1}`);
      });
    }
    expect(funde, `diese Stellen legen ein Antwort-Feld ungeprueft in einen Zustand: ${funde.join(" ")} — Vorgang: tuerSatz(feld, falltext)`).toEqual([]);
  });
});
