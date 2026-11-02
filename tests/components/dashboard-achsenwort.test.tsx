// @vitest-environment jsdom
// Punkt 5, erster Schlag: die drei Achsen des Wissens brauchen drei verschiedene Fragen.
//
// Warum diese Datei existiert und kein Fall vorher: die Flaeche zaehlt unter dem Wort
// "where it came from" die TRAEGER (Notes / Files / Code, Dashboard.tsx:1815-1818 und :1829),
// waehrend dasselbe Wort im Graph die HERKUNFT meint ("Colour by where notes came from",
// KnowledgeGraph.tsx:5619; die Achse selbst: graphHerkunft.ts:47-51). Damian hat am
// 29.10. ein Bild genau dieser Zeile geschickt und die Gruppierung seines Wissens
// beanstandet. Ein Wort, das zwei Achsen nennt, ist keine Gruppierung, sondern ein
// Ratespiel - und die Marktzaehlung haelt fest, dass jedes der verglichenen Produkte seine
// erste Achse mit dem Wort benennt, das ihre Zahlen zaehlen
// (feldzug/belege-2910/markt/MARKT-FUNKTIONEN-GRUPPIERUNG-2910.md, Abschnitt E1).
//
// Die Gegenrichtung ist Teil des Auftrags: das Wort der Herkunft bleibt im Besitz der
// Herkunft. Ein Fall, der nur die eine Seite prueft, waere die Haelfte eines Beweises.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, act } from "@testing-library/react";
import { Dashboard } from "../../src/components/Dashboard";
import { AuthProvider } from "../../src/contexts/AuthContext";
import { ThemeProvider } from "../../src/contexts/ThemeContext";
import { ToastProvider } from "../../src/components/ui/Toast";
import { installiereLeinwand, installiereResizeObserver, installiereZeiger } from "../helfer/canvas";
import { TRAEGER_FRAGE, TRAEGER_FRAGE_SATZ, THEMA_FRAGE } from "../../src/lib/graphHierarchy";
import { HERKUNFT_FRAGE } from "../../src/lib/graphHerkunft";
import type { Memory } from "../../src/types";

vi.mock("../../src/lib/pdfText", () => ({
  pdfTextAusBuffer: vi.fn(async () => ""),
}));

let idZaehler = 0;
function note(over: Partial<Memory> = {}): Memory {
  const i = ++idZaehler;
  return {
    id: `m${i}`, userId: "local", title: `Notiz ${i}`, content: `Inhalt ${i}`,
    tags: [], type: "semantic", createdAt: Date.parse("2025-01-01"), updatedAt: Date.parse("2025-01-01"),
    ...over,
  };
}

function stubFetch() {
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    const u = String(url);
    if (u.includes("/api/memories/gruppen")) {
      return new Response(JSON.stringify({
        ok: true, bestand: 150,
        traeger: { notes: 100, files: 30, code: 20 },
        themen: { people: 5, projects: 9, events: 3, tasks: 1, guides: 2, links: 4 },
      }), { status: 200 });
    }
    if (u.includes("/api/health")) {
      return new Response(JSON.stringify({ ok: true, version: "3.2.92", count: 150 }), { status: 200 });
    }
    if (u.includes("/api/license")) {
      return new Response(JSON.stringify({ licensed: false }), { status: 200 });
    }
    if (u.includes("/api/memor")) {
      return new Response(JSON.stringify([
        note({ title: "Gedanke", content: "Frei getippt, keine Datei dahinter" }),
        note({ title: "Papier", content: "— Source: /tmp/b.md", tags: ["machine-scan"] }),
      ]), { status: 200 });
    }
    return new Response("{}", { status: 200 });
  }));
}

async function zeige() {
  const view = render(
    <ThemeProvider><AuthProvider><ToastProvider><Dashboard /></ToastProvider></AuthProvider></ThemeProvider>
  );
  await act(async () => { await new Promise((r) => setTimeout(r, 150)); });
  return view;
}

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem("ki_gehirn_wizard_dismissed", "1");
  idZaehler = 0;
  stubFetch();
  installiereLeinwand();
  installiereResizeObserver(1000, 700);
  installiereZeiger();
  Element.prototype.scrollIntoView = vi.fn();
});

describe("Punkt 5: drei Achsen, drei Fragen", () => {
  it("kennt fuer jede Achse genau eine Frage in Menschensprache", () => {
    const fragen = [TRAEGER_FRAGE, THEMA_FRAGE, HERKUNFT_FRAGE];
    for (const f of fragen) {
      expect(typeof f, "eine Achse hat kein Wort — eine Zahl ohne Frage ist Schmuck").toBe("string");
      expect((f ?? "").length, "das Wort einer Achse ist leer").toBeGreaterThan(0);
    }
    // Drei verschiedene Worte, nicht drei Varianten eines Wortes.
    const norm = fragen.map((f) => f.toLowerCase().replace(/[^a-z ]/g, "").trim());
    expect(new Set(norm).size, `zwei Achsen nennen sich gleich: ${fragen.join(" | ")}`).toBe(3);
  });

  it("laesst das Wort der Herkunft bei der Herkunft und nimmt es dem Traeger weg", () => {
    expect(HERKUNFT_FRAGE.toLowerCase()).toMatch(/came from|where/);
    expect(TRAEGER_FRAGE.toLowerCase(), "der Traeger leiht sich das Wort der Herkunft").not.toMatch(/came from/);
    expect(TRAEGER_FRAGE_SATZ.toLowerCase(), "der Traeger leiht sich das Wort der Herkunft").not.toMatch(/came from/);
  });

  it("nennt die Traeger-Zahlen im Streifen bei ihrer eignen Frage", async () => {
    const { container } = await zeige();
    await waitFor(() => expect(container.textContent).toMatch(/all of your notes/i), { timeout: 6000 });
    expect(container.textContent, `der Streifen steht unter falschem Wort: ${streifenWort(container)}`)
      .toMatch(/in what form · all of your notes/);
    expect(container.textContent, "unter den Traeger-Zahlen steht wieder die Herkunfts-Frage")
      .not.toMatch(/where it came from · all of your notes/);
  });

  it("fuehrt die Chips-Gruppe mit demselben Wort wie den Streifen", async () => {
    const { container } = await zeige();
    await waitFor(() => expect(container.textContent).toMatch(/all of your notes/i), { timeout: 6000 });
    expect(screen.getByRole("group", { name: new RegExp(TRAEGER_FRAGE, "i") }),
      "die Traeger-Chips tragen ein andres Wort als ihre Zahlen oben").toBeTruthy();
    expect(screen.queryByRole("group", { name: /where it came from/i }),
      "eine Gruppe auf der Liste heisst weiter 'where it came from'").toBeNull();
  });
});

/** Der Satz unter den drei Traeger-Zahlen, falls er zu finden ist - fuer die Meldung. */
function streifenWort(container: HTMLElement): string {
  return traegerZelle(container)?.querySelector(".k")?.textContent ?? "(keine Zeile gefunden)";
}

/**
 * Nur die Zelle, die die Traeger-Zahlen haelt.
 *
 * Grund, dass der Rest des Blatts hier nicht mitgerechnet wird: die erste Fassung dieser
 * Faelle suchte "100 %" im Text der ganzen Flaeche und verlor an der Einstellungen-Zeile
 * "Text size 100 %" — ein Zeuge, der die angeklagte Stelle nicht ansieht, klagt die falsche
 * an. Gesehen 23:56:15, zwei Faelle rot bei richtiger Auskunft.
 */
function traegerZelle(container: HTMLElement): Element | undefined {
  return [...container.querySelectorAll(".index-cell")].find((c) => /Notes|Files|Code/.test(c.textContent ?? ""));
}

/**
 * Zweite Scheibe (Punkt 5, Fix 4 von 16.10., bis heute ungebaut): die Zeile nennt den
 * ANTEIL, nicht nur die Menge.
 *
 * Grund, dass dieser Fall existiert: an Damians echtem Bestand (21 066, heute 15:51:39 an der
 * eignen Tuer gemessen) sind 92 Stuecke selbst getippt = 0,44 %. Die Menge allein sagt ihm das
 * nicht - "92 Notes" sieht aus wie eine Zahl unter vielen, und die einzige Zahl an seinem Bild,
 * die etwas ueber sein Wissen aussagt, ist das Verhaeltnis. Der Nenner ist schon genannt
 * ("all of your notes" in derselben Zelle) und wird nicht wiederholt: dieselbe Zahl zweimal in
 * einem Streifen ist die Krankheit, die #77 gerade nicht wollte.
 *
 * Die Faelle rechnen mit SEINEN Zahlen, nicht mit dem bequemen 100/30/20: ein Fixture, dessen
 * Anteil die Krankheit nicht ausdruecken kann, ist kein Fall.
 */
async function zeigeMit(bestand: number, traeger: { notes: number; files: number; code: number }) {
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    const u = String(url);
    if (u.includes("/api/memories/gruppen")) {
      return new Response(JSON.stringify({
        ok: true, bestand, traeger,
        themen: { people: 5, projects: 9, events: 3, tasks: 1, guides: 2, links: 4 },
      }), { status: 200 });
    }
    if (u.includes("/api/health")) {
      return new Response(JSON.stringify({ ok: true, version: "3.2.93", count: bestand }), { status: 200 });
    }
    if (u.includes("/api/license")) return new Response(JSON.stringify({ licensed: false }), { status: 200 });
    if (u.includes("/api/memor")) {
      return new Response(JSON.stringify([note({ title: "Gedanke" }), note({ title: "Papier", tags: ["machine-scan"] })]), { status: 200 });
    }
    return new Response("{}", { status: 200 });
  }));
  const view = render(
    <ThemeProvider><AuthProvider><ToastProvider><Dashboard /></ToastProvider></AuthProvider></ThemeProvider>
  );
  await act(async () => { await new Promise((r) => setTimeout(r, 150)); });
  return view;
}

describe("Punkt 5: die Traeger-Zeile nennt ihren Anteil", () => {
  it("sagt zu seinen echten Zahlen, wie klein das Selbstgetippte ist", async () => {
    const { container } = await zeigeMit(21_066, { notes: 92, files: 10_996, code: 9_978 });
    await waitFor(() => expect(container.textContent).toMatch(/all of your notes/i), { timeout: 6000 });
    const text = container.textContent ?? "";
    // 92 / 21 066 = 0,4367 % · 10 996 / 21 066 = 52,197 % · 9 978 / 21 066 = 47,366 %
    expect(text, `kein Anteil an der Zeile: ${streifenWort(container)}`).toMatch(/0\.4\s*%/);
    expect(text).toMatch(/52\.2\s*%/);
    expect(text).toMatch(/47\.4\s*%/);
  });

  it("verschwindet nicht in einem 0-Prozent-Fach, das nur klein ist", async () => {
    const { container } = await zeigeMit(21_066, { notes: 1, files: 10_532, code: 10_533 });
    await waitFor(() => expect(container.textContent).toMatch(/all of your notes/i), { timeout: 6000 });
    const text = container.textContent ?? "";
    // 1 / 21 066 = 0,0047 %. Eine gerundete 0 % an einem Fach, das ein Stueck haelt, ist eine
    // Absage an den Leser, nicht eine Zahl: es sagt "hier ist nichts", waehrend etwas da ist.
    expect(text, "ein Fach mit einem Stueck darf nicht als 0 % verschwinden").toMatch(/<\s*0\.1\s*%/);
    expect(text).not.toMatch(/\b1 Notes 0(\.0)?\s*%/);
  });

  /**
   * Der Fall, den das ausgelieferte Bild von 3.2.94 selbst gezeigt hat (23:51, eigner Schuss,
   * eigne Sichtpruefung): der Demo-Bestand fuellt EIN Fach und die Zeile antwortet
   * "74 Notes 100.0 %". Hundert Prozent einer Menge, die nur aus diesem einen Fach besteht,
   * ist keine Auskunft, sondern die Tautologie derselben Zahl in einem zweiten Gewand —
   * dasselbe Gesetz, das leere Faecher nicht als Schmuck malt (`Dashboard.tsx`, "Ein Fach mit
   * null Stücken ist keine Auskunft").
   */
  it("nennt keinen Anteil, wenn ein einziges Fach den ganzen Laden fuellt", async () => {
    const { container } = await zeigeMit(74, { notes: 74, files: 0, code: 0 });
    await waitFor(() => expect(container.textContent).toMatch(/all of your notes/i), { timeout: 6000 });
    const zelle = traegerZelle(container)?.textContent ?? "";
    expect(zelle, `ein Fach, das alles ist, braucht kein hundert Prozent daneben: ${zelle}`).not.toMatch(/100(\.0)?\s*%/);
    // Die Menge selbst bleibt stehen — ohne sie waere die Zeile leer.
    expect(zelle).toMatch(/74\s*Notes/);
  });

  it("sagt fast alles und fast nichts, statt auf 100 und 0 zu runden", async () => {
    const { container } = await zeigeMit(21_066, { notes: 21_060, files: 5, code: 1 });
    await waitFor(() => expect(container.textContent).toMatch(/all of your notes/i), { timeout: 6000 });
    const zelle = traegerZelle(container)?.textContent ?? "";
    // 21 060 / 21 066 = 99,97 % und 1 / 21 066 = 0,0047 %. Zwei Faelle, eine Regel: die Rundung
    // darf keinen Rand erzeugen, den es nicht gibt — "100 %" behauptet ein alleiniges Fach,
    // "0 %" behauptet ein leeres.
    expect(zelle, `ein Fach, das fast alles ist, darf nicht als 100 % erscheinen: ${zelle}`).toMatch(/>99\.9\s*%/);
    expect(zelle).toMatch(/<\s*0\.1\s*%/);
    expect(zelle).not.toMatch(/100(\.0)?\s*%/);
  });
});
