// @vitest-environment jsdom
//
// Punkt 4, zweite Scheibe — die Trefferstufe muss die Liste kappen, nicht nur die Anfrage.
//
// Gemessen 31.10. 11:28 MESZ im echten Fenster (eigne Kapsel, 30 gesaete Notizen, Query
// "Fristenkontrolle"): die Stufe zeigt "5" und ihr Titel sagt "Showing at most 5 hits" —
// die Liste steht bei **16** Zeilen. Ueber alle sieben Stufen: 5 -> 16, 10 -> 16, 20 -> 20,
// 50 -> 30, 100/250/alles -> 30. Der Grund liegt im Quelltext: `anfrageLimit`
// (src/components/Dashboard.tsx:517) hebt die Anfrage auf mindestens die Suchtiefe (16), die
// Flaeche zeigt danach, was die Tuer bringt, und kappt nicht mehr auf die gewaehlte Stufe.
//
// decided, weil: ein Regler, dessen Zahl nicht das hält, was er sagt, ist genau die Klasse
// "Dinge, die nicht funktionieren". Die Kappe kommt auf die Anzeige, die Anfrage bleibt tief
// (sonst verschwinden Kandidaten aus der Rangfolge). Die bestehende Auskunft "N of M matches ·
// show all" ist der Rueckweg — sie zeigt schon heute, dass mehr passen.
//
// Die Grenze der Kappe: sie gilt nur im semantischen Zweig. Ohne Semantik gibt es kein
// `serverTotal`, also auch keinen Rueckweg — dort zu kappen hiessse, Notizen ohne jede
// Moeglichkeit zu verbergen. Ein Fall haelt das.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, act, fireEvent } from "@testing-library/react";
import { Dashboard } from "../../src/components/Dashboard";
import { AuthProvider } from "../../src/contexts/AuthContext";
import { ThemeProvider } from "../../src/contexts/ThemeContext";
import { ToastProvider } from "../../src/components/ui/Toast";
import { installiereResizeObserver } from "../helfer/canvas";
import type { Memory } from "../../src/types";

const NOTIZ = (i: number): Memory => ({
  id: `s${i}`, userId: "local", title: `Fristenkontrolle ${i}`, content: `Die Frist ${i} haelt.`,
  tags: ["saat"], type: "semantic",
  createdAt: Date.parse("2025-01-01"), updatedAt: Date.parse("2025-01-01"),
});

/**
 * Die Tuer bringt, was die Anfrage hergibt, und sagt dazu, wie viel **passt**: der Leib traegt
 * `results` (die bestellten Kandidaten, hier sechzehn) und `total` (alle Treffer, hier dreissig).
 * Ein Stub, der `total = results.length` setzt, erzaehlt der Flaeche eine bessere Welt, als die
 * Tuer liefert — gemessen 31.10. im echten Fenster, wo die Auskunft "5 of 30 matches" heisst und
 * der Streifen "16 hits" sagte. Also: beide Zahlen, getrennt.
 */
function tuer({ gesamt = 30 }: { gesamt?: number } = {}) {
  const alle = Array.from({ length: gesamt }, (_, i) => NOTIZ(i + 1));
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    const ziel = String(url);
    if (ziel.includes("/api/search")) {
      // Die echte Tuer kappt ihre Antwort selbst nach dem bestellten topK und nennt in `total`,
      // wie viel wirklich passt. Ein Stub, der beides vermischt, verkauft der Flaeche eine Welt,
      // die es nicht gibt — gemessen 31.10. im Fenster: "All" bringt 30, Stufe 5 bringt 16.
      const bestellt = Number((JSON.parse(String(init?.body ?? "{}")) as { topK?: number }).topK) || gesamt;
      const gebracht = alle.slice(0, Math.min(gesamt, bestellt));
      return new Response(JSON.stringify({
        results: gebracht.map((m) => ({ memory: m, score: 0.9, matchedTerms: ["frist"] })),
        total: gesamt, usedVectors: false, query: "frist",
      }), { status: 200, headers: { "content-type": "application/json" } });
    }
    if (ziel.includes("/api/memories")) {
      return new Response(JSON.stringify({ count: alle.length, total: alle.length, memories: alle }), {
        status: 200, headers: { "content-type": "application/json", "x-kepta-total": String(alle.length) },
      });
    }
    if (ziel.includes("/api/graph")) return new Response(JSON.stringify({ relations: [], memoriesByEntity: {} }), { status: 200 });
    if (ziel.includes("/api/inbox/status")) return new Response(JSON.stringify({ inboxDir: "/x", files: [], watching: true }), { status: 200 });
    if (ziel.includes("/api/health")) {
      return new Response(JSON.stringify({ ok: true, count: alle.length, version: "3.2.101", embeddings: { total: 60, embedded: 60, models: {} }, encryption: { aktiv: true } }), { status: 200 });
    }
    return new Response("{}", { status: 200 });
  }));
}


async function zeichne(und: { topK?: string; semantik?: string } = {}) {
  localStorage.clear();
  if (und.topK !== undefined) localStorage.setItem("ki_gehirn_topK", und.topK);
  if (und.semantik !== undefined) localStorage.setItem("ki_gehirn_semantic", und.semantik);
  const view = render(
    <AuthProvider><ThemeProvider><ToastProvider><Dashboard /></ToastProvider></ThemeProvider></AuthProvider>
  );
  await act(async () => { await new Promise((r) => setTimeout(r, 500)); });
  const feld = view.container.querySelector<HTMLInputElement>('input[aria-label="Search your memory"]');
  expect(feld, "das Suchfeld fehlt — die Flaeche hat ihre Form geaendert").not.toBeNull();
  fireEvent.change(feld!, { target: { value: "Fristenkontrolle" } });
  await act(async () => { await new Promise((r) => setTimeout(r, 1600)); });
  return view;
}

const zeilen = (container: HTMLElement) => container.querySelectorAll(".row-entry").length;
const text = (container: HTMLElement) => (container.textContent || "").replace(/\s+/g, " ");

beforeEach(() => { installiereResizeObserver(); });
afterEach(() => { vi.unstubAllGlobals(); });

describe("Punkt 4: die Trefferstufe kantt die Liste", () => {
  it("auf Stufe 5 stehen fuenf Zeilen, nicht sechzehn", async () => {
    tuer();
    const { container } = await zeichne({ topK: "5" });
    expect(zeilen(container), `die Stufe sagt 5, die Liste zeigt ${zeilen(container)}`).toBe(5);
  });

  it("die Liste nennt ihre eigene Kappe und den Rueckweg", async () => {
    tuer();
    const { container } = await zeichne({ topK: "5" });
    // Der Streifen darf nicht "16 hits" sagen, wenn 30 passen: der Chip an der Stufe nennt "5", und die Auskunft unter der
    // Liste sagt, wie viel die Tuer wirklich hat. ("Top 5" stünde nur, wenn nichts mehr passte —
    // hier ist der Rueckweg der Knopf, nicht die Kappe.)
    const stufe = [...container.querySelectorAll(".chip")].some((c) => (c.textContent || "").trim() === "5");
    expect(stufe, "die Stufe nennt ihre eigne Zahl nicht").toBe(true);
    expect(text(container), "der Streifen nennt nicht, wie viel wirklich passt").toMatch(/16 of 30 hits/);
    expect(text(container), "der Rueckweg ueber die Kappe hinweg fehlt").toMatch(/5 of 30 matches/);
  });

  it("ein Klick auf den Rueckweg hebt die Kappe auf", async () => {
    tuer();
    const view = await zeichne({ topK: "5" });
    const weg = [...view.container.querySelectorAll("button")].find((b) => /show all/i.test(b.textContent || ""));
    expect(weg, "der Show-all-Knopf steht nicht").toBeDefined();
    fireEvent.click(weg!);
    await act(async () => { await new Promise((r) => setTimeout(r, 1400)); });
    expect(zeilen(view.container), "nach dem Klick ist die Liste nicht voller").toBe(30);
    expect(localStorage.getItem("ki_gehirn_topK"), "die Stufe wurde nicht auf alles gestellt").toBe("0");
  });

  it("auf der letzten Stufe bleibt alles stehen", async () => {
    tuer();
    const { container } = await zeichne({ topK: "0" });
    expect(zeilen(container)).toBe(30);
    expect(text(container)).toMatch(/All matches/);
  });

  it("ein Bestand unter der Stufe wird nicht gekappt", async () => {
    tuer({ gesamt: 3 });
    const { container } = await zeichne({ topK: "5" });
    expect(zeilen(container)).toBe(3);
    expect(text(container), "bei drei Treffern darf keine Show-all-Auskunft stehen").not.toMatch(/show all/i);
  });

  it("ohne Semantik kantt die Stufe nichts — dort gibt es keinen Rueckweg", async () => {
    tuer();
    const { container } = await zeichne({ topK: "5", semantik: "false" });
    expect(zeilen(container) > 5, `ohne Semantik stehen nur ${zeilen(container)} Zeilen — die Liste kaeme ohne Rueckweg aus`).toBe(true);
  });

  /* P193 (Damian-Befund, 9.11.): der Spuren-Schalter richtet die Liste AUF.
     Sein Video zeigte den Blackscreen: der Klick auf Words/Meaning/Graph liefert
     der Liste neue Ergebnisse, ohne den sichtbaren Zähler zurückzusetzen — wer
     vorher per Nachladen den Aufbau vergrößert hatte, malte beim nächsten Such-Lauf
     plötzlich den ganzen Aufbau auf einmal, und das Fenster erstarrte. Die Such-
     ergebnisse ändern sich mit jeder Stimme, also muss die Liste auf ihren Anfang
     zurück (die ersten 48 Karten), sobald eine Stimme umgestellt wird. */
  it("P193: nach dem Umstellen einer Stimme richtet sich die Liste auf den Anfang", async () => {
    tuer({ gesamt: 3000 });
    const { container } = await zeichne({ topK: "0" });
    const erste = zeilen(container);
    expect(erste, "die Liste startet nicht bei der Seitengröße").toBe(48);
    // Die Liste aufbauen: der Load-more-Knopf hebt den sichtbaren Zähler.
    for (let k = 0; k < 3; k++) {
      const mehr = [...container.querySelectorAll("button")].find((b) => /Load more/i.test(b.textContent || ""));
      if (!mehr) break;
      fireEvent.click(mehr!);
      await act(async () => { await new Promise((r) => setTimeout(r, 900)); });
    }
    const aufgebaut = zeilen(container);
    expect(aufgebaut, "der Aufbau wuchs nicht — der Test kann die Rücksetzung nicht sehen").toBeGreaterThan(erste);

    // Der Klick, der bei Damian schwarz wurde: eine Stimme umstellen.
    await act(async () => {
      localStorage.setItem("ki_gehirn_spur_bm25", "0");
      window.dispatchEvent(new CustomEvent("kepta_such_prefs"));
      await new Promise((r) => setTimeout(r, 1200));
    });
    // Die Suche lief neu — die Liste muss auf ihren Anfang zurück (48 Karten),
    // nicht am alten Aufbau hängen (dort malte sie beim Umschalten alles auf einmal).
    expect(zeilen(container), `nach der Stimme standen ${zeilen(container)} Zeilen — der Aufbau wurde nicht aufgerichtet`).toBe(48);
  });
});
