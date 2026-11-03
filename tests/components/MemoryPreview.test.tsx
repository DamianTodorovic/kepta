// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
const toastPush = vi.hoisted(() => vi.fn());
vi.mock("../../src/components/ui/Toast", () => ({ useToast: () => ({ push: toastPush }) }));
import { MemoryPreview } from "../../src/components/MemoryPreview";
import type { Memory } from "../../src/types";

function mem(overrides: Partial<Memory> = {}): Memory {
  return {
    id: "m1",
    userId: "local",
    title: "Gewerbe-Ummeldung — 2/5",
    content: "Extracted text…\n\n— Source: /Users/da/Desktop/Gewerbe-Ummeldung.pdf",
    tags: ["machine-scan", "pdf"],
    type: "semantic",
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...overrides,
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("MemoryPreview", () => {
  it("zeigt Titel, Teil-Badge und den bereinigten Text ohne Quellzeile", () => {
    const { container } = render(<MemoryPreview memory={mem()} onClose={() => {}} onEdit={() => {}} />);
    expect(container.textContent).toContain("Gewerbe-Ummeldung — 2/5");
    expect(container.textContent).toContain("Part 2/5");
    expect(container.textContent).toContain("Extracted text…");
    expect(container.textContent).not.toContain("— Source:");
  });

  it("zeigt die Quelle mit vollem Pfad und öffnet sie über den Server", async () => {
    const fetchMock = vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) =>
      new Response(JSON.stringify({ ok: true }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    render(<MemoryPreview memory={mem()} onClose={() => {}} onEdit={() => {}} />);
    await userEvent.click(screen.getByTestId("preview-open-source"));
    await waitFor(() => {
      const aufruf = fetchMock.mock.calls.find(([u]) => String(u).includes("/api/open"));
      expect(aufruf).toBeTruthy();
      const init = aufruf![1] as { body: string };
      expect(JSON.parse(init.body).pfad).toBe("/Users/da/Desktop/Gewerbe-Ummeldung.pdf");
    });
  });

  it("übernimmt per Edit in den Editor", async () => {
    const onEdit = vi.fn();
    render(<MemoryPreview memory={mem()} onClose={() => {}} onEdit={onEdit} />);
    await userEvent.click(screen.getByRole("button", { name: /Edit/i }));
    expect(onEdit).toHaveBeenCalledOnce();
    expect(onEdit.mock.calls[0][0].title).toBe("Gewerbe-Ummeldung — 2/5");
  });

  it("bei URL-Quelle zeigt die Vorschau den Link und öffnet ihn im Browser", async () => {
    const oeffnen = vi.fn();
    vi.stubGlobal("open", oeffnen);
    const { container } = render(<MemoryPreview memory={mem({
      title: "arXiv",
      content: "Source: https://arxiv.org/abs/x\n\nAbstract…",
    })} onClose={() => {}} onEdit={() => {}} />);
    expect(container.textContent).toContain("arxiv.org");
    await userEvent.click(screen.getByTestId("preview-open-source"));
    expect(oeffnen).toHaveBeenCalledOnce();
  });
});

describe("MemoryPreview: Komfort", () => {
  it("Copy text schreibt Titel und Text in die Zwischenablage", async () => {
    const schreiben = vi.fn(async () => {});
    Object.defineProperty(navigator, "clipboard", { value: { writeText: schreiben }, configurable: true });
    render(<MemoryPreview memory={mem()} onClose={() => {}} onEdit={() => {}} />);
    await userEvent.click(screen.getByRole("button", { name: /Copy text/i }));
    await waitFor(() => expect(schreiben).toHaveBeenCalledOnce());
    expect(screen.getByText("Copied")).toBeInTheDocument();
  });

  it("meldet per Hinweis, wenn die Datei nicht geöffnet werden kann", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 404 })));
    render(<MemoryPreview memory={mem()} onClose={() => {}} onEdit={() => {}} />);
    await userEvent.click(screen.getByTestId("preview-open-source"));
    await waitFor(() => expect(toastPush).toHaveBeenCalledOnce());
    expect(String(toastPush.mock.calls[0][0].message)).toMatch(/could not be opened/i);
  });
});

describe("MemoryPreview: Copy-Fehlschlag", () => {
  it("sagt es, wenn die Zwischenablage verweigert — Stillheit war der Defekt", async () => {
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText: async () => { throw new Error("verweigert"); } },
      configurable: true,
    });
    render(<MemoryPreview memory={mem()} onClose={() => {}} onEdit={() => {}} />);
    await userEvent.click(screen.getByRole("button", { name: /Copy text/i }));
    // Bis 3.2.132 stand hier "bleibt ruhig" und der Fall prüfte nur, dass der Knopf noch da
    // ist — eine Verweigerung ohne Meldung. Derselbe Defekt, den der Chat in 3.2.129
    // bekommen hat: das Fenster hat etwas nicht getan und sagt nichts davon. Der Weg ist der
    // Hinweis, denselben wie die Datei-Öffnungs-Absage weiter oben in dieser Datei.
    await waitFor(() => expect(toastPush).toHaveBeenCalledOnce());
    expect(String(toastPush.mock.calls[0][0].message)).toMatch(/the window did not get the clipboard/i);
    expect(screen.queryByText("Copied")).toBeNull();
  });
});
