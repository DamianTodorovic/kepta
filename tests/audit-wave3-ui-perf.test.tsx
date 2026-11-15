// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, cleanup, act, fireEvent } from "@testing-library/react";
import fs from "node:fs";
import path from "node:path";
import { ToastProvider } from "../src/components/ui/Toast";
import { FensterStatusAnbieter } from "../src/components/ui/FensterStatus";
import { ThemeProvider } from "../src/contexts/ThemeContext";
import { Chat } from "../src/components/Chat";
import { Settings } from "../src/components/Settings";
import { KnowledgeGraph } from "../src/components/KnowledgeGraph";
import { MemoryPreview } from "../src/components/MemoryPreview";
import { spanneCrashWachter } from "../src/lib/crashZeug";
import { ladeEinstellungen } from "../src/lib/settings";
import { hydratePrefs } from "../src/lib/prefs";
import { hydrateAISettings } from "../src/lib/ai";
import type { Memory } from "../src/types";
import { installiereLeinwand, installiereResizeObserver } from "./helfer/canvas";
import { suchModellWechseln } from "../server/helfer/such-modell";

const sampleMem: Memory = {
  id: "mem-1",
  userId: "local",
  title: "Old Architecture",
  content: "Legacy setup replaced by v2",
  tags: ["arch"],
  type: "semantic",
  createdAt: Date.now() - 10_000,
  updatedAt: Date.now() - 5_000,
  supersededBy: "mem-2",
};

beforeEach(() => {
  localStorage.clear();
  vi.useFakeTimers({ shouldAdvanceTime: true });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("Audit Wave 3: Frontend Bugfixes, Startup Burst Coalescing, Responsive UI & Superseded Lineage", () => {
  it("crashZeug logs error message before source location (does not transpose args)", () => {
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    spanneCrashWachter();
    window.dispatchEvent(new ErrorEvent("error", {
      message: "BoomCrash123",
      filename: "http://127.0.0.1:3000/src/app.js",
      lineno: 77,
    }));
    const crashCall = errSpy.mock.calls.find(([arg]) => String(arg).includes("K3PTA-Absturz:"));
    expect(crashCall).toBeDefined();
    expect(String(crashCall![0]).split("\n")[0]).toContain("BoomCrash123");
  });

  it("coalesces concurrent GET /api/settings bootstrap bursts across ladeEinstellungen, hydratePrefs, and hydrateAISettings", async () => {
    let settingsGets = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: unknown) => {
        const url = String(input);
        if (url === "/api/settings") {
          settingsGets++;
          return new Response(
            JSON.stringify({
              theme: "light",
              ui_prefs: JSON.stringify({ ki_gehirn_semantic: "true" }),
            }),
            { status: 200, headers: { "content-type": "application/json" } },
          );
        }
        return new Response(JSON.stringify({}), { status: 200 });
      }),
    );

    await Promise.all([ladeEinstellungen(), hydratePrefs(), hydrateAISettings()]);
    expect(settingsGets).toBe(1);
  });

  it("Chat skips FensterStatus override when aktiv=false and uses English system prompt wording", () => {
    const src = fs.readFileSync(path.join(process.cwd(), "src", "components", "Chat.tsx"), "utf8");
    expect(src).not.toContain("Passe Antwort-Stil und Beispiele daran an.");

    const meldeSpy = vi.fn();
    render(
      <ToastProvider>
        <FensterStatusAnbieter melde={meldeSpy}>
          <Chat activeMemories={[sampleMem]} aktiv={false} />
        </FensterStatusAnbieter>
      </ToastProvider>,
    );
    expect(meldeSpy).not.toHaveBeenCalled();
  });

  it("Settings skips background polling and health/model fetches when aktiv=false", async () => {
    const fetches: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: unknown) => {
        fetches.push(String(input));
        return new Response(JSON.stringify({ ok: true, models: [] }), { status: 200 });
      }),
    );
    localStorage.setItem("ki_gehirn_ai_settings", JSON.stringify({
      providerId: "ollama",
      apiKey: "local",
      baseUrl: "http://127.0.0.1:11434/v1",
      model: "llama3.2",
    }));

    render(
      <ThemeProvider>
        <ToastProvider>
          <FensterStatusAnbieter melde={vi.fn()}>
            <Settings aktiv={false} />
          </FensterStatusAnbieter>
        </ToastProvider>
      </ThemeProvider>,
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(15_000);
    });
    expect(fetches.filter((u) => u.includes("/api/models"))).toHaveLength(0);
    expect(fetches.filter((u) => u.includes("/api/health"))).toHaveLength(0);
  });

  it("KnowledgeGraph yields initial paint for alle=1 while sichtbar=false and coalesces /api/graph reads across boot state updates", async () => {
    installiereLeinwand();
    installiereResizeObserver(1000, 700);
    const urls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: unknown) => {
        const u = String(input);
        urls.push(u);
        if (u.includes("/api/graph/nachzug")) return new Response(JSON.stringify({ needed: false }), { status: 200 });
        if (u.includes("/api/graph")) return new Response(JSON.stringify({ entities: [], relations: [], memoriesByEntity: {} }), { status: 200 });
        if (u.includes("/api/memories?alle=1")) return new Response(JSON.stringify({ memories: [] }), { status: 200 });
        return new Response(JSON.stringify({}), { status: 200 });
      }),
    );

    const view = render(
      <ToastProvider>
        <KnowledgeGraph memories={[]} sichtbar={false} onSelectMemory={vi.fn()} />
      </ToastProvider>,
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(150);
    });
    expect(urls.filter((u) => u.includes("alle=1"))).toHaveLength(0);

    // Rerendering with loaded page memories yields 120ms before alle=1 and coalesces /api/graph?depth=2
    view.rerender(
      <ToastProvider>
        <KnowledgeGraph
          memories={[sampleMem, { ...sampleMem, id: "k-m2" }]}
          sichtbar={false}
          onSelectMemory={vi.fn()}
        />
      </ToastProvider>,
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(50);
    });
    expect(urls.filter((u) => u.includes("alle=1"))).toHaveLength(0);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(150);
    });
    expect(urls.filter((u) => u.includes("/api/graph?depth="))).toHaveLength(1);
    expect(urls.filter((u) => u.includes("alle=1"))).toHaveLength(1);
  });

  it("MemoryPreview surfaces supersededBy lineage notice and jumps via onOpenById", () => {
    const openById = vi.fn();
    const { getByTestId } = render(
      <ToastProvider>
        <MemoryPreview
          memory={sampleMem}
          onClose={vi.fn()}
          onEdit={vi.fn()}
          onOpenById={openById}
        />
      </ToastProvider>,
    );
    const btn = getByTestId("preview-superseded-link");
    expect(btn.textContent).toMatch(/Replaced by a newer note/i);
    fireEvent.click(btn);
    expect(openById).toHaveBeenCalledWith("mem-2");
  });

  it("enforces Dashboard import timeout updater fix, CSS responsive overflow & 22px footer targets, and English server helper errors", () => {
    const root = process.cwd();
    const dashSrc = fs.readFileSync(path.join(root, "src", "components", "Dashboard.tsx"), "utf8");
    expect(dashSrc).not.toContain("setImportMsg((c) => (c === quittung ? null : quittung))");
    expect(dashSrc).not.toContain("setImportErr((c) => (c === quittung ? null : quittung))");

    const masseCss = fs.readFileSync(path.join(root, "src", "mockup-masse.css"), "utf8");
    expect(masseCss).toMatch(/\.huelle\s+\.seiten-leiste\[aria-hidden="true"\][^{]*\{[^}]*overflow:\s*hidden\s*!important/);
    expect(masseCss).toMatch(/\.huelle\s+\.listen-spalte\s+\.listen-fuss\s+button[^{]*\{[^}]*min-height:\s*22px\s*!important/);

    const indexCss = fs.readFileSync(path.join(root, "src", "index.css"), "utf8");
    expect(indexCss).toMatch(/@media\s*\(\s*max-width:\s*639px\s*\)[\s\S]*\.kopf-handlungen/);

    const res = suchModellWechseln(
      { setzeEinstellungen: vi.fn(), chunksNeedingEmbedding: vi.fn(() => []) } as never,
      null,
      "missing-model",
      ["nomic-embed-text:latest", "bge-m3:latest"],
    );
    expect(res.ok).toBe(false);
    expect(res.fehler).toContain("bge-m3:latest");
    expect(res.fehler).not.toMatch(/Ollama kennt|Modell-Feld fehlt/);
  });
});
