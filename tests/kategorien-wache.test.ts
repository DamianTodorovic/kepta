/**
 * Wache: die neun Woerter gelten auf der ganzen Flaeche (#84).
 *
 * Anlass: die zwei Zeilen waren an fuenf Orten gebaut, und die Leitung zaehlte
 * fuenf Stellen, die noch Facts / How-tos / Documents zeigen. Abgeschrieben war
 * genau dieser Fehler zum zweiten Mal — also leitet dieser Fall alles ab:
 *
 *   1. Verbotene Woerter: die Etikette der vier Rechen-Arten aus `TYP_LABELS`,
 *      abueglich derer, die selbst zu den neun zaehlen ("Events" bleibt erlaubt).
 *   2. Erlaubte Woerter: `TRAEGER_LABELS` + `THEMA_LABELS` = genau neun.
 *   3. Der Scan ist ein Lauf durch den Baum, keine Handliste von Dateien.
 *   4. Sichttext ist ein String-Literal oder ein JSX-Textknoten — kein Kommentar,
 *      keine Kennung, kein Objekt-Schluessel. Das zaehlt ein kleiner Automat.
 *
 * Zwei Behauptungen:
 *   (a) kein Stueck Sichttext nennt ein verworfenes Wort — als Etikett oder als
 *       Aufzaehlung der vier Koerbe, und
 *   (b) jede Datei, die eines der neun Woerter als Kategorie zeigt, holt es aus
 *       der gemeinsamen Quelle, damit nicht irgendwo ein zweites Regelwerk steht.
 */
import FS from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";
import { TYP_LABELS, TYP_BESCHREIBUNG, TRAEGER_LABELS, THEMA_LABELS, buildHierarchy } from "../src/lib/graphHierarchy";

const HIER = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/**
 * Flaeche = was ein Mensch liest. Der Kern (`src/core`) spricht zu Maschinen
 * (MCP-Vertrag, Wortlisten der Regeln) und der Scanner (`src/scan`) begruendet
 * Ueberspringen gegenueber dem Protokoll — da sind "how-to" und "document"
 * Daten, keine Etikette. Diese Grenze ist eine Aussage, keine Ausrede: sie
 * steht hier, damit ein neuer Schirm unter ihr nicht ungeprueft durchkommt.
 */
const FLAECHEN = ["src/components", "src/lib", "src/App.tsx", "src/types.ts"];

/** Die neun Woerter, wie die Flaeche sie spricht. */
const NEUN = [...Object.values(TRAEGER_LABELS), ...Object.values(THEMA_LABELS)];

/**
 * Verboten: die Etikette der vier Rechen-Arten. "Events" faellt raus — es ist
 * eines der neun Woerter und darf weiter dastehen. Dazu die Singularformen,
 * abgeleitet durch abhaengen des Plural-s ("Facts" -> "Fact", "How-tos" ->
 * "How-to").
 */
const VERBOTEN = [
  ...new Set(
    Object.values(TYP_LABELS)
      .filter((w) => !NEUN.includes(w))
      .flatMap((w) => [w, w.replace(/s$/u, "")])
  ),
];

function dateien(ordner: string): string[] {
  const raus: string[] = [];
  if (!FS.existsSync(ordner)) return raus;
  if (FS.statSync(ordner).isFile()) return [ordner];
  for (const e of FS.readdirSync(ordner, { withFileTypes: true })) {
    const p = path.join(ordner, e.name);
    if (e.isDirectory()) raus.push(...dateien(p));
    else if (/\.tsx?$/u.test(e.name) && !e.name.endsWith(".d.ts")) raus.push(p);
  }
  return raus.sort();
}

const FLAECHEN_DATEIEN = FLAECHEN.flatMap((t) => dateien(path.join(HIER, t)));

/**
 * Sammelt den Sichttext: String-Literale und JSX-Textknoten, mit Zeilennummer.
 * Laesst Kommentare, Objekt-Schluessel und Regexe weg — sonst klagt die Wache
 * Dateien an, die nichts zeigen.
 */
function sichttext(code: string): { text: string; zeile: number; linie: string }[] {
  const zeilen = code.split("\n");
  const funde: { text: string; zeile: number; linie: string }[] = [];
  const push = (text: string, zeile: number) => funde.push({ text, zeile, linie: zeilen[zeile - 1] ?? "" });
  const vorString = "=({[,:;+*?&|!~\n";
  // Kein `<` und kein `>` davor: `</div>` ist ein schliessendes Tag, keine Regex.
  // Mit `<` in der Liste verschluckte der Zaehler ein ganzes Stueck JSX und
  // meldete Etikette nicht, die dort sichtbar stehen.
  let i = 0;
  let zeile = 1;
  const hoch = (bis: number) => { for (; i < bis && i < code.length; i++) if (code[i] === "\n") zeile++; i = bis; };
  const letztes = () => code.slice(0, i).trimEnd().slice(-1);

  while (i < code.length) {
    const c = code[i];
    const n = code[i + 1];

    if (c === "/" && n === "/") { const bis = code.indexOf("\n", i); hoch(bis === -1 ? code.length : bis); continue; }
    if (c === "/" && n === "*") { const bis = code.indexOf("*/", i + 2); hoch(bis === -1 ? code.length : bis + 2); continue; }

    if (c === "/") {
      const vorher = letztes();
      if (vorher === "" || vorString.includes(vorher) || vorher === ")") {
        const bis = regexEnde(code, i);
        if (bis > i) { hoch(bis); continue; }
      }
    }

    if (c === '"' || c === "'" || c === "`") {
      const vorher = letztes();
      // Ein Apostroph mitten im Text ("don't") eroeffnet keinen String.
      const eroeffnet = vorher !== "" && (vorString.includes(vorher) || /\b(?:return|case|of|in|yield)\s+$/u.test(code.slice(0, i)));
      if (eroeffnet) {
        const start = zeile;
        const bis = stringEnde(code, i, c);
        const inhalt = code.slice(i + 1, Math.max(i + 1, bis - 1));
        // Ein Objekt-Schluessel ist kein Sichttext: `"legend.facts": "Facts"`.
        // Nur ein Schluessel, nicht die Mitte einer Bedingung: der String hinter
        // `? 'Facts' : 'x'` waere sonst verloren — genau der Tooltip-Befund.
        const davor = code.slice(0, i).trimEnd().slice(-1);
        const danach = code.slice(bis).trimStart()[0];
        const schluessel = danach === ":" && (davor === "{" || davor === "," || davor === "");
        if (!schluessel) push(inhalt, start);
        hoch(bis);
        continue;
      }
    }

    if (c === ">" && code[i - 1] !== "=") {
      const bis = code.indexOf("<", i + 1);
      const text = code.slice(i + 1, bis === -1 ? code.length : bis);
      // `>` ist auch ein Rechenzeichen. Ein JSX-Textknoten traegt nie
      // geschweiflte Klammern oder Kommentarzeichen; und wenn es keiner ist,
      // einen Zeichen weitergehen — sonst ueberspringt der Zaehler die Datei.
      if (/[A-Za-z]/u.test(text) && !/[{}*]/u.test(text) && text.trim().length > 0) {
        push(text, zeile);
        hoch(bis === -1 ? code.length : bis);
        continue;
      }
    }

    if (c === "\n") zeile++;
    i++;
  }
  return funde;
}

function stringEnde(code: string, start: number, delim: string): number {
  for (let j = start + 1; j < code.length; j++) {
    if (code[j] === "\\") { j++; continue; }
    if (code[j] === delim) return j + 1;
    if (code[j] === "\n" && delim !== "`") return j;
  }
  return code.length;
}

function regexEnde(code: string, start: number): number {
  let klammer = false;
  for (let j = start + 1; j < code.length; j++) {
    const c = code[j];
    if (c === "\\") { j++; continue; }
    if (c === "[") klammer = true;
    else if (c === "]") klammer = false;
    else if (c === "/" && !klammer) {
      while (j + 1 < code.length && /[a-z]/ui.test(code[j + 1])) j++;
      return j + 1;
    } else if (c === "\n") return start;
  }
  return start;
}

const wort = (w: string, m = "u") => new RegExp(`\\b${w.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&")}\\b`, m);

/**
 * Ein Etikett ist kurz, hat keine Zahl und keinen Satzbau. Eine Zahl heisst: das
 * Wort zaehlt Dinge ("Import 12 documents") und ist englisches Substantiv, keine
 * Kategorie.
 */
const kurzesEtikett = (text: string) => {
  const t = text.trim();
  return t.length <= 24 && !/\d/u.test(t);
};

/**
 * Befund fuer (a): ein kurzes Etikett, das ein verworfenes Wort nennt
 * ("Key facts"), oder ein Text, der **zwei oder mehr** der vier Worte nennt —
 * das ist die Taxonomie selbst, egal wie lang der Satz ist. Ein einzelnes
 * englisches Substantiv in einem langen Satz ("read your documents", "Import 12
 * documents") ist keine Kategorie.
 */
function befund(text: string): string | null {
  const genannte = VERBOTEN.filter((w) => wort(w, "iu").test(text));
  if (!genannte.length) return null;
  if (kurzesEtikett(text)) return genannte[0];
  return genannte.length >= 2 ? genannte.join(", ") : null;
}

/**
 * Fuer (b) gilt eine strengere Schwelle: eines der neun Woerter zaehlt nur als
 * Kategorie, wenn es als ganzer Text oder als Glied einer Liste dasteht
 * ("Notes · Files · Code", "4 Notes") — nicht mitten in einem Namen
 * ("Claude Code").
 */
function kategorieGlieder(text: string): string[] {
  return text
    .split(/[·,|/\n]/u)
    .map((s) => s.trim().replace(/^\d[\d .]*\s+/u, "").trim())
    .filter((s) => NEUN.includes(s));
}

/** Die Datei, in der TYP_LABELS steht, ist die Definition — kein Sichttext. */
function definitionsort(): string {
  for (const p of FLAECHEN_DATEIEN) if (FS.readFileSync(p, "utf8").includes("export const TYP_LABELS")) return p;
  return "";
}

/**
 * Kein Sichttext, was ein Pfad oder ein Schluessel ist: `path.join(programme,
 * "Code", "User")` zeigt kein Kategorie-Wort, es oeffnet ein Verzeichnis.
 */
const maschinenzeile = (linie: string) => /path\.(join|resolve)\(|process\.env\.|require\(/u.test(linie);

function verboteneFunde() {
  const aus: { datei: string; zeile: number; wort: string; text: string }[] = [];
  for (const p of FLAECHEN_DATEIEN) {
    if (p === definitionsort()) continue;
    for (const s of sichttext(FS.readFileSync(p, "utf8"))) {
      if (maschinenzeile(s.linie)) continue;
      const w = befund(s.text);
      if (w) aus.push({ datei: path.relative(HIER, p), zeile: s.zeile, wort: w, text: s.text.trim().slice(0, 80) });
    }
  }
  return aus;
}

function neunOhneQuelle() {
  const aus: string[] = [];
  for (const p of FLAECHEN_DATEIEN) {
    if (p === definitionsort()) continue;
    const code = FS.readFileSync(p, "utf8");
    const zeigt = sichttext(code).some((s) => !maschinenzeile(s.linie) && kategorieGlieder(s.text).length > 0);
    if (!zeigt) continue;
    const holt = /from\s+["'][^"']*graphHierarchy["']/u.test(code) || /from\s+["'][^"']*klassifikation["']/u.test(code);
    if (!holt) aus.push(path.relative(HIER, p));
  }
  return aus;
}

describe("Wache: die neun Woerter gelten auf der ganzen Flaeche", () => {
  it("leitet die Woerter ab, statt sie abzuschreiben", () => {
    expect(NEUN).toHaveLength(9);
    expect(VERBOTEN).not.toContain("Events");
    expect([...VERBOTEN].sort()).toEqual(["Document", "Documents", "Fact", "Facts", "How-to", "How-tos"].sort());
    expect(FLAECHEN_DATEIEN.length).toBeGreaterThan(40);
  });

  it("liest Sichttext — keinen Kommentar, keine Kennung, keinen Schluessel", () => {
    const probe = [
      '// "Facts" im Kommentar ist kein Sichttext',
      'const TITEL = "Facts";',
      "/* Documents auch nicht */",
      "const regex = /['\"];{2}/;",
      'const LEGENDE = { "legend.facts": "Facts", key: "Code" };',
      "return <h3>How-tos</h3>;",
      "return <p>don't panic — a document</p>;",
    ].join("\n");
    const texte = sichttext(probe).map((s) => s.text.trim());
    expect(texte).toContain("Facts");
    expect(texte).toContain("How-tos");
    expect(texte).not.toContain("legend.facts");
    expect(texte.join(" ")).not.toMatch(/Kommentar ist kein Sichttext/);
    expect(texte.join(" ")).not.toMatch(/Documents auch nicht/);
    // Ein String in einer Bedingung hinter einem JSX-Attribut ist Sichttext —
    // genau die Form des Tooltip-Befunds in `Dashboard.tsx`.
    const bedingung = sichttext("<div title={a > 1 ? 'Facts, Events, How-tos' : 'x'} />").map((s) => s.text.trim());
    expect(bedingung).toContain("Facts, Events, How-tos");
    // Zwei Geschachtelte auf einer Zeile, wie die Zahl-Kacheln des Scans: das
    // Etikett hinter `>` muss gefunden werden, auch wenn davor `{wert}` steht.
    const kachel = sichttext('<div className="a"><div style={{ color: "var(--x)" }}>{n.found}</div><div className="hud-label">documents</div></div>');
    expect(kachel.map((s) => s.text.trim())).toContain("documents");
  });

  it("kennt seine eigene Grenze: Etikett ja, englisches Substantiv nein", () => {
    expect(befund("Key facts")).toBe("Facts");
    expect(befund("How-tos")).toBe("How-tos");
    expect(befund("Let K3PTA read your documents")).toBe(null);
    expect(befund("Import 12 documents")).toBe(null);
    expect(befund("Facts, Events, How-tos, Documents")).toContain("Facts");
    expect(befund("Notes · Files · Code")).toBe(null);
    expect(kategorieGlieder("Claude Code")).toEqual([]);
    expect(kategorieGlieder("4 Notes")).toEqual(["Notes"]);
    expect(kategorieGlieder("Notes · Files · Code")).toEqual(["Notes", "Files", "Code"]);
    expect(kurzesEtikett("Claude Code liest dein Gedächtnis")).toBe(false);
  });

  it("(c) die alten Etiketten stehen nur noch an der einen, offen gemeldeten Stelle", () => {
    /**
     * OFFENE SCHULD #84, gemeldet am 14.10. um 23:00 MESZ an die Leitung:
     * `buildHierarchy`, `graphSchema` und die Graph-Legende malen weiter die vier
     * alten Worte, weil Buchstaben und Scheiben GFs Entwurfsvertrag sind
     * (`KnowledgeGraph.render.test.tsx` haelt sie in 7 Faellen). Ich habe die
     * Umstellung dort gebaut und zurueckgezogen — sie wirft GFs Suite.
     *
     * Die Liste ist keine Ausrede, sondern ein Register: **ein viertes Stueck,
     * das die alten Etikette importiert, faellt hier rot auf**, und ein neuer
     * Schirm kommt nicht ungeprueft durch. Wer die Schuld tilgt, leert die Liste.
     */
    // Leer seit 15.10. 01:1x: die Leitung hat die Graph-Woerter dieser Scheibe
    // gegeben, `KnowledgeGraph.tsx`, `graphSchema.ts` und `buildHierarchy` ziehen
    // jetzt `TYP_BESCHREIBUNG`, und GFs Etikett-Faelle sind mitgezogen.
    // Die Behauptung unten ist eine exakte Mengen-Gleichheit: ein Stueck mehr,
    // das `TYP_LABELS` importiert, faellt rot auf — ein Eintrag ohne Fund auch.
    const OFFENE_SCHULD: string[] = [];

    const Nutzer = FLAECHEN_DATEIEN.filter((p) => p !== definitionsort())
      .filter((p) => /TYP_LABELS/u.test(FS.readFileSync(p, "utf8")))
      .map((p) => path.relative(HIER, p))
      .sort();
    expect(Nutzer.join("\n")).toBe(OFFENE_SCHULD.join("\n"));

    // (c2) Was durch die Map laeuft, sieht der statische Scan nicht: ein Etikett
    //        aus einer Variablen ist unsichtbar. Also wird der Baum selbst
    //        gestellt — erlaubt sind die neun Woerter, die vier Beschreibungen
    //        und, als ausgewiesene Schuld, genau die alten Etikette.
    const notizen = (["semantic", "episodic", "procedural", "reference"] as const).map((typ, i) => ({
      id: `m${i}`, userId: "local", title: `Notiz ${i}`, content: "Text", tags: [] as string[],
      type: typ, createdAt: 1, updatedAt: 1,
    })) as unknown as Parameters<typeof buildHierarchy>[0];
    const erlaubt = new Set([...NEUN, ...Object.values(TYP_BESCHREIBUNG), ...Object.values(TYP_LABELS)]);
    type Knoten = { id?: string; label: string; kind?: string; children?: Knoten[] };
    const falscheEtikette = (knoten: Knoten[]): string[] => {
      const raus: string[] = [];
      for (const k of knoten) {
        // Nur die Kategorie-Knoten zaehlen — Notizknoten tragen Titel aus dem
        // Bestand des Nutzers, und die sind kein Etikett.
        if (k.kind === "type" && !erlaubt.has(k.label)) raus.push(`${k.id}: „${k.label}"`);
        if (Array.isArray(k.children)) raus.push(...falscheEtikette(k.children));
      }
      return raus;
    };
    const baum = [buildHierarchy(notizen) as unknown as Knoten];
    expect(falscheEtikette(baum)).toEqual([]);
    // Gegenprobe, damit (c2) nicht zahnlos grün wird: ein erfundenes drittes
    // Etikett zwischen den vier alten und den neun neuen muss auffallen.
    expect(falscheEtikette([{ id: "__typ:x", kind: "type", label: "Baskets", children: [] }]))
      .toEqual(['__typ:x: „Baskets"']);
    // Und die Schuld ist sichtbar, nicht still: wie viele Knoten malen noch alt?
    const nochAlt = (function zahl(knoten: Knoten[]): number {
      let n = 0;
      for (const k of knoten) {
        if (k.kind === "type" && Object.values(TYP_LABELS).includes(k.label)) n++;
        if (Array.isArray(k.children)) n += zahl(k.children);
      }
      return n;
    })(baum);
    expect(falscheEtikette(baum)).toEqual([]);
    console.warn(`KATEGORIEN-WACHE — offene Schuld #84: ${nochAlt} Knoten im Graphenbaum malen noch ein altes Etikett (${OFFENE_SCHULD.join(", ")}).`);
  });

  it("(d) die Flaeche zieht keinen Server-Code in den Browser", () => {
    /**
     * Kein JSDOM-Lauf merkt das: unter Node lebt `process`, im Renderer nicht.
     * Mein eigener Fall vom 14.10. — `DossierView` importierte die Titel aus
     * `lib/dossier`, und das haelt `core/engine` → `core/embeddings` →
     * `process.env`. Die Suite blieb grün, die App war schwarz
     * (`ReferenceError: process is not defined`).
     *
     * Regel: von jeder Datei unter `src/components` aus der Importgraph laufen;
     * erreicht er eine Datei, die `process.` liest, ist die Kette ein Befund.
     */
    const liestProzess = new Set(
      dateien(path.join(HIER, "src")).filter((p) => /\bprocess\.[a-z]/u.test(FS.readFileSync(p, "utf8"))),
    );
    const anfange = dateien(path.join(HIER, "src/components"));
    const ketten: string[] = [];
    const besuch = (p: string, weg: string[], tiefe: number) => {
      if (tiefe > 7 || ketten.length > 6) return;
      if (liestProzess.has(p)) { ketten.push(`${weg.join(" → ")} → ${path.relative(HIER, p)}`); return; }
      const code = FS.readFileSync(p, "utf8");
      for (const m of code.matchAll(/from\s+["'](\.[^"']+)["']/gu)) {
        const ziel = path.resolve(path.dirname(p), m[1]);
        const kandidat = [`${ziel}.ts`, `${ziel}.tsx`, path.join(ziel, "index.ts")].find((k) => FS.existsSync(k));
        if (kandidat && !weg.includes(kandidat)) besuch(kandidat, [...weg, path.relative(HIER, kandidat)], tiefe + 1);
      }
    };
    for (const start of anfange) besuch(start, [path.relative(HIER, start)], 0);
    if (ketten.length) console.warn(`KATEGORIEN-WACHE — ${ketten.length} Importkette(n) ziehen Server-Code in den Renderer:\n${ketten.join("\n")}`);
    expect(ketten.join("\n")).toBe("");
  });

  it("(a) kein Stueck Sichttext nennt ein Wort der vier Rechen-Arten", () => {
    const funde = verboteneFunde();
    const liste = funde.map((f) => `${f.datei}:${f.zeile}  „${f.wort}"  ${f.text}`).join("\n");
    if (funde.length) console.warn(`KATEGORIEN-WACHE — ${funde.length} Stellen zeigen noch ein altes Wort:\n${liste}`);
    expect(liste).toBe("");
  });

  it("(b) jede Flaeche mit einem der neun Woerter holt sie aus der gemeinsamen Quelle", () => {
    const ohne = neunOhneQuelle();
    if (ohne.length) console.warn(`KATEGORIEN-WACHE — ${ohne.length} Dateien zeigen eines der neun Woerter ohne die gemeinsame Quelle:\n${ohne.join("\n")}`);
    expect(ohne.join("\n")).toBe("");
  });
});
