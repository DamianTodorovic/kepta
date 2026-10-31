// @vitest-environment jsdom
//
// Punkt 4, erste Scheibe — der Tab der Einstellungen verliert sein Gedaechtnis.
//
// Der Zensus (`audit-2026-10-09/feldzug/P4-ZENSUS-EINSTELLUNGEN-3110.md`) nannte einen sichtbaren
// Defekt: `src/components/Settings.tsx:143` haelt den gewaehlten Tab in reinem `useState`. Wer bei
// "Device Sync" oder "MCP / API" steht und die Seite verlaesst, kommt auf "AI & data" zurueck —
// als haette er nichts eingestellt. Jeder andere Regler auf dieser Seite schreibt einen Wert, den
// jemand liest; dieser eine schreibt nirgends hin.
//
// Die Flaechen werden hier am **Inhalt** erkannt, nicht am Behaelter: das System-Feld traegt die
// Spur "Track BM25", der Sync-Schirm seine Verschluesselungs-Abfrage. Ein Test, der auf Klassen
// oder Farben prueft, schlaegt auch dann gruen, wenn nichts zu sehen ist.
//
// Der letzte Fall ist der, der weh tut: ein fremder oder kaputter Wert im Schluessel darf nicht
// einen Tab oeffnen, den es nicht gibt, und nicht die Seite leer zuruecklassen.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, fireEvent, cleanup } from "@testing-library/react";
import { Settings } from "../../src/components/Settings";
import { TAB_SCHLUESSEL, tabLesen, tabSetzen } from "../../src/lib/einstellungenTab";
import { gehoertUns } from "../../src/lib/settings";

const TABS: Array<[string, RegExp]> = [
  ["AI & data", /AI & data/i],
  ["MCP / API", /MCP \/ API/i],
  ["Device Sync", /Device Sync/i],
];

function systemSichtbar(container: HTMLElement) {
  return !!container.querySelector('input[aria-label="Track BM25"]');
}
function syncSichtbar(container: HTMLElement) {
  return !!container.querySelector('input[placeholder^="At least"]');
}

beforeEach(() => {
  localStorage.clear();
  vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 200 })));
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("Punkt 4: der Tab der Einstellungen merkt sich, wo die Hand war", () => {
  it("frisch gestartet liegt die Hand auf dem System-Schirm", () => {
    const erste = render(<Settings />);
    expect(systemSichtbar(erste.container), "der System-Schirm zeigt seine Spuren nicht").toBe(true);
    expect(syncSichtbar(erste.container), "beim ersten Oeffnen steht ein andrer Schirm offen").toBe(false);
  });

  it("ein Klick auf Device Sync oeffnet den Schirm und schreibt den Tab", () => {
    const erste = render(<Settings />);
    fireEvent.click(erste.getByRole("button", { name: /Device Sync/i }));
    expect(syncSichtbar(erste.container), "der Klick hat den Sync-Schirm nicht geoeffnet").toBe(true);
    expect(systemSichtbar(erste.container), "beide Schirme stehen uebereinander").toBe(false);
    expect(localStorage.getItem(TAB_SCHLUESSEL), "der Klick ist nirgends notiert").toMatch(/sync/i);
  });

  it("nach dem Neubeginn liegt die Hand wieder auf dem Schirm, den sie verlassen hat", () => {
    const erste = render(<Settings />);
    fireEvent.click(erste.getByRole("button", { name: /Device Sync/i }));
    cleanup();
    const zweite = render(<Settings />);
    expect(syncSichtbar(zweite.container), "die Seite ist zurueck auf AI & data — das Gedaechtnis fehlt").toBe(true);
    expect(systemSichtbar(zweite.container), "der verlassene Schirm wurde mitgeoeffnet").toBe(false);
  });

  it.each(TABS)("%s ist nach einem Hin und Her wieder offen", (marke, muster) => {
    const erste = render(<Settings />);
    fireEvent.click(erste.getByRole("button", { name: muster }));
    const notiert = localStorage.getItem(TAB_SCHLUESSEL) ?? "";
    cleanup();
    const wieder = render(<Settings />);
    expect(wieder.getByRole("button", { name: muster }).getAttribute("aria-pressed"),
      `${marke}: der Knopf nennt seinen Zustand nicht als gedrueckt`)
      .toBe("true");
    expect(notiert.length > 0, `${marke}: nichts geschrieben`).toBe(true);
  });

  it("ein fremder Wert im Schluessel oeffnet keinen Tab, den es nicht gibt", () => {
    for (const muell of ["", "   ", "system2", "sync; drop", "0", "{}", "undefined"]) {
      localStorage.setItem(TAB_SCHLUESSEL, muell);
      const view = render(<Settings />);
      expect(systemSichtbar(view.container), `Muell "${muell}" haelt die Seite nicht lesbar`).toBe(true);
      expect(view.container.textContent, `Muell "${muell}" laesst die Seite leer werden`).not.toBe("");
      cleanup();
    }
  });

  it("der Schluessel gehoert dem Haus — sonst spiegelt ihn niemand in die Datenbank", () => {
    expect(gehoertUns(TAB_SCHLUESSEL), `${TAB_SCHLUESSEL} faellt durch die Vorregel und bleibt im Browser`).toBe(true);
  });

  it("Lesen und Setzen sind eine Kante: was gesetzt wird, wird gelesen", () => {
    for (const kenne of ["system", "mcp", "sync"] as const) {
      tabSetzen(kenne);
      expect(tabLesen(), `${kenne} kommt nicht zurueck`).toBe(kenne);
    }
  });
});
