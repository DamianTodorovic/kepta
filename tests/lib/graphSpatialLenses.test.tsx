// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, fireEvent, render } from "@testing-library/react";
import {
  SPATIAL_LENSES,
  FOCUS_EXCLUSION_RADIUS,
  convexHull,
  expandAndChaikin,
  computeBlastSet,
  computeLensTargets,
} from "../../src/lib/graphSpatialLenses";
import { KnowledgeGraph } from "../../src/components/KnowledgeGraph";
import type { LayoutEdge, LayoutNode } from "../../src/lib/graphLayout";
import type { Memory } from "../../src/types";
import { installiereLeinwand, installiereResizeObserver, installiereZeiger, setzeTheme } from "../helfer/canvas";

const DAY_MS = 86_400_000;

function makeMemory(id: string, overrides: Partial<Memory> = {}): Memory {
  const now = Date.now();
  return {
    id,
    userId: "local",
    title: overrides.title ?? `Note ${id}`,
    content: overrides.content ?? "Default content",
    tags: overrides.tags ?? [],
    type: overrides.type ?? "semantic",
    scope: overrides.scope ?? "local",
    createdAt: now - 10 * DAY_MS,
    updatedAt: now - 2 * DAY_MS,
    ...overrides,
  };
}

describe("graphSpatialLenses — pure cartography & projection invariants", () => {
  it("convexHull & expandAndChaikin produce clean closed polygon contours", () => {
    const hull = convexHull([
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 100 },
      { x: 0, y: 100 },
      { x: 50, y: 50 },
    ]);
    expect(hull).toHaveLength(4);
    const smoothed = expandAndChaikin(hull, 24, 2);
    expect(smoothed.length).toBe(16);
    expect(smoothed.some((p) => p.x < 0)).toBe(true);
    expect(smoothed.some((p) => p.y < 0)).toBe(true);
    expect(smoothed.some((p) => p.x > 100)).toBe(true);
    expect(smoothed.some((p) => p.y > 100)).toBe(true);
  });

  it("computeBlastSet respects depth bounds (1..4) and ignores non-real guess edges", () => {
    const edges: LayoutEdge[] = [
      { source: "a", target: "b", strength: 1, real: true },
      { source: "b", target: "c", strength: 1, real: true },
      { source: "c", target: "d", strength: 1, real: true },
      { source: "a", target: "guess", strength: 0.4, real: false },
    ];
    const d1 = computeBlastSet("a", edges, 1);
    expect([...d1.keys()]).toEqual(["a", "b"]);
    const d2 = computeBlastSet("a", edges, 2);
    expect([...d2.keys()]).toEqual(["a", "b", "c"]);
    expect(d2.has("guess")).toBe(false);
  });

  it("computes disjoint spatial zones across timeline, privacy, review, and focus lenses", () => {
    const now = Date.now();
    const memories: Memory[] = [
      makeMemory("n1", { title: "Priv Policy", scope: "private", updatedAt: now - 120 * DAY_MS }),
      makeMemory("n2", { title: "Current Brief", scope: "local", updatedAt: now - 1 * DAY_MS }),
      makeMemory("n3", { title: "Outbound Claim Target", scope: "local", updatedAt: now - 10 * DAY_MS }),
    ];
    const byId = new Map(memories.map((m) => [m.id, m]));
    const nodes: LayoutNode[] = memories.map((m) => ({
      id: m.id, x: 0, y: 0, vx: 0, vy: 0, fx: null, fy: null, r: 8, pinned: false,
    }));
    const edges: LayoutEdge[] = [{ source: "n2", target: "n3", strength: 1, real: true }];

    const tl = computeLensTargets("timeline", nodes, byId, edges, "n2", new Set(), now);
    expect(tl.get("n1")!.x).toBe(-480);
    expect(tl.get("n2")!.x).toBe(480);

    const priv = computeLensTargets("privacy", nodes, byId, edges, "n2", new Set(), now);
    expect(priv.get("n1")!.x).toBeLessThan(0);
    expect(priv.get("n2")!.x).toBeGreaterThan(0);

    const focus = computeLensTargets("focus", nodes, byId, edges, "n2", new Set(["n3"]), now);
    expect(focus.get("n2")).toEqual({ x: 0, y: 0 });
    const distN3 = Math.hypot(focus.get("n3")!.x, focus.get("n3")!.y);
    expect(distN3).toBeGreaterThanOrEqual(FOCUS_EXCLUSION_RADIUS);
  });

  it("enforces plain English labels without node/nodes jargon", () => {
    for (const def of SPATIAL_LENSES) {
      expect(def.label).not.toMatch(/\bnodes?\b/i);
      expect(def.caption).not.toMatch(/\bnodes?\b/i);
      expect(def.caption).not.toMatch(/\s-\s/);
    }
  });
});

describe("KnowledgeGraph — PDCR Stage C2 integration", () => {
  beforeEach(() => {
    installiereLeinwand();
    installiereResizeObserver(1280, 760);
    installiereZeiger();
    setzeTheme("hell");
    localStorage.clear();
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.includes("/api/contradictions/resolve")) {
        return new Response(JSON.stringify({ ok: true }), { status: 200 });
      }
      return new Response(JSON.stringify({ relations: [], memoriesByEntity: {} }), { status: 200 });
    }));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders all 5 spatial lenses, 4-way contradiction tribunal, Trace ripple, and unclipped note titles", async () => {
    const memories: Memory[] = [
      makeMemory("m1", {
        title: "Q4 Advance VAT extension — Akte Hoffmann full audit",
        content: "The retention window is 28 days for statutory objection.",
        scope: "private",
      }),
      makeMemory("m2", {
        title: "Hoffmann deadline summary (AI extract)",
        content: "The retention window is 14 days for initial review.",
        scope: "local",
      }),
    ];

    const view = render(
      <KnowledgeGraph
        memories={memories}
        onSelectMemory={() => {}}
        sichtbar={true}
      />
    );
    await act(async () => { await new Promise((r) => setTimeout(r, 120)); });

    const buttons = [...view.container.querySelectorAll("button")];
    expect(buttons.find((b) => b.textContent?.trim() === "Atlas")?.getAttribute("data-on")).toBe("true");
    expect(buttons.find((b) => b.textContent?.trim() === "Timeline")).toBeTruthy();
    expect(buttons.find((b) => b.textContent?.trim() === "AI & Privacy")).toBeTruthy();
    const reviewBtn = buttons.find((b) => b.textContent?.trim() === "Review & Gaps")!;
    expect(reviewBtn).toBeTruthy();
    expect(buttons.find((b) => b.textContent?.trim() === "Focus")).toBeTruthy();

    // Switch to Review & Gaps -> verifies tribunal panel and 4-way options appear
    await act(async () => { fireEvent.click(reviewBtn); });
    const tribunal = view.container.querySelector(".graph-tribunal");
    expect(tribunal).toBeTruthy();
    const resBtns = [...view.container.querySelectorAll(".graph-tribunal-btn")];
    expect(resBtns).toHaveLength(4);

    // Trigger Trace ripple banner cleanly
    const rippleBtn = [...view.container.querySelectorAll("button")].find((b) => b.textContent?.trim() === "Trace ripple")!;
    await act(async () => { fireEvent.click(rippleBtn); });
    expect(view.container.querySelector(".graph-ripple-banner")?.textContent).toContain("steps");
  });
});
