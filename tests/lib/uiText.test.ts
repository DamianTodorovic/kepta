// @vitest-environment jsdom
//
// Texte und Schriftgroesse. K3PTA ist englisch — der Deutsch-Umschalter aus
// 2.10 ist entfernt (11.9.2026).
import { describe, it, expect, beforeEach } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import ts from "typescript";
import { t, getZoom, setZoom, wendeZoomAn, TEXTE } from "../../src/lib/uiText";

/**
 * Deutsch erkennt die Wache an der Orthographie und an Vokabeln, die es im
 * Englischen nicht gibt. Zweideutige Woerter (Test, Status, Probe, Daten) hoeren
 * nicht rein — sie haengen die Wache an englischem Text auf.
 * Grenze, ehrlich benannt: ein deutsches Wort ohne Umlaut ausserhalb dieser Liste
 * entkommt. Gefunden hat es bis heute die Sonde am Bild.
 */
const UMLAUT = /[äöüßÄÖÜ]/;
const VOKABELN = /\b(und|oder|aber|nicht|mit|von|der|die|das|ist|sind|werden|wurde|kann|muss|speichert|gespeichert|Konfiguration|Einstellungen|Einstellung|Suche|Datei|Quellen?|Heute|Alle|Wissen|kein[emrs]?|über|nach|vor|als|wenn|dann|sonst|auch|noch|schon|bitte|danke|Fehler|Hinweis|Wertung|Werkzeug|Werkzeuge|Benutzer|Nutzer|Ordner|Auswahl|Anzeige|Antwort|Frage|Speicher)\b/;
const deutsch = (text: string) => UMLAUT.test(text) || VOKABELN.test(text);

/**
 * Sichttext der Flaeche: was zwischen zwei JSX-Markern steht und was ein
 * Attribut einem Menschen zeigt. Bis zum 16.10. sah diese Wache nur die
 * TEXTE-Tabelle — ein Wort direkt im JSX („Konfiguration gespeichert",
 * Settings.tsx:707) entkam ihr, weil die Tabelle es nie enthielt.
 * Kommentare zaehlen nicht: die liest kein Mensch auf dem Schirm.
 */
const SICHT_ATTRIBUTE = ["label", "title", "placeholder", "alt", "aria-label", "text", "fix", "detail", "hint"];

interface Sichttext { datei: string; zeile: number; wo: string; text: string }

function tsDateien(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = path.join(dir, name);
    if (statSync(p).isDirectory()) return tsDateien(p);
    return name.endsWith(".tsx") ? [p] : [];
  });
}

function sichtbareTexte(): Sichttext[] {
  const wurzel = path.resolve(process.cwd(), "src/components");
  const funde: Sichttext[] = [];
  for (const datei of tsDateien(wurzel)) {
    const ast = ts.createSourceFile(datei, readFileSync(datei, "utf8"), ts.ScriptTarget.ESNext, true, ts.ScriptKind.TSX);
    const rel = path.relative(process.cwd(), datei);
    const zeileVon = (pos: number) => ast.getLineAndCharacterOfPosition(pos).line + 1;
    const notiere = (knoten: ts.Node, wo: string, text: string) => {
      const sauber = text.replace(/\s+/g, " ").trim();
      if (sauber) funde.push({ datei: rel, zeile: zeileVon(knoten.pos), wo, text: sauber });
    };
    const zeichen = (knoten: ts.Node): string | null =>
      ts.isStringLiteral(knoten) ? knoten.text : ts.isNoSubstitutionTemplateLiteral(knoten) ? knoten.text : null;
    (function durchlauf(knoten: ts.Node) {
      if (ts.isJsxText(knoten)) notiere(knoten, "JsxText", knoten.text);
      if (ts.isJsxAttribute(knoten) && ts.isIdentifier(knoten.name) && SICHT_ATTRIBUTE.includes(knoten.name.text) && knoten.initializer) {
        const init = knoten.initializer;
        const direkt = zeichen(init);
        if (direkt !== null) notiere(init, `@${knoten.name.text}`, direkt);
        else if (ts.isJsxExpression(init) && init.expression) {
          const ausdruck = zeichen(init.expression);
          if (ausdruck !== null) notiere(init.expression, `@${knoten.name.text}`, ausdruck);
        }
      }
      ts.forEachChild(knoten, durchlauf);
    })(ast);
  }
  return funde;
}

describe("uiText", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("t() liefert den englischen Text und fällt auf den Schlüssel zurück", () => {
    expect(t("nav.knowledge")).toBe("Knowledge");
    expect(t("list.byFile")).toBe("By file");
    expect(t("gibt.es.nicht")).toBe("gibt.es.nicht");
  });

  it("eine alte Spracheinstellung aus 2.10 ändert nichts mehr", () => {
    localStorage.setItem("ki_gehirn_sprache", "de");
    expect(t("nav.knowledge")).toBe("Knowledge");
    expect(t("list.noSource")).toBe("No source");
  });

  it("kein Eintrag ist deutsch", () => {
    for (const [k, v] of Object.entries(TEXTE)) {
      expect(v.trim().length, `${k} ist leer`).toBeGreaterThan(0);
      expect(deutsch(v), `${k}: „${v}“ ist nicht englisch`).toBe(false);
    }
  });

  it("Zoom kennt nur 100/115/130 — alles andere fällt auf 100", () => {
    setZoom(130);
    expect(getZoom()).toBe(130);
    localStorage.setItem("ki_gehirn_zoom", "999");
    expect(getZoom()).toBe(100);
  });
});

describe("wendeZoomAn", () => {
  it("setzt body.zoom und räumt bei 100 % auf", () => {
    setZoom(115);
    wendeZoomAn();
    expect(document.body.style.zoom).toBe("1.15");
    setZoom(100);
    wendeZoomAn();
    expect(document.body.style.zoom).toBe("");
  });
});

describe("uiText: kaputtes localStorage", () => {
  it("t(), setZoom und getZoom überleben ein werfendes localStorage", () => {
    const original = window.localStorage;
    Object.defineProperty(window, "localStorage", {
      value: {
        getItem: () => { throw new Error("kaputt"); },
        setItem: () => { throw new Error("kaputt"); },
      },
      configurable: true,
    });
    try {
      setZoom(130); // darf nicht werfen
      expect(getZoom()).toBe(100);
      expect(t("nav.chat")).toBe("Chat");
    } finally {
      Object.defineProperty(window, "localStorage", { value: original, configurable: true });
    }
  });
});

describe("Waechter: die Flaeche bleibt englisch", () => {
  const texte = sichtbareTexte();

  it("die Sonde sieht JSX-Text — sonst ist jede Wache in diesem Block taub", () => {
    // 703 Sichttexte gemessen am 16.10. (Sonde set1-code/b7-sichttext-sonde.mts).
    // Die Latte ist absichtlich grob: sie prueft nur, dass der Baum geparst wird.
    expect(texte.length, "die Sonde sieht fast nichts — Parser oder Wurzel geaendert?").toBeGreaterThan(300);
    // Ein Wort, das nur im JSX steht und in keiner Tabelle: genau die Klasse,
    // die dem frueheren Waechter entkam.
    const nurInJsx = texte.filter((x) => x.wo === "JsxText" && !Object.values(TEXTE).includes(x.text));
    expect(nurInJsx.length, "kein einziges JSX-Wort ausserhalb der Tabelle? Sonde defekt").toBeGreaterThan(50);
    expect(deutsch("Konfiguration gespeichert")).toBe(true);
    expect(deutsch("Configuration saved")).toBe(false);
    expect(deutsch("Hide personal data from cloud AI")).toBe(false);
    expect(deutsch("Search… (⌘K for commands)")).toBe(false);
  });

  it("kein sichtbarer Text der Flaeche ist deutsch", () => {
    const treff = texte.filter((x) => deutsch(x.text)).map((x) => `${x.datei}:${x.zeile} [${x.wo}] „${x.text.slice(0, 70)}“`);
    expect(treff).toEqual([]);
  });
});
