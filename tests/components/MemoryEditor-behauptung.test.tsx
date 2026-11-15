// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryEditor } from "../../src/components/MemoryEditor";
import type { Memory } from "../../src/types";

// Punkt 126 — die Hand, die das Wort hinlegt.
//
// Der Kern kann eine Behauptung setzen (tests/core/behauptung-setzen.test.ts), das Tor nimmt
// sie an und liefert sie zurück (tests/rest-behauptung.test.ts). Was einer Person fehlte, ist
// das Feld selbst: gemessen 29.10. 08:19:52 an Damians echtem Bestand sind 1 468 von 1 468
// Relationen Systemwoerter und keine einzige hat ein Wort von einer Hand.
//
// Die Fälle unten halten vier Dinge, die ein Feld leicht verwechselt: was **schon steht** ist
// nicht das, was **gleich geschrieben wird**; ein leeres Feld ist eine Loeschung, ein
// nicht genanntes Feld ist keine; und eine Absage des Tors muss als Grund zu sehen sein, nicht
// als "Save failed".

function memory(overrides: Partial<Memory> = {}): Memory {
  return {
    id: "m1",
    userId: "local",
    title: "Uebergabe 14.03",
    content: "Nordwind und Elena sind genannt.",
    tags: [],
    type: "semantic",
    confidence: 1,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...overrides,
  } as Memory;
}

/** Die Tuer, die das Blatt öffnet: eine Behauptung, die schon steht. */
function turMitBehauptungen(liste: { quelle: string; ziel: string; wort: string }[]) {
  const fetchMock = vi.fn(async (eingang: string | URL | Request) => {
    const url = String(eingang);
    if (url.includes("/behauptungen")) {
      return new Response(JSON.stringify({
        count: liste.length,
        behauptungen: liste,
        hinweis: liste.length === 0 ? "This note claims nothing yet" : `${liste.length} claim written by a hand`,
      }), { status: 200 });
    }
    return new Response(JSON.stringify({ memories: [], total: 0 }), { status: 200 });
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

beforeEach(() => {
  turMitBehauptungen([]);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("126 das Behauptungsfeld im Blatt", () => {
  it("zeigt, was schon steht — ein Feld, das nur schreibt, ist ein Rat", async () => {
    turMitBehauptungen([{ quelle: "nordwind", ziel: "elena", wort: "betreut" }]);
    render(<MemoryEditor memory={memory()} onSave={() => {}} onClose={() => {}} />);
    const reihe = await screen.findByTestId("behauptung-reihe");
    expect(reihe.textContent).toContain("nordwind");
    expect(reihe.textContent).toContain("betreut");
    expect(reihe.textContent).toContain("elena");
  });

  it("ein neuer Satz geht mit, wenn das Blatt speichert", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    render(<MemoryEditor memory={memory()} onSave={onSave} onClose={() => {}} />);
    await screen.findByTestId("behauptung-feld");

    await user.type(screen.getByTestId("behauptung-wer"), "Nordwind");
    await user.type(screen.getByTestId("behauptung-tutwas"), "betreut");
    await user.type(screen.getByTestId("behauptung-wen"), "Elena");
    await user.click(screen.getByTestId("behauptung-hinzufuegen"));

    const reihe = await screen.findByTestId("behauptung-reihe");
    expect(reihe.textContent, "die neue Behauptung steht nicht in der Liste").toContain("betreut");

    await user.click(screen.getByRole("button", { name: /^Save$/i }));
    await waitFor(() => expect(onSave).toHaveBeenCalled());
    const payload = onSave.mock.calls[0]![0] as { beziehungen?: unknown };
    expect(payload.beziehungen, "das Speichern nimmt das Feld nicht mit").toEqual([
      { quelle: "nordwind", ziel: "elena", wort: "betreut" },
    ]);
  });

  it("wer nichts loescht, speichert, was da steht — und wer eine Reihe entfernt, speichert sie weg", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    turMitBehauptungen([{ quelle: "nordwind", ziel: "elena", wort: "betreut" }]);
    render(<MemoryEditor memory={memory()} onSave={onSave} onClose={() => {}} />);
    await screen.findByTestId("behauptung-reihe");

    // Erster Speicherngriff ohne Anynderung: die bestehende Aussage muss mitgehen,
    // sonst loescht jedes Tippen auf dem Blatt, was die Hand einmal gesetzt hat.
    await user.click(screen.getByRole("button", { name: /^Save$/i }));
    await waitFor(() => expect(onSave).toHaveBeenCalled());
    expect(onSave.mock.calls[0]![0]).toMatchObject({
      beziehungen: [{ quelle: "nordwind", ziel: "elena", wort: "betreut" }],
    });

    await user.click(screen.getByTestId("behauptung-entfernen"));
    await waitFor(() => expect(screen.queryByTestId("behauptung-reihe")).toBeNull());
    await user.click(screen.getByRole("button", { name: /^Save$/i }));
    await waitFor(() => expect(onSave.mock.calls.length).toBe(2));
    expect(onSave.mock.calls[1]![0]).toMatchObject({ beziehungen: [] });
  });

  it("eine leere Eingabe kommt nicht ins Feld, und die Zeile nennt den Grund", async () => {
    const user = userEvent.setup();
    render(<MemoryEditor memory={memory()} onSave={() => {}} onClose={() => {}} />);
    await screen.findByTestId("behauptung-feld");
    await user.click(screen.getByTestId("behauptung-hinzufuegen"));
    expect(screen.queryByTestId("behauptung-reihe")).toBeNull();
    const meldung = screen.getByTestId("behauptung-meldung");
    expect(meldung.textContent, "die leere Eingabe verschwindet ohne ein Wort an die Hand")
      .toMatch(/who|word|whom/i);
  });

  it("ist die Liste leer, sagt das Feld es — und erfindet keine Aussage", async () => {
    const { container } = render(<MemoryEditor memory={memory()} onSave={() => {}} onClose={() => {}} />);
    await screen.findByTestId("behauptung-feld");
    expect(screen.queryByTestId("behauptung-reihe")).toBeNull();
    expect(container.textContent, "ein leeres Blatt behauptet schon etwas").toMatch(/nothing yet|no claim/i);
  });
});
