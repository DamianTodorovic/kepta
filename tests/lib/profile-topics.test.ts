// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest";
import { createDefaultProfile, loadProfile, normalizeTopics, MAX_TOPICS, MAX_TOPIC_LENGTH } from "../../src/lib/profile";
import { starterNotes } from "../../src/lib/starter";

// Der Einrichtungsassistent bot acht feste Kategorien an, zwei davon aus dem
// Umfeld des Autors ("Fishing — Bait, rods, spots", "Dropshipping"). Wer KEPTA
// fuer eine Kanzlei geprueft hat, bekam als Erstes Angelkoeder angeboten.
// Schlimmer als die Optik: jede Kategorie schrieb fremde Notizen in die
// Datenbank des Nutzers — Forellenkoeder, Angelknoten, Shopify-Pflichtseiten.
// Bei einem Gedaechtnis, dessen Versprechen "dein Wissen" ist, ist das falsch.
//
// Neu: der Nutzer tippt seine Themen selbst. Keine Liste, keine Fremdinhalte.

const PROFILE_KEY = "ki_gehirn_adaptive_profile";

beforeEach(() => {
  localStorage.clear();
});

describe("normalizeTopics", () => {
  it("nimmt die Worte des Nutzers unveraendert an", () => {
    expect(normalizeTopics(["Mandatsakten", "Fristen"])).toEqual(["Mandatsakten", "Fristen"]);
  });

  it("trimmt, wirft Leeres weg und entfernt Doppelte ohne Ruecksicht auf Gross-/Kleinschreibung", () => {
    expect(normalizeTopics(["  Recht ", "", "recht", "   ", "Steuern"])).toEqual(["Recht", "Steuern"]);
  });

  it("begrenzt die Anzahl", () => {
    const viele = Array.from({ length: MAX_TOPICS + 5 }, (_, i) => `Thema ${i}`);
    expect(normalizeTopics(viele)).toHaveLength(MAX_TOPICS);
  });

  it("begrenzt die Laenge eines einzelnen Themas", () => {
    const lang = "x".repeat(MAX_TOPIC_LENGTH + 50);
    expect(normalizeTopics([lang])[0]!.length).toBe(MAX_TOPIC_LENGTH);
  });

  it("vertraegt Unfug, ohne zu werfen", () => {
    expect(normalizeTopics(undefined as never)).toEqual([]);
    expect(normalizeTopics(null as never)).toEqual([]);
    expect(normalizeTopics([42, null, undefined, {}] as never)).toEqual([]);
  });
});

describe("createDefaultProfile", () => {
  it("startet mit leeren Themen statt einer vorgegebenen Kategorie", () => {
    const p = createDefaultProfile();
    expect(p.topics).toEqual([]);
    expect(p.hasCompletedOnboarding).toBe(false);
  });
});

describe("loadProfile: Migration alter Profile", () => {
  it("uebersetzt alte useCases in eigene Themen, damit niemand seine Auswahl verliert", () => {
    localStorage.setItem(
      PROFILE_KEY,
      JSON.stringify({ displayName: "Alt", useCases: ["ki", "coding"], goal: "", customNote: "", createdAt: 1, updatedAt: 1, detectedAIs: [], hasCompletedOnboarding: true })
    );
    const p = loadProfile();
    expect(p).not.toBeNull();
    expect(p!.topics.length).toBe(2);
    // Die alten Schluessel waren intern und teils deutsch — der Nutzer sieht Klartext.
    expect(p!.topics.join(" ")).not.toMatch(/\bki\b|\bcoding\b/);
  });

  it("laesst ein Profil mit eigenen Themen unangetastet", () => {
    localStorage.setItem(
      PROFILE_KEY,
      JSON.stringify({ displayName: "Neu", topics: ["Mandatsakten", "Fristen"], goal: "", customNote: "", createdAt: 1, updatedAt: 1, detectedAIs: [], hasCompletedOnboarding: true })
    );
    expect(loadProfile()!.topics).toEqual(["Mandatsakten", "Fristen"]);
  });

  it("ein Profil ganz ohne Themenfeld ergibt eine leere Liste, kein Absturz", () => {
    localStorage.setItem(PROFILE_KEY, JSON.stringify({ displayName: "Ohne", createdAt: 1, updatedAt: 1 }));
    expect(loadProfile()!.topics).toEqual([]);
  });
});

describe("starterNotes", () => {
  it("legt nur Notizen ueber KEPTA selbst an, nichts aus fremden Fachgebieten", () => {
    const notizen = starterNotes();
    expect(notizen.length).toBeGreaterThan(0);
    const text = JSON.stringify(notizen).toLowerCase();
    for (const fremd of ["trout", "forelle", "bait", "koeder", "clinch", "palomar", "shopify", "dropship", "ustg"]) {
      expect(text, `Starternotizen enthalten Fremdinhalt: ${fremd}`).not.toContain(fremd);
    }
  });

  it("jede Notiz hat Titel, Inhalt und Schlagworte", () => {
    for (const n of starterNotes()) {
      expect(n.title.trim().length).toBeGreaterThan(0);
      expect(n.content.trim().length).toBeGreaterThan(0);
      expect(Array.isArray(n.tags)).toBe(true);
    }
  });

  it("liefert keine doppelten Titel", () => {
    const titel = starterNotes().map((n) => n.title);
    expect(new Set(titel).size).toBe(titel.length);
  });
});