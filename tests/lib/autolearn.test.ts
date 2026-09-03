import { describe, it, expect } from "vitest";
import {
  stripReasoning,
  extractJsonObject,
  parseNode,
  shouldLearn,
  buildExtractPrompt,
  AUTO_LEARN_TIMEOUT_MS,
  isAutoLearnEnabled,
  shouldShowHint,
  AUTOLEARN_KEY,
  AUTOLEARN_HINT_KEY,
} from "../../src/lib/autolearn";

// Hintergrund: Auto-Learn schnitt bisher stur vom ersten "{" bis zum letzten "}".
// Bei Reasoning-Modellen (Qwen3, DeepSeek-R1 u. a.) steht davor ein <think>-Block
// oder blosze Prosa — der Ausschnitt griff dann daneben und JSON.parse warf.
// Der Fehler wurde nur per console.warn geschluckt, sichtbar war nichts.

describe("stripReasoning", () => {
  it("entfernt einen geschlossenen think-Block", () => {
    const t = stripReasoning('<think>Der Nutzer will JSON {a}</think>\n{"title":"X"}');
    expect(t).not.toContain("Der Nutzer");
    expect(t).toContain('{"title":"X"}');
  });

  it("entfernt auch <thinking> und Grossschreibung", () => {
    expect(stripReasoning("<Thinking>egal</Thinking>ok")).toBe("ok");
  });

  it("verwirft einen nicht geschlossenen think-Block bis zum Ende", () => {
    // Passiert bei abgeschnittenen Antworten (max_tokens erreicht).
    expect(stripReasoning("<think>ich denke noch")).toBe("");
  });

  it("laesst Text ohne Reasoning unveraendert", () => {
    expect(stripReasoning('  {"a":1}  ')).toBe('{"a":1}');
  });
});

describe("extractJsonObject", () => {
  it("findet reines JSON", () => {
    expect(extractJsonObject('{"a":1}')).toBe('{"a":1}');
  });

  it("findet JSON nach Prosa", () => {
    expect(extractJsonObject('Hier ist das Ergebnis:\n{"a":1}\nFertig.')).toBe('{"a":1}');
  });

  it("behaelt verschachtelte Objekte vollstaendig", () => {
    expect(extractJsonObject('x {"a":{"b":2}} y')).toBe('{"a":{"b":2}}');
  });

  it("laesst sich von Klammern in Zeichenketten nicht taeuschen", () => {
    // Genau hier scheiterte der alte Ausschnitt-Ansatz.
    expect(extractJsonObject('{"t":"ein } in Text"}')).toBe('{"t":"ein } in Text"}');
  });

  it("beachtet maskierte Anfuehrungszeichen", () => {
    expect(extractJsonObject('{"t":"er sagte \\"hallo\\""}')).toBe('{"t":"er sagte \\"hallo\\""}');
  });

  it("nimmt das erste vollstaendige Objekt, nicht bis zur letzten Klammer", () => {
    expect(extractJsonObject('{"a":1} Nachwort {b}')).toBe('{"a":1}');
  });

  it("liefert null ohne Objekt", () => {
    expect(extractJsonObject("nur Prosa")).toBeNull();
    expect(extractJsonObject('{"unvollstaendig":')).toBeNull();
  });
});

describe("parseNode", () => {
  const fallback = "Die vollstaendige Antwort als Rueckfall.";

  it("liest Titel, Tags und Zusammenfassung", () => {
    const n = parseNode('{"title":"Carbonara","tags":["kochen","rezept"],"summary":"Ohne Sahne."}', fallback);
    expect(n?.title).toBe("Carbonara");
    expect(n?.tags).toContain("kochen");
    expect(n?.summary).toBe("Ohne Sahne.");
  });

  it("haengt immer den Marker auto-learn an", () => {
    expect(parseNode('{"title":"X","tags":["a"],"summary":"y"}', fallback)?.tags).toContain("auto-learn");
  });

  it("normalisiert Tags und wirft Unbrauchbares weg", () => {
    const n = parseNode('{"title":"X","tags":["Gross Schrift","!!!","ok-1"],"summary":"y"}', fallback);
    expect(n?.tags).toContain("grossschrift");
    expect(n?.tags).toContain("ok-1");
    expect(n?.tags).not.toContain("!!!");
  });

  it("begrenzt die Tag-Anzahl", () => {
    const many = JSON.stringify({ title: "X", tags: ["a", "b", "c", "d", "e", "f", "g", "h"], summary: "y" });
    expect(parseNode(many, fallback)!.tags.length).toBeLessThanOrEqual(6);
  });

  it("kuerzt zu lange Titel", () => {
    const n = parseNode(JSON.stringify({ title: "T".repeat(200), tags: [], summary: "y" }), fallback);
    expect(n!.title.length).toBeLessThanOrEqual(80);
  });

  it("faellt auf die Antwort zurueck, wenn summary fehlt", () => {
    expect(parseNode('{"title":"X","tags":[]}', fallback)?.summary).toBe(fallback);
  });

  it("setzt einen Ersatztitel, wenn keiner kommt", () => {
    expect(parseNode('{"tags":[],"summary":"y"}', fallback)?.title).toBeTruthy();
  });

  it("liefert null bei kaputtem JSON", () => {
    expect(parseNode("kein json", fallback)).toBeNull();
    expect(parseNode('{"title":', fallback)).toBeNull();
  });

  it("liefert null, wenn das JSON kein Objekt ist", () => {
    expect(parseNode("[1,2,3]", fallback)).toBeNull();
  });

  it("verarbeitet Reasoning-Antworten mit think-Block", () => {
    const raw = '<think>Ich ueberlege {kurz}</think>\n{"title":"Y","tags":["t"],"summary":"s"}';
    expect(parseNode(raw, fallback)?.title).toBe("Y");
  });
});

describe("shouldLearn", () => {
  it("lehnt zu kurze Antworten ab", () => {
    expect(shouldLearn("ok")).toBe(false);
  });

  it("nimmt lange Antworten an", () => {
    expect(shouldLearn("x".repeat(80))).toBe(true);
  });

  it("nimmt kurze mehrzeilige Antworten an", () => {
    expect(shouldLearn("Zeile eins\nZeile zwei mit etwas mehr Text")).toBe(true);
  });

  it("lehnt Leerraum ab", () => {
    expect(shouldLearn("   \n  ")).toBe(false);
  });
});

describe("buildExtractPrompt", () => {
  it("enthaelt die Antwort und fordert reines JSON", () => {
    const p = buildExtractPrompt("Carbonara ohne Sahne.");
    expect(p).toContain("Carbonara ohne Sahne.");
    expect(p).toMatch(/NUR als JSON/i);
  });

  it("begrenzt sehr lange Antworten", () => {
    expect(buildExtractPrompt("x".repeat(20000)).length).toBeLessThan(6000);
  });
});

describe("isAutoLearnEnabled — Opt-in", () => {
  const read = (v: Record<string, string>) => (k: string) => v[k] ?? null;

  it("ist ohne Einstellung AUS", () => {
    // Bewusst Opt-in: die Funktion loest pro Antwort einen zweiten Modellaufruf aus.
    expect(isAutoLearnEnabled(read({}))).toBe(false);
  });

  it("ist bei 'true' an", () => {
    expect(isAutoLearnEnabled(read({ [AUTOLEARN_KEY]: "true" }))).toBe(true);
  });

  it("ist bei 'false' aus", () => {
    expect(isAutoLearnEnabled(read({ [AUTOLEARN_KEY]: "false" }))).toBe(false);
  });

  it("ist bei Unsinn aus", () => {
    expect(isAutoLearnEnabled(read({ [AUTOLEARN_KEY]: "vielleicht" }))).toBe(false);
  });
});

describe("shouldShowHint", () => {
  const read = (v: Record<string, string>) => (k: string) => v[k] ?? null;

  it("zeigt den Hinweis, solange Auto-Learn aus und ungesehen ist", () => {
    expect(shouldShowHint(read({}))).toBe(true);
  });

  it("zeigt ihn nicht erneut, wenn er gesehen wurde", () => {
    expect(shouldShowHint(read({ [AUTOLEARN_HINT_KEY]: "seen" }))).toBe(false);
  });

  it("zeigt ihn nicht, wenn Auto-Learn bereits an ist", () => {
    expect(shouldShowHint(read({ [AUTOLEARN_KEY]: "true" }))).toBe(false);
  });
});

describe("Zeitlimit", () => {
  it("ist gesetzt und plausibel", () => {
    // Ohne Limit haengt der Hintergrundaufruf bei langsamen lokalen Modellen ewig.
    expect(AUTO_LEARN_TIMEOUT_MS).toBeGreaterThan(5_000);
    expect(AUTO_LEARN_TIMEOUT_MS).toBeLessThanOrEqual(120_000);
  });
});
