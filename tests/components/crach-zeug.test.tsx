/* P190: die Fenster-Wache. Der React-Fehlerschirm fängt nur Render-Würfe —
   ein Absturz in einem Klick-Handler oder einer Nebenläufigkeit fliegt an ihm
   vorbei, und das Fenster bleibt schwarz (Damians Blackscreen, 9.11.: er kann
   den Fehler nicht lesen, also kann niemand ihn heilen). Diese Wache hängt an
   window.onerror und unhandledrejection und malt den Fehler als rohes DOM
   (unabhängig von React) auf den Bildschirm — mit Kopier-Knopf. Damian
   fotografiert den Text, die Stelle ist benannt. */
// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { spanneCrashWachter, crashZeile } from "../../src/lib/crashZeug";

afterEach(() => {
  document.body.innerHTML = "";
  vi.restoreAllMocks();
});

describe("P190: ein Absturz zeigt sich als Text, nicht als Schwarz", () => {
  it("ein window-Fehler malt das Overlay mit Meldung und Fundstelle", () => {
    spanneCrashWachter();
    const fehle = new Error("Das ist der Absturz");
    const ereignis = new ErrorEvent("error", {
      message: "Das ist der Absturz",
      filename: "dist/assets/index.js",
      lineno: 42,
      error: fehle,
    });
    window.dispatchEvent(ereignis);
    const zeichnung = document.querySelector('[data-testid="crash-zeichnung"]');
    expect(zeichnung, "das Overlay muss da sein").not.toBeNull();
    // Die Fläche trägt den FESTEN Satz und die Fundstelle — die Meldung selbst
    // reist in die Konsole und die Zwischenablage (P47: der rohe Wortlaut bleibt
    // von der Fläche, Damian kopiert ihn mit einem Knopf).
    expect(zeichnung?.textContent).toContain("K3PTA ist an dieser Stelle abgestürzt");
    expect(zeichnung?.textContent).toContain("index.js:42");
  });

  it("eine unerledigte Zusage malt denselben Text", () => {
    spanneCrashWachter();
    // Das Versprechen selbst wird gefangen — sonst meldet vitest die echte
    // unerledigte Zusage und der Lauf endet rot, obwohl die Wache grün ist.
    const zusagePromis = Promise.reject(new Error("Zusage crasht"));
    zusagePromis.catch(() => { /* nur das Event soll es tragen */ });
    const zusage = new PromiseRejectionEvent("unhandledrejection", {
      promise: zusagePromis,
      reason: new Error("Zusage crasht"),
    });
    window.dispatchEvent(zusage);
    const zeichnung = document.querySelector('[data-testid="crash-zeichnung"]');
    expect(zeichnung, "das Overlay muss auch bei einer Zusage da sein").not.toBeNull();
    expect(zeichnung?.textContent).toContain("K3PTA ist an dieser Stelle abgestürzt");
  });

  it("der Kopier-Knopf trägt den Crash-Zeile-Text — Damian drückt kopieren, nicht abschreiben", () => {
    spanneCrashWachter();
    window.dispatchEvent(new ErrorEvent("error", { message: "x ist kein Objekt", error: new Error("x ist kein Objekt") }));
    const knopf = document.querySelector('[data-testid="crash-kopieren"]');
    expect(knopf, "der Kopier-Knopf muss da sein").not.toBeNull();
    // Die Zwischenablage-Zeile trägt Meldung + Fundstelle — Damian schickt sie.
    expect(crashZeile("x ist kein Objekt", "app.js:7")).toContain("x ist kein Objekt");
    expect(crashZeile("x ist kein Objekt", "app.js:7")).toContain("app.js:7");
  });

  it("schließen bleibt möglich — die Fläche kann weiterarbeiten, wenn der Absturz überlebt wurde", () => {
    spanneCrashWachter();
    window.dispatchEvent(new ErrorEvent("error", { message: "kleiner Kratzer", error: new Error("kleiner Kratzer") }));
    const schliessen = document.querySelector<HTMLButtonElement>('[data-testid="crash-schliessen"]');
    schliessen?.click();
    expect(document.querySelector('[data-testid="crash-zeichnung"]')).toBeNull();
  });
});
