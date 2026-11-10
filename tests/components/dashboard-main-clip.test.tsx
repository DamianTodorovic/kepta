// @vitest-environment jsdom
//
// P195: die Bühne des Blackscreens steht fest — `main` trägt `overflow-clip`.
//
// Gemessen am echten Fenster (10.11., 20:52): Damian sah das leere Panel, während
// das DOM die Settings-Seite vollständig hielt (6938 Zeichen, sichtbar, 814 px).
// Die Spur: `main.scrollTop = 1455` bei `scrollHeight = 2269` — ein Fokus außer-
// halb der sichtbaren Ansicht ließ den Browser JEDEN scrollbaren Ahnen anziehen,
// und `overflow-hidden` verweigert das Scrollen nicht (nur die Leiste fehlt).
// Die sichtbare Hülle fuhr aus dem Fenster; übrig blieb der leere Panel-Rahmen.
// Die Heilung war ein Griff: `scrollTop = 0` — das Bild kam sofort zurück.
//
// `overflow: clip` verweigert das Scrollen vollständig (auch programmatisch).
// Die Wache hält die Klasse fest: wer `hidden` zurückbaut, baut den
// Blackscreen-Mechanismus wieder ein. Der Auslöser (wer dort fokussiert) bleibt
// ein eigener Auftrag — die Bühne steht aber schon fest.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, act } from "@testing-library/react";
import { Dashboard } from "../../src/components/Dashboard";
import { AuthProvider } from "../../src/contexts/AuthContext";
import { ThemeProvider } from "../../src/contexts/ThemeContext";
import { ToastProvider } from "../../src/components/ui/Toast";
import { installiereResizeObserver } from "../helfer/canvas";

beforeEach(() => { installiereResizeObserver(); });
afterEach(() => { vi.unstubAllGlobals(); });

describe("P195: die Bühne des Blackscreens steht fest", () => {
  it("main trägt overflow-clip und niemals wieder overflow-hidden", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ count: 0, total: 0, memories: [] }), { status: 200, headers: { "content-type": "application/json", "x-kepta-total": "0" } })));
    const view = render(
      <AuthProvider><ThemeProvider><ToastProvider><Dashboard /></ToastProvider></ThemeProvider></AuthProvider>
    );
    await act(async () => { await new Promise((r) => setTimeout(r, 300)); });
    const main = view.container.querySelector("main");
    expect(main, "main fehlt — die Fläche hat ihre Form geändert").not.toBeNull();
    expect(main!.className, "main ist nicht geclippt — der Scroll-Raub ist offen").toContain("overflow-clip");
    expect(main!.className, "overflow-hidden lässt den Scroll-Raub wieder zu").not.toContain("overflow-hidden");
  });
});
