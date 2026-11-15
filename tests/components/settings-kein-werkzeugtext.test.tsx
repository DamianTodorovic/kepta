// @vitest-environment jsdom
// Punkt 7, 2.11. — ein Nutzersatz nennt kein Werkzeug.
//
// Zwei Erstleser ohne Projektkenntnis (dieselbe Datei, zwei unabhaengige Laeufe, 2.11.) stossen
// beide auf denselben Satz in den Einstellungen: "The switch lives in localStorage
// ki_gehirn_autolearn … saves title/tags/summary as a new node." Der eine nannte ihn "a note to a
// programmer", der andere wollte wissen, was "node" hier heisst — wo die Flaeche doch sonst
// "note" sagt. Ein interner Name auf einer Flaeche ist kein Detail: er verraet, dass es zwei
// Namen fuer dieselbe Sache gibt, und der Nutzer hat keinen Schluessel, welchen er suchen soll.
//
// Diese Datei haelt die Seite, die der Nutzer sieht, und die Seite, die der Code braucht: der
// Schalter muss weiter unter demselben Schlussel liegen (zweiter Fall), aber sein Wort darf auf
// der Flaeche nicht mehr vorkommen.
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, waitFor } from "@testing-library/react";
import { Settings } from "../../src/components/Settings";
import { ToastProvider } from "../../src/components/ui/Toast";

function stubFetch() {
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
    ok: true, count: 3, uptime: 12, models: ["llama3.2"], protocol: "2026-07-28", tools: [],
  }), { status: 200, headers: { "content-type": "application/json" } })));
}

async function zeige() {
  const { container } = render(<ToastProvider><Settings /></ToastProvider>);
  await waitFor(() => expect(container.textContent).toMatch(/Auto-learn/i));
  return (container.textContent || "").replace(/\s+/g, " ");
}

beforeEach(() => {
  localStorage.clear();
  stubFetch();
});
afterEach(() => { vi.unstubAllGlobals(); });

describe("Punkt 7: die Einstellungen erzaehlen dem Nutzer kein Werkzeug", () => {
  it("nennt auf der Flaeche keinen Speicherschluessel, keinen internen Namen, kein Feldschema", async () => {
    const text = await zeige();
    expect(text, `ein Speicher-Schluessel steht auf dem Schirm: ${text.slice(0, 400)}`).not.toMatch(/localStorage/i);
    expect(text, `ein interner Schlussel steht auf dem Schirm: ${text.slice(0, 400)}`).not.toMatch(/ki_gehirn_/);
    expect(text, `ein Feldschema steht in einem Nutzersatz: ${text.slice(0, 400)}`).not.toMatch(/title\/tags\/summary/);
  });

  it("sagt in einem Satz, was der Schalter tut, und dass die Antwort kommt", async () => {
    const text = await zeige();
    expect(text, `kein Satz ueber die Spanne: ${text.slice(0, 400)}`).toMatch(/60 characters or more/i);
    expect(text, `der Schalter nennt nicht, dass er im Hintergrund arbeitet: ${text.slice(0, 400)}`).toMatch(/background/i);
    expect(text, `die Notiz heisst hier nicht Notiz: ${text.slice(0, 400)}`).toMatch(/saved as a new note/i);
  });

  it("laesst den Schalter trotzdem unter demselben Schlussel liegen (der Code, nicht die Flaeche)", () => {
    const quelltext = readFileSync("src/components/Settings.tsx", "utf8");
    expect(quelltext, "der Schalter liegt nicht mehr unter ki_gehirn_autolearn — Bestandsinstallationen verlieren ihn").toMatch(/localStorage\.(getItem|setItem)\(\s*['"]ki_gehirn_autolearn['"]/);
  });
});
