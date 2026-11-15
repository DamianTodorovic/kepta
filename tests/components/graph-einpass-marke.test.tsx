// @vitest-environment jsdom
// D0: der Einpass-Knopf braucht ein Handfeste, an dem eine Sonde ihn finden kann.
//
// Warum das ein Fall ist und keine Formatfrage: das Haus schießt seine eigenen Bilder mit
// `scripts/screenshots.mjs`, und diese Strasse findet ihr drittes von zwoelf Bildern nicht mehr.
// Sie sucht `button[title^="Fit the whole graph"]` — ein **Voranfang**-Abgleich. Seit 3.2.79 ist
// der Titel desselben Knopfs eine Entscheidung, die je nach Boden anders lautet
// (`fitTitel`, KnowledgeGraph.tsx:870-875): "Fit the whole graph into view" oder
// "Fit — held at the readability floor, so some notes stay outside; ...". Im Demobestand beißt
// der Boden, also steht dort der zweite Satz, und die Strasse sieht ein Steuer, das da ist, nicht.
// Zweimal reproduziert, 21:23 und 00:32, jeweils mit einer Error-Zeile im Protokoll.
//
// Ein Titel, der eine Auskunft ist, darf kein Griff sein. Der Griff ist die Marke.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, act } from "@testing-library/react";
import { KnowledgeGraph } from "../../src/components/KnowledgeGraph";
import { installiereLeinwand, installiereResizeObserver, installiereZeiger, setzeTheme } from "../helfer/canvas";
import type { Memory } from "../../src/types";

function notiz(i: number, titel: string): Memory {
  return {
    id: `k${i}`, userId: "local", title: titel, content: `Inhalt ${i} mit [[nordwind]] und [[elena]]`,
    tags: [], type: "semantic", createdAt: Date.parse("2025-01-01"), updatedAt: Date.parse("2025-01-01"),
  };
}

async function bilder(n: number) {
  for (let i = 0; i < n; i++) {
    await act(async () => { await new Promise((r) => setTimeout(r, 16)); });
  }
}

beforeEach(() => {
  localStorage.clear();
  setzeTheme("dunkel");
  installiereLeinwand();
  installiereResizeObserver(1440, 900);
  installiereZeiger();
  Element.prototype.scrollIntoView = vi.fn();
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
    relations: [{ source: "nordwind", target: "elena", relation: "betreut", memoryId: null }],
    memoriesByEntity: { nordwind: ["k1", "k2"], elena: ["k3"] },
  }), { status: 200 })));
});

afterEach(() => { vi.unstubAllGlobals(); });

describe("D0: das Einpass-Steuer hat einen Griff, der nicht umziehen kann", () => {
  it("traegt eine Marke, die eine Sonde auch dann findet, wenn der Titel den erklaert", async () => {
    const view = render(
      <KnowledgeGraph memories={[notiz(1, "Besprechung"), notiz(2, "Notiz"), notiz(3, "Papier")]} onSelectMemory={() => {}} />
    );
    await bilder(14);
    const knopf = view.container.querySelector('[data-testid="graph-fit"]');
    expect(knopf, "kein data-testid='graph-fit' am Einpass-Steuer — die Bildstrasse sucht weiter nach einem Satz, der eine Entscheidung ist").toBeTruthy();
    // Und der Titel bleibt, was er ist: eine Auskunft ueber den Boden, keine Kennung. Welche
    // der beiden Antworten er gerade gibt, haengt an der Kamera und ist hier nicht das Urteil —
    // darum zaehlt nur, dass er ueberhaupt eine hat.
    const titel = knopf?.getAttribute("title") ?? "";
    expect(titel.length, "der Einpass-Knopf traegt keinen Titel — die Auskunft ist weg").toBeGreaterThan(0);
    expect(knopf?.tagName, "die Marke sitzt nicht auf einem Knopf").toBe("BUTTON");
  });
});
