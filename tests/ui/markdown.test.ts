// @vitest-environment node
//
// Markdown für die Core-Oberfläche: ein Baum statt HTML, lesbare Titel und
// Vorschauen ohne YAML, Markdown-Zeichen und Vorlagen-Platzhalter. Bis 2.11
// standen Rauten, Sternchen, „---“ und „{{date}}“ roh auf jeder Karte.
import { describe, it, expect } from "vitest";
import { zeile, zerlege, anzeige, detail, istPfad, verschoenere, alsText } from "../../src/ui/markdown";

const text = (v: string) => ({ t: "text", v });

describe("Markdown in einer Zeile", () => {
  it("erkennt Hervorhebungen, Code, Links und Wiki-Links", () => {
    expect(zeile("**fett** und *kursiv* mit `code`")).toEqual([
      { t: "b", c: [text("fett")] }, text(" und "), { t: "i", c: [text("kursiv")] }, text(" mit "), { t: "code", v: "code" },
    ]);
    expect(zeile("~~alt~~ ==neu== __auch fett__ _auch kursiv_")).toEqual([
      { t: "s", c: [text("alt")] }, text(" "), { t: "mark", c: [text("neu")] }, text(" "), { t: "b", c: [text("auch fett")] }, text(" "), { t: "i", c: [text("auch kursiv")] },
    ]);
    expect(zeile("[[Projekt Atlas|Atlas]]")).toEqual([{ t: "wiki", ziel: "Projekt Atlas", v: "Atlas" }]);
    expect(zeile("[[Projekt Atlas#Ziele]]")).toEqual([{ t: "wiki", ziel: "Projekt Atlas", v: "Projekt Atlas" }]);
    expect(zeile("![[bilder/plan.png]]")).toEqual([{ t: "embed", v: "plan.png" }]);
    expect(zeile("[Doku](https://example.com/a) und https://kepta.app.")).toEqual([
      { t: "link", v: "Doku", href: "https://example.com/a" }, text(" und "), { t: "link", v: "https://kepta.app", href: "https://kepta.app" }, text("."),
    ]);
  });

  it("lässt Alltagszeichen stehen: snake_case, Rechnungen, C#, #1, Anker in Adressen", () => {
    for (const s of ["snake_case_name", "5 * 3 * 2", "C# and F#", "Platz #1", "seite#abschnitt", "a_b und c_d"]) {
      expect(zeile(s), s).toEqual([text(s)]);
    }
  });

  it("macht aus gefährlichen Linkzielen und HTML nur Text", () => {
    expect(zeile("[klick](javascript:void0)")).toEqual([text("klick")]);
    expect(zeile("[datei](file:///etc/passwd)")).toEqual([text("datei")]);
    expect(alsText(zeile('<img src=x onerror="alert(1)"><script>b</script>'))).toBe("b");
    expect(zeile("a<br>b &amp; c<!-- geheim -->")).toEqual([text("a\nb & c")]);
  });

  it("erkennt Vorlagen-Platzhalter und Tags", () => {
    expect(zeile("Datum: {{date:YYYY-MM-DD}} #daily")).toEqual([text("Datum: "), { t: "ph", v: "date:YYYY-MM-DD" }, text(" "), { t: "tag", v: "daily" }]);
    expect(zeile("<% tp.date.now() %>")).toEqual([{ t: "ph", v: "tp.date.now()" }]);
    expect(zeile("\\*kein kursiv\\*")).toEqual([text("*kein kursiv*")]);
  });
});

describe("Markdown-Blöcke", () => {
  const b = (s: string) => zerlege(s).bloecke;

  it("Überschriften, Absätze und Linien — ein #tag am Zeilenanfang ist keine Überschrift", () => {
    expect(b("# Titel\n\nText mit **fett**.\nzweite Zeile\n\n---\n\n## Zwei ##\n#projekt offen")).toEqual([
      { t: "h", ebene: 1, c: [text("Titel")] },
      { t: "p", c: [text("Text mit "), { t: "b", c: [text("fett")] }, text(".\nzweite Zeile")] },
      { t: "hr" },
      { t: "h", ebene: 2, c: [text("Zwei")] },
      { t: "p", c: [{ t: "tag", v: "projekt" }, text(" offen")] },
    ]);
  });

  it("Listen mit Aufgaben, Nummern, Einrückung und Fortsetzungszeilen", () => {
    expect(b("- [ ] offen\n- [x] erledigt\n  - eingerückt\n    weiter\n\n1. eins\n2) zwei")).toEqual([
      {
        t: "list",
        punkte: [
          { c: [text("offen")], done: false, tiefe: 0, nr: null },
          { c: [text("erledigt")], done: true, tiefe: 0, nr: null },
          { c: [text("eingerückt\nweiter")], done: null, tiefe: 1, nr: null },
          { c: [text("eins")], done: null, tiefe: 0, nr: "1." },
          { c: [text("zwei")], done: null, tiefe: 0, nr: "2." },
        ],
      },
    ]);
  });

  it("Obsidian-Callouts und Zitate", () => {
    expect(b("> [!warning] Achtung\n> Nicht **löschen**.\n\n> Nur ein Zitat")).toEqual([
      { t: "quote", art: "warning", titel: [text("Achtung")], blocks: [{ t: "p", c: [text("Nicht "), { t: "b", c: [text("löschen")] }, text(".")] }] },
      { t: "quote", art: null, titel: [], blocks: [{ t: "p", c: [text("Nur ein Zitat")] }] },
    ]);
  });

  it("Codeblöcke bleiben, wie sie sind — auch ohne schließenden Zaun", () => {
    expect(b("```js\nconst a = **b**; // [[kein Link]]\n```\nnach")).toEqual([
      { t: "code", v: "const a = **b**; // [[kein Link]]", lang: "js" },
      { t: "p", c: [text("nach")] },
    ]);
    expect(b("~~~\noffen")).toEqual([{ t: "code", v: "offen", lang: "" }]);
  });

  it("Tabellen", () => {
    expect(b("| Name | Wert |\n|---|---:|\n| a | **1** |\n| [[b\\|B]] | 2 |")).toEqual([
      {
        t: "table",
        kopf: [[text("Name")], [text("Wert")]],
        zeilen: [
          [[text("a")], [{ t: "b", c: [text("1")] }]],
          [[{ t: "wiki", ziel: "b", v: "B" }], [text("2")]],
        ],
      },
    ]);
  });

  it("der YAML-Kopf wird zu Eigenschaften, die Herkunftszeile zur Quelle, Kommentare fallen weg", () => {
    const z = zerlege("---\ntitle: Kickoff Atlas\ntags: [projekt, atlas]\nstatus: draft\nkepta_id: x1\n---\n# Kickoff\nText %%intern%%\n\n— Source: /Users/x/Vault/kickoff.md");
    expect(z.titelAusKopf).toBe("Kickoff Atlas");
    expect(z.kopf).toEqual([["tags", "projekt, atlas"], ["status", "draft"]]);
    expect(z.quelle).toBe("/Users/x/Vault/kickoff.md");
    expect(z.bloecke).toEqual([{ t: "h", ebene: 1, c: [text("Kickoff")] }, { t: "p", c: [text("Text")] }]);
  });
});

describe("was die Karte zeigt", () => {
  it("ein Pfad als Titel wird zur ersten Überschrift oder zum Dateinamen — der Pfad bleibt als Hinweis", () => {
    expect(anzeige("Vault/Projekte/atlas-kickoff.md", "# Kickoff Projekt Atlas\n\nWir starten am Montag.")).toEqual({
      displayTitle: "Kickoff Projekt Atlas",
      path: "Vault/Projekte/atlas-kickoff.md",
      preview: "Wir starten am Montag.",
      template: false,
    });
    expect(anzeige("notes/daily/2026-09-14.md", "Nur Text").displayTitle).toBe("2026-09-14");
    expect(anzeige("/Users/x/Documents/Quartals bericht.pdf", "Umsatz stieg.").displayTitle).toBe("Quartals bericht");
  });

  it("der Titel aus dem YAML-Kopf gewinnt, ein Slug wird lesbar, normale Titel bleiben", () => {
    expect(anzeige("Meeting", "---\ntitle: Weekly Sync\n---\nBody").displayTitle).toBe("Weekly Sync");
    expect(anzeige("projekt-atlas_kickoff", "kein Titel hier").displayTitle).toBe("Projekt atlas kickoff");
    expect(anzeige("Untitled", "# Echter Titel\nText").displayTitle).toBe("Echter Titel");
    for (const t of ["TCP/IP Grundlagen", "und/oder", "Report.pdf (3/12)", "2026-09-14"]) {
      expect(anzeige(t, "x"), t).toMatchObject({ displayTitle: t, path: null });
    }
  });

  it("die Vorschau hat keinen YAML-Kopf, keine Markdown-Zeichen, keine Platzhalter und nicht den Titel noch einmal", () => {
    const a = anzeige("Rezept", "---\ntags: [kochen]\n---\n# Rezept\n\n**Zutaten:** [[Mehl]], `Salz` und {{menge}}\n\n- eins\n- zwei");
    expect(a.preview).toBe("Zutaten: Mehl, Salz und eins · zwei");
    for (const roh of ["**", "[[", "`", "{{", "---", "#", "tags"]) expect(a.preview).not.toContain(roh);
  });

  it("kürzt lange Vorschauen am Wortende", () => {
    const p = anzeige("Lang", "Wort ".repeat(200)).preview;
    expect(p.length).toBeLessThanOrEqual(180);
    expect(p.endsWith("Wort…")).toBe(true);
  });

  it("erkennt Vorlagen — an Platzhaltern oder am Namen", () => {
    expect(anzeige("Daily", "# {{date}}\n\n## Tasks\n- [ ] ")).toMatchObject({ displayTitle: "Daily", template: true, preview: "Tasks" });
    expect(anzeige("Templates/Meeting.md", "## Agenda").template).toBe(true);
    expect(anzeige("Handlebars", "Schreib `{{name}}` in die Vorlage.").template).toBe(false);
  });
});

describe("was die Detailansicht bekommt", () => {
  it("lässt die doppelte Titelzeile weg und liefert Eigenschaften und Quelle mit", () => {
    const d = detail("atlas.md", "---\nstatus: draft\n---\n# Atlas\n\nText\n\n— Source: inbox atlas.pdf");
    expect(d.displayTitle).toBe("Atlas");
    expect(d.body).toEqual([{ t: "p", c: [text("Text")] }]);
    expect(d.properties).toEqual([["status", "draft"]]);
    expect(d.source).toBe("inbox atlas.pdf");
  });

  it("enthält nie HTML oder gefährliche Linkziele", () => {
    const d = JSON.stringify(detail("x", '<img src=x onerror=alert(1)>\n\n[a](javascript:alert) <script>b</script>\n\n<div onclick="x">c</div>'));
    for (const boese of ["<img", "<script", "javascript:", "onerror", "onclick", "<div"]) expect(d).not.toContain(boese);
  });

  it("bleibt schnell bei riesigen, kaputten Texten", () => {
    const start = Date.now();
    for (const muster of ["**a ", "[[b ", "`c ", "_d ", "<e ", "{{f ", "| g "]) detail("gross", muster.repeat(50_000));
    detail("zeilen", "- x\n".repeat(50_000));
    expect(Date.now() - start).toBeLessThan(4000);
  });
});

describe("Hilfen", () => {
  it("istPfad und verschoenere", () => {
    expect(istPfad("a/b/c")).toBe(true);
    expect(istPfad("~/notes")).toBe(true);
    expect(istPfad("C:\\Users\\x")).toBe(true);
    expect(istPfad("TCP/IP")).toBe(false);
    expect(istPfad("")).toBe(false);
    expect(verschoenere("meeting_notes-q3")).toBe("Meeting notes q3");
    expect(verschoenere("lumen-contract-2026")).toBe("Lumen contract 2026");
    expect(verschoenere("2026-09-12-call-lumen")).toBe("2026-09-12 call lumen");
    expect(verschoenere("2026-09-14")).toBe("2026-09-14");
    expect(verschoenere("Schon gut")).toBe("Schon gut");
  });
});
