import { describe, it, expect } from "vitest";
import { themen } from "../../src/core/klassifikation";
import { THEMA_HINWEISE } from "../../src/lib/graphHierarchy";

// PUNKT 5 / A4 — "projects" darf zwei Drittel des Wissens nicht fressen.
//
// Gemessen 1.11.2026, 01:59 MEZ, an Damians echtem Bestand im ausgelieferten 3.2.106
// (`GET /api/memories/gruppen`, zwei Laeufe, identische Zahlen): 13 600 von 21 064 Notizen
// tragen das Themenwort `projects` = **64,6 %**. Die eigne Latte fuer eine Achse
// (`BAU-P5-VIER-ENTSCHEIDE-2910.md` §5): kein Fach ueber 60 %. Ein Fach, in dem zwei Drittel
// liegen, teilt nichts ein — es zaehlt nur.
//
// Der Grund sitzt in der Regel, nicht in seinem Kopf: sieben der vierzehn Woerter sind
// Selbst- und Werkzeugnamen seiner eignen Arbeit (kepta, k3pta, repo, release, feature,
// theme, sprint). 95 % seines Bestands sind aus Repos gescannt, und ein JSON, das den
// Schluessel "theme" hat, ist kein Projekt — es ist eine Datei.
//
// Was der Schnitt tut: die sieben Woerter verlassen die Regel. Was er nicht tun darf:
// die Achse weicher machen. Darum steht jeder Haelter hier neben jedem Fall.
// Papier: audit-2026-10-09/feldzug/BEFUND-130-ACHSEN-SEIN-BESTAND-1110.md

/** Eine gescannte Datendatei, die ausser dem einen Wort nichts Projektartiges sagt. */
const dateiMit = (wort: string) => ({
  title: "config",
  content: `{ "${wort}": "current" }\n\n— Source: /Users/beispiel/src/config.json`,
  tags: ["machine-scan", "json"],
  quelle: "/Users/beispiel/src/config.json",
});

const GESTRICHEN = ["kepta", "k3pta", "repo", "release", "feature", "theme", "sprint"];

describe("Themen-Achse — sieben Selbst- und Werkzeugwoerter teilen nicht mehr ein", () => {
  it("nennt die Liste, gegen die hier geprueft wird (keine leere Grundgesamtheit)", () => {
    expect(GESTRICHEN.length).toBe(7);
  });

  for (const wort of GESTRICHEN) {
    it(`ein JSON, das nur "${wort}" im Schluessel traegt, ist kein Projekt`, () => {
      const t = themen(dateiMit(wort));
      expect(t, `"${wort}" macht die Datei weiter zu projects: ${JSON.stringify(t)}`).not.toContain("projects");
    });
  }

  it("und die Datei verliert dabei kein anderes Themenwort, das sie wirklich traegt", () => {
    // "anleitung" fuehrt weiter guides — die Regel wird enger, nicht taub.
    const m = { ...dateiMit("repo"), content: dateiMit("repo").content + "\nanleitung" };
    expect(themen(m)).toContain("guides");
  });
});

describe("Themen-Achse — was ein Projekt ist, bleibt ein Projekt", () => {
  const haelter: [string, string][] = [
    ["Mandant Meier fragt nach dem Stand", "mandant"],
    ["Kanzlei Amberg, Termin am Donnerstag", "kanzlei"],
    ["Projekt Nordwind startet", "projekt"],
    ["Auftrag 412 anlegen", "auftrag"],
    ["angelshop braucht neue Preise", "angelshop"],
    ["freqtrade Config sichern", "freqtrade"],
    ["den Shop fuer Kunden oeffnen", "shop"],
  ];
  for (const [text, wort] of haelter) {
    it(`"${wort}" fuehrt weiter zu projects`, () => {
      expect(themen({ title: text, content: text, tags: [] as string[] })).toContain("projects");
    });
  }

  it("ein echtes Projekt mit Repo-Wort darin bleibt erhalten — die Regel streicht ein Wort, nicht ein Thema", () => {
    const m = { title: "Projekt Nordwind", content: "Projekt Nordwind: das repo laeuft auf release 2", tags: [] as string[] };
    expect(themen(m)).toContain("projects");
  });
});

describe("Die Auskunft am Fach nennt nur, was die Regel liest", () => {
  it("der Hinweis zu projects nennt keines der gestrichenen Woerter", () => {
    const hinweis = THEMA_HINWEISE.projects.toLowerCase();
    for (const wort of GESTRICHEN) {
      expect(hinweis, `der Hinweis verspricht weiter "${wort}", die Regel liest es nicht: ${hinweis}`)
        .not.toContain(wort);
    }
  });
});
