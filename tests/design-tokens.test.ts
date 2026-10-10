import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

// Der Vertrag der Token, direkt aus der Quelle gelesen — ohne die Wache.
// Die Wache rechnet Verhältnisse; dieser Test prüft die Form. Beides zusammen
// heißt: jemand kann die Latte nicht tiefer legen, ohne dass ein Test schreit.

const css = fs.readFileSync(path.join(process.cwd(), "src/index.css"), "utf8");
const icons = fs.readFileSync(path.join(process.cwd(), "src/lib/icons.tsx"), "utf8");
const daten = JSON.parse(fs.readFileSync(path.join(process.cwd(), "src/lib/kepta-icons.json"), "utf8"));

/** Alle Deklarationen eines Theme-Blocks, in Reihenfolge der Datei. */
function block(selektor: string) {
  const i = css.indexOf(selektor + " {");
  if (i < 0) return [];
  const ende = css.indexOf("\n}", i);
  return css.slice(i, ende).split("\n");
}
const dekl = (zeilen: string[], name: string) =>
  zeilen.map((z) => z.match(new RegExp(`^\\s*${name}:\\s*(.+);`))).filter(Boolean).map((m) => m![1]);

const ZEILEN = css.split("\n");
const zeileVon = (suche: string | RegExp) => {
  const i = ZEILEN.findIndex((z) => (typeof suche === "string" ? z.includes(suche) : suche.test(z)));
  return i < 0 ? "Zeile —" : `Zeile ${i + 1}`;
};

describe("Token-Form in src/index.css", () => {
  it("definiert die Leiter in beiden Themen als oklch-Stufen", () => {
    for (const selektor of [":root", ".dark"]) {
      const b = block(selektor);
      const stufen = ["--eb-0", "--eb-1", "--eb-2"].map((n) => dekl(b, n));
      for (const s of stufen) expect(s, `${selektor}: ${n(s)} fehlt`).toHaveLength(1);
      for (const s of stufen.flat()) expect(s).toMatch(/^oklch\(/);
      expect(dekl(b, "--feld")).toHaveLength(1);
      // Der Tisch bleibt die Marke, aber die Leiter ist gerechnet: die
      // Lichtwerte sind oklch, keine vierzig Hex-Werte.
      expect(dekl(b, "--eb-1")[0]).not.toBe(dekl(b, "--eb-2")[0]);
    }
    function n(s: string[]) { return s[0] ?? "?"; }
  });

  it("hält die Schriftleiter: höchstens acht Stufen, ganzzahlig, keine unter 11 px", () => {
    const werte = dekl(block(":root"), "--fs-1").concat(
      ...[2, 3, 4, 5, 6, 7, 8].map((i) => dekl(block(":root"), `--fs-${i}`))
    );
    expect(werte.length).toBeLessThanOrEqual(8);
    expect(werte.length).toBeGreaterThanOrEqual(6);
    const px = werte.map((w) => parseFloat(w));
    for (const p of px) {
      expect(Number.isInteger(p), `${p} px ist ein halber Schritt (${zeileVon(`--fs`)} )`).toBe(true);
      expect(p).toBeGreaterThanOrEqual(11);
    }
    expect([...px].sort((a, b) => a - b)).toEqual(px.slice().sort((a, b) => a - b));
  });

  it("kennt nur Gewichte, die eine nicht-variable Schrift mitmacht", () => {
    const werte = [1, 2, 3].flatMap((i) => dekl(block(":root"), `--fw-${["ruhig", "halbfest", "fest"][i - 1]}`)).map((w) => parseInt(w));
    expect(werte.length).toBe(3);
    for (const w of werte) expect([300, 400, 600, 700, 800]).toContain(w);
    // und in der Datei steht kein wörtliches Gewicht mehr
    const wörtlich = ZEILEN.filter((z) => /font-weight:\s*\d/.test(z));
    expect(wörtlich.map((z) => z.trim()), "wörtliche Gewichte außerhalb der --fw-Token").toEqual([]);
  });

  it("setzt die Icon-Untergrenze und schreibt sie fest", () => {
    expect(dekl(block(":root"), "--icon-min")).toEqual(["14px"]);
    expect(css).toMatch(/svg\[aria-hidden="true"\][^}]*min-block-size:\s*var\(--icon-min\)/s);
  });

  it("schaltet nirgends den Tastatur-Fokus ab", () => {
    const aus = ZEILEN.filter((z) => /outline:\s*none/.test(z));
    // outline: none ist nur erlaubt, wo ein eigener Ring folgt (focus-within
    // eines Composers, der den Ring am Feld inside trägt) — nie auf focus-visible.
    for (const z of aus) expect(z, `focus-visible ohne Ring: ${z.trim()}`).not.toMatch(/focus-visible/);
    expect(css).toMatch(/outline:\s*2px solid var\(--fokus\)/);
    expect((css.match(/outline:\s*2px solid var\(--fokus\)/g) ?? []).length).toBeGreaterThanOrEqual(2);
  });

  it("hat keine Referenz auf einen nicht existierenden Token", () => {
    const definiert = new Set((css.match(/^\s*(--[\w-]+):/gm) ?? []).map((s) => s.trim().slice(0, -1)));
    const benutzt = (css.match(/var\(\s*(--[\w-]+)\s*[,)]/g) ?? []).map((s) => s.replace(/var\(\s*/, "").slice(0, -1));
    const fehlen = [...new Set(benutzt)].filter((n) => !definiert.has(n));
    expect(fehlen, `undefinerte var() in index.css (${zeileVon("--graph-datum")} u. a.)`).toEqual([]);
  });

  it("heilt die zwei Schreibstellen von D1-14", () => {
    // text-wrap: balance steht in der Regel, nicht danach
    // Verwaiste Deklarationen erkennt nur mit Klammertiefe: eine Zeile
    // "farb: rot;" ist innerhalb einer Regel korrekt, außerhalb verpufft sie.
    const waisen = (() => {
      const ohne = css.replace(/\/\*[^]*?\*\//g, "");
      const out: string[] = [];
      let tiefe = 0, stuck = "";
      for (const c of ohne) {
        if (c === "{") { tiefe++; stuck = ""; continue; }
        if (c === "}") { tiefe--; stuck = ""; continue; }
        if (c === ";") {
          if (tiefe === 0 && /^\s*[-a-zA-Z]+\s*:\s*\S/.test(stuck) && !stuck.trim().startsWith("@")) out.push(stuck.trim());
          stuck = "";
          continue;
        }
        stuck += c;
      }
      return out;
    })();
    expect(waisen, `Deklaration außerhalb einer Regel: ${waisen.join(" | ")}`).toEqual([]);
    // .graph-datum benutzt definierte Token
    const datum = css.slice(css.indexOf(".graph-datum {"));
    expect(datum.slice(0, 500)).toMatch(/background:\s*var\(--feld\)/);
    expect(datum.slice(0, 500)).toMatch(/border:\s*1px solid var\(--kante-kontrolle\)/);
  });

  it("lässt die beiden Heilungen der Fläche stehen", () => {
    expect(css).toMatch(/\.huelle-schmal \.seiten-leiste\s*\{[^}]*position:\s*fixed/s);
    expect(css).toMatch(/\.flaeche-huelle div:has\(> #graph-search-count\)\s*\{[^}]*flex-wrap:\s*nowrap/s);
  });
});

describe("Iconvertrag in src/lib/icons.tsx", () => {
  const macht = [...icons.matchAll(/export const ([A-Za-z0-9_]+)\s*=\s*make\("([\w-]+)"\)/g)];
  const aliase = [...icons.matchAll(/export const ([A-Za-z0-9_]+)\s*=\s*([A-Z][A-Za-z0-9_]*)\s*;/g)];
  const zusatz = [...icons.matchAll(/^\s+"?([\w-]+)"?:\s*\{\s*body:/gm)].map((m) => m[1]);

  it("ruft für jeden Export ein Bild, das es wirklich gibt", () => {
    const vorrat = new Set([...Object.keys(daten.icons), ...zusatz]);
    const fehlt = macht.filter(([, , name]) => !vorrat.has(name)).map(([, n, name]) => `${n}->${name}`);
    expect(fehlt).toEqual([]);
  });

  it("gibt keinem Bild zwei Namen (Alias = dieselbe Absicht, make = ein Zeichen)", () => {
    const seen = new Map<string, string[]>();
    for (const [, n, name] of macht) seen.set(name, [...(seen.get(name) ?? []), n]);
    const doppel = [...seen.entries()].filter(([, ns]) => ns.length > 1).map(([name, ns]) => `${name}: ${ns.join(",")}`);
    expect(doppel).toEqual([]);
  });

  it("aliast nur, was dasselbe bedeutet, und sagt warum", () => {
    expect(aliase.length).toBeGreaterThanOrEqual(5);
    const namen = new Set(macht.map((m) => m[1]));
    const insulan = aliase.filter(([, , ziel]) => !namen.has(ziel) && !["CheckCircle", "User"].includes(ziel));
    expect(insulan.map((m) => m.slice(1).join("=")), "Alias zeigt auf keinen Export").toEqual([]);
  });

  it("lässt keine importierte Ikone verlorengehen", () => {
    const bausteine = fs.readdirSync(path.join(process.cwd(), "src/components"))
      .filter((f) => f.endsWith(".tsx"))
      .map((f) => fs.readFileSync(path.join(process.cwd(), "src/components", f), "utf8"))
      .join("\n");
    const importiert = [...bausteine.matchAll(/import\s*\{([^}]*)\}\s*from\s*["'][^"']*lib\/icons["']/g)]
      .flatMap((m) => m[1].split(",").map((s) => s.trim().split(/\s+as\s+/)[0]))
      .filter(Boolean);
    const exportiert = new Set([...macht.map((m) => m[1]), ...aliase.map((m) => m[1])]);
    const fehlen = [...new Set(importiert)].filter((n) => !exportiert.has(n));
    expect(fehlen, "Bausteine importieren Icons, die es nicht mehr gibt").toEqual([]);
  });

  it("benennt die tote weight-API, statt sie zu verschweigen", () => {
    expect(icons).toMatch(/weight\?:/);
    expect(icons, "weight muss als ignoriert benannt sein").toMatch(/einen? Strich|ignoriert/);
  });
});
