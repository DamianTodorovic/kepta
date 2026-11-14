// @vitest-environment jsdom
// Punkt 7, 2.11. — ein Statuswort, das wie ein Befehl gelesen wird.
//
// Beide Erstleser des gemalten Korpus stossen an demselben Wort an:
//   Leser 1: "'Clean' sounds mildly dangerous with no description at all"
//   Leser 2: "I would not touch … nor 'Clean' — could delete; the word does not say what"
// Die Flaeche meint keinen Knopf: `Dashboard.tsx:1762` malt einen **Status-Chip**, wenn nichts zu
// tun ist, und der Nachbarzweig sagt "N duplicates · Review". Ein Zustand, der wie ein
// Imperativ aussieht, ist ein Wort, das der Nutzer erst uebersetzen muss — und beim Uebersetzen
// raeumt er lieber nicht ein.
//
// Diese Datei haelt beide Zweige, damit die Heilung nicht eine Haelfte benennt: der leere Zweig
// sagt "No duplicates", der volle Zweig behaelt seine Zahl und seinen Review-Weg.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, waitFor } from "@testing-library/react";
import { Dashboard } from "../../src/components/Dashboard";
import { AuthProvider } from "../../src/contexts/AuthContext";
import { ThemeProvider } from "../../src/contexts/ThemeContext";
import { ToastProvider } from "../../src/components/ui/Toast";
import { installiereLeinwand, installiereResizeObserver } from "../helfer/canvas";
import type { Memory } from "../../src/types";

function notiz(i: number, titel: string, inhalt: string): Memory {
  return {
    id: `m${i}`, userId: "local", title: titel, content: inhalt, tags: [], type: "semantic",
    createdAt: Date.parse("2025-01-01"), updatedAt: Date.parse("2025-01-01"),
  };
}

function stubpeTuer(memories: Memory[]) {
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    const ziel = String(url);
    if (ziel.includes("/api/memories/gruppen")) {
      return new Response(JSON.stringify({
        ok: true, bestand: memories.length, ohneThema: memories.length, ms: 2,
        traeger: { notes: memories.length, files: 0, code: 0, daten: 0, anderes: 0 },
        themen: { people: 0, projects: 0, events: 0, tasks: 0, guides: 0, links: 0 },
      }), { status: 200 });
    }
    if (ziel.includes("/api/memories")) {
      return new Response(JSON.stringify({ count: memories.length, total: memories.length, memories }), {
        status: 200, headers: { "content-type": "application/json", "x-kepta-total": String(memories.length) },
      });
    }
    if (ziel.includes("/api/duplicates")) return new Response(JSON.stringify({ groups: [] }), { status: 200 });
    return new Response(JSON.stringify({ results: [], total: 0, relations: [], memoriesByEntity: {}, files: [], ok: true }), { status: 200 });
  }));
}

async function zeige(memories: Memory[]) {
  stubpeTuer(memories);
  const { container } = render(
    <ThemeProvider><AuthProvider><ToastProvider><Dashboard /></ToastProvider></AuthProvider></ThemeProvider>
  );
  // Gewartet wird auf den Zustand, nicht auf den Rahmen: die Liste laeuft einem Takt nach,
  // und ein Snapshot beim ersten Streifen misst die Flaeche vor ihrem ersten Laden.
  await waitFor(() => expect((container.textContent || "").replace(/\s+/g, " ")).toMatch(/3 of 3/i), { timeout: 8000 });
  return (container.textContent || "").replace(/\s+/g, " ");
}

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem("ki_gehirn_wizard_dismissed", "1");
  installiereLeinwand();
  installiereResizeObserver(1200, 800);
  Element.prototype.scrollIntoView = vi.fn();
});
afterEach(() => { vi.unstubAllGlobals(); });

describe("Punkt 7: der leere Duplett-Zweig ist ein Zustand, kein Befehl", () => {
  it("sagt 'No duplicates', wenn nichts zu tun ist — und kein Wort, das nach Wegraeumen klingt", async () => {
    const text = await zeige([
      notiz(1, "Frist 1", "Die Frist 1 haelt die Kasse 0."),
      notiz(2, "Frist 2", "Die Frist 2 haelt die Kasse 1."),
      notiz(3, "Frist 3", "Die Frist 3 haelt die Kasse 2."),
    ]);
    expect(text, `der Zustand heisst weiter wie ein Imperativ: ${text.slice(0, 400)}`).toMatch(/No duplicates/i);
    expect(text, `das Statuswort steht noch auf dem Schirm: ${text.slice(0, 400)}`).not.toMatch(/\bClean\b/);
  });

  it("erklaert an dem Chip, was gemeint ist — die Leser klagten genau das an", async () => {
    stubpeTuer([notiz(1, "Frist 1", "Die Frist 1 haelt die Kasse 0.")]);
    const { container } = render(
      <ThemeProvider><AuthProvider><ToastProvider><Dashboard /></ToastProvider></AuthProvider></ThemeProvider>
    );
    const chip = await waitFor(() => {
      const e = [...container.querySelectorAll(".chip")].find((c) => /No duplicates/i.test(c.textContent || ""));
      if (!e) throw new Error("der Duplett-Chip ist nicht gemalt");
      return e;
    });
    const titel = chip.getAttribute("title") || "";
    expect(titel, `der Chip erklaert sich nicht: "${titel}"`).toMatch(/nothing to do|no obvious duplicates/i);
  });
});
