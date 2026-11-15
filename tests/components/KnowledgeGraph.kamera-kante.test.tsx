// @vitest-environment jsdom
// Punkt 1 (Graph), zweiter Schlag — die Kante.
//
// Der erste Schlag (3.2.21) gab dem Feld einen Lesbarkeitsboden. Was er nicht
// heilte, ist die Lage der Kamera: sie sitzt auf der Begrenzungsbox der GANZEN
// Welt, und deren Mitte ist bei einem weiten Feld Vereinzelte leer. Gemessen
// 18.10./19.10. im ausgelieferten 3.2.22 an einem eignen Bestand von 1 500
// Notizen (eigne Kapsel, eigne Kennung, chrome-headless-shell): bei 1440 px
// beruehren 16 von 29 gemalten Titeln die Leinwandkante, bei 820 px 12 von 15,
// bei 390 px 3 von 3 — kein Titel des Telefonbildes ist ganz.
//
// Dieser Fall haelt die Kante. Die andre Haelfte der Latte — dass die Bildmitte
// nicht leer ist — laesst sich in jsdom nicht halten: dasselbe Kraftfeld driftet
// hier nach dem Einpassen weiter (gemessen: derselbe Bestand malt 122 Titel im
// ersten Rahmen und 2 im dreiessigsten), und eine Zahl, die von der Abfragezeit
// abhaengt, ist keine Latte. Sie wird im ausgelieferten Objekt gemessen und im
// Felzug-Papier gemeldet.
//
// Die Kasten rechnen mit der Ausrichtung, die die Flaeche im jeweiligen Aufruf
// gesetzt hat: die Gang-Zeile sitzt linksbuendig, das Etikett mittig. Wer beides
// mittig misst, zaehlt Beschnitt, wo keiner ist — das war der erste Fehler
// dieser Sonde, berichtigt bevor der Fall galt.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, act } from "@testing-library/react";
import { KnowledgeGraph, TITEL_KANTEN_PX } from "../../src/components/KnowledgeGraph";
import { installiereLeinwand, installiereResizeObserver, installiereZeiger, setzeTheme, type Leinwand, type Aufruf } from "../helfer/canvas";
import type { Memory } from "../../src/types";

const BREITE = 900;
const HOEHE = 600;
const STAUB = 1400; // verbindet nichts — das ist die Welt, deren Mitte leer ist
const KERN = 300; // Notizen mit Begriffen: hier stehen die Namen, die zaehlen
/**
 * Die Luft, die ein Titel an einer Kante braucht. Absichtlich eine eigne Zahl im
 * Fall und nicht der Import: sonst koennte die Flaeche den Rand auf null setzen
 * und der Fall waere gruen ueber einem beschnittenen Bild. Der letzte Fall haelt
 * die Flaeche an genau diese Zahl.
 */
const LUFT = 11;

let buch: Leinwand;

const notiz = (i: number): Memory =>
  ({
    id: `n${i}`,
    userId: "local",
    title: `Kante ${String(i).padStart(4, "0")}`,
    content: "Inhalt",
    tags: [],
    type: "reference",
    createdAt: Date.parse("2024-01-01"),
    updatedAt: Date.parse("2024-01-01"),
  }) as Memory;

function bestand(): Memory[] {
  const kern = Array.from({ length: KERN }, (_, i) => notiz(i));
  const staub = Array.from({ length: STAUB }, (_, i) => notiz(KERN + i));
  return [...staub, ...kern];
}

/** Notiz `i` haengt an `KERN - i` Begriffen — ihr Grad faellt von KERN auf 1. */
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

async function zeichne() {
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
    for (let i = 0; i < 60; i++) {
      await new Promise((r) => setTimeout(r, 50));
      if (kaesten().length >= 3) break;
    }
  });
  return view;
}

const groesse = (schrift: unknown) => {
  const treff = [...String(schrift ?? "").matchAll(/(\d+(?:\.\d+)?)px/g)].pop();
  return treff ? Number(treff[1]) : 12;
};

/**
 * Die Titelkaesten des letzten Rahmens mit tragfaehiger Titelzahl (>= 3 Notiztitel),
 * sonst hilfsweise des letzten Rahmens mit irgendeinem Titel.
 *
 * Der Rahmen wird aus der Aufruffolge nachgespielt (clearRect teilt ihn, save /
 * restore stapeln die Schrift), weil die Flaeche Etikette in festem Bildpixel-Satz
 * ausserhalb der Welt-Transformation malt: x und y sind hier schon Bildpixel.
 */
function kaesten(): { text: string; links: number; rechts: number; oben: number; unten: number }[] {
  const alle = buch.aufrufe;
  const starts: number[] = [];
  for (let i = 0; i < alle.length; i++) if (alle[i].op === "clearRect") starts.push(i);
  let bester: { text: string; links: number; rechts: number; oben: number; unten: number }[] | null = null;
  for (let r = starts.length - 1; r >= 0; r--) {
    const ende = r + 1 < starts.length ? starts[r + 1] : alle.length;
    const rahmen: Aufruf[] = alle.slice(starts[r], ende);
    let schrift = 12;
    let ausrichtung = "start";
    const funde: { text: string; links: number; rechts: number; oben: number; unten: number }[] = [];
    for (const a of rahmen) {
      if (a.op === "set:font") schrift = groesse(a.args[0]);
      else if (a.op === "set:textAlign") ausrichtung = String(a.args[0]);
      else if (a.op === "fillText") {
        const text = String(a.args[0]);
        if (!/^Kante \d{4}$/.test(text)) continue;
        const breite = text.length * schrift * 0.5;
        const x = Number(a.args[1]);
        const y = Number(a.args[2]);
        const links = ausrichtung === "left" ? x : ausrichtung === "right" ? x - breite : x - breite / 2;
        funde.push({ text, links, rechts: links + breite, oben: y, unten: y + schrift });
      }
    }
    if (funde.length >= 3) return funde;
    if (!bester && funde.length > 0) bester = funde;
  }
  return bester ?? [];
}

describe("KnowledgeGraph: der erste Blick beruehrt keine Kante", () => {
  it("malt ueberhaupt Notiztitel — ohne Bild ist jede Latte erfuellt", async () => {
    await zeichne();
    const k = kaesten();
    expect(k.length, `die Flaeche malt keine Notiztitel; der letzte Rahmen traegt ${buch.texteImRahmen().length} Texte`).toBeGreaterThanOrEqual(3);
  });

  it("laesst keinen Titel ueber die Leinwandkante laufen", async () => {
    await zeichne();
    const k = kaesten();
    expect(k.length, "ohne Titel ist der Fall kein Fall").toBeGreaterThanOrEqual(3);
    // Beruehren heisst: der Kasten liegt nicht mehr im Bild. Die Luft, die die
    // Flaeche zusaetzlich einhaelt (`TITEL_KANTEN_PX`), wird im zweiten Fall an
    // der Zahl gehalten — zwei verschiedene Behauptungen, zwei Beweise.
    const ueber = k.filter((b) => b.links < 0 || b.rechts > BREITE || b.oben < 0 || b.unten > HOEHE);
    expect(
      ueber.map((b) => `${b.text} [${b.links.toFixed(0)}…${b.rechts.toFixed(0)}] y ${b.oben.toFixed(0)}…${b.unten.toFixed(0)}`),
      `${ueber.length} von ${k.length} Titeln liegen ausserhalb der Leinwand ${BREITE}×${HOEHE}`,
    ).toEqual([]);
    const abstand = Math.min(...k.map((b) => Math.min(b.links, BREITE - b.rechts, b.oben, HOEHE - b.unten)));
    expect(abstand, `der naechste Titel steht ${abstand.toFixed(1)} px von der Kante ab, gehaelt werden ${LUFT} px`).toBeGreaterThanOrEqual(LUFT);
  });

  it("traegt denselben Rand wie der Fall", () => {
    // Kein Verhaltens-Fall, ein Vertrags-Fall: die Zahl, an der dieser Fall misst,
    // muss die Zahl sein, die die Flaeche einhaelt — sonst messen zwei Seiten an
    // verschiedenen Linien und keiner merkt es.
    expect(TITEL_KANTEN_PX, "die Flaeche kennt keinen Titelrand").toBeTypeOf("number");
    expect(TITEL_KANTEN_PX, `die Flaeche haelt ${TITEL_KANTEN_PX} px fuer Luft, der Fall misst ${LUFT} px`).toBe(LUFT);
  });
});
