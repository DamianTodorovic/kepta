// P47/#47 — der Helfer selbst, nicht nur seine Zahl im Quelltext.
//
// zwei Fragen, beide am Verhalten gemessen:
//   1. Was darf von der Tuer auf die Flaeche? (tuerSatz)
//   2. Was passiert mit allem anderen?       (absage — Grund ins Protokoll, Satz nach aussen)
// Der Befund, der die Klasse aufgemacht hat, war ein Pfad auf einem Knopf:
// `QuotaExceededError: the quota has been exceeded — /Users/a/.kepta/kepta.db` (3.2.130,
// gefunden von scripts/pfade-im-fenster.mjs bei 820 px).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { absage } from "../src/lib/absage";
import { ApiFehler, tuerSatz } from "../src/lib/api";

describe("tuerSatz: nur einzeilige Kurzsätze aus der eignen Tür", () => {
  it("lässt einen Satz durch, den die Tuer geschrieben hat", () => {
    expect(tuerSatz("Pick the two notes that disagree.", "HTTP 400")).toBe("Pick the two notes that disagree.");
  });

  it("wirft einen Text mit Pfad zurück — das ist der Befund von 3.2.130", () => {
    expect(tuerSatz("/Users/a/.kepta/kepta.db", "HTTP 500")).toBe("HTTP 500");
    expect(tuerSatz("open ~/Desktop/thing.txt", "HTTP 500")).toBe("HTTP 500");
    expect(tuerSatz("C:\\Users\\a\\kepta.db", "HTTP 500")).toBe("HTTP 500");
    expect(tuerSatz("rel ../x/y", "HTTP 500")).toBe("HTTP 500");
    expect(tuerSatz("/tmp/kepta.db", "HTTP 500")).toBe("HTTP 500");
  });

  it("laesst eine Auskunft mit Schragsstrich durch — nur die Pfadform faellt raus", () => {
    expect(tuerSatz("Chat Rate-Limit: max 20/min", "HTTP 429")).toBe("Chat Rate-Limit: max 20/min");
    expect(tuerSatz("a files array (1..5000) is required", "HTTP 400")).toBe("a files array (1..5000) is required");
    expect(tuerSatz("Such-Limit: max 100/min", "HTTP 429")).toBe("Such-Limit: max 100/min");
  });

  it("kennt seine Kappe und seine Zeile", () => {
    expect(tuerSatz("x".repeat(161), "HTTP 500")).toBe("HTTP 500");
    expect(tuerSatz("x".repeat(160), "HTTP 500")).toBe("x".repeat(160));
    expect(tuerSatz("zwei\nZeilen", "HTTP 500")).toBe("HTTP 500");
  });

  it("lässt leeren Form und Nicht-Text nicht durch", () => {
    expect(tuerSatz("   ", "HTTP 500")).toBe("HTTP 500");
    expect(tuerSatz(undefined, "HTTP 500")).toBe("HTTP 500");
    expect(tuerSatz({ msg: "kein String" }, "HTTP 500")).toBe("HTTP 500");
    expect(tuerSatz(42, "HTTP 500")).toBe("HTTP 500");
  });

  it("kürzt vor der Länge, nicht danach — ein Satz mit Rand darf durch", () => {
    expect(tuerSatz(`  ${"y".repeat(160)}  `, "HTTP 500")).toBe("y".repeat(160));
  });
});

describe("absage: die Herkunft entscheidet, was der Nutzer sieht", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });
  afterEach(() => vi.restoreAllMocks());

  it("gibt den eignen Satz und den Grund der Tuer zurück — beides, nicht eins", () => {
    const fest = "The pair could not be resolved.";
    expect(absage(fest, new ApiFehler("Pick the two notes that disagree.", 400))).toBe(
      "The pair could not be resolved. (Pick the two notes that disagree.)",
    );
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining(fest));
    expect(console.error).not.toHaveBeenCalled();
  });

  it("gibt den Grund nie ohne den Satz — die Flaeche nennt immer, was fehlschlug", () => {
    const grund = "disk full";
    const text = absage("The switch did not stay.", new ApiFehler(grund, 500));
    expect(text.startsWith("The switch did not stay.")).toBe(true);
    expect(text).toContain(grund);
  });

  it("zeigt einer Bibliotheks-Ausnahme nur den festen Satz — der Grund bleibt im Protokoll", () => {
    const fest = "Import did not run — the reason is in the developer console.";
    const wurf = new TypeError("Failed to fetch /Users/a/.kepta/kepta.db");
    expect(absage(fest, wurf)).toBe(fest);
    expect(console.error).toHaveBeenCalledWith(`kepta: ${fest}`, wurf);
  });

  it("wirft keinen leeren Satz heraus, wenn ein ApiFehler ohne Text daher kommt", () => {
    const fest = "The list did not arrive.";
    expect(absage(fest, new ApiFehler("   ", 500))).toBe(fest);
    expect(console.error).toHaveBeenCalledOnce();
  });

  it("hält einem String, der gar keine Ausnahme ist, den festen Satz entgegen", () => {
    const fest = "The switch could not be saved.";
    expect(absage(fest, "disk full")).toBe(fest);
  });
});
