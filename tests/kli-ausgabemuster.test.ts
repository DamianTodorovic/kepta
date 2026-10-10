// D2 (b) — die Satzung R1…R12, gemessen am Bild. Jede Regel hat hier einen
// Test, der sie hält; keine Regel steht als Kommentar im Quelltext.
import { describe, it, expect } from "vitest";
import * as erlebnis from "../src/cli-erlebnis";
import { remember } from "../src/cli-erlebnis";
import { bild, lauf, ohneFarbe, sandkiste, speicher, stackZeilen, ueberBreite } from "./kli-helfer";

const LANG =
  "Ms. Weber is billed quarterly — never invoice her monthly, and the standing rule was written down after the June invoice arrived monthly instead of quarterly, which is why the client called and why the billing note carries the exception explicitly.";
const TITEL_LANG = "Ms. Weber is billed quarterly, never monthly — the standing rule after the June invoice went wrong";

/** Alle Einzüge, die in einem Bild vorkommen. */
function einzuege(text: string): number[] {
  return [...new Set(ohneFarbe(text).split("\n").map((z) => (z.match(/^ +/) ?? [""])[0].length))];
}

const einzug = (z: string): number => (z.match(/^ +/) ?? [""])[0].length;
function physisch(text: string): string[] {
  return ohneFarbe(text).split("\n").filter((z) => z.trim() !== "");
}

/**
 * R9 heisst: der Weg ist das Letzte, was steht. Was danach kommt, darf nur eine
 * Fortsetzung sein — keine neue Blockezeile (R2 bricht lange Wege um).
 */
const neuerBlock = /^\s*(next:|✓|✗|○|\d+\.|↔|file|notes|types|graph|tags|state|risk)\b/;
function wegZuletzt(text: string): boolean {
  const zeilen = physisch(text);
  const letzter = zeilen.map((z, i) => (/^\s*next:/.test(z) ? i : -1)).filter((i) => i >= 0).pop();
  if (letzter === undefined) return false;
  return !zeilen.slice(letzter + 1).some((z) => neuerBlock.test(z));
}

/** Der Weg selbst, Fortsetzung wieder angesetzt — für die Z5-Roundtrip-Prüfung. */
function letzterWeg(text: string): string {
  const zeilen = physisch(text);
  const letzter = zeilen.map((z, i) => (/^\s*next:/.test(z) ? i : -1)).filter((i) => i >= 0).pop();
  if (letzter === undefined) return "";
  return [zeilen[letzter]!.trim(), ...zeilen.slice(letzter + 1).filter((z) => !neuerBlock.test(z)).map((z) => z.trim())].join(" ");
}

describe("R1 — ein Raster, kein Dreierlei", () => {
  it("keine Zeile steht auf einem ungeraden Einzug, keine auf 3 oder 5", async () => {
    const s = speicher();
    remember(s, LANG, ["weber"]);
    remember(s, "Weber billing rhythm: quarterly only", ["weber"]);
    const bilder: [string, string[]][] = [
      ["stats", []],
      ["recall", ["weber"]],
      ["timeline", ["weber"]],
      ["contradict", []],
      ["remember", ["Dritte Notiz ueber Weber"]],
    ];
    for (const [befehl, args] of bilder) {
      for (const e of einzuege((await bild(s, befehl, args)).aus)) {
        expect(e % 2, `${befehl}: ungerader Einzug ${e}`).toBe(0);
        expect([3, 5], `${befehl}: Einzug ${e} — das Raster kennt 2 und 4, nie 3 oder 5`).not.toContain(e);
      }
    }
  });

  it("die Detailzeile steht bei jedem Befehl auf derselben Spalte", async () => {
    const s = speicher();
    remember(s, "Weber billing rhythm: quarterly only", ["weber"]);
    const merk = (ohneFarbe((await bild(s, "remember", ["Neue Notiz ueber Weber"])).aus).split("\n")[1] ?? "").match(/^ */)?.[0].length;
    const stat = (ohneFarbe((await bild(s, "stats")).aus).split("\n")[1] ?? "").match(/^ */)?.[0].length;
    expect(merk, "remember: die Detailzeile rueckt nicht auf 4").toBe(4);
    expect(stat, "stats: die Detailzeile rueckt nicht auf 4").toBe(4);
  });
});

/** Zeilen mit erhaltenen geschützten Leerzeichen: nur die Farbe ist abgezogen. */
function rohZeilen(text: string): string[] {
  // eslint-disable-next-line no-control-regex
  return text.replace(/\x1b\[[0-9;]*m/g, "").split("\n").filter((z) => z.trim() !== "");
}

describe("R4 / R5 — Trennzeichen trennen, Zahlen sprechen im Singular", () => {
  // Messen gefunden: ein umbrochener Typ hing als nacktes `· semantic` in der
  // nächsten Zeile, und eine Kürzung um EIN Zeichen endete als „(+1 more
  // characters)". Beides Verstöße gegen die Satzung, beide vorher nicht geprüft.
  const fuenf: [string, string[]][] = [
    ["remember", ["Ms. Weber is billed quarterly, never monthly — the standing rule after the June invoice went wrong"]],
    ["recall", ["weber"]],
    ["timeline", ["weber"]],
    ["contradict", []],
    ["stats", []],
  ];

  it("kein nacktes Trennzeichen steht am Zeilenanfang", async () => {
    const s = speicher();
    remember(s, TITEL_LANG, ["weber"]);
    remember(s, TITEL_LANG, ["weber"]);
    remember(s, LANG, ["weber"]);
    for (const [befehl, args] of fuenf) {
      for (const z of rohZeilen((await bild(s, befehl, args)).aus)) {
        // Ein Trenner mit geklebtem Wort ist erlaubt — ein einzelner nicht.
        expect(/^\s*[·—]( |$)/.test(z), `${befehl}: Trenner allein am Zeilenanfang — ${z}`).toBe(false);
      }
    }
  });

  it("eine Kürzung um ein Zeichen nennt ein Zeichen, nicht zwei", async () => {
    const s = speicher();
    remember(s, LANG.slice(0, 180) + "x", ["weber"]);
    const text = physisch((await bild(s, "recall", ["weber"])).aus).join("\n");
    expect(text).toMatch(/… \(\+1 more character\)/);
    expect(text).not.toMatch(/\b1 more characters\b/);
  });

  it("die Paarzeile von contradict bleibt auf der Bühne", async () => {
    const s = speicher();
    remember(s, TITEL_LANG, ["weber"]);
    remember(s, TITEL_LANG, ["weber"]);
    for (const z of physisch((await bild(s, "contradict")).aus)) {
      expect([...z].length, `länger als 80: ${z}`).toBeLessThanOrEqual(80);
    }
  });
});

describe("R2 — 80 Zeichen, gebrochen bevor der Schirm bricht", () => {
  it("keine Zeile mit Wortgrenze ist laenger als 80 Zeichen", async () => {
    const s = speicher();
    remember(s, LANG, ["weber"]);
    remember(s, TITEL_LANG, ["weber"]);
    const bilder: [string, string[]][] = [
      ["stats", []],
      ["recall", ["weber"]],
      ["timeline", ["weber"]],
      ["contradict", []],
      ["remember", [TITEL_LANG]],
    ];
    for (const [befehl, args] of bilder) {
      const { aus } = await bild(s, befehl, args);
      for (const z of ueberBreite(aus).filter((x) => x.zeile.trim().includes(" "))) {
        expect(z.laenge, `${befehl}: ${z.laenge} Zeichen — ${z.zeile}`).toBeLessThanOrEqual(80);
      }
    }
  });

  it("eine Kürzung wird genannt, nie ein Auslassungszeichen ohne Zahl (D2-18)", async () => {
    const s = speicher();
    remember(s, LANG, ["weber"]);
    const text = physisch((await bild(s, "recall", ["weber"])).aus).join("\n");
    for (const z of text.split("\n")) expect(z.length, `Zeile ist länger als die Bühne: ${z}`).toBeLessThanOrEqual(80);
    expect(text, "der Rumpf fehlt ganz").toContain("Ms. Weber is billed");
    // Die Notiz ist länger als eine Karte: dann muss dastehen, wie viel fehlt.
    expect(text, "gekürzt, ohne die Länge zu nennen").toMatch(/… \(\+\d+ more characters\)/);
  });
});

describe("R5 — Zahlen sprechen wie ein Mensch", () => {
  it("1 node, 1 link, 1 entry — nirgends ein Plural bei eins", async () => {
    const s = speicher();
    remember(s, "Weber billing rhythm: quarterly only", ["weber"]);
    const stat = ohneFarbe((await bild(s, "stats")).aus);
    expect(stat).toMatch(/1 node\b(?!s)/);
    expect(stat).not.toMatch(/\b1 nodes\b/);
    expect(stat).not.toMatch(/\b1 links\b/);
    const zeit = ohneFarbe((await bild(s, "timeline", ["weber"])).aus);
    expect(zeit).toMatch(/1 entry\b(?!s)/);
    expect(zeit).not.toMatch(/\b1 entries\b/);
  });

  it("die Typen stehen nach Menge, bei Gleichstand alphabetisch", async () => {
    // Nicht über remember gesetzt — dort entscheidet die Klassifikation, und dann
    // bewiese der Test die Klassifikation statt der Sortierung.
    const s = speicher();
    for (const [typ, n] of [["semantic", 2], ["procedural", 3], ["episodic", 3]] as const) {
      for (let i = 0; i < n; i++) s.createMemory({ type: typ, title: `${typ} note ${i} about Weber`, content: `quarterly billing ${i}`, tags: ["weber"] });
    }
    const zeile = physisch((await bild(s, "stats")).aus).find((z) => z.includes("types")) ?? "";
    expect(zeile, "sortiert ist nach Menge, dann alphabetisch").toMatch(/episodic: 3 · procedural: 3 · semantic: 2/);
  });

  it("grosse Zahlen tragen ein Komma, weil kein Mensch 1200 in einem Zug liest", () => {
    // Der Namespace-Pfad, damit diese Datei laedt, solange es die Funktion noch
    // nicht gibt — ein fehlender Export würde sonst jede andere Regel rot
    // verschuetten, statt sie einzeln zu zeigen.
    const formatieren = (erlebnis as { zahl?: (n: number) => string }).zahl;
    expect(formatieren, "es gibt keine Zahlform mit Tausenderpunkt (R5)").toBeTruthy();
    expect(formatieren?.(999)).toBe("999");
    expect(formatieren?.(1000)).toBe("1,000");
    expect(formatieren?.(1234567)).toBe("1,234,567");
  });
});

describe("R6 — Zeit zweifach: absolut zuerst, relativ in Klammern", () => {
  it("die Spur nennt das Datum und dahinter das Gefuehl", async () => {
    const s = speicher();
    remember(s, "Weber billing rhythm: quarterly only", ["weber"]);
    const { aus } = await bild(s, "recall", ["weber"]);
    expect(ohneFarbe(aus)).toMatch(/\d{4}-\d{2}-\d{2} \((today|\d+[dmy] ago)\)/);
  });

  // Die Uhr ist eine Wanduhr: gemessen stand „last write 16:09 (just now)",
  // waehrend der Schirm 18:09 zeigte — UTC neben „just now" widerspricht sich
  // selbst in derselben Zeile.
  it("last write zeigt die Uhr des Lesers, nicht die von UTC", async () => {
    const s = speicher();
    remember(s, "Weber billing rhythm: quarterly only", ["weber"]);
    const jetzt = new Date();
    const p = (n: number) => String(n).padStart(2, "0");
    const lokal = `${jetzt.getFullYear()}-${p(jetzt.getMonth() + 1)}-${p(jetzt.getDate())} ${p(jetzt.getHours())}`;
    const { aus } = await bild(s, "stats");
    expect(ohneFarbe(aus)).toMatch(new RegExp(`wrote\\s+${lokal}`));
  });
});

describe("R7 — abschneiden wird mit beiden Zahlen gesagt", () => {
  it("timeline sagt showing N of M, wenn es bei 30 kappt", async () => {
    const s = speicher();
    for (let i = 0; i < 32; i++) s.createMemory({ title: `Weber note ${i}`, content: `quarterly billing for Weber number ${i}`, tags: ["weber"] });
    const { aus } = await bild(s, "timeline", ["weber"]);
    const text = ohneFarbe(aus);
    expect(text).toMatch(/showing 30 of 32/);
    expect(text.split("\n").filter((z) => /^\s{4}\d{4}-\d{2}-\d{2}/.test(z)).length).toBe(30);
  });

  it("stats nennt, wie viele Tags unter der Kante fehlen", async () => {
    const s = speicher();
    for (let i = 0; i < 9; i++) s.createMemory({ title: `Notiz ${i}`, content: `Weber ${i}`, tags: ["weber", `marke${i}`] });
    const { aus } = await bild(s, "stats");
    expect(ohneFarbe(aus)).toMatch(/(\d+) more tag/);
  });
});

describe("R9 — die letzte Zeile ist ein Weg, kein Lob", () => {
  it("jeder der fuenf Befehle endet mit next:", async () => {
    const s = speicher();
    remember(s, "Weber billing rhythm: quarterly only", ["weber"]);
    remember(s, "Weber billing rhythm: quarterly only", ["weber"]);
    for (const befehl of ["remember", "recall", "timeline", "contradict", "stats"]) {
      const args = befehl === "recall" || befehl === "timeline" ? ["weber"] : befehl === "remember" ? ["Noch eine Notiz ueber Weber"] : [];
      const { aus } = await bild(s, befehl, args);
      expect(wegZuletzt(aus), `${befehl}: der Weg steht nicht am Ende — zuletzt: ${physisch(aus).at(-1)}`).toBe(true);
    }
  });

  it("der gewiesene Weg nennt einen Befehl, den es gibt, und der trifft (Z5)", async () => {
    const k = sandkiste();
    const statsBild = await lauf(["stats"], k);
    const weg = letzterWeg(statsBild.aus);
    // Scharf gestellt: ein Test, der den Vorschlag einfach an den Prozess
    // weiterreicht, fiel durch, weil ein Argument mit Leerzeichen am Anfang als
    // leerer String in den MCP-Start rutschte und dort Exit 0 wurde.
    expect(weg, `stats endet ohne Weg, sondern mit: ${physisch(statsBild.aus).at(-1)}`).toMatch(/^next:/);
    const genannt = weg.replace(/^\s*next:\s*/, "").replace(/^kepta\s+/, "").split(/\s+/)[0];
    expect(["remember", "recall", "timeline", "contradict", "stats", "demo", "setup", "ui", "import"], `${weg} weist einen Befehl, den es nicht gibt`).toContain(genannt);
    const folge = await lauf([genannt], k);
    expect(folge.code, `next: kepta ${genannt} — Exit ${folge.code}, stderr: ${folge.fehl}`).toBe(0);
    expect(stackZeilen(folge.fehl), folge.fehl).toEqual([]);
  });
});

describe("R10 — Fehler dreizeilig, auf stderr, Exit ungleich 0, nie ein Stack", () => {
  it("leerer Text: was, warum, Weg — jede Zeile auf der Bühne", async () => {
    const { code, fehl, aus } = await bild(speicher(), "remember", ["   "]);
    expect(code).toBe(1);
    expect(aus).toBe("");
    const zeilen = physisch(fehl);
    // R10 zählt logische Zeilen: der Grund kann länger sein als die Bühne und
    // bricht dann — drei Absätze, nicht drei Zeilen im Editor.
    expect(zeilen[0], `erste Zeile ohne ✗: ${zeilen[0]}`).toMatch(/✗/);
    expect(zeilen.some((z) => /^\s*next:/.test(z)), fehl).toBe(true);
    expect(wegZuletzt(fehl), `der Weg steht nicht am Schluss:\n${fehl}`).toBe(true);
    for (const z of zeilen) expect([...z].length, `länger als 80: ${z}`).toBeLessThanOrEqual(80);
    expect(stackZeilen(fehl)).toEqual([]);
  });

  it("ein unbekannter Befehl ist ebenso dreiteilig, mit Praefix und Weg", async () => {
    const { code, fehl } = await bild(speicher(), "zwerchgucker");
    expect(code).toBe(2);
    const zeilen = physisch(fehl);
    expect(zeilen[0], `erste Zeile ohne Kanal-Praefix: ${zeilen[0]}`).toMatch(/^\[kepta\] ✗/);
    expect(zeilen.some((z) => /^\s*next:/.test(z)), fehl).toBe(true);
    for (const z of zeilen) expect([...z].length, `länger als 80: ${z}`).toBeLessThanOrEqual(80);
    // Die Tafel ist die Antwort auf --help, nicht die auf einen Irrtum (D2-21).
    expect(fehl).not.toMatch(/KEPTA from the terminal/);
    expect(stackZeilen(fehl)).toEqual([]);
  });
});

describe("R11 — stdout ist Inhalt, stderr ist Log", () => {
  it("kein Prefix auf stdout, jedes auf stderr", async () => {
    const s = speicher();
    remember(s, "Weber billing rhythm: quarterly only", ["weber"]);
    for (const befehl of ["stats", "recall", "contradict"]) {
      const { aus, fehl } = await bild(s, befehl, befehl === "recall" ? ["weber"] : []);
      expect(aus, `${befehl}: stdout traegt ein Log-Praefix`).not.toContain("[kepta]");
      for (const z of fehl.split("\n").filter((x) => x.trim())) {
        expect(/^\[kepta\]|^ {2}/.test(ohneFarbe(z)), `${befehl}: Log-Zeile ohne Praefix: ${z}`).toBe(true);
      }
    }
  });

  it("--json liefert ein Objekt, Prosa liefert keinen JSON-Text", async () => {
    const k = sandkiste();
    const json = await lauf(["stats", "--json"], k);
    expect(() => JSON.parse(json.aus)).not.toThrow();
    const prose = await lauf(["stats"], k);
    expect(prose.aus).not.toMatch(/^\s*\{/);
  });
});

describe("R3 / Z4 — Farbe traegt Bedeutung und verliert ohne sie nichts", () => {
  it("mit --color=always ist der Text wortgleich wie mit --color=never", async () => {
    const k = sandkiste();
    const an = await lauf(["stats", "--color=always"], k);
    const aus = await lauf(["stats", "--color=never"], k);
    expect(an.aus.includes("\x1b["), "--color=always hat keine Farbe gesetzt").toBe(true);
    expect(ohneFarbe(an.aus)).toBe(ohneFarbe(aus.aus));
  });

  it("kein Zustand hangt nur an einer Farbe: jedes Zustandswort steht auch da", async () => {
    const k = sandkiste();
    const stumm = await lauf(["stats", "--no-color"], k);
    expect(stumm.aus.includes("\x1b[")).toBe(false);
    expect(ohneFarbe(stumm.aus)).toMatch(/state\s+encrypted · key:|state\s+NOT encrypted/);
  });
});

describe("die Hilftafel (D2-24)", () => {
  it("Gruppen, Schalter, Exit-Codes, Umwelt — keine Zeile ueber 80, kein Befehl auf Spalte 0", async () => {
    const l = await lauf(["--help"], sandkiste());
    const zeilen = physisch(l.aus);
    for (const z of zeilen) expect([...z].length, `laenger als 80: ${z}`).toBeLessThanOrEqual(80);
    // Gemessen: eine umgebrochene Zeile begann auf Spalte 0, waehrend ihre
    // Nachbarn auf 2 standen — die Tafel sah zerschoben aus.
    expect(zeilen.some((z) => /^kepta\b/.test(z)), "ein Befehl beginnt auf Spalte 0").toBe(false);
    const text = ohneFarbe(l.aus);
    for (const teil of ["write", "read", "set up", "--json", "exit codes", "KEPTA_DB_KEY", "NO_COLOR"]) {
      expect(text, `die Tafel nennt ${teil} nicht`).toContain(teil);
    }
    expect(text.split("\n").filter((z) => /^ {2}kepta /.test(z)).length).toBe(9);
  });
});

describe("Feldnamen, die das Terminal nennt (D2-26 rückwärts)", () => {
  it("kein gewiesener Weg schickt ein Feld, das der Kern nicht kennt", async () => {
    const s = speicher();
    remember(s, "The production server is Hetzner CX42.", ["infra"]);
    remember(s, "The production server is Hetzner CX42.", ["infra"]);
    const { aus } = await bild(s, "contradict");
    expect(ohneFarbe(aus)).toMatch(/dryRun=false/);
    expect(ohneFarbe(aus)).not.toMatch(/dry_run|valid_to|supersede_by/);
  });
});

describe("der Umbruch verliert kein Wort (R2, selbst gefunden)", () => {
  // Gemessen: „…picks the type and the tags" endete als „…and tags", im
  // Kern-Konflikttext fehlten „reads" und „rand". Ein Füller, der Wörter
  // verschluckt, ist schlimmer als ein umkippendes Terminal.
  const texte = [
    "store one sentence — KEPTA picks the type and the tags for it",
    "The knowledge base is encrypted, but its key is not available. Nothing was changed. The file was not opened and no empty knowledge base was started over it. SECURITY.md lists the command that reads your key back; a key you hold yourself goes in KEPTA_DB_KEY (openssl rand -hex 32).",
  ];

  it("jedes Wort des Satzes steht nach dem Brechen noch da", async () => {
    const { bricht } = await import("../src/cli-erlebnis");
    for (const text of texte) {
      const gebrochen = bricht(text, { einzug: 0, rueck: 2, breite: 72 });
      expect(gebrochen.join(" ").replace(/\s+/g, " ").trim(), `Wörter fehlen in: ${text}`).toBe(text.replace(/\s+/g, " ").trim());
      for (const z of gebrochen) expect([...z].length, `länger als 72: ${z}`).toBeLessThanOrEqual(72);
    }
  });

  it("auch die Hilftafel verliert nichts: jeder Satz der Befehle steht ganz da", async () => {
    const l = await lauf(["--help"], sandkiste());
    const text = ohneFarbe(l.aus).split("\n").map((z) => z.trim()).join(" ");
    for (const rest of ["picks the type and the tags", "best matches first", "oldest first", "changes nothing", "what state it is in", "throwaway database"]) {
      expect(text, `die Hilftafel verschluckt: ${rest}`).toContain(rest);
    }
  });
});
