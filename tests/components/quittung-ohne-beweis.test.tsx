// @vitest-environment jsdom
// Punkt 4 und 7, 2.11. — eine Quittung, die nicht fragt, ob das Werk gelang.
//
// Der Fehlerpfad-Zensus nannte drei Stellen, und ich habe sie selbst nachgelesen, bevor dies
// hier geschrieben wurde:
//
//   1. Dashboard.tsx:1178  `await saveMemory({...}); totalNodes++;` — saveMemory faengt jeden
//      Fehlwurf und gibt `null` zurueck (store.ts:324-335). Der Rueckgabewert wird verworfen,
//      der Zaehler steigt trotzdem. Fuenf verweigerte Schreibungen malen "Imported 5 nodes
//      from 1 file." in den **gruenen** Kasten (:1800).
//   2. Dashboard.tsx:563   `const r = await fetch('/api/inbox/scan'); const d = await r.json();`
//      — `r.ok` wird nie gefragt. Ein Fehlerkorper mit JSON (429, 500) ergibt
//      "Inbox: undefined files scanned, undefined nodes imported", ebenfalls gruen.
//   3. OnboardingWizard.tsx:108  zaehlt nur `r.ok`; sind alle Posten fehlgeschlagen, steht
//      "0 notes created for you" im gruenen Kasten (:331) und `onComplete` laeuft trotzdem.
//
// Dasselbe Muster hat Damian am 14.10. schon einmal erwischt ("Sicherung sichert die Seite":
// 100 von 21 066 Knoten als "Backup created" verkauft). Eine Zahl in einer Erfolgsmeldung darf
// nur aus einer **gefragten** Antwort kommen.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, waitFor } from "@testing-library/react";
import { act } from "react";
import { Dashboard } from "../../src/components/Dashboard";
import { AuthProvider } from "../../src/contexts/AuthContext";
import { ThemeProvider } from "../../src/contexts/ThemeContext";
import { ToastProvider } from "../../src/components/ui/Toast";
import { installiereResizeObserver } from "../helfer/canvas";
import type { Memory } from "../../src/types";

const LEER: Memory[] = [];

/** Ein Dateifeld, eine echte Datei, ein change-Ereignis — derselbe Weg wie Dashboard.test.tsx:293. */
async function dateiAblegen(container: HTMLElement, text: string, name: string) {
  const eingabe = container.querySelector('input[type="file"]') as HTMLInputElement;
  if (!eingabe) throw new Error("kein Dateifeld");
  const datei = new File([text], name, { type: "text/markdown" });
  Object.defineProperty(eingabe, "files", { value: [datei], configurable: true });
  await act(async () => {
    eingabe.dispatchEvent(new Event("change", { bubbles: true }));
    await new Promise((r) => setTimeout(r, 400));
  });
}

function stubpe(tuer: (url: string, init?: RequestInit) => Promise<Response>) {
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => tuer(String(url), init)));
}

const ALLE_SCHREIBUNGEN_VERWEIGERT = async () =>
  new Response(JSON.stringify({ error: "the store is closed" }), { status: 500 });

/** Die Tuer heisst /api/memories (store.ts:305) — ein Muster auf "/api/memory" trifft sie NIE. */
const SCHREIBUNG = (url: string, init?: RequestInit) =>
  url.includes("/api/memories") && String(init?.method || "GET") === "POST";

async function zeige() {
  const view = render(
    <ThemeProvider><AuthProvider><ToastProvider><Dashboard /></ToastProvider></AuthProvider></ThemeProvider>
  );
  await act(async () => { await new Promise((r) => setTimeout(r, 200)); });
  return view;
}

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem("ki_gehirn_wizard_dismissed", "1");
  installiereResizeObserver(1200, 800);
});
afterEach(() => { vi.unstubAllGlobals(); });

describe("Punkt 4: der Import meldet nur, was wirklich gerettet wurde", () => {
  it("sagt, dass nichts gerettet wurde, wenn jede Schreibung abgewiesen wird", async () => {
    stubpe(async (url, init) => {
      if (SCHREIBUNG(url, init)) return ALLE_SCHREIBUNGEN_VERWEIGERT();
      if (url.includes("/api/health")) return new Response(JSON.stringify({ ok: true, count: 0, version: "3.2.118", encryption: { aktiv: true }, embeddings: { total: 0, embedded: 0 }, mcp: { tools: 8, protocol: "2026-07-28" } }), { status: 200 });
      return new Response(JSON.stringify({ memories: [], count: 0, total: 0 }), { status: 200, headers: { "content-type": "application/json" } });
    });
    const { container } = await zeige();
    await dateiAblegen(container, "# Fristen\n\nMontags und donnerstags.", "Fristen.md");
    const text = await waitFor(() => {
      const t = (container.textContent || "").replace(/\s+/g, " ");
      if (!/saved|Imported|Nothing/i.test(t)) throw new Error(`keine Quittung: "${t.slice(0, 200)}"`);
      return t;
    });
    expect(text, `die Quittung behauptet einen Import, den niemand bestaetigt hat: ${text}`).not.toMatch(/Imported \d+/);
    expect(text, `kein Wort des Fehlschlags: ${text}`).toMatch(/Nothing was saved/i);
    // 3.2.117, dritter Traeger: dieselbe Zahl, die oben notes heisst, durfte in der Quittung
    // nicht nodes heissen.
    expect(text, `die Quittung zaehlt nodes, wo die Seitenleiste notes zaehlt: ${text}`).not.toMatch(/\bnodes\b/);
  });

  it("nennt beide Zahlen, wenn ein Teil der Schreibungen durchgeht", async () => {
    let versuche = 0;
    stubpe(async (url, init) => {
      if (SCHREIBUNG(url, init)) {
        versuche += 1;
        return versuche % 2 === 1
          ? new Response(JSON.stringify({ memory: { id: `m${versuche}`, title: "t", content: "c", tags: [], userId: "local", createdAt: Date.now(), updatedAt: Date.now() } }), { status: 201 })
          : ALLE_SCHREIBUNGEN_VERWEIGERT();
      }
      if (url.includes("/api/health")) return new Response(JSON.stringify({ ok: true, count: 0, version: "3.2.118", encryption: { aktiv: true }, embeddings: { total: 0, embedded: 0 }, mcp: { tools: 8, protocol: "2026-07-28" } }), { status: 200 });
      return new Response(JSON.stringify({ memories: [], count: 0, total: 0 }), { status: 200, headers: { "content-type": "application/json" } });
    });
    const { container } = await zeige();
    // Zwei Dateien, damit mehr als eine Schreibung laeuft.
    const eingabe = container.querySelector('input[type="file"]') as HTMLInputElement;
    const dateien = [
      new File(["Erster Text mit genug Woertern fuer eine Notiz."], "a.md", { type: "text/markdown" }),
      new File(["Zweiter Text mit genug Woertern fuer eine Notiz."], "b.md", { type: "text/markdown" }),
    ];
    Object.defineProperty(eingabe, "files", { value: dateien, configurable: true });
    await act(async () => {
      eingabe.dispatchEvent(new Event("change", { bubbles: true }));
      await new Promise((r) => setTimeout(r, 600));
    });
    const text = await waitFor(() => {
      const t = (container.textContent || "").replace(/\s+/g, " ");
      if (!/saved|refused|Nothing|Imported/i.test(t)) throw new Error(`keine Quittung: "${t.slice(0, 220)}"`);
      return t;
    });
    expect(versuche, `es liefen nur ${versuche} Schreibungen — die Wache prueft ins Leere: ${text}`).toBeGreaterThan(1);
    expect(text, `ein Teilerfolg wird als voller Erfolg gemalt: ${text}`).toMatch(/\d+ of \d+ notes saved/i);
  });
});

describe("Punkt 4: der Inbox-Scan fragt den Status, bevor er Zahlen malt", () => {
  it("meldet den Fehlschlag statt undefined-Zahlen, wenn die Tuer einen Fehlerkorper sendet", async () => {
    stubpe(async (url) => {
      if (url.includes("/api/inbox/scan")) return new Response(JSON.stringify({ error: "capped" }), { status: 429 });
      if (url.includes("/api/inbox/status")) return new Response(JSON.stringify({ inboxDir: "/x", files: [], watching: true }), { status: 200 });
      if (url.includes("/api/health")) return new Response(JSON.stringify({ ok: true, count: 0, version: "3.2.118", encryption: { aktiv: true }, embeddings: { total: 0, embedded: 0 }, mcp: { tools: 8, protocol: "2026-07-28" } }), { status: 200 });
      return new Response(JSON.stringify([]), { status: 200, headers: { "content-type": "application/json" } });
    });
    const { container } = await zeige();
    const knopf = await waitFor(() => {
      const k = [...container.querySelectorAll("button")].find((b) => /scan/i.test(b.textContent || ""));
      if (!k) throw new Error("kein Scan-Knopf");
      return k;
    });
    await act(async () => { knopf.click(); await new Promise((r) => setTimeout(r, 400)); });
    const text = (container.textContent || "").replace(/\s+/g, " ");
    expect(text, `undefined steht als Zahl auf dem Schirm: ${text}`).not.toMatch(/undefined/);
    expect(text, `der 429 wurde als Erfolg gemalt: ${text}`).toMatch(/Inbox scan failed/i);
  });

  it("zaehlt notes, nicht nodes, wenn der Scan wirklich antwortet", async () => {
    stubpe(async (url) => {
      if (url.includes("/api/inbox/scan")) return new Response(JSON.stringify({ scanned: 3, imported: 2 }), { status: 200 });
      if (url.includes("/api/inbox/status")) return new Response(JSON.stringify({ inboxDir: "/x", files: [], watching: true }), { status: 200 });
      if (url.includes("/api/health")) return new Response(JSON.stringify({ ok: true, count: 0, version: "3.2.118", encryption: { aktiv: true }, embeddings: { total: 0, embedded: 0 }, mcp: { tools: 8, protocol: "2026-07-28" } }), { status: 200 });
      return new Response(JSON.stringify([]), { status: 200, headers: { "content-type": "application/json" } });
    });
    const { container } = await zeige();
    const knopf = await waitFor(() => {
      const k = [...container.querySelectorAll("button")].find((b) => /scan/i.test(b.textContent || ""));
      if (!k) throw new Error("kein Scan-Knopf");
      return k;
    });
    await act(async () => { knopf.click(); await new Promise((r) => setTimeout(r, 400)); });
    const text = (container.textContent || "").replace(/\s+/g, " ");
    expect(text, `die Quittung nennt 3 Dateien: ${text}`).toMatch(/3 files scanned/i);
    expect(text, `der Scan zaehlt nodes, wo die Seitenleiste notes zaehlt: ${text}`).toMatch(/2 notes imported/i);
  });
});
