// Wache: das Regal und die trennendste Marke (Punkt 5, 18.10.).
//
// Anlass ist sein eigener Beleg: ein Screenshot mit „92 Notes / 10 996 Files /
// 9 978 Code" bei 21 066 gespeicherten. Nachgemessen an genau diesem Bestand
// (GET /api/memories?alle=1, 18.10. 14:1x) war die erste Ebene des Baums ein
// einziger Korb — 19 283 von 21 066 (91,54 %) heissen `reference` — und die zweite
// Ebene ein noch grosserer: 18 993 (90,16 %) stecken in EINEM Fach namens
// `#machine-scan`, weil der Scan diese Marke als ERSTES Element anhaengt und die
// Regel `tags.find(...)` nimmt. Was wie eine Gruppierung aussieht, ist eine
// Klammer um den ganzen Laden.
//
// Diese Faelle halten die Heilung und die Zahl, die sie kostet. Alle Zahlen sind
// an seinen echten Bestand gefahren und aus demselben Lauf gezogen (Gemessenes steht
// im Papier audit-2026-10-09/feldzug/gruppe-punkt5-2026-10-18.md); die Faelle selbst
// laufen gegen Formate, die dem echten Bestand nachgebaut sind — nicht gegen seinen
// Inhalt.
import { describe, it, expect } from "vitest";
import {
  buildHierarchy,
  markenHaeufigkeit,
  trennendsteMarke,
  maschinenVorspann,
  lesePfad,
  regalFach,
  baueRegal,
  REGAL_SCHWELLE_PROZENT,
  type HierarchieKnoten,
} from "../../src/lib/graphHierarchy";
import type { Memory } from "../../src/types";

function mem(teil: Partial<Memory> & { id: string }): Memory {
  return {
    id: teil.id,
    userId: "local",
    title: teil.title ?? "",
    content: teil.content ?? "",
    tags: teil.tags ?? [],
    type: teil.type ?? "semantic",
    scope: teil.scope ?? "private",
    confidence: teil.confidence ?? 1,
    createdAt: teil.createdAt ?? 0,
    updatedAt: teil.updatedAt ?? 0,
  } as Memory;
}

/** Ein Bestand im Schnitt seines Scans: jede Zeile traegt `machine-scan` zuerst. */
function scanBestand(anzahl: number, endungen: string[]): Memory[] {
  const aus: Memory[] = [];
  for (let i = 0; i < anzahl; i++) {
    const endung = endungen[i % endungen.length];
    aus.push(mem({
      id: `n${i}`,
      type: "reference",
      title: `Stueck ${i}`,
      content: `Zeile aus ${endung}-Datei ${i}\n— Source: /Users/irgendwer/Desktop/ordner-${i % 4}/datei-${i}.${endung}`,
      tags: ["machine-scan", endung],
    }));
  }
  return aus;
}

const blaetter = (k: HierarchieKnoten): number =>
  k.children.length === 0 ? 1 : k.children.reduce((s, c) => s + blaetter(c), 0);
const groesstesFach = (typ: HierarchieKnoten): { id: string; n: number } => {
  let bestes = { id: "", n: 0 };
  for (const kind of typ.children) {
    const n = blaetter(kind);
    if (n > bestes.n) bestes = { id: kind.id, n };
  }
  return bestes;
};

describe("trennendste Marke statt erster Marke", () => {
  it("waehlt die Marke, die das Stueck unterscheidet — nicht die, die alle teilen", () => {
    const bestand = [
      mem({ id: "1", tags: ["machine-scan", "json"] }),
      mem({ id: "2", tags: ["machine-scan", "md"] }),
      mem({ id: "3", tags: ["machine-scan"] }),
    ];
    const haeufigkeit = markenHaeufigkeit(bestand);
    expect(trennendsteMarke(bestand[0], haeufigkeit)).toBe("json");
    expect(trennendsteMarke(bestand[1], haeufigkeit)).toBe("md");
    // Was nichts unterscheidet, bleibt allein: die einzige Marke ist die einzige Wahl.
    expect(trennendsteMarke(bestand[2], haeufigkeit)).toBe("machine-scan");
  });

  it("gruppt gleich gross — die Groessenordnung der Marke entscheidet, nicht die Reihenfolge", () => {
    const bestand = [
      mem({ id: "1", tags: ["md", "machine-scan"] }),
      mem({ id: "2", tags: ["machine-scan", "md"] }),
    ];
    const haeufigkeit = markenHaeufigkeit(bestand);
    expect(trennendsteMarke(bestand[0], haeufigkeit)).toBe(trennendsteMarke(bestand[1], haeufigkeit));
  });

  it("macht im Baum aus einem Korb ueber dem ganzen Laden mehrere Fächer", () => {
    const bestand = scanBestand(120, ["md", "json", "txt", "html"]);
    const typ = buildHierarchy(bestand).children.find((c) => c.id === "__typ:reference")!;
    const groesstes = groesstesFach(typ);
    // Mit der ersten Marke waere das groesste Fach die ganzen 120 (90,16 % am echten
    // Bestand). Ueber die seltenste Marke teilt sich der Laden nach Format.
    expect(groesstes.n).toBeLessThan(bestand.length);
    expect(typ.children.length).toBeGreaterThanOrEqual(4);
    expect(groesstes.id).not.toBe("__tag:machine-scan");
  });

  it("laesst eine Notiz ohne jede Marke ein direktes Blatt", () => {
    const baum = buildHierarchy([mem({ id: "1", tags: [] })]);
    const typ = baum.children.find((c) => c.id === "__typ:semantic")!;
    expect(typ.children.map((c) => c.id)).toEqual(["1"]);
  });
});

describe("maschinenVorspann", () => {
  it("laesst eine Stufe fallen, die praktisch alle teilen", () => {
    const pfade = [
      "/Users/irgendwer/Desktop/a/x.md",
      "/Users/irgendwer/Desktop/b/y.md",
      "/Users/irgendwer/Documents/z.md",
    ];
    expect(maschinenVorspann(pfade)).toEqual(["Users", "irgendwer"]);
  });

  it("haelt eine Stufe, die nur die Mehrheit teilt — sie ist schon eine Antwort", () => {
    const pfade = [
      ...Array.from({ length: 70 }, (_, i) => `/Users/x/Desktop/a-${i}/f.md`),
      ...Array.from({ length: 30 }, (_, i) => `/Users/x/Documents/b-${i}/f.md`),
    ];
    expect(maschinenVorspann(pfade)).toEqual(["Users", "x"]);
  });

  it("ein Ausreisser ausserhalb des Kontos loescht den Vorspann nicht", () => {
    // Der echte Bestand hatte fuenf Pfade ausserhalb seines Heimordners. Ein strikt
    // gemeinsamer Prefix macht daraus einen leeren Vorspann — und das groesste Fach
    // heisst "Users / irgendwer" mit 57,43 % des Bestands.
    const pfade = [
      ...Array.from({ length: 99 }, (_, i) => `/Users/x/Desktop/a-${i}/f.md`),
      "/opt/andere/wurzel/f.md",
    ];
    expect(maschinenVorspann(pfade)).toEqual(["Users", "x", "Desktop"]);
  });

  it("ohne Pfade gibt es keinen Vorspann", () => {
    expect(maschinenVorspann([])).toEqual([]);
  });
});

describe("lesePfad", () => {
  it("nimmt einen echten Pfad", () => {
    expect(lesePfad({ content: "— Source: /Users/x/Desktop/a/f.md" })).toBe("/Users/x/Desktop/a/f.md");
  });

  it("fasst Prosa nicht als Pfad auf", () => {
    // 122 von 21 066 Stuecken nennen in ihrer Source-Zeile Text statt eines Pfads
    // (z. B. "):     4336"). Ohne diese Pruefung gruppiert das Regal bald einen
    // Satz als Ordner.
    expect(lesePfad({ content: "):     4336" })).toBeNull();
    expect(lesePfad({ content: "" })).toBeNull();
    expect(lesePfad({ content: "kein Source-Hinweis ueberhaupt" })).toBeNull();
  });

  it("kuerzt eine Netzadresse auf den Ort, nicht auf die Seite", () => {
    expect(lesePfad({ content: "Source: https://arxiv.org/abs/2401.00001" })).toBe("netz://arxiv.org");
  });
});

describe("baueRegal", () => {
  it("zaehlt in beiden Baendern genau den Bestand — kein Stueck doppelt, keins fehlt", () => {
    const bestand = [...scanBestand(60, ["md", "json"]), mem({ id: "t1", title: "Notiz von Hand", content: "Kurz notiert, ohne Datei dahinter." })];
    const regal = baueRegal(bestand);
    const summe = (l: { notizen: number }[]) => l.reduce((s, f) => s + f.notizen, 0);
    expect(regal.bestand).toBe(bestand.length);
    expect(summe(regal.woher)).toBe(bestand.length);
    expect(summe(regal.worum)).toBe(bestand.length);
  });

  it("fasst Fächer unter der Schwelle in einer Zeile zusammen", () => {
    const bestand = scanBestand(400, ["md", "json", "txt", "html", "yaml", "sql", "rs", "go", "toml", "ini"]);
    const regal = baueRegal(bestand);
    const schwanz = regal.worum.filter((f) => f.herkunft === "schwanz");
    expect(schwanz.length).toBeLessThanOrEqual(1);
    const schwelle = (REGAL_SCHWELLE_PROZENT / 100) * bestand.length;
    for (const f of regal.worum.filter((x) => x.herkunft !== "schwanz")) {
      expect(f.notizen).toBeGreaterThanOrEqual(schwelle);
    }
  });

  it("nennt seine Luecken als Zahlen statt sie zu verschweigen", () => {
    const bestand = [
      mem({ id: "a", title: "Rechnung", content: "Rechnung 2024/07 vom Kanal" }),      // Betreff: events (Datum)
      mem({ id: "b", title: "Nichts", content: "ein Satz ohne Datum, Name oder Frist" }), // kein Betreff
    ];
    const regal = baueRegal(bestand);
    expect(regal.luecken.ohneBetreff).toBeGreaterThanOrEqual(1);
    expect(regal.luecken.ohnePfad).toBeGreaterThanOrEqual(1);
    expect(regal.luecken.ohneMarke).toBeGreaterThanOrEqual(1);
  });

  it("ein flacher Pfad macht nicht aus jeder Datei ein eignes Fach", () => {
    // Der Fehler stand eine Nacht im Flicken: der letzte Pfadteil ist die Datei,
    // kein Ordner. Mitgenommen waren 200 Stuecke 200 Fächer zu eins — alle unter
    // der Schwelle, das Regal endete in einer Zeile "200 smaller shelves" mit 100 %.
    const bestand = scanBestand(200, ["md", "json", "txt", "html"]);
    const regal = baueRegal(bestand);
    expect(regal.groesstesFachProzent).toBeLessThan(100);
    for (const f of regal.worum) expect(f.name).not.toContain(".md");
  });

  it("die Woher-Zeile zeigt alle drei Traeger — auch das kleinste", () => {
    // 92 Notes gegen 10 996 Files und 9 978 Code: mit Schwelle war das kleinste Fach
    // eine Schwanzzeile "1 smaller shelves". Genau diese Zahl war der Screenshot, mit
    // dem dieser Auftrag anfing — eine Gruppierung, die ihn selbst verschluckt, baut
    // nicht.
    const bestand = [
      ...scanBestand(400, ["md", "json"]),
      mem({ id: "h1", title: "Von Hand", content: "Kurz notiert, ohne Datei dahinter, ohne jedes Muster." }),
    ];
    const regal = baueRegal(bestand);
    expect(regal.woher.map((f) => f.name)).toContain("Notes");
    expect(regal.woher.some((f) => f.herkunft === "schwanz")).toBe(false);
    expect(regal.woher.length).toBe(3);
  });

  it("gibt die Zeilenzahl zurueck, die die Flaeche wirklich braucht", () => {
    const regal = baueRegal(scanBestand(200, ["md", "json", "txt", "html"]));
    expect(regal.zeilen).toBe(regal.woher.length + regal.worum.length);
    // Ein Regal, das den ganzen Laden in einer Zeile nennt, ist kein Regal.
    expect(regal.groesstesFachProzent).toBeLessThan(100);
    expect(regal.groesstesFachProzent).toBe(
      Number(((100 * Math.max(...regal.worum.map((f) => f.notizen))) / regal.bestand).toFixed(2)),
    );
  });

  it("ein leerer Bestand wirft kein Regal", () => {
    const regal = baueRegal([]);
    expect(regal.bestand).toBe(0);
    expect(regal.worum).toEqual([]);
    expect(regal.zeilen).toBe(0);
  });
});

describe("regalFach", () => {
  it("nimmt den Betreff, wo einer greift", () => {
    const f = regalFach({ title: "Besprechung 2026-10-13", content: "Termin mit Kunde Miller, https://example.com" });
    expect(f.herkunft).toBe("betreff");
  });

  it("nimmt den Ordner, wo kein Betreff greift", () => {
    const f = regalFach({ content: "reiner Text ohne jedes Muster\n— Source: /Users/x/Desktop/ki gehirn/audit/datei.md" }, ["Users", "x"]);
    expect(f.herkunft).toBe("ordner");
    expect(f.name).toBe("Desktop / ki gehirn");
  });

  it("lasst ein Stueck ohne beides in einem ehrlichen Restfach", () => {
    const f = regalFach({ title: "Nur ein Satz", content: "reiner Text ohne jedes Muster" });
    expect(f.herkunft).toBe("ohne beides");
  });
});
