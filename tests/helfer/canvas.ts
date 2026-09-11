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
 * Baut den Buchfuehrungs-Kontext und haengt ihn an HTMLCanvasElement — inklusive
 * der Leinwaende, die die Komponente sich selbst fuer die Sprites anlegt.
 */
export function installiereLeinwand(): Leinwand {
  const aufrufe: Aufruf[] = [];

  const machKontext = () => {
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
    ctx.measureText = (t: string) => {
      aufrufe.push({ op: "measureText", args: [t] });
      return { width: String(t).length * 6 };
    };
    ctx.getImageData = (x: number, y: number, w: number, h: number) => ({
      data: new Uint8ClampedArray(Math.max(0, w) * Math.max(0, h) * 4),
      width: w, height: h,
    });
    ctx.canvas = null;
    return ctx as unknown as CanvasRenderingContext2D;
  };

  // Jede Leinwand bekommt ihren eigenen Kontext, alle schreiben in dieselbe Liste.
  const kontexte = new WeakMap<HTMLCanvasElement, CanvasRenderingContext2D>();
  (HTMLCanvasElement.prototype as unknown as Record<string, unknown>).getContext = function (
    this: HTMLCanvasElement,
    art: string
  ) {
    if (art !== "2d") return null;
    let k = kontexte.get(this);
    if (!k) { k = machKontext(); kontexte.set(this, k); }
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
    constructor(private cb: ResizeObserverCallback) { rueckrufe.push(cb); }
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
  const werte = modus === "hell"
    ? { "--bg-panel-solid": "#fbf9f4", "--text-1": "#1a1712", "--text-3": "#6b6555", "--accent": "#8f7440", "--node-rim": "rgba(64, 56, 38, 0.34)", "--node-shade": "rgba(40, 32, 16, 0.16)", "--node-hi": "0.5" }
    : { "--bg-panel-solid": "#121214", "--text-1": "#e8e6e1", "--text-3": "#7a7a7a", "--accent": "#c9b785", "--node-rim": "rgba(255, 255, 255, 0.2)", "--node-shade": "rgba(0, 0, 0, 0.3)", "--node-hi": "0.72" };
  for (const [k, v] of Object.entries(werte)) w.setProperty(k, v);
}
