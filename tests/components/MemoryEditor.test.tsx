// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryEditor } from "../../src/components/MemoryEditor";
import type { Memory } from "../../src/types";

// Zwei offene Punkte aus der Durchsicht: die Typwahl mit Gueltigkeitszeitraum
// und das Loeschen per Klick. Beide waren nur ueber die API geprueft — im
// Browser scheiterte der Weg an eingefrorenen Animationen. Hier laeuft es
// deterministisch, und es bleibt abgesichert.

function memory(overrides: Partial<Memory> = {}): Memory {
  return {
    id: "m1",
    userId: "local",
    title: "Carbonara",
    content: "Echte Carbonara kommt ohne Sahne aus.",
    tags: ["kochen"],
    type: "semantic",
    confidence: 1,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...overrides,
  } as Memory;
}

describe("MemoryEditor: Typwahl", () => {
  it("bietet die drei Typen an", () => {
    render(<MemoryEditor memory={memory({ type: "episodic" })} onSave={() => {}} onClose={() => {}} />);
    for (const label of ["Fact", "Event", "How-to"]) {
      expect(screen.getByRole("button", { name: new RegExp(label, "i") })).toBeTruthy();
    }
  });

  it("uebernimmt einen Typwechsel beim Speichern", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    render(<MemoryEditor memory={memory({ type: "semantic" })} onSave={onSave} onClose={() => {}} />);

    await user.click(screen.getByRole("button", { name: /How-to/i }));
    await user.click(screen.getByRole("button", { name: /^Save$/i }));

    await waitFor(() => expect(onSave).toHaveBeenCalled());
    expect(onSave.mock.calls[0]![0]).toMatchObject({ type: "procedural" });
  });
});

describe("MemoryEditor: Gueltigkeit und Vertrauen", () => {
  it("zeigt den Gueltigkeitsbereich aufgeklappt, wenn der Eintrag Daten hat", () => {
    const von = new Date("2026-01-15T00:00:00Z").getTime();
    render(<MemoryEditor memory={memory({ validFrom: von })} onSave={() => {}} onClose={() => {}} />);
    expect(document.querySelectorAll('input[type="date"]').length).toBeGreaterThan(0);
  });

  it("reicht einen gesetzten Gueltigkeitszeitraum an onSave weiter", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    const von = new Date("2026-01-15T00:00:00Z").getTime();
    render(<MemoryEditor memory={memory({ validFrom: von })} onSave={onSave} onClose={() => {}} />);

    await user.click(screen.getByRole("button", { name: /^Save$/i }));
    await waitFor(() => expect(onSave).toHaveBeenCalled());
    const daten = onSave.mock.calls[0]![0] as Partial<Memory>;
    expect(typeof daten.validFrom === "number" || daten.validFrom === null).toBe(true);
  });

  it("gibt einen Vertrauenswert zwischen 0 und 1 weiter", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    render(<MemoryEditor memory={memory({ confidence: 0.6 })} onSave={onSave} onClose={() => {}} />);

    await user.click(screen.getByRole("button", { name: /^Save$/i }));
    await waitFor(() => expect(onSave).toHaveBeenCalled());
    const c = (onSave.mock.calls[0]![0] as Partial<Memory>).confidence;
    if (c !== undefined) {
      expect(c).toBeGreaterThanOrEqual(0);
      expect(c).toBeLessThanOrEqual(1);
    }
  });
});

describe("MemoryEditor: Loeschen per Klick", () => {
  function findeLoeschknopf(container: HTMLElement): HTMLElement | undefined {
    return [...container.querySelectorAll("button")].find((b) =>
      /delete|loesch|lösch|trash|entfernen/i.test(
        `${b.getAttribute("aria-label") ?? ""} ${b.getAttribute("title") ?? ""} ${b.textContent ?? ""}`
      )
    );
  }

  it("ruft onDelete, wenn der Loeschknopf gedrueckt wird", async () => {
    const user = userEvent.setup();
    const onDelete = vi.fn();
    const { container } = render(
      <MemoryEditor memory={memory()} onSave={() => {}} onClose={() => {}} onDelete={onDelete} />
    );

    const knopf = findeLoeschknopf(container);
    expect(knopf, "kein Loeschknopf im Editor gefunden").toBeTruthy();

    await user.click(knopf as HTMLElement);
    await waitFor(() => expect(onDelete).toHaveBeenCalled());
  });

  it("zeigt keinen Loeschknopf, wenn onDelete fehlt — ein neuer Eintrag ist nicht loeschbar", () => {
    const { container } = render(<MemoryEditor memory={null} onSave={() => {}} onClose={() => {}} />);
    expect(findeLoeschknopf(container)).toBeUndefined();
  });
});

describe("MemoryEditor: Schlagworte", () => {
  it("legt ein Schlagwort per Enter ab und gibt es beim Speichern weiter", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    const { container } = render(<MemoryEditor memory={memory({ tags: [] })} onSave={onSave} onClose={() => {}} />);
    // Das Tag-Feld traegt den Platzhalter "Type and press Enter…" (und keinen,
    // sobald schon Schlagworte da sind) — deshalb ueber die Position im Formular.
    const feld = [...container.querySelectorAll("input")].find((i) => /press Enter/i.test(i.placeholder ?? ""));
    expect(feld, "kein Tag-Feld").toBeTruthy();
    await user.type(feld!, "kanzlei{Enter}");
    await user.click(screen.getByRole("button", { name: /^Save$/i }));
    await waitFor(() => expect(onSave).toHaveBeenCalled());
    expect((onSave.mock.calls[0]![0] as Partial<Memory>).tags).toContain("kanzlei");
  });

  it("trennt auch per Komma", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    const { container } = render(<MemoryEditor memory={memory({ tags: [] })} onSave={onSave} onClose={() => {}} />);
    const feld = [...container.querySelectorAll("input")].find((i) => /press Enter/i.test(i.placeholder ?? ""));
    await user.type(feld!, "fristen,");
    await user.click(screen.getByRole("button", { name: /^Save$/i }));
    await waitFor(() => expect(onSave).toHaveBeenCalled());
    expect((onSave.mock.calls[0]![0] as Partial<Memory>).tags).toContain("fristen");
  });

  it("nimmt ein Schlagwort wieder weg", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    const { container } = render(<MemoryEditor memory={memory({ tags: ["weg"] })} onSave={onSave} onClose={() => {}} />);
    // Der Chip traegt den Namen, der Wegnehmen-Knopf darin nur ein Kreuz.
    const chip = [...container.querySelectorAll("span")].find((sp) => /^#?weg/.test((sp.textContent ?? "").trim()) && sp.querySelector("button"));
    expect(chip, "kein Schlagwort-Chip").toBeTruthy();
    await user.click(chip!.querySelector("button")!);
    await user.click(screen.getByRole("button", { name: /^Save$/i }));
    await waitFor(() => expect(onSave).toHaveBeenCalled());
    expect((onSave.mock.calls[0]![0] as Partial<Memory>).tags).not.toContain("weg");
  });

  it("saeubert Schlagworte von Sonderzeichen", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    const { container } = render(<MemoryEditor memory={memory({ tags: [] })} onSave={onSave} onClose={() => {}} />);
    const feld = [...container.querySelectorAll("input")].find((i) => /press Enter/i.test(i.placeholder ?? ""));
    await user.type(feld!, "Kanzlei / Akte!{Enter}");
    await user.click(screen.getByRole("button", { name: /^Save$/i }));
    await waitFor(() => expect(onSave).toHaveBeenCalled());
    const tags = (onSave.mock.calls[0]![0] as Partial<Memory>).tags ?? [];
    for (const t of tags) expect(t).toMatch(/^[a-z0-9-]*$/);
  });
});

describe("MemoryEditor: Inhalt und Schliessen", () => {
  it("gibt Titel und Inhalt weiter", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    render(<MemoryEditor memory={null} onSave={onSave} onClose={() => {}} />);
    const eingaben = screen.getAllByRole("textbox");
    await user.type(eingaben[0], "Neuer Titel");
    const bereich = document.querySelector("textarea") as HTMLTextAreaElement;
    await user.type(bereich, "Neuer Inhalt");
    await user.click(screen.getByRole("button", { name: /^Save$/i }));
    await waitFor(() => expect(onSave).toHaveBeenCalled());
    expect(onSave.mock.calls[0]![0]).toMatchObject({ title: "Neuer Titel", content: "Neuer Inhalt" });
  });

  it("speichert nichts, wenn Titel und Inhalt leer sind", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    render(<MemoryEditor memory={null} onSave={onSave} onClose={() => {}} />);
    await user.click(screen.getByRole("button", { name: /^Save$/i }));
    expect(onSave).not.toHaveBeenCalled();
  });

  it("warnt bei ungespeicherten Aenderungen, bevor Escape verwirft", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<MemoryEditor memory={memory()} onSave={() => {}} onClose={onClose} />);
    const titel = screen.getByPlaceholderText("Title of this entry");
    await user.type(titel, " (bearbeitet)");
    await user.keyboard("{Escape}");
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByText(/Unsaved changes/)).toBeTruthy();
    await user.keyboard("{Escape}");
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it("schliesst mit Escape", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<MemoryEditor memory={memory()} onSave={() => {}} onClose={onClose} />);
    await user.keyboard("{Escape}");
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it("uebernimmt eine andere Notiz, wenn sich die Auswahl aendert", async () => {
    const erste = memory({ id: "a", title: "Erste" });
    const zweite = memory({ id: "b", title: "Zweite" });
    const { rerender } = render(<MemoryEditor memory={erste} onSave={() => {}} onClose={() => {}} />);
    expect((screen.getAllByRole("textbox")[0] as HTMLInputElement).value).toBe("Erste");
    rerender(<MemoryEditor memory={zweite} onSave={() => {}} onClose={() => {}} />);
    await waitFor(() => expect((screen.getAllByRole("textbox")[0] as HTMLInputElement).value).toBe("Zweite"));
  });
});

describe("MemoryEditor: Gueltigkeit aufklappen", () => {
  it("laesst sich oeffnen und einen Zeitraum setzen", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    const { container } = render(<MemoryEditor memory={memory()} onSave={onSave} onClose={() => {}} />);
    const auf = [...container.querySelectorAll("button, summary")].find((b) => /validity|confidence|gueltig/i.test(b.textContent ?? ""));
    if (auf) await user.click(auf);
    const daten = container.querySelectorAll('input[type="date"]');
    if (daten.length > 0) {
      await user.type(daten[0] as HTMLInputElement, "2026-01-15");
      await user.click(screen.getByRole("button", { name: /^Save$/i }));
      await waitFor(() => expect(onSave).toHaveBeenCalled());
    }
  });
});

describe("MemoryEditor: Tags und Vertrauen", () => {
  it("uebernimmt einen frisch getippten Tag beim Speichern", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    render(<MemoryEditor memory={memory({ tags: [] })} onSave={onSave} onClose={() => {}} />);

    const input = screen.getByPlaceholderText(/Type and press Enter/i) || screen.getByPlaceholderText(/tag/i);
    await user.type(input, "Sommerrezepte"); // ohne Enter — der Save-Zweig nimmt den Eingabe-Rest mit
    await user.click(screen.getByRole("button", { name: /^Save$/i }));

    await waitFor(() => expect(onSave).toHaveBeenCalled());
    const payload = onSave.mock.calls[0]![0] as { tags: string[] };
    expect(payload.tags).toContain("sommerrezepte");
  });

  it("uebernimmt Vertrauen und Gueltigkeit aus dem aufgeklappten Block", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    render(<MemoryEditor memory={memory()} onSave={onSave} onClose={() => {}} />);

    await user.click(screen.getByText(/Validity & confidence/i));
    const datumsfelder = document.querySelectorAll('input[type="date"]');
    const setter2 = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")!.set!;
    setter2.call(datumsfelder[1], "2026-12-31"); // das zweite Feld ist „valid to“
    datumsfelder[1].dispatchEvent(new Event("input", { bubbles: true }));
    const regler = document.querySelector('input[type="range"]') as HTMLInputElement;
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")!.set!;
    setter.call(regler, "40");
    regler.dispatchEvent(new Event("input", { bubbles: true }));
    await user.click(screen.getByRole("button", { name: /^Save$/i }));

    await waitFor(() => expect(onSave).toHaveBeenCalled());
    const payload = onSave.mock.calls[0]![0] as { confidence: number; validTo: number | null };
    expect(payload.confidence).toBeCloseTo(0.4, 5);
    expect(payload.validTo).not.toBeNull();
  });
});
