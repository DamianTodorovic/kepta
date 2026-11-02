// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, act } from "@testing-library/react";
import { Dashboard } from "../../src/components/Dashboard";
import { AuthProvider } from "../../src/contexts/AuthContext";
import { ThemeProvider } from "../../src/contexts/ThemeContext";
import { ToastProvider } from "../../src/components/ui/Toast";
import { installiereResizeObserver } from "../helfer/canvas";

beforeEach(() => { localStorage.clear(); installiereResizeObserver(1200, 800);
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ count: 0, total: 0, memories: [] }), { status: 200 }))); });
afterEach(() => vi.unstubAllGlobals());

describe("scratch", () => {
  it("druckt den gerenderten Text", async () => {
    const { container } = render(<ThemeProvider><AuthProvider><ToastProvider><Dashboard /></ToastProvider></AuthProvider></ThemeProvider>);
    await act(async () => { await new Promise((r) => setTimeout(r, 200)); });
    console.log("GEMALT>>> " + (container.textContent || "").slice(0, 900));
    expect(true).toBe(true);
  });
});
