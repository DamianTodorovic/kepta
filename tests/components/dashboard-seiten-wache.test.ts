// @vitest-environment node
//
// Die Wache am Verbraucher (Brief `BRIEF-SEITE-100-20-10.md`, Auftrag 3 und 4): der Zähler
// `seiteIstBegrenzt()` aus `src/lib/store.ts:61` hatte in keiner Fläche einen Verbraucher — Zensus
// 15:20 über `src/`: 0 Treffer außerhalb von `store.ts` selbst. Diese Wache hält den Faden am
// Quelltext, weil jsdom die Fläche nicht sieht (`process` ist da, der Renderer nicht) und der echte
// Beweis ein Bild im Fenster ist (Abnahme des Briefs). **Was sie beweist:** die Fläche fragt die Kappe
// und ruft den Nachlade-Griff. **Was sie nicht beweist:** dass der Scroll im Browser funktioniert.
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

const flaeche = fs.readFileSync(path.resolve("src/components/Dashboard.tsx"), "utf8");
const speicher = fs.readFileSync(path.resolve("src/lib/store.ts"), "utf8");

describe("Der Kappenzähler hat einen Verbraucher", () => {
  it("Die Fläche importiert Kappe, Nachlade-Griff und Seiten-Grund aus dem Speicher", () => {
    const zeile = flaeche.split("\n").find((l) => l.includes("from '../lib/store'")) || "";
    expect(zeile).toContain("seiteIstBegrenzt");
    expect(zeile).toContain("mehrAnholen");
    expect(zeile).toContain("seitenFehler");
  });

  it("Der Scroll-Beobachter fragt die Tür, wenn der Cache am Ende ist", () => {
    // Vorher: `if (visibleCount >= displayedMemories.length) return;` — der Effekt endete genau dort,
    // wo die Frage an die Tür hätte beginnen müssen. Jetzt sitzt der Aufruf in demselben Effekt.
    // Kommentare werden vorher geworfen: derselbe Fall, den mein eigner Text erfüllen würde, ist kein
    // Fall — er kann nicht verlieren.
    const start = flaeche.indexOf("IntersectionObserver: automatisches Nachladen");
    expect(start).toBeGreaterThan(-1);
    const effekt = flaeche.slice(start, start + 2000)
      .split("\n")
      .filter((l) => !l.trim().startsWith("//") && !l.trim().startsWith("*") && !l.trim().startsWith("/*"))
      .join("\n");
    expect(effekt).toContain("seiteIstBegrenzt()");
    expect(effekt).toContain("holeNaechsteSeite(");
  });

  it("Die Fusszeile darf 'entries shown' nicht sagen, solange die Tuer begrenzt meldet", () => {
    const zeile = flaeche.split("\n").find((l) => l.includes("entries shown</>")) || "";
    expect(zeile).not.toBe("");
    // Der Zweig, der „shown" malt, darf nur gelten, wenn weder die Kappe noch die Zahl mehr verspricht.
    const bedingung = flaeche.split("\n").find((l) => l.includes("seiteIstBegrenzt() || (tuerBestand")) || "";
    expect(bedingung).toContain("seiteIstBegrenzt()");
  });

  it("Der Nachladeweg kennt nur die Kappe der Tür, nie `alle=1`", () => {
    // Verbot 1 des Briefs, am Quelltext gehalten: die einzige Stelle, die Seiten nachlädt, fragt mit
    // `limit` und `offset`. Die Zahl selbst ist die Kappe der Route (`SEITE_MAX`, api-form.ts:79).
    const start = speicher.indexOf("export function mehrAnholen");
    expect(start).toBeGreaterThan(-1);
    const rumpf = speicher.slice(start, start + 2600);
    expect(rumpf).toContain("limit=${SEITE_NACHLAD}");
    expect(rumpf).toContain("offset=${offset}");
    expect(rumpf).not.toContain("alle=1");
  });

  it("Der Papierkorb-Abruf hat keinen leeren Fang mehr", () => {
    // Zweitbefund des Briefs: der `catch { /* ignore */ }` am Korb-Abruf ließ einen kaputten
    // Papierkorb exakt wie einen leeren aussehen — derselbe Satz, den 3.2.26 für den Hauptbestand
    // eingeführt hat. Die Wache greift den **Abruf-Block** heraus, nicht die ganze Datei: sechs
    // weitere stille Fänge bleiben stehen (localStorage-Schreibwege, der Assistenten-Pfad und der
    // Badge-Griff auf `/api/storage-info`) — einer davon gehört an den Badge, keiner in diesen Auftrag.
    const anfang = flaeche.indexOf("  // Papierkorb");
    const ende = flaeche.indexOf("  // Erstes Laden");
    expect(anfang).toBeGreaterThan(-1);
    expect(ende).toBeGreaterThan(anfang);
    const block = flaeche.slice(anfang, ende);
    expect(block).not.toMatch(/catch\s*\{\s*\/\* ignore \*\/\s*\}/);
    expect(block).toContain("setPapierkorbGrund");
    expect(block).toContain("status >= 400");
  });
});
