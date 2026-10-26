// #106 — die gemalte Gang-Zeile endet an einer Kante, nie mitten im Wort.
//
// Gemessen am ausgelieferten Stueck (Punkt 2, 390 px, 26.10.): die letzte helle
// Spalte des Satzes lag bei x 364, die rechte Kante des Legendenkastens bei 358,
// die Bildkante bei 390. Der Malweg kurzte nie — `strokeText` und `fillText`
// setzten den Satz unkapped an `x0` (KnowledgeGraph.tsx:4085/4087), und die
// Zeilensuche brach nur an der unteren Bildkante ab (4081) — abwaerts, in den
// Kasten hinein, der am unteren Rand steht.
//
// Der Satz traegt Zahlen (Seite, gemalt, nicht gemalt). Darum darf die Heilung ihn
// nicht kuerzen, wo er umbricht, und nicht verschwinden lassen, wo er knapp wird:
// er wird an Woertern gebrochen, und jedes Wort haelt die Kante.
//
// Die Faelle unten pruefen die Rechnung. Die Kante selbst ist ein Bildbeweis (echtes
// Fenster, Pixelsonde, vorher und nachher): jsdom malt den Gang-Satz an dieser Stelle
// nie — auch nicht nach zwanzig Herauszoom-Knoepfen und angesetztem Kastenmass,
// versucht und verworfen 26.10. 21:55 Uhr, gemeldet statt uegangen.
import { describe, it, expect } from "vitest";
import { KANTEN_RAND_PX, satzKuerzen, zeilenFlucht, zeilenUmbruch } from "../../src/lib/graphLayout";

describe("#106 — der Satz endet an einer Kante, nie mitten im Wort", () => {
  it("bricht an Woertern, wenn die Kante naeher ist als seine Breite", () => {
    const masse = (t: string) => t.length * 10;
    // Ein Satz, der passt, bleibt eine Zeile.
    expect(zeilenUmbruch("acht notes", masse, 120)).toEqual(["acht notes"]);
    // Zwei Woerter, 120 px frei: "acht notes" ist 100, "zahl" 40 — zusammen 145 mit
    // dem Leerzeichen. Der Bruch liegt dazwischen.
    expect(zeilenUmbruch("acht notes zahl", masse, 120)).toEqual(["acht notes", "zahl"]);
    // Der Lichtungs-Satz, gekuerzt um eine Zahl: er verliert nichts, was er sagt.
    const lang = "1,284 notes connect to nothing in this picture · 96 painted at this zoom · 288 counted, not painted";
    const Zeilen = zeilenUmbruch(lang, masse, 366);
    expect(Zeilen.length, "bei 366 px muss der Satz ueber mehrere Zeilen stehen").toBeGreaterThan(1);
    expect(Zeilen.join(" "), "gebrochen darf keinen Wortteil kosten").toBe(lang);
    for (const z of Zeilen) expect(masse(z), `Zeile ueber die Kante: "${z}"`).toBeLessThanOrEqual(366);
  });

  it("gibt kein Wort auf, das breiter ist als das Bild", () => {
    const masse = (t: string) => t.length * 10;
    // Ein Wort von 170 px in 50 px Platz: vier Buchstaben plus Punkt sind 50 px, der
    // fuenfte waere 60 — also endet das Wort mit Auslassung, nicht mit der Kante.
    expect(zeilenUmbruch("uuuuuuuuuuuuuuuuu", masse, 50)).toEqual(["uuuu…"]);
    // Reicht der Platz fuer kein Zeichen plus Punkt, bleibt nichts zu malen.
    expect(zeilenUmbruch("uuuuuuuuuuuuuuuuu", masse, 5)).toEqual([]);
  });

  it("kuerzt ein einzelnes Wort auf die freie Breite", () => {
    const masse = (t: string) => t.length * 10;
    // Acht Zeichen plus Auslassungszeichen sind 90 px, das neunte waere 100.
    expect(satzKuerzen("abcdefghijklmnopqrstuvwxyz", masse, 92)).toBe("abcdefgh…");
    // Passt der ganze Text, bleibt er unangetastet.
    expect(satzKuerzen("kurz", masse, 96)).toBe("kurz");
    // Kein Platz, kein Text.
    expect(satzKuerzen("abcdefghijklmnopqrstuvwxyz", masse, 5)).toBe("");
  });

  it("weist die Breite der Latte zu, nicht dem Fall", () => {
    const masse = (t: string) => t.length * 10;
    // 92 px frei sind 90 px Tinte; wer den Rand von vier auf vierzig Bildpunkte
    // setzt, bekommt eine kuerzere Zeile — die Zahl entscheidet, nicht der Wunsch.
    expect(satzKuerzen("abcdefghijklmnopqrstuvwxyz", masse, 92)).toHaveLength(9);
    expect(satzKuerzen("abcdefghijklmnopqrstuvwxyz", masse, 92 - KANTEN_RAND_PX * 9)).toHaveLength(5);
  });

  it("fluechtet mit der ganzen Zeilengruppe vor dem Kasten nach oben", () => {
    // Schritt 14, eine Zeile hoch, Kastenoberkante 204, Bildhoehe 300. Bei 196
    // reichte die Zeile bis 210 — sechs Bildpunkte unter den Kasten; sie muss eine
    // Zeile hoch auf 182, denn abwaerts ist bis 296 alles Kasten.
    expect(zeilenFlucht(196, 14, 14, 204, 300)).toBe(182);
    // Bei Oberkante 220 bleibt sie auf 196: dieselbe Rechnung, mehr Platz, keine Flucht.
    expect(zeilenFlucht(196, 14, 14, 220, 300)).toBe(196);
    // Zwei Zeilen brauchen zwei Schritte mehr Platz — dieselbe Stelle reicht dann nicht.
    expect(zeilenFlucht(196, 14, 28, 220, 300)).toBe(182);
    // Laesst der Kasten ueberhaupt keine Zeile, gibt es keine: null heisst "nicht
    // gemalt", nicht "irgendwo gequetscht".
    expect(zeilenFlucht(196, 14, 14, 60, 300)).toBeNull();
    // Die untere Bildkante gilt weiterhin.
    expect(zeilenFlucht(290, 14, 14, 300, 300)).toBe(276);
  });
});
