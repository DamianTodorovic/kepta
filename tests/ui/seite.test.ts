// @vitest-environment node
//
// Die Seite der Core-Oberfläche: englisch, nichts von fremden Servern, Inhalte
// aus der Datenbank nie als HTML — mit dem echten KEPTA-Logo und Werbung für
// Enterprise, die nur verspricht, was die Vergleichstabelle der README belegt.
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import { SEITE_HTML, SEITE_CSS, SEITE_JS, FAVICON_SVG } from "../../src/ui/seite";

const LINKEDIN = "https://www.linkedin.com/in/damian-todorovic-244235434";
const VERGLEICH = "https://github.com/DamianTodorovic/kepta#-kepta-pro--the-full-desktop-app";
const lies = (datei: string) => fs.readFileSync(new URL(`../../${datei}`, import.meta.url), "utf8");
const vorlage = /<template id="enterprise">([\s\S]*?)<\/template>/.exec(SEITE_HTML)?.[1] ?? "";

describe("die Seite der Core-Oberfläche", () => {
  it("hat genau einen Platz für das Sitzungs-Token und die Version", () => {
    expect(SEITE_HTML.match(/__KEPTA_TOKEN__/g)).toHaveLength(1);
    expect(SEITE_HTML.match(/__KEPTA_VERSION__/g)).toHaveLength(1);
  });

  it("lädt nichts von fremden Servern — nur Links zu LinkedIn und zum Vergleich, in einem neuen Tab", () => {
    const quellen = [...SEITE_HTML.matchAll(/(?:src|href)="([^"]+)"/g)].map((m) => m[1]);
    expect(quellen.filter((q) => /^https?:/.test(q))).toEqual([LINKEDIN, VERGLEICH]);
    for (const a of SEITE_HTML.match(/<a [^>]*href="https?:[^>]*>/g) ?? []) {
      expect(a).toContain('target="_blank"');
      expect(a).toContain('rel="noopener noreferrer"');
    }
    expect(SEITE_JS).not.toMatch(/https?:\/\//);
    expect(SEITE_CSS).not.toMatch(/url\(|@import|https?:\/\//);
  });

  it("zeigt das offizielle KEPTA-Logo — im Tab und in der Seitenleiste", () => {
    expect(FAVICON_SVG).toBe(lies("docs/kepta-logo.svg").trim());
    expect(FAVICON_SVG).toContain('d="M176 176 V336 M176 256 L288 176 M176 256 L288 336"');
    // das Zeichen aus der Seitenleiste von Enterprise (KeptaMark): dunkle Kachel, weißes K, Punkt
    expect(SEITE_HTML).toContain('d="M11 9.5 V22.5 M11 16 L18.2 9.5 M11 16 L18.2 22.5"');
    expect(SEITE_HTML).toContain('<circle cx="21.2" cy="9.8" r="1.7" fill="#fff"/>');
  });

  it("erwähnt Pro leise: ein Link unten in der Seitenleiste — keine gesperrten Einträge, keine eingestreuten Hinweise", () => {
    // Bis 2.11 standen vier gesperrte Enterprise-Einträge in der Seitenleiste,
    // dazu ein Werbekasten, ein Knopf in der Kopfzeile und Hinweise mitten in
    // der Arbeit. Core soll für sich überzeugen; Enterprise ist einen Klick entfernt.
    expect(vorlage).toContain(LINKEDIN);
    expect(vorlage).toContain(VERGLEICH);
    expect([...SEITE_HTML.matchAll(/data-pro="([^"]*)"/g)].map((m) => m[1])).toEqual([""]);
    expect(SEITE_HTML).not.toMatch(/lock-ico|class="upsell"|pro-btn/);
    expect(SEITE_JS).not.toMatch(/hinweis\(|class: 'hint'/);
  });

  it("verspricht nur, was die Vergleichstabelle der README belegt", () => {
    const readme = lies("README.md");
    const belege: [string, string][] = [
      ["Force and Tree", "Force (physics) and Tree (dendrogram)"],
      ["time slider", "Time slider"],
      ["3 000 nodes", "3 000 nodes"],
      ["Obsidian vault", "Obsidian vault import"],
      ["clip a web page", "URL clipper"],
      ["scan this computer", "Scan this computer"],
      ["20 providers", "20 provider presets"],
      ["which notes it used", "every answer shows which memories it used"],
      ["one undo for the batch", "one undo for the batch"],
      ["command palette (⌘K)", "command palette (⌘K)"],
      ["focus mode", "Focus mode"],
      ["never phones home", "never phones home"],
    ];
    for (const [seite, tabelle] of belege) {
      expect(vorlage, seite).toContain(seite);
      expect(readme, tabelle).toContain(tabelle);
    }
  });

  it("das eingebettete JavaScript ist gültig — ein Syntaxfehler tötet die ganze Seite", async () => {
    // SEITE_JS ist ein String: tsc sieht hier nichts. Der Dreifach-Deklarations-
    // Fehler vom 21.9. (function openNote dreimal) lieferte eine leere Oberfläche
    // bei heilem Server — genau das muss der Wächter sofort melden.
    // Parse-only über esbuild (kein eval, keine Ausführung — das wäre
    // Code-Injektion per Definition; das Parsen alone tötet den Fehler).
    const { transform } = await import("esbuild");
    await expect(transform(SEITE_JS, { loader: "js" })).resolves.toHaveProperty("code");
  });

  it("verträgt die strenge CSP: kein Inline-Skript, keine Inline-Stile", () => {
    expect(SEITE_HTML).not.toMatch(/<script>(?!\s*<\/script>)[^<]/);
    expect(SEITE_HTML).not.toMatch(/\sstyle="/);
    expect(SEITE_JS).not.toMatch(/innerHTML|outerHTML|insertAdjacentHTML|document\.write/);
    expect(SEITE_JS).not.toMatch(/setAttribute\(['"]style/);
  });

  it("baut Markdown nur aus Elementen — Links nur nach http(s) und mailto, Karten mit lesbarem Titel", () => {
    expect(SEITE_JS).toContain("/^(https?:|mailto:)/i.test(x.href)");
    expect(SEITE_JS).toContain("target: '_blank', rel: 'noopener noreferrer'");
    expect(SEITE_JS).toContain("note.displayTitle");
    expect(SEITE_JS).toContain("markdown(n.body");
    // die alte Rohtext-Vorschau ist weg
    expect(SEITE_JS).not.toContain("excerpt(");
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
