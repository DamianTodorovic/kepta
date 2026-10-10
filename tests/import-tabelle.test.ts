// Der Tabellen-Weg: CSV und JSONL mit einer klaren Spaltensprache.
//
// Ein Nutzer hat seine Notizen oft als Tabelle: ein Excel-Export mit `;`, ein
// Sheets-Export mit `,`, ein Notion-Export mit `|`, eine JSONL-Zeile je Eintrag.
// Was dieser Weg verspricht, ist die Ansage, was er verstanden hat:
//   - Erkannte Spalten werden benannt, ignorierte Spalten bleiben sichtbar
//     (eine still weggeworfene Spalte ist ein verlorener Datensatz).
//   - Rät er die Inhaltsspalte nicht, weist er die Datei ab und nennt die
//     Wörter, die er kennt — statt jede Zeile mit einem blinden Textfeld zu füllen.
//   - Zeilennummer oder ID-Spalte ergeben die Knoten-ID: derselbe Lauf zweimal
//     geändert nichts, sondern bleibt bei `unveraendert`.
//   - Datumsformen: ISO, `dd.MM.yyyy`, epoch Sekunden wie Millisekunden.
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { KeptaStore } from "../src/core/store";
import { importTabelle, ladungVerwerfen } from "../src/core/import-tabelle";

let store: KeptaStore;
let wurzel: string;

beforeEach(() => {
  wurzel = fs.mkdtempSync(path.join(os.tmpdir(), "kepta-i1-tabelle-"));
  store = new KeptaStore(path.join(wurzel, "t.db"));
});
afterEach(() => {
  store.close();
  fs.rmSync(wurzel, { recursive: true, force: true });
});

function tabelle(name: string, inhalt: string): string {
  const p = path.join(wurzel, name);
  fs.writeFileSync(p, inhalt, "utf-8");
  return p;
}

const alle = () => store.listMemories({ limit: 500 });

describe("import tabelle: die Spaltensprache", () => {
  it("liest eine CSV mit title,content,date,tags und setzt die Zeit aus der Spalte", async () => {
    const p = tabelle(
      "notizen.csv",
      ["title,content,date,tags", '"Kellner,""Der""","Der Gast zahlt 42 Euro und gibt 8 Euro Trinkgeld.","2024-05-06","bewirtung;belege"'].join("\n")
    );
    const z = await importTabelle(store, p);
    expect(z.zeilen).toBe(1);
    expect(z.imported).toBe(1);
    const m = alle()[0];
    expect(m.title).toBe('Kellner,"Der"');
    expect(m.validFrom).toBe(Date.parse("2024-05-06T00:00:00Z"));
    expect(m.tags).toEqual(expect.arrayContaining(["bewirtung", "belege", "import-tabelle", "zeit-quelle"]));
    expect(m.scope).toBe("local");
  });

  it("erkennt das Semikolon eines Excel-Exports und ein deutsches Datum", async () => {
    const p = tabelle("export.csv", "datum;inhalt;schluessel\n06.05.2024;Die Rechnung 118 geht an die Buchhaltung im Erdgeschoss.;R118\n");
    const z = await importTabelle(store, p);
    expect(z.imported).toBe(1);
    const m = alle()[0];
    expect(m.validFrom).toBe(Date.parse("2024-05-06T00:00:00Z"));
    expect(m.content).toContain("Rechnung 118");
    // Die ID-Spalte trägt den Knoten — deshalb ist der zweite Lauf `unveraendert`.
    expect(m.id).toContain("r118");
    expect(z.spalten.erkannt.id).toBe("schluessel");
    expect(z.spalten.erkannt.zeit).toBe("datum");
    expect(z.spalten.trennzeichen).toBe(";");
  });

  it("lässt einen Zeilenumbruch in einer zitierten Zelle heil und zählt eine Zeile", async () => {
    const p = tabelle("mehrzeilig.csv", 'titel,text\n"Protokoll","Punkt eins.\nPunkt zwei mit Substanz für den Knoten."\n');
    const z = await importTabelle(store, p);
    expect(z.zeilen).toBe(1);
    expect(alle()[0].content).toBe("Punkt eins.\nPunkt zwei mit Substanz für den Knoten.");
  });

  it("versteht JSONL: ein Objekt je Zeile, Felder als Spalten, Listen als Schlagwörter", async () => {
    const p = tabelle(
      "notizen.jsonl",
      [
        JSON.stringify({ title: "Lieferplan", content: "Die Anlieferung läuft ab dem 3. über die Südseite.", date: "2024-09-03", tags: ["logistik", "suedseite"] }),
        JSON.stringify({ title: "Vertretung", content: "Die Vertretung im Büro übernimmt ab Montag Frau Krüger." }),
      ].join("\n")
    );
    const z = await importTabelle(store, p);
    expect(z.imported).toBe(2);
    expect(alle().find((m) => m.title === "Lieferplan")!.validFrom).toBe(Date.parse("2024-09-03T00:00:00Z"));
    expect(alle().find((m) => m.title === "Vertretung")!.tags).toContain("zeit-import");
  });

  it("weist eine Tabelle ab, deren Inhaltsspalte er nicht kennt, und nennt seine Wörter", async () => {
    const p = tabelle("fremd.csv", "betrag,waehrung,faellig\n1200,EUR,2024-05-01\n");
    const z = await importTabelle(store, p);
    expect(z.imported).toBe(0);
    expect(alle().length).toBe(0);
    expect(z.gruende.map((g) => g.grund).join(" ")).toMatch(/inhalt|content|text/i);
    expect(z.spalten.kopf).toContain("betrag");
  });

  it("nimmt eine angesagte Spalte dem Raten voraus", async () => {
    const p = tabelle("sonderlich.csv", "spalte_a,spalte_b\nHinweis,Eine Notiz aus der sonderlichen Spalte mit genug Text.\n");
    const z = await importTabelle(store, p, { spalten: { titel: "spalte_a", inhalt: "spalte_b" } });
    expect(z.imported).toBe(1);
    expect(alle()[0].title).toBe("Hinweis");
  });

  it("meldet, welche Spalten er liegen lässt — eine vergessene Spalte ist ein verlorener Datensatz", async () => {
    const p = tabelle("vier.csv", "titel,text,anhang,pruefung\nStart,Eine Notiz mit genug Text für einen Knoten.,beleg-7.pdf,ja\n");
    const z = await importTabelle(store, p);
    expect(z.uebrig.length).toBe(2);
    expect(z.uebrig).toEqual(expect.arrayContaining(["anhang", "pruefung"]));
  });
});

describe("import tabelle: Idempotenz, Duplette, Rückweg", () => {
  it("ändert beim zweiten Lauf nichts, statt jede Zeile noch einmal anzulegen", async () => {
    const p = tabelle("stabil.csv", "titel,text,id\nPlan A,Der Plan A gilt ab dem nächsten Monat für beide Standorte.,A-1\n");
    const erster = await importTabelle(store, p);
    const zweiter = await importTabelle(store, p, { ladung: erster.ladung });
    expect(erster.imported).toBe(1);
    expect(zweiter.unveraendert).toBe(1);
    expect(store.countMemories().active).toBe(1);
    expect(alle()[0].id).toContain("a-1");
  });

  it("legt einen doppelten Wortlaut nicht zweimal an, weder in der Ladung noch gegen den Bestand", async () => {
    const aussage = "Der Küchenumbau kostet 18000 Euro und dauert sechs Wochen.";
    store.createMemory({ id: "chatgpt:conv-1:n1", title: "Küchenumbau", content: aussage, tags: ["chatgpt-import"] });
    const p = tabelle("doppelt.csv", `titel,text\n"Zelle 1","${aussage}"\n"Zelle 2","${aussage}"\n`);
    const z = await importTabelle(store, p);
    expect(z.imported).toBe(0);
    expect(z.bereitsVorhanden).toBe(1);
    expect(z.duplikateInDerLadung).toBe(1);
    expect(store.countMemories().active).toBe(1);
    expect(z.kandidaten[0].bestehend).toBe("chatgpt:conv-1:n1");
  });

  it("geht über den Ladungsnamen abbestellbar und lässt andere Quellen in Ruhe", async () => {
    const p = tabelle("ladung.csv", "titel,text\nReklamation,Die Reklamation Nummer 12 ging am Dienstag an den Lieferanten.\n");
    const z = await importTabelle(store, p, { ladung: "september" });
    store.createMemory({ id: "datei:w:n.md", title: "Andere Quelle", content: "Eine Datei-Notiz, die denselben Ladungsnamen trägt.", tags: ["import-datei", "ladung-september"] });
    const verworfen = ladungVerwerfen(store, z.ladung);
    expect(verworfen.abgegeben).toBe(1);
    expect(verworfen.andereQuellen).toBe(1);
    expect(store.getMemory("datei:w:n.md")?.deletedAt).toBeNull();
  });

  it("findet den zwilling auch ohne wortspur — geprüft wird der wortlaut, nicht der index", async () => {
    const zwilling = "a b c d e f g h i j k l m n o p";
    store.createMemory({ id: "chatgpt:z:1", title: "Zwilling", content: zwilling, tags: ["chatgpt-import"] });
    const p = tabelle("ohnewortspur.csv", `titel,text\n"Ohne","${zwilling}"\n`);
    const z = await importTabelle(store, p);
    expect(z.bereitsVorhanden).toBe(1);
    expect(z.imported).toBe(0);
    expect(z.kandidaten[0]?.bestehend).toBe("chatgpt:z:1");
    expect(typeof z.pruefungVorlauf).toBe("number");
  });

  it("sagt in der Vorschau, was reinkäme, und lässt die leeren Zeilen als Grund", async () => {
    const p = tabelle("vorschau.csv", "titel,text\nVolle Zeile,Eine Zeile mit genug Text für einen Knoten.\nLeere Zeile,\n");
    const vorher = store.countMemories().active;
    const z = await importTabelle(store, p, { dryRun: true });
    expect(z.trocken).toBe(true);
    expect(z.imported).toBe(1);
    expect(z.gruende.find((g) => g.grund === "leere zeile")?.anzahl).toBe(1);
    expect(store.countMemories().active).toBe(vorher);
  });
});

describe("import tabelle: die Schleuse", () => {
  const MARKER = "SYMLINK-MARKER-2468";

  it("lehnt eine Tabelle ab, die per Symlink aus dem erlaubten Ordner läuft", async () => {
    const fremd = fs.mkdtempSync(path.join(os.tmpdir(), "kepta-i1-fremd-tab-"));
    const ziel = path.join(fremd, "fremd.csv");
    fs.writeFileSync(ziel, `titel,text\nFremd,${MARKER}: die geheime Tabelle liegt außerhalb.\n`, "utf-8");
    const link = path.join(wurzel, "verlinkt.csv");
    fs.symlinkSync(ziel, link);
    await expect(importTabelle(store, link)).rejects.toThrow(/symlink/i);
    expect(alle().map((m) => m.content).join("\n")).not.toContain(MARKER);
  });

  it("lies eine echte Datei im erlaubten Ordner ganz normal", async () => {
    const p = tabelle("echt.csv", "titel,text\nEcht,Eine echte Tabelle mit genug Text für einen Knoten.\n");
    const z = await importTabelle(store, p);
    expect(z.imported).toBe(1);
  });
});

describe("import tabelle: Menge, Bremse, keine Sperre", () => {
  it("blockiert den Lauf nicht: 1500 Zeilen halten eine andere Aufgabe am Leben", async () => {
    const zeilen = ["titel,text"];
    for (let i = 0; i < 1500; i++) zeilen.push(`"Zelle ${i}","Mengenlauf ${i}: Der Kunde Nummer ${i} bestellt am Monatsersten um acht."`);
    const p = tabelle("menge.csv", `${zeilen.join("\n")}\n`);
    let tick = 0;
    const timer = setInterval(() => tick++, 1);
    let dauer = 0;
    try {
      const start = performance.now();
      const z = await importTabelle(store, p, { gegenBestand: false });
      dauer = performance.now() - start;
      expect(z.imported).toBe(1500);
    } finally {
      clearInterval(timer);
    }
    expect(tick).toBeGreaterThan(0);
    console.log(`  Mengenzaehler: 1500 zeilen in ${Math.round(dauer)} ms (${(dauer / 1500).toFixed(2)} ms je zeile), ohne duplikatspruefung`);
  });

  it("gibt zu hören, wo ein langer Lauf steht — ein Herzschlag, keine Mauer", async () => {
    const zeilen = ["titel,text"];
    for (let i = 0; i < 300; i++) zeilen.push(`"Herzschlag ${i}","Herzschlag ${i}: Die Lieferung Nummer ${i} kommt am Dienstag in die Halle 3."`);
    const p = tabelle("herzschlag.csv", `${zeilen.join("\n")}\n`);
    const rufe: { verarbeitet: number; gesamt: number }[] = [];
    const z = await importTabelle(store, p, { gegenBestand: false, fortschritt: (stand) => rufe.push(stand) });
    expect(z.imported).toBe(300);
    expect(rufe.length).toBeGreaterThanOrEqual(3);
    expect(rufe[rufe.length - 1]).toEqual({ verarbeitet: 300, gesamt: 300 });
  });

  it("sagt, wenn der Bestand über die Bremse läuft, und lies trotzdem alle Zeilen", async () => {
    vi.stubEnv("KEPTA_MAX_ACTIVE", "4");
    try {
      const zeilen = ["titel,text"];
      for (let i = 0; i < 9; i++) zeilen.push(`"Bremse ${i}","Bremsenlauf ${i}: Die Akte Nummer ${i} liegt im blauen Ordner bei der Anwältin."`);
      const p = tabelle("bremse.csv", `${zeilen.join("\n")}\n`);
      const z = await importTabelle(store, p, { gegenBestand: false });
      expect(z.imported).toBe(9);
      expect(z.bremse).toEqual({ grenze: 4, bestand: 9, ueber: true });
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("hat keinen Schlüssel und keine Grenze: nichts an diesem Weg antwortet mit einer Sperre", async () => {
    const zeilen = ["titel,text"];
    for (let i = 0; i < 6; i++) zeilen.push(`"Frei ${i}","Grenzenloser Lauf ${i}: Die Garage am Markt 4 wurde im März gestrichen."`);
    const p = tabelle("frei.csv", `${zeilen.join("\n")}\n`);
    const z = await importTabelle(store, p);
    expect(z.imported).toBe(6);
    expect(JSON.stringify(z)).not.toMatch(/licence|license|upgrade|paywall|bezahlen|sperre|quota/i);
  });
});
