// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CommandPalette, buildPaletteActions, type PaletteAction } from "../../src/components/CommandPalette";

function actions(overrides: Partial<Record<string, () => void>> = {}): PaletteAction[] {
  return [
    { id: "search", label: "Suche im Index", desc: "Wissens-Index durchsuchen", keywords: "finden filter", action: overrides.search ?? (() => {}) },
    { id: "new", label: "Neuer Knoten", desc: "Leeren Knoten öffnen", keywords: "erstellen", action: overrides.new ?? (() => {}) },
    { id: "graph", label: "Graph öffnen", desc: "Wissens-Graph", keywords: "kanten", action: overrides.graph ?? (() => {}) },
  ];
}

describe("CommandPalette", () => {
  it("rendert nichts, wenn geschlossen", () => {
    const { container } = render(<CommandPalette open={false} onClose={() => {}} actions={actions()} />);
    expect(container.firstChild).toBeNull();
  });

  it("zeigt alle Aktionen, wenn offen", () => {
    render(<CommandPalette open onClose={() => {}} actions={actions()} />);
    expect(screen.getByText("Suche im Index")).toBeInTheDocument();
    expect(screen.getByText("Neuer Knoten")).toBeInTheDocument();
    expect(screen.getByText("Graph öffnen")).toBeInTheDocument();
  });

  it("filtert nach Eingabe", async () => {
    render(<CommandPalette open onClose={() => {}} actions={actions()} />);
    const input = screen.getByPlaceholderText(/Command or search/);
    await userEvent.type(input, "graph");
    expect(screen.getByText("Graph öffnen")).toBeInTheDocument();
    expect(screen.queryByText("Neuer Knoten")).not.toBeInTheDocument();
  });

  it("zeigt Leermeldung ohne Treffer", async () => {
    render(<CommandPalette open onClose={() => {}} actions={actions()} />);
    await userEvent.type(screen.getByPlaceholderText(/Command or search/), "zzz-nichts");
    expect(screen.getByText(/No matches/)).toBeInTheDocument();
  });

  it("führt Aktion per Klick aus und schließt", async () => {
    const onClose = vi.fn();
    const graph = vi.fn();
    render(<CommandPalette open onClose={onClose} actions={actions({ graph })} />);
    await userEvent.click(screen.getByText("Graph öffnen"));
    expect(onClose).toHaveBeenCalled();
    expect(graph).toHaveBeenCalled();
  });

  it("schließt bei Escape", async () => {
    const onClose = vi.fn();
    render(<CommandPalette open onClose={onClose} actions={actions()} />);
    await userEvent.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalled();
  });

  it("navigiert mit Pfeiltasten und öffnet mit Enter", async () => {
    const onClose = vi.fn();
    const newNode = vi.fn();
    render(<CommandPalette open onClose={onClose} actions={actions({ new: newNode })} />);
    await userEvent.keyboard("{ArrowDown}{Enter}"); // Index 1 = "Neuer Knoten"
    expect(newNode).toHaveBeenCalled();
  });
});

describe("buildPaletteActions", () => {
  it("baut die Standard-Aktionsliste mit allen Callbacks", () => {
    const fns = {
      onNewNode: vi.fn(), onFocusSearch: vi.fn(), onGoMemories: vi.fn(), onGoChat: vi.fn(),
      onGoSettings: vi.fn(), onGoGraph: vi.fn(), onImportFileClick: vi.fn(), onFocusUrl: vi.fn(),
    };
    const list = buildPaletteActions(fns);
    expect(list.length).toBeGreaterThanOrEqual(8);
    list.find((a) => a.id === "new")?.action();
    expect(fns.onNewNode).toHaveBeenCalled();
    list.find((a) => a.id === "graph")?.action();
    expect(fns.onGoGraph).toHaveBeenCalled();
    // "extract" ruft onGoChat
    list.find((a) => a.id === "extract")?.action();
    expect(fns.onGoChat).toHaveBeenCalled();
  });
});
