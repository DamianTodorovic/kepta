// @vitest-environment jsdom
//
// Punkt 83, Flaeche (Brief 26.10. 14:38 MEZ (+0100)): die Flaeche konnte zeigen und zurueckgehen,
// aber nicht wiederherstellen. Dieser Fall trifft ein SICHTBAR BENANNTES Steuer (Rolle Knopf,
// Name "Restore this stand"), verlangt eine Rueckfrage, und misst die WIRKUNG: der Text wechselt,
// der Bestand waechst um eins (die Zahl wird aus einer Lesung VOR der Schreibe genommen), die
// Historie bleibt - und ein Abbruch schreibt nichts.
//
// Am Kopf dac03ad gibt es das Steuer nicht - dieser Fall faellt dort rot.
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
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

/** Ein Leib, in dem der Server wirklich lebt: die Staende wachsen bei einer Wiederherstellung. */
function welt(staende: Stand[], inhalt: string) {
  const zustand = { staende: [...staende], inhalt };
  const rufe: Array<{ url: string; method: string; body: string | null }> = [];
  const fetchMock = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
    const u = String(url);
    const method = String(init?.method ?? "GET").toUpperCase();
    rufe.push({ url: u, method, body: typeof init?.body === "string" ? init.body : null });
    if (/\/stande\/\d+\/restore$/.test(u) && method === "POST") {
      const id = Number(u.match(/\/stande\/(\d+)\/restore$/)![1]);
      const ziel = zustand.staende.find((s) => s.id === id);
      if (!ziel) return new Response(JSON.stringify({ error: "Node or stand not found" }), { status: 404 });
      zustand.staende = [stand(90, zustand.inhalt), ...zustand.staende];
      zustand.inhalt = ziel.content;
      return new Response(JSON.stringify({ ok: true, memory: { ...mem(), content: ziel.content }, restoredFrom: id, total: zustand.staende.length }), { status: 200 });
    }
    if (u.includes("/stande")) {
      return new Response(JSON.stringify({ count: zustand.staende.length, total: zustand.staende.length, limit: 20, offset: 0, begrenzt: false, hinweis: "", staende: zustand.staende }), { status: 200 });
    }
    if (u.includes("/readers")) return new Response(JSON.stringify({ readers: [] }), { status: 200 });
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  });
  return { fetchMock, rufe, zustand };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  toastPush.mockReset();
});

describe("Flaeche: einen Stand zur aktuellen Fassung machen", () => {
  it("benanntes Steuer, Rueckfrage zuerst, Wirkung am Text und am Bestand", async () => {
    const w = welt([stand(1, "Der alte Text"), stand(2, "Der aeltere Text")], "Der aktuelle Text");
    vi.stubGlobal("fetch", w.fetchMock);
    render(<MemoryPreview memory={mem()} onClose={() => {}} onEdit={() => {}} />);

    await userEvent.click(await screen.findByTestId("preview-stands-open", {}, { timeout: 1500 }));
    await userEvent.click(screen.getAllByTestId("preview-stand-row")[1]);

    // Das Steuer wird ueber seinen SICHTBAREN Namen getroffen, nicht ueber einen Testid.
    const steuer = screen.getByRole("button", { name: /restore this stand/i });
    expect(steuer).toBeTruthy();

    // Zahl VOR der Schreibe: die letzte Stand-Lesung vor dem Klick auf die Bestaetigung.
    const lesungenVor = w.rufe.filter((r) => r.method === "GET" && r.url.includes("/stande")).length;
    const postsVor = w.rufe.filter((r) => r.method === "POST").length;
    expect(lesungenVor).toBeGreaterThan(0);

    await userEvent.click(steuer);
    // Rueckfrage sichtbar, und noch KEINE Schreibe
    expect(screen.getByTestId("preview-stand-restore-bestaetigung")).toBeTruthy();
    expect(w.rufe.filter((r) => r.method === "POST").length).toBe(postsVor);

    await userEvent.click(screen.getByRole("button", { name: /restore to this version/i }));
    await waitFor(() => expect(w.rufe.filter((r) => r.method === "POST").length).toBe(postsVor + 1));

    const post = w.rufe.find((r) => r.method === "POST")!;
    expect(post.url).toContain("/stande/2/restore");
    expect(JSON.parse(post.body!).confirm).toBe("restore");

    // Wirkung: der Text wechselt, die Stand-Ansicht geht, die Historie waechst um eins.
    await waitFor(() => expect(screen.getByTestId("preview-text").textContent).toBe("Der aeltere Text"));
    expect(screen.queryByTestId("preview-stand-text")).toBeNull();
    await waitFor(() => expect(screen.getByTestId("preview-stands").textContent).toContain("3"));
    expect(w.zustand.staende).toHaveLength(3);
    expect(w.zustand.staende.slice(1).map((s) => s.content)).toEqual(["Der alte Text", "Der aeltere Text"]);
  });

  it("Abbruch schreibt nicht und bleibt in der Stand-Ansicht", async () => {
    const w = welt([stand(1, "Der alte Text")], "Der aktuelle Text");
    vi.stubGlobal("fetch", w.fetchMock);
    render(<MemoryPreview memory={mem()} onClose={() => {}} onEdit={() => {}} />);
    await userEvent.click(await screen.findByTestId("preview-stands-open", {}, { timeout: 1500 }));
    await userEvent.click(screen.getAllByTestId("preview-stand-row")[0]);
    await userEvent.click(screen.getByRole("button", { name: /restore this stand/i }));
    await userEvent.click(screen.getByRole("button", { name: /cancel/i }));
    expect(w.rufe.filter((r) => r.method === "POST")).toHaveLength(0);
    expect(screen.getByTestId("preview-stand-text")).toBeTruthy();
    expect(screen.queryByTestId("preview-stand-restore-bestaetigung")).toBeNull();
  });

  it("ein Fehler aendert nichts: Text bleibt, Warnung kommt, Stand-Ansicht bleibt", async () => {
    const kaputt = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      const u = String(url);
      if (String(init?.method ?? "GET").toUpperCase() === "POST") return new Response(JSON.stringify({ error: "kaputt" }), { status: 500 });
      if (u.includes("/stande")) return new Response(JSON.stringify({ count: 1, total: 1, limit: 20, offset: 0, begrenzt: false, hinweis: "", staende: [stand(1, "Der alte Text")] }), { status: 200 });
      return new Response(JSON.stringify({ readers: [] }), { status: 200 });
    });
    vi.stubGlobal("fetch", kaputt);
    render(<MemoryPreview memory={mem()} onClose={() => {}} onEdit={() => {}} />);
    await userEvent.click(await screen.findByTestId("preview-stands-open", {}, { timeout: 1500 }));
    await userEvent.click(screen.getAllByTestId("preview-stand-row")[0]);
    await userEvent.click(screen.getByRole("button", { name: /restore this stand/i }));
    await userEvent.click(screen.getByRole("button", { name: /restore to this version/i }));
    await waitFor(() => expect(toastPush).toHaveBeenCalled());
    expect(screen.getByTestId("preview-stand-text").textContent).toBe("Der alte Text");
    expect(screen.queryByTestId("preview-text")).toBeNull();
    // Die Gegenprobe am Symbol: eine Warnung ist da, aber der Text hat sich NICHT geaendert.
    fireEvent.click(screen.getByTestId("preview-stand-back"));
    expect(screen.getByTestId("preview-text").textContent).toBe("Der aktuelle Text");
  });
});
