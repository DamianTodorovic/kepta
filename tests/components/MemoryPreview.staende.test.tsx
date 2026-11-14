// @vitest-environment jsdom
//
// BAU-P3-11, dritter Schritt (24.10. 00:5x MESZ): die FLAECHE der Staende - Latte-Zeile 8.
//
// Was hier verlangt wird, ist das Verhalten, das ein Mensch sieht: eine Standliste an der Notiz,
// ein Klick oeffnet den alten Text VOLLSTAENDIG, einer geht zurueck, und der aktuelle Text bleibt
// unberuehrt (kein Schreibvorgang). Dazu die Gratis-Stufe mit ihrem Gegenfall.
//
// Am Kopf f366bc9 gibt es die Flaeche nicht - dieser Fall faellt dort rot am Verhalten.
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
const toastPush = vi.hoisted(() => vi.fn());
vi.mock("../../src/components/ui/Toast", () => ({ useToast: () => ({ push: toastPush }) }));
import { MemoryPreview } from "../../src/components/MemoryPreview";
import type { Memory } from "../../src/types";

function mem(overrides: Partial<Memory> = {}): Memory {
  return {
    id: "m1",
    userId: "local",
    title: "Notiz mit Geschichte",
    content: "Der aktuelle Text",
    tags: ["kapsel"],
    type: "semantic",
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...overrides,
  };
}

interface Stand { id: number; memoryId: string; title: string; content: string; createdAt: number }
const stand = (id: number, content: string): Stand =>
  ({ id, memoryId: "m1", title: "Notiz mit Geschichte", content, createdAt: Date.now() - id * 60_000 });

function fetchMit(staende: Stand[]) {
  return vi.fn(async (url: RequestInfo | URL, _init?: RequestInit) => {
    const u = String(url);
    if (u.includes("/stande")) {
      return new Response(JSON.stringify({
        count: staende.length, total: staende.length, limit: 20, offset: 0, begrenzt: false,
        hinweis: staende.length === 0 ? "This note has no earlier stand yet." : "",
        staende,
      }), { status: 200 });
    }
    if (u.includes("/readers")) return new Response(JSON.stringify({ readers: [] }), { status: 200 });
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

/** Der Bezahlwort-Scanner der Gratis-Stufe - und sein Gegenfall steht weiter unten. */
const BEZAHLWORT = /licen[sc]e|premium|upgrade|unlock|paywall|subscription|buy now|purchase/i;
const hatBezahlwort = (s: string) => BEZAHLWORT.test(s);

describe("MemoryPreview: die Staende einer Notiz", () => {
  it("zeigt die Standliste, oeffnet den alten Text vollstaendig und geht zurueck", async () => {
    vi.stubGlobal("fetch", fetchMit([stand(1, "Der alte Text"), stand(2, "Der aeltere Text")]));
    render(<MemoryPreview memory={mem()} onClose={() => {}} onEdit={() => {}} />);

    // P202, Mockup-Tische: die Stände stehen als zustandszeile-Tisch — die Liste
    // öffnet über den „click to read them"-Knopf in der Zeile.
    const abschnitt = await screen.findByTestId("preview-stands-gruppe", {}, { timeout: 1500 });
    expect(abschnitt.textContent).toContain("2 earlier");

    await userEvent.click(screen.getByTestId("preview-stands-open"));
    const zeilen = screen.getAllByTestId("preview-stand-row");
    expect(zeilen).toHaveLength(2);

    // Der aeltere Stand (zweite Zeile) wird geoeffnet - vollstaendig, nicht als Vorschau.
    await userEvent.click(zeilen[1]);
    expect(screen.getByTestId("preview-stand-text").textContent).toBe("Der aeltere Text");
    expect(screen.getByTestId("preview-stand-flag")).toBeTruthy();

    await userEvent.click(screen.getByTestId("preview-stand-back"));
    expect(screen.getByTestId("preview-text").textContent).toBe("Der aktuelle Text");
    expect(screen.queryByTestId("preview-stand-text")).toBeNull();
  });

  it("ohne Staende: ein benannter leerer Zustand, kein leerer Kasten", async () => {
    vi.stubGlobal("fetch", fetchMit([]));
    render(<MemoryPreview memory={mem()} onClose={() => {}} onEdit={() => {}} />);
    const leer = await screen.findByTestId("preview-stands-none", {}, { timeout: 1500 });
    expect(leer.textContent).toMatch(/no earlier stand/i);
    expect(screen.queryByTestId("preview-stands")).toBeNull();
  });

  it("das Oeffnen eines Stands schreibt nichts: kein POST, PUT, PATCH oder DELETE", async () => {
    const rufe = fetchMit([stand(1, "Der alte Text")]);
    vi.stubGlobal("fetch", rufe);
    render(<MemoryPreview memory={mem()} onClose={() => {}} onEdit={() => {}} />);
    await userEvent.click(await screen.findByTestId("preview-stands-open", {}, { timeout: 1500 }));
    await userEvent.click(screen.getAllByTestId("preview-stand-row")[0]);
    await userEvent.click(screen.getByTestId("preview-stand-back"));

    const schreibend = rufe.mock.calls.filter(([, init]) => {
      const m = String((init as RequestInit | undefined)?.method ?? "GET").toUpperCase();
      return m !== "GET" && m !== "HEAD";
    });
    expect(schreibend).toHaveLength(0);
  });

  it("Gratis-Stufe: die Stand-Flaeche traegt kein Bezahlwort und kein Schluesselfeld", async () => {
    vi.stubGlobal("fetch", fetchMit([stand(1, "Der alte Text")]));
    render(<MemoryPreview memory={mem()} onClose={() => {}} onEdit={() => {}} />);
    // P202, Mockup-Tische: die Stände stehen als zustandszeile-Tisch — die Liste
    // öffnet über den Knopf in der Zeile, der Tisch bleibt die Stand-Fläche.
    const abschnitt = await screen.findByTestId("preview-stands-gruppe", {}, { timeout: 1500 });
    await userEvent.click(screen.getByTestId("preview-stands-open"));
    const flaeche = screen.getByTestId("memory-preview");
    expect(hatBezahlwort(flaeche.textContent ?? "")).toBe(false);
    expect(flaeche.querySelector("input[type='password'], [data-testid*='license'], [data-testid*='key']")).toBeNull();
    expect(abschnitt).toBeTruthy();
  });

  it("Gegenfall: der Bezahlwort-Scanner findet ein gepflanztes Wort (er kann verlieren)", () => {
    expect(hatBezahlwort("Upgrade to unlock earlier stands")).toBe(true);
    expect(hatBezahlwort("Earlier stands - the app keeps them for free")).toBe(false);
  });
});
