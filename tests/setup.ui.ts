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
