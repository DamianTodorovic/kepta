import "@testing-library/jest-dom/vitest";
import fs from "node:fs";
import path from "node:path";
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

// jsdom legt keine Stylesheet-Regeln aus und jsdoms getComputedStyle kennt keine
// Custom Properties (angelegte issue seit Jahren). Beides zusammen heisst: eine
// Komponente, die ihre Farben aus dem Register liest — die Graph-Fläche tut das
// seit dem 11.10., sie malt keine Handfarbe mehr — sähe in Tests ein leeres
// Bild. Also: (1) die Register-Werte aus src/index.css auf die Wurzel schreiben,
// damit sie da sind, und (2) getComputedStyle so erweitern, dass es Inline-
// Custom-Properties zurückgibt, wie ein echter Browser es für jeden Wert täte.
// Die Werte kommen nicht aus einer Hand, sondern aus der Register-Datei selbst —
// eine Testpalette kann so nie von der Produktleiter abdriften.
if (typeof window !== "undefined" && typeof document !== "undefined") {
  const css = fs.readFileSync(path.join(process.cwd(), "src/index.css"), "utf-8");
  const wurzel = /:root\s*\{([\s\S]*?)\n\}/.exec(css)?.[1] ?? "";
  for (const [, name, wert] of wurzel.matchAll(/(--type-[\w-]+-hex):\s*(#[0-9a-fA-F]{6})/g)) {
    document.documentElement.style.setProperty(name, wert);
  }

  const gemessen = window.getComputedStyle.bind(window);
  const mitRegister = (el: Element, ...rest: unknown[]) => {
    const stil = (gemessen as (e: Element, ...r: unknown[]) => CSSStyleDeclaration)(el, ...rest);
    const inline = (el as HTMLElement | null)?.style;
    if (!inline) return stil;
    return new Proxy(stil, {
      get: (ziel, key) =>
        key === "getPropertyValue"
          ? (name: string) => stil.getPropertyValue(name) || inline.getPropertyValue(name) || ""
          : Reflect.get(ziel, key, ziel),
    });
  };
  window.getComputedStyle = mitRegister as unknown as typeof window.getComputedStyle;
  // Vitest kopiert die jsdom-Fenster-Globals auf globalThis — die Komponente
  // ruft die Funktion nackt auf, also muss beide Stellen dasselbe sehen.
  (globalThis as unknown as Record<string, unknown>).getComputedStyle = mitRegister;
}

// Vitest ruft Testing-Library-Cleanup nicht automatisch → sonst leaken DOM-Knoten
// zwischen Tests ("Found multiple elements"). cleanup ist ein No-op ohne jsdom.
afterEach(() => {
  cleanup();
});

// jsdom implementiert scrollIntoView nicht — CommandPalette ruft es beim Navigieren.
if (typeof Element !== "undefined" && !Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => {};
}

// Node ≥ 25 definiert ein natives globales localStorage (Experimental-Webstorage),
// das ohne --localstorage-file undefined liefert. Dieser Getter überlebt vitests
// jsdom-Bridging und verdrängt jsdoms window.localStorage-Accessor → localStorage
// wäre in Tests undefined (unter CI-Node 22 tritt das nicht auf).
// Fix: an das echte jsdom-Storage (window._localStorage) bridgen, notfalls In-Memory.
if (typeof localStorage === "undefined" && typeof window !== "undefined") {
  const w = window as any;
  const bridge = (name: "localStorage" | "sessionStorage", internal: "_localStorage" | "_sessionStorage") => {
    const real = w[internal] as Storage | undefined;
    if (real) {
      Object.defineProperty(globalThis, name, { configurable: true, get: () => real });
    } else {
      const map = new Map<string, string>();
      Object.defineProperty(globalThis, name, {
        configurable: true,
        get: () => ({
          get length() { return map.size; },
          key: (i: number) => [...map.keys()][i] ?? null,
          getItem: (k: string) => (map.has(k) ? map.get(k)! : null),
          setItem: (k: string, v: string) => { map.set(String(k), String(v)); },
          removeItem: (k: string) => { map.delete(k); },
          clear: () => { map.clear(); },
        }),
      });
    }
  };
  bridge("localStorage", "_localStorage");
  bridge("sessionStorage", "_sessionStorage");
}

// jsdom bringt einige Browser-Bausteine nicht mit, die die Anwendung im Alltag
// benutzt. Ohne sie misst man die Luecken der Testumgebung statt des Programms:
// das Nachladen langer Listen wirft, und jeder Datei-Import scheitert.
if (typeof globalThis.IntersectionObserver === "undefined") {
  class IO implements IntersectionObserver {
    readonly root = null;
    readonly rootMargin = "";
    readonly thresholds: readonly number[] = [];
    constructor(cb: IntersectionObserverCallback) { void cb; }
    observe() { /* nichts — Tests loesen das Nachladen ueber den Knopf aus */ }
    unobserve() {}
    disconnect() {}
    takeRecords(): IntersectionObserverEntry[] { return []; }
  }
  (globalThis as unknown as Record<string, unknown>).IntersectionObserver = IO;
}

if (typeof File !== "undefined" && !File.prototype.text) {
  Object.defineProperty(File.prototype, "text", {
    configurable: true,
    value(this: File) {
      return new Promise<string>((res, rej) => {
        const r = new FileReader();
        r.onload = () => res(String(r.result));
        r.onerror = () => rej(r.error);
        r.readAsText(this);
      });
    },
  });
}

if (typeof File !== "undefined" && !File.prototype.arrayBuffer) {
  Object.defineProperty(File.prototype, "arrayBuffer", {
    configurable: true,
    value(this: File) {
      return new Promise<ArrayBuffer>((res, rej) => {
        const r = new FileReader();
        r.onload = () => res(r.result as ArrayBuffer);
        r.onerror = () => rej(r.error);
        r.readAsArrayBuffer(this);
      });
    },
  });
}
