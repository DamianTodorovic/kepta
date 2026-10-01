// Markdown für die Core-Oberfläche — als kleiner Baum, nie als HTML.
//
// Notizen kommen aus Obsidian-Vaults, von Agenten und aus Scans: mit YAML-Kopf,
// Vorlagen-Platzhaltern ({{date}}), Callouts, Tabellen und Dateipfaden als
// Titel. Bis 2.11 zeigte die Seite all das roh — Rauten, Sternchen und „---“
// auf jeder Karte. Hier wird der Text einmal auf dem Server zerlegt; die Seite
// baut daraus Elemente mit textContent. So bleibt die strenge CSP, und kein
// Inhalt kann als HTML etwas ausführen. Jedes Muster ist in der Länge begrenzt,
// damit ein riesiger Scan-Text die Seite nicht aufhält.
import { parseFrontmatter } from "../core/obsidian";

export type Inline =
  | { t: "text"; v: string }
  | { t: "b" | "i" | "s" | "mark"; c: Inline[] }
  | { t: "code"; v: string }
  | { t: "link"; v: string; href: string }
  | { t: "wiki"; ziel: string; v: string }
  | { t: "embed"; v: string }
  | { t: "ph"; v: string }
  | { t: "tag"; v: string };

/** Ein Listenpunkt: Aufgabe (done = true/false) oder nicht (null), Nummer bei nummerierten Listen. */
export interface Punkt {
  c: Inline[];
  done: boolean | null;
  tiefe: number;
  nr: string | null;
}

export type Block =
  | { t: "h"; ebene: number; c: Inline[] }
  | { t: "p"; c: Inline[] }
  | { t: "list"; punkte: Punkt[] }
  | { t: "quote"; art: string | null; titel: Inline[]; blocks: Block[] }
  | { t: "code"; v: string; lang: string }
  | { t: "hr" }
  | { t: "table"; kopf: Inline[][]; zeilen: Inline[][][] };

export interface Zerlegt {
  /** Eigenschaften aus dem YAML-Kopf, soweit sie nicht ohnehin angezeigt werden. */
  kopf: [string, string][];
  titelAusKopf: string | null;
  bloecke: Block[];
  /** Die Herkunftszeile, die Scan und Posteingang anhängen („— Source: …“). */
  quelle: string | null;
}

// Erlaubte Linkziele — alles andere (javascript:, data:, Dateipfade) bleibt Text.
export const SICHERES_ZIEL = /^(https?:\/\/|mailto:)/i;

const INLINE = new RegExp(
  [
    "\\\\(?<esc>[!-/:-@\\[-`{-~])",
    "(?<ticks>`{1,3})(?<code>[^`\\n][^\\n]{0,499}?)\\k<ticks>(?!`)",
    "\\{\\{(?<ph>[^{}\\n]{1,120})\\}\\}",
    "<%[-_=*~]?(?<tpl>[^\\n]{0,300}?)[-_]?%>",
    "!\\[\\[(?<embed>[^\\[\\]\\n]{1,200})\\]\\]",
    "\\[\\[(?<wiki>[^\\[\\]\\n]{1,200})\\]\\]",
    "(?<bild>!?)\\[(?<label>[^\\[\\]\\n]{0,300})\\]\\(\\s*<?(?<href>[^()\\s<>]{1,2000})>?(?:\\s+[\"'(][^\\n]{0,200}?[\"')])?\\s*\\)",
    "<(?<auto>https?:\\/\\/[^\\s<>]{1,2000})>",
    "(?<url>https?:\\/\\/[^\\s<>()\\[\\]]{1,2000}[^\\s<>()\\[\\].,;:!?'\"])",
    "\\*\\*(?<b1>[^\\n]{1,500}?)\\*\\*",
    "(?<![\\w])__(?<b2>[^\\n]{1,500}?)__(?![\\w])",
    "~~(?<s>[^\\n]{1,500}?)~~",
    "==(?<mark>[^\\n=][^\\n]{0,499}?)==",
    "\\*(?<i1>[^\\s*][^\\n*]{0,499}?)\\*",
    "(?<![\\w])_(?<i2>[^\\s_][^\\n_]{0,499}?)_(?![\\w])",
    "(?<![\\w/#&])#(?<tag>[A-Za-z\\u00C0-\\u024F_][\\w\\-/\\u00C0-\\u024F]{0,80})",
    "(?<kommentar><!--[\\s\\S]{0,5000}?-->)",
    "<(?<br>br)\\s*\\/?>",
    "(?<html><\\/?[A-Za-z][\\w-]{0,30}(?:\\s[^<>\\n]{0,500})?\\/?>)",
    "&(?<ent>nbsp|amp|lt|gt|quot|#39|apos);",
  ].join("|"),
  "g"
);

const ENTITAET: Record<string, string> = { nbsp: " ", amp: "&", lt: "<", gt: ">", quot: '"', "#39": "'", apos: "'" };

/** Zerlegt eine Zeile in Text, Hervorhebungen, Links, Platzhalter und Tags. */
export function zeile(text: string, tiefe = 0): Inline[] {
  const aus: Inline[] = [];
  const dazu = (v: string) => {
    if (!v) return;
    const l = aus[aus.length - 1];
    if (l && l.t === "text") l.v += v;
    else aus.push({ t: "text", v });
  };
  if (tiefe > 4) {
    dazu(text);
    return aus;
  }
  const re = new RegExp(INLINE.source, "g");
  let zuletzt = 0;
  for (let m = re.exec(text); m; m = re.exec(text)) {
    const g = m.groups!;
    dazu(text.slice(zuletzt, m.index));
    zuletzt = re.lastIndex;
    if (g.esc !== undefined) dazu(g.esc);
    else if (g.code !== undefined) aus.push({ t: "code", v: g.code.trim() || g.code });
    else if (g.ph !== undefined) aus.push({ t: "ph", v: g.ph.trim() });
    else if (g.tpl !== undefined) aus.push({ t: "ph", v: g.tpl.trim().slice(0, 40) || "template" });
    else if (g.embed !== undefined) aus.push({ t: "embed", v: dateiname(g.embed.split("|")[0]!) });
    else if (g.wiki !== undefined) {
      const [ziel = "", alias] = g.wiki.replace(/\\\|/g, "|").split("|");
      const ohneAnker = ziel.split("#")[0]!.trim();
      const v = alias?.trim() || ohneAnker || ziel.replace(/^#+/, "").trim();
      if (!v) dazu(m[0]);
      else aus.push({ t: "wiki", ziel: ohneAnker || v, v });
    } else if (g.href !== undefined) {
      const label = (g.label ?? "").trim();
      if (SICHERES_ZIEL.test(g.href)) aus.push({ t: "link", v: label || (g.bild ? "Image" : g.href), href: g.href });
      else if (g.bild) aus.push({ t: "embed", v: label || dateiname(g.href) });
      else aus.push(...zeile(label, tiefe + 1));
    } else if (g.auto !== undefined) aus.push({ t: "link", v: g.auto, href: g.auto });
    else if (g.url !== undefined) aus.push({ t: "link", v: g.url, href: g.url });
    else if (g.b1 !== undefined || g.b2 !== undefined) aus.push({ t: "b", c: zeile((g.b1 ?? g.b2)!, tiefe + 1) });
    else if (g.s !== undefined) aus.push({ t: "s", c: zeile(g.s, tiefe + 1) });
    else if (g.mark !== undefined) aus.push({ t: "mark", c: zeile(g.mark, tiefe + 1) });
    else if (g.i1 !== undefined || g.i2 !== undefined) aus.push({ t: "i", c: zeile((g.i1 ?? g.i2)!, tiefe + 1) });
    else if (g.tag !== undefined) aus.push({ t: "tag", v: g.tag });
    else if (g.br !== undefined) dazu("\n");
    else if (g.ent !== undefined) dazu(ENTITAET[g.ent] ?? "");
    // Kommentare und HTML-Tags fallen weg — ihr Text zwischen den Tags bleibt.
  }
  dazu(text.slice(zuletzt));
  return aus;
}

/** Der reine Text eines Inline-Baums — ohne Platzhalter, es sei denn, sie sind gewünscht. */
export function alsText(teile: Inline[], mitPlatzhaltern = false, mitDateien = true): string {
  let aus = "";
  for (const x of teile) {
    switch (x.t) {
      case "b":
      case "i":
      case "s":
      case "mark":
        aus += alsText(x.c, mitPlatzhaltern, mitDateien);
        break;
      case "tag":
        aus += "#" + x.v;
        break;
      case "ph":
        if (mitPlatzhaltern) aus += x.v;
        break;
      case "embed":
        if (mitDateien) aus += x.v;
        break;
      default:
        aus += x.v;
    }
  }
  return aus;
}

function dateiname(pfad: string): string {
  const teil = pfad.trim().split(/[\\/]/).filter(Boolean).pop() ?? pfad.trim();
  return teil.replace(ENDUNG, "") || teil;
}

const ZAUN = /^ {0,3}(`{3,}|~{3,})[ \t]*([\w+#.-]*)/;
const UEBERSCHRIFT = /^ {0,3}(#{1,6})(?:[ \t]+(.*?))?(?:[ \t]+#+)?[ \t]*$/;
const LINIE = /^ {0,3}([-*_])(?:[ \t]*\1){2,}[ \t]*$/;
const PUNKT = /^([ \t]*)([-*+]|\d{1,9}[.)])(?:[ \t]+(?:\[([ xX])\](?:[ \t]+|$))?(.*))?$/;
const ZITAT = /^ {0,3}> ?/;
const TRENNER = /^[ \t]*\|?[ \t]*:?-+:?[ \t]*(?:\|[ \t]*:?-+:?[ \t]*)*\|?[ \t]*$/;
const CALLOUT = /^\[!([\w-]{1,30})\][+-]?[ \t]*(.*)$/;

function breite(einzug: string): number {
  return einzug.replace(/\t/g, "    ").length;
}

function zellen(z: string): string[] {
  return z.trim().replace(/^\|/, "").replace(/(?<!\\)\|$/, "").split(/(?<!\\)\|/).slice(0, 20).map((c) => c.trim());
}

function istTabelle(zeilen: string[], i: number): boolean {
  return zeilen[i]!.includes("|") && i + 1 < zeilen.length && zeilen[i + 1]!.includes("|") && zeilen[i + 1]!.includes("-") && TRENNER.test(zeilen[i + 1]!);
}

function beginntBlock(zeilen: string[], i: number): boolean {
  const z = zeilen[i]!;
  const u = UEBERSCHRIFT.exec(z);
  return (u !== null && u[2] !== undefined) || ZAUN.test(z) || LINIE.test(z) || PUNKT.test(z) || ZITAT.test(z) || istTabelle(zeilen, i);
}

/** Zerlegt Markdown-Zeilen in Blöcke. */
export function bloecke(zeilen: string[], tiefe = 0): Block[] {
  const aus: Block[] = [];
  let i = 0;
  while (i < zeilen.length) {
    const z = zeilen[i]!;
    if (!z.trim()) {
      i++;
      continue;
    }
    const zaun = ZAUN.exec(z);
    if (zaun) {
      const ende = new RegExp(`^ {0,3}${zaun[1]![0] === "`" ? "`" : "~"}{${zaun[1]!.length},}[ \\t]*$`);
      const code: string[] = [];
      i++;
      while (i < zeilen.length && !ende.test(zeilen[i]!)) code.push(zeilen[i++]!);
      i++;
      aus.push({ t: "code", v: code.join("\n"), lang: zaun[2] ?? "" });
      continue;
    }
    const u = UEBERSCHRIFT.exec(z);
    if (u) {
      i++;
      if (u[2]) aus.push({ t: "h", ebene: u[1]!.length, c: zeile(u[2], 1) });
      continue;
    }
    if (LINIE.test(z)) {
      i++;
      aus.push({ t: "hr" });
      continue;
    }
    if (istTabelle(zeilen, i)) {
      const kopf = zellen(z).map((c) => zeile(c, 1));
      const reihen: Inline[][][] = [];
      i += 2;
      while (i < zeilen.length && zeilen[i]!.includes("|") && zeilen[i]!.trim()) {
        if (reihen.length < 500) reihen.push(zellen(zeilen[i]!).map((c) => zeile(c, 1)));
        i++;
      }
      aus.push({ t: "table", kopf, zeilen: reihen });
      continue;
    }
    if (ZITAT.test(z)) {
      const innen: string[] = [];
      while (i < zeilen.length && ZITAT.test(zeilen[i]!)) innen.push(zeilen[i++]!.replace(ZITAT, ""));
      const callout = CALLOUT.exec(innen[0] ?? "");
      const rest = callout ? innen.slice(1) : innen;
      aus.push({
        t: "quote",
        art: callout ? callout[1]!.toLowerCase() : null,
        titel: callout ? zeile(callout[2] ?? "", 1) : [],
        blocks: tiefe < 3 ? bloecke(rest, tiefe + 1) : [{ t: "p", c: zeile(rest.join("\n"), 1) }],
      });
      continue;
    }
    if (PUNKT.test(z)) {
      const punkte: Punkt[] = [];
      const stapel: number[] = [];
      while (i < zeilen.length) {
        const p = PUNKT.exec(zeilen[i]!);
        if (p && !LINIE.test(zeilen[i]!)) {
          const b = breite(p[1]!);
          while (stapel.length && b < stapel[stapel.length - 1]!) stapel.pop();
          if (!stapel.length || b > stapel[stapel.length - 1]!) stapel.push(b);
          punkte.push({
            c: zeile(p[4] ?? "", 1),
            done: p[3] === undefined ? null : p[3] !== " ",
            tiefe: Math.min(3, stapel.length - 1),
            nr: /\d/.test(p[2]!) ? p[2]!.slice(0, -1) + "." : null,
          });
          i++;
          continue;
        }
        const leer = !zeilen[i]!.trim();
        if (leer) {
          // Eine Leerzeile beendet die Liste nur, wenn danach kein Punkt mehr kommt.
          let j = i;
          while (j < zeilen.length && !zeilen[j]!.trim()) j++;
          if (j < zeilen.length && PUNKT.test(zeilen[j]!) && !LINIE.test(zeilen[j]!)) {
            i = j;
            continue;
          }
          break;
        }
        if (beginntBlock(zeilen, i) || !punkte.length) break;
        // Fortsetzungszeile des letzten Punkts
        const letzter = punkte[punkte.length - 1]!;
        const weiter = zeile("\n" + zeilen[i]!.trim(), 1);
        const ende = letzter.c[letzter.c.length - 1];
        const anfang = weiter[0];
        if (ende && ende.t === "text" && anfang && anfang.t === "text") {
          ende.v += anfang.v;
          weiter.shift();
        }
        letzter.c.push(...weiter);
        i++;
      }
      aus.push({ t: "list", punkte });
      continue;
    }
    const absatz: string[] = [];
    while (i < zeilen.length && zeilen[i]!.trim() && (absatz.length === 0 || !beginntBlock(zeilen, i))) absatz.push(zeilen[i++]!.trim());
    aus.push({ t: "p", c: zeile(absatz.join("\n")) });
  }
  return aus;
}

// Felder, die die Seite schon selbst zeigt, oder die nur KEPTA intern braucht.
const VERSTECKT = new Set(["title", "type", "scope", "kepta_id", "confidence", "superseded_by"]);
const QUELLE = /\n*[ \t]*—[ \t]*Source:[ \t]*(\S[^\n]*?)[ \t]*$/;

/** Zerlegt einen Notiztext: YAML-Kopf, Herkunftszeile und Markdown-Blöcke. */
export function zerlege(inhalt: string, grenze = 200_000): Zerlegt {
  let text = inhalt.replace(/^﻿/, "").replace(/\r\n?/g, "\n");
  if (text.length > grenze) text = text.slice(0, grenze);
  const kopf: [string, string][] = [];
  let titelAusKopf: string | null = null;
  const vorn = text.replace(/^\s*\n(?=---\n)/, "");
  if (vorn.startsWith("---\n")) {
    const fm = parseFrontmatter(vorn);
    if (fm.hasFrontmatter) {
      text = fm.body;
      for (const [k, v] of Object.entries(fm.meta)) {
        const wert = (Array.isArray(v) ? v.map(String).join(", ") : String(v)).trim();
        if (k === "title" && wert && !/\{\{|<%/.test(wert)) titelAusKopf = wert.slice(0, 200);
        if (VERSTECKT.has(k) || !wert || kopf.length >= 20) continue;
        kopf.push([k.slice(0, 60), wert.slice(0, 200)]);
      }
    }
  }
  let quelle: string | null = null;
  const q = QUELLE.exec(text);
  if (q) {
    quelle = q[1]!.slice(0, 300);
    text = text.slice(0, q.index);
  }
  // Obsidian-Kommentare (%% … %%) sind für niemanden gedacht, der liest.
  if (text.includes("%%")) text = text.replace(/%%[\s\S]*?%%/g, "");
  return { kopf, titelAusKopf, bloecke: bloecke(text.split("\n")), quelle };
}

const ENDUNG = /\.(md|markdown|txt|text|pdf|docx?|rtf|html?|json|csv|org|pages|odt)$/i;

/** Sieht der Titel wie ein Dateipfad oder Dateiname aus? */
export function istPfad(titel: string): boolean {
  const t = titel.trim();
  if (!t) return false;
  if (ENDUNG.test(t) || /^(\/|~\/|\.{1,2}\/|[A-Za-z]:\\)/.test(t)) return true;
  // „projekte/atlas/kickoff“ ja, „TCP/IP“ oder „und/oder“ nein
  return !/\s/.test(t) && (t.match(/[\\/]/g)?.length ?? 0) >= 2;
}

/**
 * „projekt-atlas_kickoff“ → „Projekt atlas kickoff“, „vertrag-2026“ → „Vertrag 2026“.
 * Ein Datum wie 2026-09-14 bleibt; Titel mit Leerzeichen bleiben, wie sie sind.
 */
export function verschoenere(name: string): string {
  const n = name.trim();
  if (/\s/.test(n) || !/[A-Za-zÀ-ɏ][-_]+[\wÀ-ɏ]|\d[-_]+[A-Za-zÀ-ɏ]/.test(n)) return n;
  const aus = n
    .replace(/_+/g, " ")
    .replace(/(?<=[A-Za-zÀ-ɏ])-+(?=[\wÀ-ɏ])|(?<=\d)-+(?=[A-Za-zÀ-ɏ])/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return aus.charAt(0).toUpperCase() + aus.slice(1);
}

function gleich(a: string, b: string): boolean {
  const n = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();
  return n(a) === n(b);
}

function ersteUeberschrift(b: Block[]): string | null {
  for (const x of b.slice(0, 3)) {
    if (x.t !== "h") continue;
    if (x.ebene > 1 && x !== b[0]) continue;
    const t = alsText(x.c).replace(/\s+/g, " ").trim();
    return t ? t.slice(0, 200) : null;
  }
  return null;
}

// Text für die Vorschau: eingebettete Dateien („foto.jpg“) sagen dort nichts.
function blockText(b: Block): string {
  const t = (c: Inline[]) => alsText(c, false, false);
  switch (b.t) {
    case "h":
    case "p":
      return t(b.c);
    case "list":
      return b.punkte.map((p) => t(p.c).trim()).filter(Boolean).join(" · ");
    case "quote":
      return [t(b.titel), ...b.blocks.map(blockText)].filter(Boolean).join(" ");
    case "code":
      return b.v.slice(0, 300);
    case "table":
      return [b.kopf, ...b.zeilen].map((r) => r.map((c) => t(c).trim()).filter(Boolean).join(" · ")).join(" · ");
    default:
      return "";
  }
}

function zaehlePlatzhalter(b: Block[]): number {
  let n = 0;
  const inline = (teile: Inline[]) => {
    for (const x of teile) {
      if (x.t === "ph") n++;
      else if ("c" in x) inline(x.c);
    }
  };
  for (const x of b) {
    if (x.t === "h" || x.t === "p") inline(x.c);
    else if (x.t === "list") x.punkte.forEach((p) => inline(p.c));
    else if (x.t === "quote") {
      inline(x.titel);
      n += zaehlePlatzhalter(x.blocks);
    } else if (x.t === "table") [x.kopf, ...x.zeilen].forEach((r) => r.forEach(inline));
  }
  return n;
}

export interface Anzeige {
  /** Der Titel, wie ein Mensch ihn lesen will. */
  displayTitle: string;
  /** Der gespeicherte Titel, wenn er ein Dateipfad ist — als kleiner Hinweis. */
  path: string | null;
  /** Vorschau ohne YAML, Markdown-Zeichen und Platzhalter. */
  preview: string;
  /** Eine Vorlage mit {{…}}- oder <%…%>-Platzhaltern. */
  template: boolean;
}

const VORSCHAU = 180;

/** Titel, Vorschau und Hinweise für eine Karte. Liest nur den Anfang langer Texte. */
export function anzeige(titel: string, inhalt: string, zerlegt: Zerlegt = zerlege(inhalt, 8000)): Anzeige {
  const roh = titel.trim();
  const pfad = istPfad(roh) ? roh : null;
  const basis = pfad ? dateiname(roh) : roh;
  const h1 = ersteUeberschrift(zerlegt.bloecke);
  const unbrauchbar = !basis || /^untitled$/i.test(basis) || /^(\{\{.*\}\}|<%.*%>)$/.test(basis);
  const slug = !/\s/.test(basis) && /[-_]/.test(basis);
  const displayTitle = (zerlegt.titelAusKopf || ((pfad || unbrauchbar || slug) && h1) || verschoenere(basis) || h1 || "Untitled").slice(0, 200);

  const teile: string[] = [];
  let laenge = 0;
  zerlegt.bloecke.forEach((b, n) => {
    if (laenge > VORSCHAU * 2) return;
    if (n === 0 && b.t === "h" && gleich(alsText(b.c), displayTitle)) return;
    const t = blockText(b).replace(/\s+/g, " ").trim();
    if (!t) return;
    teile.push(t);
    laenge += t.length + 1;
  });
  let preview = teile.join(" ").replace(/\s+/g, " ").trim();
  if (preview.length > VORSCHAU) {
    const schnitt = preview.slice(0, VORSCHAU - 1);
    const wort = schnitt.lastIndexOf(" ");
    preview = (wort > VORSCHAU * 0.6 ? schnitt.slice(0, wort) : schnitt).replace(/[\s,;:·—-]+$/, "") + "…";
  }
  const template = zaehlePlatzhalter(zerlegt.bloecke) > 0 || /(^|[\\/\s_-])templates?([\\/\s_.-]|$)/i.test(roh);
  return { displayTitle, path: pfad, preview, template };
}

/** Die Suchbegriffe als ein Muster — wörtlich genommen, nur an Wortanfängen. */
export function begriffMuster(begriffe: string[]): RegExp | null {
  const t = [...new Set(begriffe.map((b) => b.trim().toLowerCase()).filter((b) => b.length >= 2))]
    .slice(0, 12)
    .map((b) => b.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  return t.length ? new RegExp(`(?<![\\p{L}\\p{N}])(?:${t.join("|")})`, "iu") : null;
}

/** Ein Ausschnitt um den ersten Treffer — damit ein Suchergebnis zeigt, warum es passt. */
export function ausschnitt(titel: string, inhalt: string, begriffe: string[]): string {
  const z = zerlege(inhalt, 60_000);
  const muster = begriffMuster(begriffe);
  const text = z.bloecke.map(blockText).join(" ").replace(/\s+/g, " ").trim();
  const m = muster ? muster.exec(text) : null;
  // Steht der Treffer ohnehin vorn, ist die normale Vorschau der beste Ausschnitt.
  if (!m || m.index < 60) return anzeige(titel, inhalt, z).preview;
  const leer = text.lastIndexOf(" ", m.index - 50);
  const start = leer < 0 ? 0 : leer + 1;
  let aus = text.slice(start, start + VORSCHAU);
  if (start + VORSCHAU < text.length) {
    const wort = aus.lastIndexOf(" ");
    aus = (wort > VORSCHAU * 0.6 ? aus.slice(0, wort) : aus).replace(/[\s,;:·—-]+$/, "") + "…";
  }
  return "…" + aus;
}

/** Alles für die Detailansicht: Blöcke ohne die doppelte Titelzeile, Eigenschaften, Herkunft. */
export function detail(titel: string, inhalt: string): Anzeige & { body: Block[]; properties: [string, string][]; source: string | null } {
  const z = zerlege(inhalt);
  const a = anzeige(titel, inhalt, z);
  const erster = z.bloecke[0];
  const body = erster && erster.t === "h" && gleich(alsText(erster.c), a.displayTitle) ? z.bloecke.slice(1) : z.bloecke;
  return { ...a, body, properties: z.kopf, source: z.quelle };
}
