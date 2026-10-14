import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";

type Befund = { sektion: string; befund: string; zahl: string; schwelle: string; fund: string; ok: boolean };
type Ergebnis = { rot: number; messungen: number; linien: Befund[]; schwelle: Record<string, number> };
import path from "node:path";

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
    for (const l of rollen) expect(parseFloat(l.zahl.replace(",", "."))).toBeGreaterThanOrEqual(4.5);
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

  // Die vier Sonden aus D1 C.16 — hier als eigene Scheibe maschinell, damit
  // ein künftiger Lauf nicht wieder "sieht das schon so" sagt.
  it("hält die Ebenen-Wache: jede Leiterstufe 1,30 gegen den Nachbarn", () => {
    const leiter = ergebnis.linien.filter((l) => l.sektion === "flächen" && /Leiter/.test(l.befund));
    expect(leiter.length).toBeGreaterThanOrEqual(4); // beide Themen, beide Nachbarschaften
    for (const l of leiter) expect(parseFloat(l.zahl.replace(",", "."))).toBeGreaterThanOrEqual(1.3 - 0.006);
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
    //    sind 20. 2. Die Gegenrichtung fehlte ganz: hud-raised (PraxisSync.tsx:172)
    //    und row-type-label (MemoryCard.tsx:65) wurden gerufen, ohne definiert zu
    //    sein. Beide sind jetzt Regeln in src/index.css.
    const tot = ergebnis.linien.find((l) => /toter Stil/.test(l.befund));
    expect(tot, "Zeile tote-r-Stil fehlt").toBeTruthy();
    expect(Number(/^(\d+)/.exec(tot!.zahl)?.[1] ?? 0), "die Wort-Sonde meldet weniger als die Teilzeichenketten-Sonde").toBeGreaterThanOrEqual(16);
    for (const k of ["glass", "inset", "ikone", "label"]) expect(tot!.zahl, `${k} fehlt in der Waisenliste`).toContain(k);
    const fremd = ergebnis.linien.find((l) => /nackter Rufer/.test(l.befund));
    expect(fremd, "Zeile nackter-Rufer fehlt").toBeTruthy();
    expect(fremd!.ok, `nackte Rufer: ${fremd!.zahl}`).toBe(true);
    const kontrolle = ergebnis.linien.find((l) => /Teilzeichenketten-Rufer/.test(l.befund));
    expect(kontrolle, "positive Kontrolle fehlt").toBeTruthy();
    expect(kontrolle!.ok).toBe(true);
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
