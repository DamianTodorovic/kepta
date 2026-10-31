// Eine Leinwand-Attrappe, die jeden Zeichenaufruf mitschreibt.
//
// jsdom hat keinen 2D-Kontext, deshalb galt der Wissensgraph lange als
// "nicht automatisiert pruefbar" — 817 Zeilen Zeichnen, Zeigerbedienung und
// Detailstufen hingen allein an Sichtpruefungen. Genau dort sind dann auch die
// Fehler gelandet: der helle Modus war unbenutzbar, der Zeitregler liess das
// Kantennetz stehen, Knoten waren nach dem Anfassen fuer immer erstarrt.
//
// Der Kontext hier fuehrt Buch. Damit laesst sich pruefen, WAS gezeichnet wurde,
// ohne ein Bild zu vergleichen: welche Farbe vor einem stroke() gesetzt war,
// wie viele Linien es gab, welcher Text an welcher Stelle stand.

export interface Aufruf {
  op: string;
  args: unknown[];
}

let wurfGrund: string | null = null;

/** Laesst die naechsten `toDataURL`-Rufe werfen — der befleckte Fall der echten Leinwand. */
export function lassLeinwandWerfen(grund: string | null): void { wurfGrund = grund; }

export interface Leinwand {
  aufrufe: Aufruf[];
  /** Alle Aufrufe einer Art. */
  von(op: string): Aufruf[];
  /** Anzahl der Aufrufe einer Art. */
  zahl(op: string): number;
  /** Der zuletzt vor Index `i` gesetzte Wert einer Eigenschaft. */
  wertVor(i: number, eigenschaft: string): unknown;
  /** Index des n-ten Aufrufs einer Art (0-basiert), sonst -1. */
  index(op: string, n?: number): number;
  /** Alle gezeichneten Texte. */
  texte(): { text: string; x: number; y: number }[];
  /**
   * Texte des letzten Bildes MIT ihrer Groesse auf dem Schirm.
   *
   * Die transformierte Leinwand kennt keine Buchstaben, sondern nur Aufrufe: ein
   * Etikett mit `font = 15px` ist bei 0,12 Zoom 1,8 Bildpunkte hoch. Wer die
   * Lesbarkeit pruefen will, muss die Schriftgroesse durch die Transformation
   * rechnen — genau so, wie A7s Mal-Rekorder im Browser es tut (`sx = |t.a|/dpr`).
   * Ohne diese Grenze gilt ein 1,4-px-Titel im Test als 15 px.
   */
  schriften(): { text: string; x: number; y: number; px: number; schrift: number }[];
  /**
   * Nur die Aufrufe des LETZTEN Bildes. Jedes Bild beginnt mit clearRect —
   * ohne diese Grenze zaehlt man ueber mehrere Bilder hinweg und misst Unsinn.
   */
  letzterRahmen(): Aufruf[];
  /** Texte des letzten Bildes. */
  texteImRahmen(): { text: string; x: number; y: number }[];
  leeren(): void;
}

const EIGENSCHAFTEN = [
  "fillStyle", "strokeStyle", "lineWidth", "globalAlpha", "font",
  "textAlign", "textBaseline", "lineJoin", "lineCap", "imageSmoothingEnabled",
] as const;

const METHODEN = [
  "setTransform", "clearRect", "save", "restore", "translate", "scale", "rotate",
  "beginPath", "closePath", "moveTo", "lineTo", "quadraticCurveTo", "bezierCurveTo",
  "arc", "arcTo", "ellipse", "rect", "fill", "stroke", "clip", "setLineDash",
  // fillRect/strokeRect malen ohne Pfad. Sie fehlten hier, und deshalb war der
  // guenstigste Weg, sehr viele winzige Knoten zu zeichnen, im Test gar nicht
  // sichtbar — die Aufrufe liefen ins Leere statt aufgezeichnet zu werden.
  "fillRect", "strokeRect",
  "drawImage", "strokeText", "fillText", "putImageData",
] as const;

/**
 * Die Schriftgröße aus einem CSS-Schriftkurzbefehl — die letzte Zahl vor „px".
 * Ohne erkennbare Größe gilt 12 px, der Satz, mit dem der Graph arbeitet.
 */
function schriftgroesse(font: unknown): number {
  const treff = [...String(font ?? "").matchAll(/(\d+(?:\.\d+)?)px/g)].pop();
  return treff ? Number(treff[1]) : 12;
}

/**
 * Baut den Buchfuehrungs-Kontext und haengt ihn an HTMLCanvasElement — inklusive
 * der Leinwaende, die die Komponente sich selbst fuer die Sprites anlegt.
 */
export function installiereLeinwand(): Leinwand {
  const aufrufe: Aufruf[] = [];

  const machKontext = (element?: HTMLCanvasElement) => {
    const ctx: Record<string, unknown> = {};
    for (const name of METHODEN) {
      ctx[name] = (...args: unknown[]) => { aufrufe.push({ op: name, args }); };
    }
    for (const name of EIGENSCHAFTEN) {
      let wert: unknown = name === "globalAlpha" ? 1 : "";
      Object.defineProperty(ctx, name, {
        get: () => wert,
        set: (v) => { wert = v; aufrufe.push({ op: `set:${name}`, args: [v] }); },
        configurable: true,
      });
    }
    ctx.createRadialGradient = (...args: unknown[]) => {
      aufrufe.push({ op: "createRadialGradient", args });
      return { addColorStop: (...a: unknown[]) => aufrufe.push({ op: "addColorStop", args: a }) };
    };
    ctx.createLinearGradient = ctx.createRadialGradient;
    /**
     * Breite im eingestellten Satz — nicht in einem festgeschriebenen. Vorher
     * standen hier sture 6 px pro Zeichen, gleichgültig was `ctx.font` sagte.
     * Der Wissensgraph verkleinert seine Etiketten mit dem Zoom: im Test waren
     * sie damit bis zu viermal zu breit und verdrängten Nachbarn, wo der
     * Browser sie nebeneinander stellt. 0,5 × Schriftgröße pro Zeichen hält den
     * gewohnten Wert bei 12 px und folgt doch der gesetzten Größe.
     */
    ctx.measureText = (t: string) => {
      aufrufe.push({ op: "measureText", args: [t] });
      const text = String(t);
      if (!text.length) return { width: 0 };
      const groesse = schriftgroesse(ctx.font);
      return { width: text.length * groesse * 0.5 };
    };
    ctx.getImageData = (x: number, y: number, w: number, h: number) => ({
      data: new Uint8ClampedArray(Math.max(0, w) * Math.max(0, h) * 4),
      width: w, height: h,
    });
    /* Die echte Schnittstelle sagt, WELCHE Leinwand dieser Kontext bedient
       (`CanvasRenderingContext2D.canvas`). Null war hier eine Luecke, die ein
       Koerper sofort findet: die Sammelmarke legt ihr Rechteck auf
       `ctx.canvas.dataset` ab, und mit null brach das Bild mitten im Malen ab. */
    ctx.canvas = element ?? null;
    return ctx as unknown as CanvasRenderingContext2D;
  };

  // `toDataURL` fehlt in jsdom ganz (ein Wurf "not implemented"), und der Bildexport der
  // Graph-Flaeche haengt daran. Die Attrappe tut, was der echte Browser tut: sie liefert eine
  // Datenkette, in der die Groesse der Leinwand steckt — ein Test kann also lesen, WELCHES Bild
  // herauskaeme — und sie kann werfen, wie eine befleckte Leinwand wirft.
  (HTMLCanvasElement.prototype as unknown as Record<string, unknown>).toDataURL = function (
    this: HTMLCanvasElement,
    typ?: string
  ) {
    if (wurfGrund) throw new Error(wurfGrund);
    const mass = `${this.width}x${this.height}`;
    return `data:${typ || "image/png"};base64,${Buffer.from(mass).toString("base64")}`;
  };

  // Jede Leinwand bekommt ihren eigenen Kontext, alle schreiben in dieselbe Liste.
  const kontexte = new WeakMap<HTMLCanvasElement, CanvasRenderingContext2D>();
  (HTMLCanvasElement.prototype as unknown as Record<string, unknown>).getContext = function (
    this: HTMLCanvasElement,
    art: string
  ) {
    if (art !== "2d") return null;
    let k = kontexte.get(this);
    if (!k) { k = machKontext(this); kontexte.set(this, k); }
    return k;
  };

  const buch: Leinwand = {
    aufrufe,
    von: (op) => aufrufe.filter((a) => a.op === op),
    zahl: (op) => aufrufe.filter((a) => a.op === op).length,
    wertVor: (i, eigenschaft) => {
      for (let j = i - 1; j >= 0; j--) if (aufrufe[j].op === `set:${eigenschaft}`) return aufrufe[j].args[0];
      return undefined;
    },
    index: (op, n = 0) => {
      let gefunden = -1;
      for (let i = 0; i < aufrufe.length; i++) {
        if (aufrufe[i].op === op) { gefunden++; if (gefunden === n) return i; }
      }
      return -1;
    },
    texte: () =>
      aufrufe
        .filter((a) => a.op === "fillText")
        .map((a) => ({ text: String(a.args[0]), x: Number(a.args[1]), y: Number(a.args[2]) })),
    /**
     * Die Transformation des letzten Bildes nachgespielt: pro fillText die
     * Groesse, die der Mensch auf dem Schirm sieht.
     *
     * Geraetet wird nur, was die Flaeche tatsaechlich aufruft — `setTransform`
     * setzt, `scale` verletzt, `save`/`restore` stapeln. Der Faktor geteilt durch
     * devicePixelRatio ist dieselbe Rechnung wie im Rekorder der Messstrasse.
     */
    schriften: () => {
      const rahmen = buch.letzterRahmen();
      const dpr = (globalThis as unknown as { devicePixelRatio?: number }).devicePixelRatio || 1;
      const out: { text: string; x: number; y: number; px: number; schrift: number }[] = [];
      let sx = 1;
      const stapel: number[] = [];
      let schrift = 12;
      for (const a of rahmen) {
        if (a.op === "setTransform") sx = Math.abs(Number(a.args[0])) || 1;
        else if (a.op === "scale") sx *= Math.abs(Number(a.args[0])) || 1;
        else if (a.op === "save") stapel.push(sx);
        else if (a.op === "restore") sx = stapel.pop() ?? sx;
        else if (a.op === "set:font") schrift = schriftgroesse(a.args[0]);
        else if (a.op === "fillText") {
          const px = (schrift * sx) / dpr;
          out.push({ text: String(a.args[0]), x: Number(a.args[1]), y: Number(a.args[2]), px, schrift });
        }
      }
      return out;
    },
    letzterRahmen: () => {
      let start = 0;
      for (let i = aufrufe.length - 1; i >= 0; i--) if (aufrufe[i].op === "clearRect") { start = i; break; }
      return aufrufe.slice(start);
    },
    texteImRahmen: () =>
      buch.letzterRahmen()
        .filter((a) => a.op === "fillText")
        .map((a) => ({ text: String(a.args[0]), x: Number(a.args[1]), y: Number(a.args[2]) })),
    leeren: () => { aufrufe.length = 0; },
  };
  return buch;
}

/** ResizeObserver, den jsdom nicht mitbringt — Tests koennen die Groesse setzen. */
export function installiereResizeObserver(breite = 1000, hoehe = 700): (b: number, h: number) => void {
  const rueckrufe: ResizeObserverCallback[] = [];
  let masse = { width: breite, height: hoehe };
  class Attrappe implements ResizeObserver {
    private cb: ResizeObserverCallback;
    constructor(cb: ResizeObserverCallback) { this.cb = cb; rueckrufe.push(cb); }
    observe(ziel: Element) {
      // Sofort melden, wie es ein echter ResizeObserver beim Beobachten tut.
      this.cb([{ target: ziel, contentRect: { ...masse, x: 0, y: 0, top: 0, left: 0, right: masse.width, bottom: masse.height, toJSON: () => ({}) } } as unknown as ResizeObserverEntry], this);
    }
    unobserve() { /* nichts */ }
    disconnect() { /* nichts */ }
  }
  (globalThis as unknown as Record<string, unknown>).ResizeObserver = Attrappe;
  return (b, h) => {
    masse = { width: b, height: h };
    const eintrag = { contentRect: { ...masse, x: 0, y: 0, top: 0, left: 0, right: b, bottom: h, toJSON: () => ({}) } } as unknown as ResizeObserverEntry;
    for (const cb of rueckrufe) cb([eintrag], {} as ResizeObserver);
  };
}

/** Was jsdom sonst noch fehlt, damit die Zeigerbedienung ueberhaupt laeuft. */
export function installiereZeiger(): void {
  const proto = Element.prototype as unknown as Record<string, unknown>;
  if (!proto.setPointerCapture) proto.setPointerCapture = () => {};
  if (!proto.releasePointerCapture) proto.releasePointerCapture = () => {};
  if (!proto.hasPointerCapture) proto.hasPointerCapture = () => false;
  if (typeof (globalThis as unknown as Record<string, unknown>).PointerEvent === "undefined") {
    class PE extends MouseEvent {
      pointerId: number;
      isPrimary: boolean;
      pointerType: string;
      constructor(typ: string, init: MouseEventInit & { pointerId?: number; isPrimary?: boolean; pointerType?: string } = {}) {
        super(typ, init);
        this.pointerId = init.pointerId ?? 1;
        this.isPrimary = init.isPrimary ?? true;
        this.pointerType = init.pointerType ?? "mouse";
      }
    }
    (globalThis as unknown as Record<string, unknown>).PointerEvent = PE;
  }
}

/** Theme-Variablen setzen, wie sie index.css im jeweiligen Modus liefert. */
export function setzeTheme(modus: "hell" | "dunkel"): void {
  const w = document.documentElement.style;
  // Die Rollen-Farben (E1s Leiter) holt sich die Flaeche aus dem Stylesheet —
  // `leseRollenHexe()` liesst `--type-*-hex` von der Wurzel. Ein jsdom-Fixture
  // kennt index.css nicht, also standen dort vorher die Hex-Literale der
  // Komponente; seit die Token Quelle sind, malt die Leinwand ohne diese Zeilen
  // gar nichts (undefined-Farbe -> TypeError im Mal-Pass, 63 Tests fielen).
  // Die Werte sind die von index.css:107-126 (hell) und 295-314 (dunkel).
  const rollen = modus === "hell"
    ? {
      "--type-semantic-hex": "#2d4964", "--type-episodic-hex": "#643a4f",
      "--type-procedural-hex": "#304e34", "--type-reference-hex": "#604028",
      "--type-neutral-hex": "#464646",
      "--type-herkunft-geschrieben-hex": "#42474c", "--type-herkunft-datei-hex": "#693a00",
      "--type-herkunft-rechner-hex": "#00514d",
    }
    : {
      "--type-semantic-hex": "#9cadc4", "--type-episodic-hex": "#c6a1ba",
      "--type-procedural-hex": "#8fb89a", "--type-reference-hex": "#c6a687",
      "--type-neutral-hex": "#acacac",
      "--type-herkunft-geschrieben-hex": "#a7acb3", "--type-herkunft-datei-hex": "#d8a25c",
      "--type-herkunft-rechner-hex": "#6cb9b3",
    };
  const werte = modus === "hell"
    ? { "--bg-panel-solid": "#f0f2eb", "--text-1": "#232526", "--text-2": "#5b5e60", "--text-3": "#8d9092", "--accent": "#9c2b1f", "--node-rim": "rgba(34, 48, 60, 0.4)", "--node-shade": "rgba(40, 32, 16, 0.16)", "--node-hi": "0.5" }
    : { "--bg-panel-solid": "#121214", "--text-1": "#eaeae8", "--text-2": "#9b9992", "--text-3": "#66645e", "--accent": "#c04a39", "--node-rim": "rgba(230, 233, 225, 0.24)", "--node-shade": "rgba(0, 0, 0, 0.35)", "--node-hi": "0.72" };
  for (const [k, v] of Object.entries({ ...werte, ...rollen })) w.setProperty(k, v);
}
