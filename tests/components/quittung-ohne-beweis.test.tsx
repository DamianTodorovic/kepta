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

describe("Der Import-Ausnahmewortlaut bleibt beim Betreiber, nicht auf dem Knopf", () => {
  it("zeigt einen festen Satz statt der Ausnahme, und die Ausnahme nirgends", async () => {
    // Aufgesucht am 3.11. um 18:58 im Fensterlauf `scripts/pfade-im-fenster.mjs`: der
    // Vor-Diener warf absichtlich in localStorage, und der Import-Knopf hiefs danach
    // "blockiert" — der Wortlaut einer Ausnahme, mitten auf der Flaeche. In der
    // Wirklichkeit waere das eine Speicher- oder Bibliothekszeile, oft mit Pfad.
    // Hausregel seit P4-2310 (c): nach aussen geht ein fester Satz, der Grund bleibt
    // beim Betreiber.
    const verraeter = ["QuotaExceededError", "/Users/a/.kepta", "the quota has been exceeded"];
    // Der Weg in den Ausnahmepfad ist die Datei selbst: extractTextFromFile ruft
    // file.text() (Dashboard.tsx:158), und eine Bibliothek, die darin wirft, ist genau
    // der Fall, dessen Wortlaut hier nicht auf den Knopf darf.
    stubpe(async () => new Response(JSON.stringify({ ok: true }), { status: 200 }));
    const werf = vi.spyOn(File.prototype, "text").mockRejectedValue(
      new Error("QuotaExceededError: the quota has been exceeded — /Users/a/.kepta/kepta.db")
    );
    const { container } = await zeige();
    await dateiAblegen(container, "Inhalt eines Mandats.", "mandat.md");
    await waitFor(() => expect(container.textContent || "").toMatch(/Import did not run/i));
    const text = (container.textContent || "").replace(/\s+/g, " ");
    expect(werf).toHaveBeenCalled();
    for (const wort of verraeter) {
      expect(text, `die Flaeche fuehrt den Wortlaut der Ausnahme: ${wort}`).not.toContain(wort);
    }
    // P71 (5.11.): dieselbe Zeile verweist auch nicht mehr auf die Konsole. Gemessen am
    // ausgelieferten 3.2.160 trug das Objekt den Verweis zweimal, weil die Objekt-Sonde
    // ihn nur in Kleinschreibung kannte.
    expect(text, `der Satz schickt den Nutzer in die Konsole: ${text}`).not.toMatch(/developer console/i);
    // Und er nennt die eigne Zaehlung: hier warf die erste Datei, also wurde nichts geschrieben.
    expect(text).toMatch(/No note was written/i);
  });

  it("zaehlt die geretteten Schreibungen, wenn der Wurf mitten im Stapel kommt", async () => {
    // Der Fall hinter der ersten Haelfte des Satzes: eine Datei geht durch, die naechste
    // wirft. "No note was written" waere dann eine Luege -- die Flaeche schuldet die Zahl.
    let aufruf = 0;
    // saveMemory (store.ts:338) liefert die Bestaetigung NUR aus `data.memory` — ein
    // Rumpf ohne dieses Feld laesst die Quittung bei null stehen und der Fall wuerde
    // den andern Zweig treffen. Also antwortet die Tuer hier wie im echten Lauf.
    stubpe(async (url, init) => {
      const meth = String(init?.method ?? "GET").toUpperCase();
      if (url === "/api/memories" && meth === "POST") {
        return new Response(JSON.stringify({ ok: true, memory: { id: "m-erste", userId: "local", title: "erste", content: "Inhalt der ersten Datei.", tags: ["import", "md"], createdAt: 1, updatedAt: 1 } }), { status: 200 });
      }
      return new Response(JSON.stringify({ ok: true, memories: [], total: 0 }), { status: 200 });
    });
    vi.spyOn(File.prototype, "text").mockImplementation(async () => {
      aufruf += 1;
      if (aufruf === 1) return "Inhalt der ersten Datei.";
      throw new Error("QuotaExceededError: the quota has been exceeded — /Users/a/.kepta/kepta.db");
    });
    const { container } = await zeige();
    // Beide Dateien in EINEM Abgabe-Vorgang: zwei Aufrufe hinter einander wuerden die
    // erste Quittung loeschen, bevor die zweite entsteht (QUITTUNG_MS), und der Wurf
    // muss den Stapel mitten im Lauf treffen.
    const eingabe = container.querySelector('input[type="file"]') as HTMLInputElement;
    expect(eingabe, "kein Dateifeld in der Flaeche").toBeTruthy();
    Object.defineProperty(eingabe, "files", {
      value: [new File(["Inhalt der ersten Datei."], "erste.md", { type: "text/markdown" }),
              new File(["Inhalt der zweiten Datei."], "zweite.md", { type: "text/markdown" })],
      configurable: true,
    });
    await act(async () => {
      eingabe.dispatchEvent(new Event("change", { bubbles: true }));
      await new Promise((r) => setTimeout(r, 600));
    });
    await waitFor(() => expect(container.textContent || "").toMatch(/Import stopped after/i));
    const text = (container.textContent || "").replace(/\s+/g, " ");
    expect(text, `die Quittung nennt keine Zahl: ${text}`).toMatch(/1 of 1 writes/);
    expect(text).toMatch(/What is saved stays in your notes/i);
    expect(text).not.toMatch(/developer console/i);
    for (const wort of ["QuotaExceededError", "/Users/a/.kepta"]) expect(text).not.toContain(wort);
  });
});
