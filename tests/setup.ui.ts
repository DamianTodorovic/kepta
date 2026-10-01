import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

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
