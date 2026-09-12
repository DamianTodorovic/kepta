// @vitest-environment node
//
// Die Seite der Core-Oberfläche: englisch, nichts von fremden Servern, und
// Inhalte aus der Datenbank nie als HTML.
import { describe, it, expect } from "vitest";
import { SEITE_HTML, SEITE_CSS, SEITE_JS, FAVICON_SVG } from "../../src/ui/seite";

describe("die Seite der Core-Oberfläche", () => {
  it("hat genau einen Platz für das Sitzungs-Token und die Version", () => {
    expect(SEITE_HTML.match(/__KEPTA_TOKEN__/g)).toHaveLength(1);
    expect(SEITE_HTML.match(/__KEPTA_VERSION__/g)).toHaveLength(1);
  });

  it("lädt nichts von fremden Servern — nur ein Link zu Enterprise", () => {
    const quellen = [...SEITE_HTML.matchAll(/(?:src|href)="([^"]+)"/g)].map((m) => m[1]);
    const fremd = quellen.filter((q) => /^https?:/.test(q));
    expect(fremd).toEqual(["https://github.com/DamianTodorovic/kepta#-kepta-enterprise--the-full-desktop-app"]);
    expect(SEITE_JS).not.toMatch(/https?:\/\//);
    expect(SEITE_CSS).not.toMatch(/url\(|@import|https?:\/\//);
    expect(FAVICON_SVG).toMatch(/^<svg/);
  });

  it("verträgt die strenge CSP: kein Inline-Skript, keine Inline-Stile", () => {
    expect(SEITE_HTML).not.toMatch(/<script>(?!\s*<\/script>)[^<]/);
    expect(SEITE_HTML).not.toMatch(/\sstyle="/);
    expect(SEITE_JS).not.toMatch(/innerHTML|outerHTML|insertAdjacentHTML|document\.write/);
    expect(SEITE_JS).not.toMatch(/setAttribute\(['"]style/);
  });

  it("ist englisch", () => {
    const sichtbar = [...SEITE_HTML.replace(/<[^>]+>/g, "\n").split("\n"), ...[...SEITE_JS.matchAll(/'([^'\\]{4,})'/g)].map((m) => m[1])];
    const deutsch = /[äöüÄÖÜß]|\b(und|oder|nicht|Notiz|Suche|Datei|Papierkorb|Speichern|Abbrechen)\b/;
    for (const t of sichtbar) expect(deutsch.test(t), `nicht englisch: ${t}`).toBe(false);
  });

  it("kennt beide Farbschemata", () => {
    expect(SEITE_CSS).toContain("[data-theme=light]");
    expect(SEITE_CSS).toContain("color-scheme:dark");
  });
});
