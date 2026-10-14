// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
const toastPush = vi.hoisted(() => vi.fn());
vi.mock("../../src/components/ui/Toast", () => ({ useToast: () => ({ push: toastPush }) }));
import { MemoryCard } from "../../src/components/MemoryCard";
import type { Memory } from "../../src/types";

function mem(overrides: Partial<Memory> = {}): Memory {
  return {
    id: "m1",
    userId: "local",
    title: "Rust Backend",
    content: "Speichersicherheit ohne Garbage Collector",
    tags: ["rust", "backend", "systems", "extra"],
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...overrides,
  };
}

describe("MemoryCard", () => {
  it("zeigt Titel, Inhalt und die ersten Tags", () => {
    render(<MemoryCard memory={mem()} onClick={() => {}} />);
    expect(screen.getByText("Rust Backend")).toBeInTheDocument();
    expect(screen.getByText(/Speichersicherheit/)).toBeInTheDocument();
    expect(screen.getByText("rust")).toBeInTheDocument();
    // 4 Tags → nur 3 gezeigt + "+1"
    expect(screen.getByText("+1")).toBeInTheDocument();
  });

  it("ruft onClick beim Klick auf", async () => {
    const onClick = vi.fn();
    render(<MemoryCard memory={mem()} onClick={onClick} />);
    await userEvent.click(screen.getByText("Rust Backend"));
    expect(onClick).toHaveBeenCalledOnce();
  });

  it("zeigt Relevanz-Prozent, wenn score gesetzt ist", () => {
    render(<MemoryCard memory={mem()} onClick={() => {}} score={0.82} matchedTerms={["rust", "speicher"]} />);
    expect(screen.getByText("82%")).toBeInTheDocument();
  });

  it("markiert abgelaufene Memories", () => {
    render(<MemoryCard memory={mem({ validTo: Date.now() - 10000 })} onClick={() => {}} />);
    expect(screen.getByText("EXPIRED")).toBeInTheDocument();
  });

  it("markiert ersetzte Memories", () => {
    render(<MemoryCard memory={mem({ supersededBy: "m2" })} onClick={() => {}} />);
    expect(screen.getByText("SUPERSEDED")).toBeInTheDocument();
  });

  // Die Standarte nannte bisher die Rechen-Art („How-to" für procedural). Seit
  // #74 steht dort Zeile 1 — der Traeger —, weil genau die vier Woerter
  // verworfen wurden. Icon und Farbe bleiben an die Rechen-Art gebunden.
  it("nennt den Traeger statt der Rechen-Art — eine eigene Notiz ist Notes", () => {
    render(<MemoryCard memory={mem({ type: "procedural" })} onClick={() => {}} />);
    expect(screen.getByText("Notes")).toBeInTheDocument();
    expect(screen.queryByText("How-to")).not.toBeInTheDocument();
  });

  it("zeigt Themen unter der Karte, wenn der Text sie traegt", () => {
    render(
      <MemoryCard
        memory={mem({
          type: "episodic",
          title: "Standup",
          content: "Meeting 2026-10-12 mit Frau Peck. TODO: Angebot nachfassen.",
          tags: ["machine-scan", "md"],
        })}
        onClick={() => {}}
      />,
    );
    // Traeger ueber die Quelldatei-Endung im Tag, Themen aus dem Text.
    expect(screen.getByText("Files")).toBeInTheDocument();
    expect(screen.getByText("People")).toBeInTheDocument();
    expect(screen.getByText("Events")).toBeInTheDocument();
    expect(screen.getByText("Tasks")).toBeInTheDocument();
  });

  it("setzt kein Thema auf eine Code-Karte, auch wenn alle sechs im Text stehen", () => {
    render(
      <MemoryCard
        memory={mem({
          type: "reference",
          title: "zh-TW schema",
          content: "Kontakt: Herr Lin. Meeting 2026-10-12. TODO frist deadline. Anleitung setup step 1. https://example.org",
          tags: ["machine-scan", "json"],
        })}
        onClick={() => {}}
      />,
    );
    expect(screen.getByText("Code")).toBeInTheDocument();
    for (const wort of ["People", "Projects", "Events", "Tasks", "Guides", "Links"]) {
      expect(screen.queryByText(wort), wort).not.toBeInTheDocument();
    }
  });

  it("fällt bei leerem Titel auf 'Ohne Titel' zurück", () => {
    render(<MemoryCard memory={mem({ title: "" })} onClick={() => {}} />);
    expect(screen.getByText("Untitled")).toBeInTheDocument();
  });
});

describe("MemoryCard: Quelle öffnen", () => {
  it("meldet per Hinweis, wenn die Datei weg ist", async () => {
    const user = userEvent.setup();
    render(<MemoryCard memory={mem({
      content: "Text\n\n— Source: /Users/da/Docs/weg.pdf",
    })} onClick={() => {}} />);
    await user.click(screen.getByText("weg.pdf"));
    await waitFor(() => expect(toastPush).toHaveBeenCalledOnce());
    expect(String(toastPush.mock.calls[0][0].message)).toMatch(/could not be opened/i);
  });
});
