// @vitest-environment jsdom
// Punkt 1 (Graph), Feldzug 18.10. — der erste Blick.
//
// Was hier geprüft wird, ist die einzige Zahl, die Damian sieht, ohne etwas zu
// tun: wie viele seiner Notizen in der Ansicht Namen tragen, die die Fläche
// selbst wählt. Gemessen an seinem echten Bestand (21 066 Notizen, ausgelieferte
// 3.2.19, Leinwand 1130×740, Blende 4 %): **0 von 729**. Die Fläche sagt das auch
// selbst — „384 in rows too tight for a title, 345 too small for a name at this
// zoom" — und malt daneben sechs Begriffsnamen, denn die Begriffs-Schicht kennt
// weder die Reihen-Schalte noch die Pforte.
//
// Die Suite ließ das grün: `graph-benannt` wurde nur auf Buchführung geprüft
// (`KnowledgeGraph.f8.test.tsx`, `KnowledgeGraph.render.test.tsx`), und
// `KnowledgeGraph.etat.test.ts:53` stellt „1 of 400 notes … carry a title" als
// korrektes Ergebnis hin. Ein Feld mit null Namen war nie eine Prüfung.
//
// Beweisform nach dem Hausgesetz (`GRAPH-ENTSCHEID-16-10.md`, Punkt 3 und 4):
// der Boden-Fall späht nicht auf `k`, sondern auf das, was der Boden verhindert —
// den Reihenabstand auf dem Schirm. Und weil der Baum dieselbe Regel seit F8-N1
// hat, prüft ein zweiter Fall ihn mit: eine Heilung, die nur eine der zwei
// Ansichten trägt, lässt die zweite Stelle offen.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, act } from "@testing-library/react";
import { KnowledgeGraph, TITEL_REIHE_PX } from "../../src/components/KnowledgeGraph";
import { GANG_ABSTAND, knotenRadius } from "../../src/lib/graphLayout";
import { BLATT_ABSTAND, zeilenKMin } from "../../src/lib/graphHierarchy";
import { installiereLeinwand, installiereResizeObserver, installiereZeiger, setzeTheme, type Leinwand } from "../helfer/canvas";
import type { Memory } from "../../src/types";

// Erfundene Masse — weder die Leinwand seines Fensters noch die der andern Fälle.
const BREITE = 900;
const HOEHE = 600;
const STAUB = 1400; // verbindet nichts — bei ihm 20 721 von 21 066
const KERN = 24; // Notizen mit Begriffen, in gestaffelter Schwere

let buch: Leinwand;

const notiz = (i: number): Memory =>
  ({
    id: `n${i}`,
    userId: "local",
    title: `Notiz ${String(i).padStart(4, "0")} — ein Titel, der eine Weile braucht`,
    content: "Inhalt",
    tags: [],
    type: "reference",
    createdAt: Date.parse("2024-01-01"),
    updatedAt: Date.parse("2024-01-01"),
  }) as Memory;

/**
 * Die schweren Knoten stehen in der Liste ZULETZT.
 *
 * Der Mal-Pass geht die Notizen in ihrer Reihenfolge durch. Läge der schwerste
 * vorn, wäre „die Schwersten zuerst" mit der Maleihenfolge identisch und der
 * Rang-Fall könnte nicht verlieren. Also umgekehrt: `n0` trägt KERN Begriffe,
 * `n1` trägt KERN−1, …, `n23` trägt einen.
 */
function bestand(): Memory[] {
  const kern = Array.from({ length: KERN }, (_, i) => notiz(i));
  const staub = Array.from({ length: STAUB }, (_, i) => notiz(KERN + i));
  return [...staub, ...kern];
}

/** Notiz `i` hängt an `KERN - i` Begriffen — ihr Grad fällt von KERN auf 1. */
function begriffe() {
  const entities: { id: number; name: string }[] = [];
  const relations: unknown[] = [];
  const traeger: Record<string, string[]> = {};
  for (let b = 0; b < KERN; b++) {
    const name = `Begriff ${b}`;
    entities.push({ id: b + 1, name });
    const liste: string[] = [];
    for (let i = 0; i < KERN; i++) if (KERN - i > b) liste.push(`n${i}`);
    for (const id of liste) relations.push({ id: `r-${b}-${id}`, source: name, target: name, relation: "mentions", memoryId: id });
    traeger[name] = liste;
  }
  return { entities, relations, memoriesByEntity: traeger, bestand: { knoten: entities.length, kanten: relations.length } };
}

beforeEach(() => {
  buch = installiereLeinwand();
  installiereResizeObserver(BREITE, HOEHE);
  installiereZeiger();
  setzeTheme("dunkel");
  localStorage.clear();
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  document.documentElement.removeAttribute("style");
});

async function zeichne(ansicht?: "baum") {
  const leib = begriffe();
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: unknown) =>
      new Response(String(url).startsWith("/api/graph?") ? JSON.stringify(leib) : JSON.stringify({ relations: [], memoriesByEntity: {} }), {
        status: 200,
      })
    )
  );
  const view = render(<KnowledgeGraph memories={bestand()} onSelectMemory={vi.fn()} />);
  await act(async () => {
    for (let i = 0; i < 60; i++) await new Promise((r) => setTimeout(r, 50));
  });
  if (ansicht === "baum") {
    const kn = [...view.container.querySelectorAll("button")].find((b) => b.textContent?.trim() === "Tree");
    expect(kn, "die Baum-Ansicht fehlt in der Leiste").toBeTruthy();
    await act(async () => {
      kn!.click();
      for (let i = 0; i < 30; i++) await new Promise((r) => setTimeout(r, 50));
    });
  }
  return view;
}

function malstab(): number {
  const skalen = buch
    .letzterRahmen()
    .filter((a) => a.op === "scale")
    .map((a) => Number(a.args[0]))
    .filter((v) => Number.isFinite(v) && v > 0);
  expect(skalen.length, "der letzte Rahmen traegt keine Welt-Skalierung — die Sonde sieht kein Bild").toBeGreaterThan(0);
  return skalen[0]!;
}
const zeile = (c: HTMLElement) => (c.querySelector('[data-testid="graph-benannt"]')?.textContent ?? "").trim();
function benannt(c: HTMLElement): number {
  const n = Number((zeile(c).match(/^([\d.,]+)\s+of\s+/) ?? [])[1]);
  return Number.isFinite(n) ? n : NaN;
}
/** Notiznamen des letzten Bildes — Begriffe und Legende bleiben außen vor. */
function gemalteNotizen(): number[] {
  return buch
    .texteImRahmen()
    .map((t) => t.text.match(/^Notiz (\d+)/))
    .filter((m): m is RegExpMatchArray => !!m)
    .map((m) => Number(m[1]));
}

describe("KnowledgeGraph: der erste Blick", () => {
  it("rückt das Feld nie näher heraus, als eine Reihe einen Titel trägt", async () => {
    const { container } = await zeichne();
    const k = malstab();
    // Der Massstab kommt aus dem Bild selbst: der Mal-Pass skaliert die Welt mit
    // `ctx.scale(t.k, t.k)`. Die angezeigte Zahl rundet auf ganze Prozente
    // (gemessen: 93 % angezeigt gegen 93,077 % gerechnet) — mit ihr wäre die
    // Sonde stumpfer als die Regel, die sie prüft.
    const reihe = GANG_ABSTAND * k;
    expect(
      reihe,
      `Reihen stehen ${reihe.toFixed(2)} px auseinander, ein Titel braucht ${TITEL_REIHE_PX} px — die Fläche weist ihre Reihen-Punkte selbst ab („rows too tight") und nennt darum nichts`
    ).toBeGreaterThanOrEqual(TITEL_REIHE_PX);
    expect(zeile(container), "die Fläche meldet zu enge Reihen, obwohl der Boden gilt").not.toMatch(/rows too tight/);
  });

  it("nennt bei seinem eigenen Startausschnitt mindestens eine Notiz", async () => {
    const { container } = await zeichne();
    const k = malstab();
    expect(
      benannt(container),
      `Blende ${(k * 100).toFixed(1)} % — die Fläche schreibt über ihre eignen Namen: „${zeile(container)}"`
    ).toBeGreaterThan(0);
  });

  it("hält die Zwillingsschwester: der Baum bleibt bei seiner eignen Lesbarkeitszeile", async () => {
    const { container } = await zeichne("baum");
    const k = malstab();
    // Der Baum regelt das seit F8-N1 über `zeilenKMin`. Wer die Feld-Heilung
    // einbaut und den Boden verlagert, muss beide Ansichten tragen können —
    // dieser Fall hält die zweite Stelle, damit die Heilung nicht eine Ansicht
    // flickt und die andere still verändert.
    expect(BLATT_ABSTAND * k, `Baum bei ${(k * 100).toFixed(1)} % — Blattzeilen stehen zu eng`).toBeGreaterThanOrEqual(
      BLATT_ABSTAND * zeilenKMin(14, BLATT_ABSTAND)
    );
  });

});
