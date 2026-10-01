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

  it("zeigt Typ-Label Ablauf für procedural", () => {
    render(<MemoryCard memory={mem({ type: "procedural" })} onClick={() => {}} />);
    expect(screen.getByText("How-to")).toBeInTheDocument();
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
