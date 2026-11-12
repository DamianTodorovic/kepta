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

  // Punkt 2, 1.11. — die Rundung. Der Zensus 31.10. im echten Fenster meldete 12 Namen und
  // 137 Stellen ausserhalb der Hausstufen, und der Zensus zaehlt gemalte Pixel, keine
  // Klassennamen. Die Klassen kommen aus Tailwards Vorrat (rounded-lg ist dort 8 px), und
  // bis hierher prüfte nur die Wache, was in index.css steht — nie, was eine Utility zieht.
  // Darum leitet dieser Fall den Vorrat aus dem Paket selbst ab und fragt jede Klasse,
  // die ein Bausteil ruft, nach ihrem Aufloesungswert. Ein neuer Name, den das Haus nicht
  // kennt, faellt hier — nicht erst im Browser.
  it("zieht jede gerufene Tailwind-Rundung auf eine Hausstufe", () => {
    const stufen = new Set(
      ["--r-panel", "--r-card", "--r-btn", "--r-chip", "--r-badge"].map((n) => {
        const wert = dekl(block(":root"), n)[0];
        expect(wert, `${n} fehlt in index.css`).toBeTruthy();
        return parseFloat(wert!);
      })
    );
    // Tailwards eigener Vorrat, nicht abgeschrieben, sondern nachgelesen.
    const vorrat = fs.readFileSync(path.join(process.cwd(), "node_modules/tailwindcss/theme.css"), "utf8");
    const basis = new Map<string, number>();
    for (const m of vorrat.matchAll(/^\s*--radius-([a-z0-9]+):\s*([\d.]+)rem/gm)) {
      basis.set(m[1], Math.round(parseFloat(m[2]) * 16 * 1000) / 1000);
    }
    expect(basis.size, "der Rundungsvorrat ist nicht zu lesen").toBeGreaterThanOrEqual(6);
    // Was das Haus ueberschreibt, gilt; der Wert darf ein Haus-Token sein oder eine Zahl.
    for (const m of block("@theme").join("\n").matchAll(/--radius-([a-z0-9]+):\s*([^;]+);/g)) {
      const roh = m[2].trim();
      const haus = roh.match(/^var\((--r-[a-z-]+)\)$/);
      if (haus) {
        const wert = dekl(block(":root"), haus[1])[0];
        expect(wert, `${m[1]} zeigt auf ein Token ohne Wert: ${haus[1]}`).toBeTruthy();
        basis.set(m[1], parseFloat(wert!));
      } else {
        basis.set(m[1], parseFloat(roh));
      }
    }
    // Jede gerufene Utility, ueber alle Bausteine und Seiten.
    const dateien: string[] = [];
    for (const wurzel of ["src/components", "src/pages", "src/ui", "src/App.tsx"]) {
      const p = path.join(process.cwd(), wurzel);
      if (!fs.existsSync(p)) continue;
      if (fs.statSync(p).isFile()) { dateien.push(p); continue; }
      for (const f of fs.readdirSync(p, { recursive: true })) {
        const voll = path.join(p, String(f));
        if (/\.(tsx|ts)$/.test(String(f)) && fs.statSync(voll).isFile()) dateien.push(voll);
      }
    }
    const rufer = new Map<string, string>();
    for (const voll of dateien) {
      const kurz = path.relative(process.cwd(), voll);
      const quelltext = fs.readFileSync(voll, "utf8");
      for (const m of quelltext.matchAll(/rounded-([a-z0-9]+|\[[\d.]+px\])/g)) {
        if (!rufer.has(m[1])) rufer.set(m[1], `${kurz}:${quelltext.slice(0, m.index).split("\n").length}`);
      }
    }
    expect([...rufer.keys()].sort(), "es ruft keine einzige Rundung").not.toHaveLength(0);
    // Zwei Namen kennt der Browser ohne Vorrat: none ist 0, full die Kapsel.
    const erlaubt = new Map<string, number>([...basis, ["none", 0], ["full", 9999]]);
    const fremd: string[] = [];
    for (const [name, wo] of rufer) {
      if (name.startsWith("[")) {
        const px = parseFloat(name.slice(1, -1));
        if (!stufen.has(px)) fremd.push(`${name} (${px} px) in ${wo}`);
        continue;
      }
      const px = erlaubt.get(name);
      if (px === undefined) { fremd.push(`${name} (kein Vorrat) in ${wo}`); continue; }
      if (px >= 100 || stufen.has(px)) continue;
      fremd.push(`${name} (${px} px) in ${wo}`);
    }
    expect(fremd, `Rundungen ausserhalb der Hausstufen: ${fremd.join(" | ")}`).toEqual([]);
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
  // H-1 Legende (14.10., an Pixeln gemessen): die vier Wörter im Index-Streifen
  // standen bei 10 px und opacity .7 — das sind 3,45–3,49:1 auf dem Panel, in 16
  // von 16 Fällen (4 Wörter × 4 Breiten) unter der Schriftkante 4,5:1. Die Ruhe
  // soll von der Größe kommen, nicht von einem Wäschegang über die Tinte.
  it("dämpft die Legende nicht, sondern setzt sie kleiner", () => {
    const regel = (css.match(/\.index-strip[^{]*\{[^}]*\}/g) ?? []).find((r) => /\.index-strip\s+span/.test(r));
    expect(regel, "die Index-Legende hat keine Regel in index.css").toBeTruthy();
    expect(regel).toMatch(/font-size:\s*var\(--fs-1\)/);
    expect(regel, "opacity unter 1 wäscht die Tinte aus dem Wort").toMatch(/opacity:\s*1\s*[;}]/);
  });

  // H-2 Die Schublade (Vorschau und Editor) ist die gehobenste Fläche im Produkt.
  // Ihr Rand war die dekorative Haarlinie; auf die Flächenrolle gezogen blieb die
  // Zahl im Bild trotzdem 1,59:1 — ein 1-px-Border verliert auf einem Element mit
  // backdrop-filter die Hälfte seiner Kraft (zwei Pixel Breite ändern nichts: 1,64).
  // Eine innere Schattenlinie malt denselben Token echt: 3,69:1 nach außen, 5,85:1
  // nach innen (1440 px, 14.10.).
  it("gibt der Schublade eine Flächenkante, die im Bild steht", () => {
    const schublade = css.match(/\.glass-strong\s*\{[^}]*\}/)?.[0] ?? "";
    expect(schublade).toContain("var(--kante-flaeche)");
    expect(schublade, "die Kante muss als innere Linie gemalt werden, nicht als Border").toMatch(
      /box-shadow:[^;]*inset\s+0 0 0 1px var\(--kante-flaeche\)/,
    );
    // Die dritte Zeile dieser Art sah frueher auch die Regel `.glass` -- die hatte aber
    // keinen Rufer (Waisen-Zensus 5.11.: null Token-Rufer in src, null class=-Treffer,
    // null Selektor-String) und ist am 5.11. mit den uebrigen 17 toten Regeln gefallen.
    // Die gehaltene Zahl ist die der lebenden Flaeche oben: `.glass-strong` ruft die
    // Vorschau und der Editor, und deren inset-Mass wird unveraendert geprueft. Eine
    // doppelte Wache "die Regel fehlt nun" faehrt die Design-Wache schon -- sie meldet
    // jede Regel ohne Rufer, und die Latte steht seit diesem Schnitt auf null Sitzen.
  });

  // H-3 Die neun Wörter (WAs Umbau 17:35) sind die Hauptfilter der Fläche, .row-quiet
  // trug für sie die leise Stufe --text-3: im gemalten Bild 5,18:1, für ein kurzes
  // Wort wie „Links" 4,36:1 (36 Wortkästen, 14.10.) — unter der Schriftkante. Eine
  // Bedienkontrolle darf nicht die leise Stufe der Fläche sein; ihre Berandung ist
  // außerdem eine Haarlinie, wo ein Bedienelement eine Kontrollkante braucht.
  it("hebt die Chips über die leise Stufe und gibt ihnen eine Kontrollkante", () => {
    const chip = css.match(/\.row-quiet\s*\{[^}]*\}/)?.[0] ?? "";
    expect(chip, ".row-quiet steht nicht auf der zweiten Tintenstufe").toContain("color: var(--text-2)");
    const knopf = css.match(/button\.row-quiet\s*\{[^}]*\}/)?.[0] ?? "";
    expect(knopf, "ein Chip ohne Kontrollkante ist ein Textstück, kein Griff").toContain("var(--kante-kontrolle)");
  });

  it("kennt Schichten, Medienabfragen und ihr Schema", () => {
    // Die drei Abfragen, die D1-12 fehlten, plus die Ruhe-Antwort.
    for (const mq of ["prefers-reduced-motion", "prefers-contrast: more", "forced-colors: active", "prefers-reduced-transparency: reduce"]) {
      expect(css, `es fehlt @media (${mq})`).toContain(`(${mq}`);
    }
    // Das increased-contrast-Schema ist generiert, nicht von Hand gesetzt:
    // es trägt seinen Marker und beide Theme-Blöcke.
    expect(css).toMatch(/generiert: increased contrast/);
    const schema = css.slice(css.indexOf("@media (prefers-contrast: more)"));
    // Das Schema härtet die Tinte und die Linien, nicht die Leiter: drei Stufen
    // zwischen Weiß und Schwarz lassen sich nur weiter spreizen, indem eine
    // Endstufe wandert, und die Endstufe ist das Gegenüber der Schrift.
    // Gemessen am 11.10.: --text-1 fiel dabei von 9,89 auf 7,31 (dunkel).
    for (const block of [/:root\s*\{[\s\S]*?\}/, /\.dark\s*\{[\s\S]*?\}/]) {
      const a = block.exec(schema)?.[0] ?? "";
      for (const n of ["--text-1", "--text-2", "--text-3", "--kante-kontrolle", "--fokus"]) {
        expect(a, `das Schema nennt ${n} nicht`).toContain(`${n}:`);
      }
      expect(a, "das Schema verschiebt die Flächenleiter").not.toMatch(/--eb-0:/);
      expect(a, "das Schema verschiebt die Flächenleiter").not.toMatch(/--feld:/);
    }
    // Jede Typ-Rolle hat ihren sRGB-Kanal auch im Schema — sonst malt die
    // Leinwand im erhöhten Kontrast das Bild des normalen.
    for (const n of ["--type-semantic", "--type-neutral", "--type-herkunft-datei"]) {
      expect(schema, `das Schema nennt ${n} nicht`).toContain(`${n}:`);
      expect(schema, `das Schema nennt ${n}-hex nicht`).toContain(`${n}-hex:`);
    }
    // Die Stahl-Lagen sind Lagen (Alpha), keine erfundenen Deckfarben.
    expect(css).toMatch(/--side-flaeche: oklch\(1 0 0 \/ 0\.045\)/);
    expect(css).toMatch(/--side-auswahl: oklch\(1 0 0 \/ 0\.07\)/);
    // Und was huelle.css (E3) gebraucht hat, ist da.
    for (const n of ["--side-leise", "--side-kante-heben"]) expect(css).toContain(`${n}:`);
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

  // Der Vertrag steht in der ersten Zeile von icons.tsx: Solar „Linear", 1,5 px
  // Strich. Eine Strich-Gruppe (`fill="none" stroke="currentColor"`) darf deshalb
  // keinen Pfad tragen, der sich selbst wieder füllt. Im gemalten Bild heißt das:
  // die Nav-Leiste zeigt Klümpchen statt Zeichen — gemessen 14.10. am echten
  // Screen, `ikon-Copytext` 1,01:1 (das ganze 16×16-Feld eine Farbe).
  it("malt die Serie als Strich, nicht als Fläche", () => {
    const koerper = new Map<string, string>();
    for (const [name, e] of Object.entries(daten.icons)) koerper.set(name, (e as { body: string }).body);
    for (const m of icons.matchAll(/"([\w-]+)":\s*\{[\s\S]*?body:\s*([`'"])([\s\S]*?)\2/g)) koerper.set(m[1], m[3]);
    const klumpen: string[] = [];
    for (const [name, body] of koerper) {
      const strichGruppe = /fill="none"[^>]*stroke="currentColor"/.test(body);
      if (!strichGruppe) continue;
      const gefuellt = [...body.matchAll(/<path\b[^>]*fill="currentColor"[^>]*>/g)].length;
      if (gefuellt > 0) klumpen.push(`${name} (${gefuellt} Pfade)`);
    }
    expect(klumpen, `${klumpen.length} Bilder füllen eine Strich-Gruppe — sie malen Klumpen`).toEqual([]);
  });
});

/* P199 (Emil-Audit, 13.11.): der Bewegungs-Vertrag. Vier Späher hörten das
   ganze Haus ab; diese Wachen nageln das Gefundene fest — eine Kurve, eine
   Dauerleiter, milde Bewegung-Reduzierung, Zeiger-Gatter für Schwebe,
   Haus-Federn statt getippter Konfigurationen. */
describe("Bewegungs-Vertrag (P199, Emil-Audit)", () => {
  it("tippt keine bare ease-Kurve — die Signaturkurve wird gerufen", () => {
    for (const [i, z] of ZEILEN.entries()) {
      if (!z.includes("transition")) continue;
      // `ease` als Wort, aber nicht --ease-apple (Bindestrich davor) und
      // nicht ease-in-out (Bindestrich danach):
      expect(z, `index.css:${i + 1} tippt bare ease statt var(--ease-apple)`).not.toMatch(
        /transition[a-z-]*\s*:[^;]*[^)\w-]ease(?![\w-])/,
      );
    }
  });

  it("misst Übergänge in Stufen, nicht in handgetippten Sekunden", () => {
    for (const [i, z] of ZEILEN.entries()) {
      if (!z.includes("transition")) continue;
      expect(z, `index.css:${i + 1} tippt Sekunden statt der Dauerstufen`).not.toMatch(
        /transition[a-z-]*\s*:[^;]*\b\d*\.?\d+s\b/,
      );
    }
  });

  it("reduziert Bewegung milde — der Stern behält seine Farb-Quittungen", () => {
    // Der alte Block tötete ALLE Übergänge auf 0,01 ms (Emil-Audit §6: Feedback
    // darf bleiben, nur Bewegung fällt). Der Wildcard-Satz darf transition-duration
    // nicht mehr anfassen.
    expect(css).not.toMatch(
      /reduced-motion: reduce[\s\S]*?\*,\s*\*::before,\s*\*::after\s*\{[^}]*transition-duration/,
    );
    // … und die Transform-Übergänge der Griffe werden sofort geschaltet:
    expect(css).toMatch(/reduced-motion: reduce[\s\S]*?\.btn-primary,\s*\.btn-ghost[^}]*transition-duration:\s*0\.01ms/);
  });

  it("gattert Schwebe-Hinterlegen hinter den Zeiger", () => {
    // Touch-Flächen feuern beim Antippen sonst einen falschen Schwebezustand:
    expect(css).toMatch(/@media \(hover: hover\) and \(pointer: fine\) \{\s*\.graph-swatch:hover/);
    expect(css).toMatch(/@media \(hover: hover\) and \(pointer: fine\) \{\s*\.graph-time::-webkit-slider-thumb:hover/);
  });

  it("ruft die Haus-Federn, statt Federn zu tippen", () => {
    const bausteine = [
      "Dashboard", "MemoryCard", "Chat", "Settings", "OnboardingWizard",
      "DuplicatesPanel", "MachineScan", "ui/Toast", "MemoryEditor", "MemoryPreview",
    ];
    for (const name of bausteine) {
      const quelltext = fs.readFileSync(path.join(process.cwd(), "src/components", `${name}.tsx`), "utf8");
      expect(quelltext, `${name}.tsx tippt eine Spring-Feder statt des Tokens`).not.toMatch(/type:\s*['"]spring['"]/);
    }
    // Der eine Gatter-Punkt für die ganze App (Bewegung reduzieren deckt Framer ab):
    const main = fs.readFileSync(path.join(process.cwd(), "src/main.tsx"), "utf8");
    expect(main).toMatch(/MotionConfig reducedMotion="user"/);
  });

  it("schiebt die Karten nicht mehr per Layout-Feder um den Tisch", () => {
    const karte = fs.readFileSync(path.join(process.cwd(), "src/components/MemoryCard.tsx"), "utf8");
    expect(karte, "MemoryCard trägt noch layout=\"position\" (Main-Thread auf der belebtesten Fläche)").not.toMatch(/layout="position"/);
  });
});
