import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

// D1-06 und Z-13 haben dieselbe Wurzel: siebzehn Knoten der Seitenleiste
// tragen ihre Farbe als Inline-Stil (Sidebar.tsx:37-42). Eine Inline-Farbe kann
// kein Thema überschreiben und kein `prefers-contrast` erreichen — gemessen im
// hellen Thema: die Leiste zeigt denselben Rotwert #c04a39 wie im dunklen,
// während ihr eigener Registerlaschen-Strich längst var(--accent) = #9c2b1f
// zieht. Zwei Akzente für eine Bedeutung, in einem Fenster.
//
// jsdom hat keine Layout-Engine, also hält dieser Vertrag die *Seite* des
// Paars: der Baum schreibt keine Farbe mehr, und die Regel-Datei antwortet auf
// Thema und Kontrast. Die gewirkten Verhältnisse sind im echten Browser gemessen
// (headless Brave + CDP, `audit-2026-10-09/e3-code/`, Pixel statt getComputedStyle).

const lese = (...teile: string[]) => fs.readFileSync(path.join(process.cwd(), ...teile), "utf-8");

const LEISTE = lese("src", "components", "Sidebar.tsx");
const STIL_PFAD = path.join(process.cwd(), "src", "components", "huelle.css");
const HAT_STIL = fs.existsSync(STIL_PFAD);
const STIL = HAT_STIL ? fs.readFileSync(STIL_PFAD, "utf-8") : "";

/** Alle Flächen, die diese Scheibe besitzt. */
const EIGENE_FLAECHEN = [
  "Sidebar.tsx", "Dashboard.tsx", "TodayView.tsx", "ActivityView.tsx", "DossierView.tsx",
  "Chat.tsx", "CommandPalette.tsx", "ConnectApps.tsx", "MemoryCard.tsx", "DuplicatesPanel.tsx",
  "OnboardingWizard.tsx", "SystemStatus.tsx",
];

describe("Seitenleisten-Farbe: kein Inline-Wert an einer Fläche, die ein Theme trägt", () => {
  it("kennt keine Farb-Literalen im Baum der Leiste", () => {
    const ohneKommentare = LEISTE.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    const hex = ohneKommentare.match(/#(?:[0-9a-fA-F]{3,8})\b/g) ?? [];
    const funktions = ohneKommentare.match(/\brgba?\(/g) ?? [];
    expect({ hex, funktions }).toEqual({ hex: [], funktions: [] });
  });

  it("kennt den Namen nicht, der hell sagt und dunkel meint", () => {
    // ACCENT_LIGHT war #c04a39 — der Akzent des *dunklen* Themas, in beiden
    // Themen benutzt. Der Name war die halbe Verwirrung.
    expect(LEISTE).not.toMatch(/ACCENT_LIGHT/);
  });

  it("zieht die Tinte über eine Regel-Datei, nicht über den Baum", () => {
    expect(HAT_STIL, "src/components/huelle.css fehlt").toBe(true);
    expect(STIL).toMatch(/\.seiten-leiste\s*\{/);
    expect(STIL).toMatch(/--s-tinte/);
  });

  it("zieht den Stahl aus dem System, nicht aus einem eigenen Wert", () => {
    // E1 hat die Triade gesetzt (index.css:112-119, 281-288) — in beiden
    // Themen derselbe Satz. Eine eigene Farbe hier wäre ein zweites System.
    for (const name of ["--side-text", "--side-ruhig", "--side-akzent", "--side-kante", "--side-flaeche", "--side-auswahl"]) {
      expect(STIL, `huelle.css zieht ${name} nicht`).toContain(`var(${name}`);
    }
    // Was das System noch nicht hat, läuft über Fallback — nie über ein Literal,
    // das niemand mehr findet.
    const literale = STIL.replace(/\/\*[\s\S]*?\*\//g, "").match(/#[0-9a-fA-F]{3,8}\b|rgba?\(/g) ?? [];
    expect(literale, `Litale statt Token: ${literale.join(", ")}`).toEqual(["#7fb08a"]);
  });

  it("antwortet auf erhöhten Kontrast", () => {
    expect(STIL).toMatch(/@media\s*\(prefers-contrast:\s*more\)/);
  });

  it("erzwingt erzwungene Farben nicht weg", () => {
    expect(STIL).toMatch(/@media\s*\(forced-colors:\s*active\)/);
  });
});

describe("Keine tote Variable: jede Referenz in der eigenen Fläche ist definiert", () => {
  const index = lese("src", "index.css");
  const definiert = new Set<string>();
  for (const treffer of `${index}\n${STIL}`.matchAll(/(--[a-z0-9-]+)\s*:/g)) definiert.add(treffer[1]);

  for (const datei of EIGENE_FLAECHEN) {
    it(`${datei} verlässt sich auf keinen Wert, den niemand setzt`, () => {
      const text = lese("src", "components", datei).replace(/\/\*[\s\S]*?\*\//g, "");
      const fehlen: string[] = [];
      for (const treffer of text.matchAll(/var\((--[a-z0-9-]+)([^)]*)\)/g)) {
        const name = treffer[1];
        const mitFallback = treffer[2].trim().length > 0;
        if (!definiert.has(name) && !mitFallback) fehlen.push(name);
      }
      expect(fehlen, `${datei}: undefiniert und ohne Fallback → ${fehlen.join(", ")}`).toEqual([]);
    });
  }
});

describe("Seiten-Harmonie: die drei Ebenen bleiben in der Reihenfolge", () => {
  const index = lese("src", "index.css");

  /** oklch-L aus einer Token-Zeile, pro Blockabschnitt. */
  function stufen(block: RegExp, wo: string) {
    const ausschnitt = block.exec(index)?.[0] ?? "";
    const h = (name: string) => {
      const m = new RegExp(`${name}:\\s*oklch\\(\\s*([0-9.]+)`).exec(ausschnitt);
      if (!m) throw new Error(`${name} fehlt im ${wo}-Block`);
      return Number(m[1]);
    };
    return { text: h("--side-text"), ruhig: h("--side-ruhig"), leise: h("--side-leise"), basis: h("--side-basis-2") };
  }

  it("normal: text > ruhig > leise > Stahl", () => {
    const s = stufen(/:root\s*\{[\s\S]*?\n\}/, "Wurzel");
    expect(s.text, `text ${s.text} muss über ruhig ${s.ruhig} liegen`).toBeGreaterThan(s.ruhig);
    expect(s.ruhig, `ruhig ${s.ruhig} muss über leise ${s.leise} liegen`).toBeGreaterThan(s.leise);
    expect(s.leise, `leise ${s.leise} muss über dem Stahl ${s.basis} liegen`).toBeGreaterThan(s.basis);
  });

  it("erhöhter Kontrast: die leiseste Ebene überholt die Beschriftung nicht", () => {
    // Gemessen am 11.10. mit E1s erster Anhebung (0,7516): die Metadaten-Ebene
    // wurde heller als die Navigation — rgb(176,174,168) gegen rgb(164,162,155).
    // Eine Anhebung, die die Rampe dreht, ist kein höherer Kontrast, sondern
    // eine falsche Hierarchie.
    // Der Kontrastblock erklärt **nur, was er anhebt** — was dort fehlt, behält
    // den Basiswert, also wird die ruhige Ebene dort gelesen, wo sie steht.
    const basis = stufen(/:root\s*\{[\s\S]*?\n\}/, "Wurzel");
    const angehoben = /@media\s*\(prefers-contrast:\s*more\)\s*\{[\s\S]*?\n\}/.exec(index)?.[0] ?? "";
    const m = /--side-leise:\s*oklch\(\s*([0-9.]+)/.exec(angehoben);
    if (!m) throw new Error("--side-leise wird im Kontrastblock nicht angehoben — diese Wache meint genau das");
    const leise = Number(m[1]);
    expect(basis.ruhig, `ruhig ${basis.ruhig} muss über dem angehobenen leise ${leise} liegen`).toBeGreaterThan(leise);
    expect(leise, `die Anhebung ${leise} soll über ihrem eigenen Basiswert ${basis.leise} liegen`).toBeGreaterThan(basis.leise);
  });

  it("dunkles Thema zieht dieselben Ebenen wie das helle", () => {
    const hell = stufen(/:root\s*\{[\s\S]*?\n\}/, "Wurzel");
    const dunkel = stufen(/\.dark\s*\{[\s\S]*?\n\}/, "Dunkelblock");
    expect(dunkel).toEqual(hell);
  });
});

describe("Zielgrößen-Vertrag: was klickbar ist, hat eine Fläche", () => {
  // macOS verlangt 28×28 als Default, 20×20 als Minimum (D1 Teil C, Z-08).
  // Die Höhe selbst ist im Browser gemessen; hier hält der Vertrag das Kleid.
  it("gibt jedem Schieber eine greifbare Höhe", () => {
    for (const datei of ["TodayView.tsx", "Chat.tsx", "Dashboard.tsx"]) {
      const text = lese("src", "components", datei);
      const schieber = [...text.matchAll(/<input\b[\s\S]*?\/>/g)].filter((m) => /type="range"/.test(m[0]));
      expect(schieber.length, `${datei}: kein Schieber gefunden — der Vertrag wäre blind`).toBeGreaterThan(0);
      for (const s of schieber) {
        expect(s[0], `${datei}: ein Schieber hat keine Trefferhöhe von 28 px`).toMatch(/(^|[\s"'])h-7\b|min-h-7/);
      }
    }
  });

  it("gibt der Flächen-Kopfzeile und den Segmenten mindestens 28 px", () => {
    const text = lese("src", "components", "Dashboard.tsx");
    expect(text).toMatch(/apple-seg-btn[^"]*min-h-7/);
    const dossier = lese("src", "components", "DossierView.tsx");
    expect(dossier).toMatch(/rounded-full[^"]*min-h-7|min-h-7[^"]*rounded-full/);
  });

  it("lässt keine Klickfläche unter 10 px Schrift stehen", () => {
    // text-[10px] war die Begleiterscheinung des 13-px-Ziels „Scan“.
    const text = lese("src", "components", "Dashboard.tsx");
    const knoepfe = [...text.matchAll(/<button\b[\s\S]{0,400}?className="([^"]*)"/g)].map((m) => m[1]);
    const duenn = knoepfe.filter((k) => /text-\[10px\]/.test(k) && !/min-h-/.test(k));
    expect(duenn, `Knöpfe ohne Mindesthöhe: ${duenn.join(" | ")}`).toEqual([]);
  });
});

describe("Fenster-Zustand: die Fläche weiß, ob sie den Schlüssel hat", () => {
  it("hängt den Zustand an den Rahmen und nicht an eine Farbe", () => {
    const text = lese("src", "components", "Dashboard.tsx");
    expect(text).toMatch(/data-fenster/);
    expect(text).toMatch(/addEventListener\(\s*["']blur["']/);
    expect(text).toMatch(/addEventListener\(\s*["']focus["']/);
    expect(STIL).toMatch(/\[data-fenster=["']?gedaempft/);
  });
});

describe("Zahlen sprechen wie ein Mensch (D2 c, Z7)", () => {
  it("beugt keine Klammer in eine Zahl", () => {
    for (const datei of EIGENE_FLAECHEN) {
      const text = lese("src", "components", datei)
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/^\s*\/\/.*$/gm, "");
      // Nur was ein Mensch liest: einzeilige Zeichenketten und Template-Stücke.
      // Der erste Versuch suchte im ganzen Quelltext und meldete `setInput(s)`
      // als Beugung; der zweite ließ ein Template über 200 Zeilen laufen, weil
      // der Backtick-Anker kein Zeilenende kannte. Beides sind Sondenlügen,
      // keine Befunde.
      const worte = [...text.matchAll(/'([^'\n]*)'|"([^"\n]*)"|`([^`\n]*)`/g)]
        .map((m) => m[1] ?? m[2] ?? m[3] ?? "");
      const klammer = worte.filter((w) => /\b[a-zA-Z]{2,}\((?:s|en)\)/.test(w));
      expect(klammer, `${datei}: ${klammer.join(" | ")} — eine Zahl, keine Klammer`).toEqual([]);
    }
  });
});
