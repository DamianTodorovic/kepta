import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";

type Befund = { sektion: string; befund: string; zahl: string; schwelle: string; fund: string; ok: boolean };
type Ergebnis = { rot: number; messungen: number; linien: Befund[]; schwelle: Record<string, number> };
import path from "node:path";
import { klassenAusSelektor, klassenAusWortlisten, waisenUndNackte } from "../scripts/helfer/klassen-sonde.mjs";

// Die Design-Wache ist das Gate dieser Scheibe: sie rechnet die Token-Werte
// aus src/index.css und src/lib/kepta-icons.tsx, kein Mensch prüft per Auge.
// Dieser Test hängt sie in die Suite und — zweiter, wichtiger Teil — er hält
// die Schwellen selbst fest. Eine Wache, deren Latte jemand still
// tiefer legt, ist keine Wache.

const PFAD = path.join(process.cwd(), "scripts/design-wache.mjs");

function wache(): Ergebnis {
  let stdout: string;
  try {
    stdout = execFileSync(process.execPath, [PFAD, "--json"], { encoding: "utf8", cwd: process.cwd() });
  } catch (e) {
    // Exit 1 heißt: Befunde unter der Schwelle. Der Output ist trotzdem da.
    stdout = String((e as { stdout?: string }).stdout ?? "");
    if (!stdout.trim()) throw e;
  }
  return JSON.parse(stdout);
}

describe("Design-Wache", () => {
  const ergebnis = wache();

  it("kennt ihre Schwellen aus D1 Teil C — die Latte liegt fest", () => {
    expect(ergebnis.schwelle.text).toBeCloseTo(4.5, 3);      // Apple HIG, bis 17 pt
    expect(ergebnis.schwelle.nachbar).toBeCloseTo(1.3, 3);   // Z-01 benachbarte Flächen
    expect(ergebnis.schwelle.kante).toBeCloseTo(3.0, 3);     // WCAG 1.4.11
    expect(ergebnis.schwelle.schriftpx).toBe(11);            // Z-04
    expect(ergebnis.schwelle.stufen).toBe(8);                 // Z-04
    expect(ergebnis.schwelle.iconpx).toBe(14);                // Z-06
  });

  it("rechnet ihre volle Breite — keine Schleife, die ins Leere läuft", () => {
    // 240 statt "über hundert": am 11.10. fielen 44 Messungen aus zwei
    // Sectionen, weil eine Schleife ein Set statt einer Map destructuring
    // durchlief. Kein Befund wurde rot — es waren einfach weniger Zeilen. Eine
    // Zahl, die nur nach unten fallen kann, ist keine Kontrolle.
    expect(ergebnis.messungen).toBeGreaterThan(240);
    for (const sektion of ["flächen", "kanten", "text", "schichten", "typ", "kontrast", "schrift", "icons", "css"]) {
      expect(ergebnis.linien.filter((l) => l.sektion === sektion).length, `${sektion} meldet nichts`).toBeGreaterThan(3);
    }
  });

  // Die Palette der Fläche: Token, nicht Handfarbe. Diese Zeilen sind der
  // Beweis, dass die Wache die acht Rollen wirklich misst (B1, 10.10.: vier
  // Hex-Werte in der Komponente, ein Kommentar sagte „alle ≥ 4,65", das Bild
  // zeigte 3,91).
  it("hält die Typ-Farb-Wache: acht Rollen auf der Leinwand, kein Hartwert in der Quelle", () => {
    const rollen = ergebnis.linien.filter((l) => l.sektion === "typ" && /auf der Leinwand/.test(l.befund));
    expect(rollen.length).toBe(16);                     // acht Rollen, beide Themen
    // P202, Damian 14.11. „100 % wie das Mockup": die Typ-Farben sind Flächen-
    // Rollen — die Wache hält sie an der Grafik-Latte (3:1), die Zeile nennt
    // ihre Latte selbst; die Schrift-Anwendungen tragen die -text-Fassung (4,5).
    for (const l of rollen) {
      const latte = l.schwelle.includes("3,00") ? 3 : 4.5;
      expect(parseFloat(l.zahl.replace(",", "."))).toBeGreaterThanOrEqual(latte);
    }
    const kanal = ergebnis.linien.filter((l) => l.sektion === "typ" && /beide Kanäle/.test(l.befund));
    expect(kanal.map((l) => l.zahl)).toEqual(["8/8", "8/8"]);
    const ratsche = ergebnis.linien.find((l) => l.sektion === "typ" && /Hex-Literal/.test(l.befund));
    expect(ratsche, "die Ratsche fehlt").toBeDefined();
    expect(ratsche!.zahl, `Hex-Literals: ${ratsche!.fund}`).toBe("0");
    const leser = ergebnis.linien.find((l) => l.sektion === "typ" && /aus dem Token liest/.test(l.befund));
    expect(leser!.zahl).toBe("8/8");
  });

  it("meldet nichts, was unter der Schwelle liegt", () => {
    const rot = ergebnis.linien.filter((l) => !l.ok);
    expect(
      rot.map((l) => `${l.sektion} · ${l.befund} · ${l.zahl} · ${l.schwelle} · ${l.fund}`),
      "Wache meldet Befunde unter der Schwelle"
    ).toEqual([]);
  });

  // Die Sonden aus D1 C.16 — hier als eigene Scheibe maschinell, damit
  // ein künftiger Lauf nicht wieder "sieht das schon so" sagt.
  // P202, Werkbank-Doktrin: das dunkle Thema führt die 1,30-Leiter weiter, das
  // helle Thema trägt die Werkbank-Zeile (die Flächen bleiben hell und
  // aufsteigend; die Grenze trägt die Kante).
  it("hält die Ebenen-Wachen: dunkel 1,30 je Nachbar, hell die Werkbank-Doktrin", () => {
    const dunkel = ergebnis.linien.filter((l) => l.sektion === "flächen" && l.befund.startsWith("dunkel: Leiter"));
    expect(dunkel.length).toBeGreaterThanOrEqual(2); // beide Nachbarschaften der Stahl-Welt
    for (const l of dunkel) expect(parseFloat(l.zahl.replace(",", "."))).toBeGreaterThanOrEqual(1.3 - 0.006);
    const werkbank = ergebnis.linien.find((l) => l.sektion === "flächen" && /aufsteigend/.test(l.befund));
    expect(werkbank, "die Werkbank-Zeile der hellen Fläche fehlt").toBeTruthy();
    expect(werkbank!.ok).toBe(true);
  });

  it("hält die Ruhe-Ebenen-Wache: jede Schrift 4,50 in beiden Themen", () => {
    const text = ergebnis.linien.filter((l) => l.sektion === "text" && /als Schrift/.test(l.befund));
    expect(text.length).toBeGreaterThanOrEqual(20); // dunkel und hell, alle Texttoken
    for (const l of text) expect(parseFloat(l.zahl.replace(",", "."))).toBeGreaterThanOrEqual(4.5);
  });

  it("hält die Klassen-Wache: Wörter statt Teilzeichenketten, und kein nackter Rufer", () => {
    // Zwei Blenden, die der Zensus 13.10. (e1-code/zensus.mjs) aufgedeckt hat:
    // 1. Die tote-Stil-Zeile verglich den Quelltext mit `includes(k)` — `glass`
    //    galt als gerufen, weil `glass-strong` dasteht, `inset` wegen `hud-inset`,
    //    `ikone` wegen `ikone-1`, `label` wegen `hud-label`. Sie meldete 16, es
    //    waren 20. 2. Die Gegenrichtung fehlte ganz: hud-raised (PraxisSync.tsx:172)
    //    und row-type-label (MemoryCard.tsx:65) wurden gerufen, ohne definiert zu
    //    sein. Beide sind jetzt Regeln in src/index.css.
    //
    // SEIT 5.11. haengt der Biss nicht mehr an der Zahl der Datei. Der Waisen-Schnitt
    // (P68/P69, Fassung 3.2.160) hat die 18 Sitze geloescht, weil der Vertrag in
    // design/DESIGN.md §10 die Regel verbietet, die niemand ruft; die lebende Datei
    // meldet "keine", und die Latte der Wache steht auf 0. Eine Kontrolle "mindestens
    // 16 Waisen" waere damit Stillstand geworden, keine Pruefung — also fuettert der
    // Fall dieselbe Sonde mit eingesetzten Baelle (scripts/helfer/klassen-sonde.mjs).
    const tot = ergebnis.linien.find((l) => /toter Stil/.test(l.befund));
    expect(tot, "Zeile tote-r-Stil fehlt").toBeTruthy();
    expect(tot!.zahl, `die Datei meldet noch Waisen: ${tot!.zahl}`).toBe("keine");
    expect(tot!.ok, "die Waisen-Latte ist nicht erfuedt").toBe(true);
    const fremd = ergebnis.linien.find((l) => /nackter Rufer/.test(l.befund));
    expect(fremd, "Zeile nackter-Rufer fehlt").toBeTruthy();
    expect(fremd!.ok, `nackte Rufer: ${fremd!.zahl}`).toBe(true);
    const kontrolle = ergebnis.linien.find((l) => /Teilzeichenketten-Rufer/.test(l.befund));
    expect(kontrolle, "positive Kontrolle fehlt").toBeTruthy();
    expect(kontrolle!.ok).toBe(true);
  });

  it("beisst: eine Waise faellt der Sonde auf, eine Teilzeichenkette nicht", () => {
    // Einsatz statt Datei: eine Regel ohne Rufer muss gefunden werden, eine
    // Tailwind-Form darf keine Waise erfinden, und ein Selektor mit Escape-Folge
    // keinen Namen `text-` (18.10., als die Leiter-Regeln in index.css einzogen).
    const selektoren = [".spott-klasse", ".card:hover, .hud-card:hover", ".glass, .glass-strong",
                        ".hud-inset", ".inset", ".text-\\[8\\.5px\\]"];
    const klassen = new Set(selektoren.flatMap(klassenAusSelektor));
    const geruft = klassenAusWortlisten([
      '<div className="glass-strong" />',
      '<div className="hud-inset inset-0 flex items-center" />',
      '<div className={cn("card", aktiv === "chat" ? "peer" : "container")} />',
      '<div className="fehl-stein" />',
    ].join("\n"));
    const { tot, fremd } = waisenUndNackte(klassen, geruft);
    // Vier Waisen, die eine includes()-Sonde als gerufen verkannt haette: glass
    // (wegen glass-strong), inset (wegen inset-0), hud-card, spott-klasse.
    expect(tot).toEqual(["glass", "hud-card", "inset", "spott-klasse"]);
    // Nackter Rufer: fehl-stein hat keine Regel; inset-0, flex, items-center, peer
    // und container sind Tailwind-Formen, kein fehlender Baustein.
    expect(fremd).toEqual(["fehl-stein"]);
    // Die Escape-Regel an ihrem eignen Fall, und die Wortliste an einem gewoehnlichen.
    expect(klassenAusSelektor(".text-\\[8\\.5px\\]")).toEqual([]);
    expect(klassenAusSelektor(".card:hover, .hud-card:hover")).toEqual(["card", "hud-card"]);
  });

  it("hält die Zeichen-Wache: kein Bild unter zwei Namen", () => {
    const doppel = ergebnis.linien.filter((l) => l.sektion === "icons" && /identischen Pfad-Daten/.test(l.befund));
    expect(doppel).toHaveLength(1);
    expect(doppel[0].zahl).toBe("0 Gruppen / 0 Namen");
    expect(doppel[0].ok).toBe(true);
  });

  it("hält die Variablen-Wache: keine Referenz ohne Definition", () => {
    const l = ergebnis.linien.find((x) => x.sektion === "var" && /ohne Definition/.test(x.befund));
    expect(l, "die Referenz-Zeile fehlt").toBeDefined();
    expect(l!.zahl).toBe("0");
  });
});
