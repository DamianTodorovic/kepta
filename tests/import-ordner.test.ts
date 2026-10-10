// Der Ordner-Weg: die eigenen Markdown- und Textdateien, ein ganzer Bestand.
// Was die Sonde 10.10. gemessen hat, hält dieser Test fest:
//   - Eine Datei ohne Frontmatter verliert ihr Alter. `obsidian.ts` kennt nur
//     `created:`/`valid_from:` in der Notiz, nie die Platte: eine Notiz von 2019
//     tat bei asOf(2020) so, als gäbe es sie noch nicht (0 Fund, Bestand 2006).
//   - Tags leer, confidence 1: fremde Datei, eigene Aussage — und keine Kennung,
//     mit der die Ladung wieder abbestellbar wäre.
// Dieses Blatt importiert ohne Frontmatter-Zwang, liest das Datum von der Platte,
// kennzeichnet jede Notiz mit Quelle und Ladung und lies keinen Symlink.
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { KeptaStore } from "../src/core/store";
import { searchMemories } from "../src/core/engine";
import { importOrdner, ladungVerwerfen } from "../src/core/import-ordner";

let store: KeptaStore;
let wurzel: string;
let vault: string;

beforeEach(() => {
  wurzel = fs.mkdtempSync(path.join(os.tmpdir(), "kepta-i1-ordner-"));
  store = new KeptaStore(path.join(wurzel, "t.db"));
  vault = path.join(wurzel, "vault");
  fs.mkdirSync(vault, { recursive: true });
});
afterEach(() => {
  store.close();
  fs.rmSync(wurzel, { recursive: true, force: true });
});

function datei(relativ: string, inhalt: string, alter?: string): string {
  const p = path.join(vault, relativ);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, inhalt, "utf-8");
  if (alter) {
    const t = new Date(alter);
    fs.utimesSync(p, t, t);
  }
  return p;
}

const alle = () => store.listMemories({ limit: 500 });

describe("import ordner: das Datum liegt auf der Platte", () => {
  it("gibt einer Datei ohne Frontmatter ihr Plattendatum, nicht den heutigen Tag", async () => {
    datei("Notizen/mietvertrag.md", "Der Mietvertrag in der Lindenstraße läuft bis zum 31. August 2028.", "2019-05-05T09:00:00Z");
    await importOrdner(store, vault);
    const m = alle().find((x) => x.title === "mietvertrag");
    expect(m).toBeTruthy();
    expect(m!.validFrom).toBeNull();
    expect(m!.createdAt).toBe(Date.parse("2019-05-05T09:00:00Z"));
    expect(m!.tags).toContain("zeit-datei");
    expect(m!.tags).toContain("import-datei");
  });

  it("lässt eine alte Datei in der Zeitreise auftauchen und eine neue dort bleiben", async () => {
    datei("alt.md", "Notiz von 2019: Der Mietvertrag in der Lindenstraße läuft bis 2028.", "2019-05-05T09:00:00Z");
    datei("neu.md", "Notiz von heute: Der Arbeitsvertrag in der Lindenstraße gilt seit diesem Monat.", undefined);
    await importOrdner(store, vault);
    const anno2020 = Date.parse("2020-01-01T00:00:00Z");
    const fund = await searchMemories(store, { query: "Lindenstraße Vertrag", limit: 10, asOf: anno2020 });
    const titel = fund.hits.map((h) => h.memory.title);
    expect(titel).toContain("alt");
    expect(titel).not.toContain("neu");
  });

  it("nimmt Frontmatter dem Plattendatum voraus, weil die Notiz selbst es sagt", async () => {
    datei("mit-frontmatter.md", ["---", "title: Kickoff Atlas", "created: 2021-02-03", "tags:", "  - projekt", "  - atlas", "type: procedural", "---", "", "Der Kickoff für Atlas war am 3. Februar und hat zwei Wochen Vorlauf gekostet."].join("\n"), "2024-01-01T00:00:00Z");
    await importOrdner(store, vault);
    const m = alle().find((x) => x.title === "Kickoff Atlas");
    expect(m!.validFrom).toBe(Date.parse("2021-02-03T00:00:00Z"));
    expect(m!.type).toBe("procedural");
    expect(m!.tags).toEqual(expect.arrayContaining(["projekt", "atlas"]));
  });

  it("traut einem Plattendatum von 1970 nicht und kennzeichnet die Notiz als Import", async () => {
    datei("ohne-alter.md", "Die Backup-Sicherung fährt jede Nacht um halb zwei über den externen Datenträger.");
    const p = path.join(vault, "ohne-alter.md");
    fs.utimesSync(p, new Date(0), new Date(0));
    await importOrdner(store, vault);
    const m = alle().find((x) => x.title === "ohne-alter");
    expect(m!.tags).toContain("zeit-import");
    expect(m!.tags).not.toContain("zeit-datei");
    expect(m!.createdAt).toBeGreaterThanOrEqual(Date.now() - 60_000);
  });
});

describe("import ordner: Formen, Vorbehalt, wiki-links", () => {
  it("liest markdown, .md und .txt aus Unterordnern und lässt anderes liegen", async () => {
    datei("a.md", "Die First-Week-Notiz: Der Wasserkocher im Besprechungsraum wird jeden Freitag entkalkt.");
    datei("tief/verschachtelt/b.txt", "Eine Textdatei aus dem Unterordner: Die Lieferantenrechnung geht an Buchhaltung. Number 7");
    datei("binar.md", "\u0000\u0000\u0000 keine schrift sondern ein speicherabbild \u0000\u0000");
    datei("bild.png", "PNGBILDEREIN");
    const z = await importOrdner(store, vault);
    // Drei Dateien gelesen, zwei davon sind Notizen geworden: `dateien` zählt das
    // Gelesene, `imported` das Angekommene — beides getrennt, damit eine
    // übersprungene Datei nicht als „gab es gar nicht" verschwindet.
    expect(z.dateien).toBe(3);
    expect(z.imported).toBe(2);
    expect(z.gruende.map((g) => g.grund).join(" ")).toMatch(/binär|leer|endung/i);
  });

  it("macht wiki-links zu Entitäten, wie es der Vault-Weg schon tut", async () => {
    datei("kickoff.md", "Der Kickoff nennt [[Atlas]] und [[Budget 2027]] als die beiden Themen der Woche.");
    await importOrdner(store, vault);
    const m = alle().find((x) => x.title === "kickoff")!;
    expect(store.entityNamesForMemory(m.id).map((e) => e.toLowerCase())).toEqual(expect.arrayContaining(["atlas"]));
  });

  it("sagt, wenn der Bestand den vollen Wortlaut schon hat, und legt nichts zweimal an", async () => {
    const aussage = "Der Küchenumbau kostet 18000 Euro und dauert sechs Wochen.";
    store.createMemory({ id: "chatgpt:conv-1:n1", title: "Küchenumbau", content: aussage, tags: ["chatgpt-import"] });
    datei("duplikat.md", aussage);
    const z = await importOrdner(store, vault);
    expect(z.bereitsVorhanden).toBe(1);
    expect(z.imported).toBe(0);
    expect(alle().filter((m) => m.content === aussage).length).toBe(1);
    expect(z.kandidaten[0].bestehend).toBe("chatgpt:conv-1:n1");
  });

  it("merkt die ownen Duplikate in einem Lauf und schreibt sie nicht zweimal", async () => {
    datei("einmal.md", "Die Sitzung am Dienstag behandelt die Jahresrechnung und den Nachtrag.");
    datei("anderer-ordner/einmal-kopie.md", "Die Sitzung am Dienstag behandelt die Jahresrechnung und den Nachtrag.");
    const z = await importOrdner(store, vault);
    expect(z.imported).toBe(1);
    expect(z.duplikateInDerLadung).toBe(1);
  });
});

describe("import ordner: Vorschau, Ladungsname, Rückweg", () => {
  it("zählt in der Vorschau, was reinkäme, und schreibt keine einzige Notiz", async () => {
    datei("voll.md", "Eine volle Notiz mit genug Text, um ein Knoten zu werden.");
    datei("leer.md", "   \n");
    const vorher = store.countMemories().active;
    const z = await importOrdner(store, vault, { dryRun: true });
    expect(z.trocken).toBe(true);
    expect(z.imported).toBe(1);
    expect(z.gruende.find((g) => g.grund === "leere datei")?.anzahl).toBe(1);
    expect(store.countMemories().active).toBe(vorher);
  });

  it("findet den zwilling auch ohne wortspur — geprüft wird der wortlaut, nicht der index", async () => {
    const zwilling = "a b c d e f g h i j k l m n o p";
    store.createMemory({ id: "chatgpt:z:1", title: "Zwilling", content: zwilling, tags: ["chatgpt-import"] });
    datei("ohnewortspur.md", zwilling);
    const z = await importOrdner(store, vault);
    expect(z.bereitsVorhanden).toBe(1);
    expect(z.imported).toBe(0);
    expect(z.kandidaten[0]?.bestehend).toBe("chatgpt:z:1");
    expect(typeof z.pruefungVorlauf).toBe("number");
  });

  it("geht über den Ladungsnamen wieder abbestellbar, ohne eine fremde Quelle anzufassen", async () => {
    datei("eins.md", "Erste Ladung: Der Maler kommt am Dienstag und streicht das Treppenhaus.");
    const z1 = await importOrdner(store, vault, { ladung: "fruehling" });
    datei("zwei.md", "Zweite Ladung: Der Maler hat Rechnung Nummer 88 über 2400 Euro geschickt.");
    const z2 = await importOrdner(store, vault, { ladung: "herbst" });
    store.createMemory({ id: "claude:x:y", title: "Fremde Quelle", content: "Ein Claude-Knoten mit derselben Ladung, damit er geprüft wird.", tags: ["import-claude", `ladung-${z2.ladung}`] });
    const verworfen = ladungVerwerfen(store, z2.ladung);
    expect(verworfen.abgegeben).toBe(1);
    expect(verworfen.andereQuellen).toBe(1);
    expect(store.getMemory("claude:x:y")?.deletedAt).toBeNull();
    expect(alle().some((m) => m.content.includes("Treppenhaus"))).toBe(true);
  });

  it("erkennt denselben Ordner wieder: der zweite Lauf ändert nichts, statt zu verdoppeln", async () => {
    datei("stabil.md", "Die WLAN-Kennung im Büro lautet KAPTOL und wird jedes Vierteljahr gewechselt.");
    const erster = await importOrdner(store, vault);
    const zweiter = await importOrdner(store, vault, { ladung: erster.ladung });
    expect(erster.imported).toBe(1);
    expect(zweiter.unveraendert).toBe(1);
    expect(zweiter.imported).toBe(0);
    expect(store.countMemories().active).toBe(1);
  });

  it("schneidet einen zu langen Inhalt nicht still ab, sondern meldet es", async () => {
    datei("riesig.md", `Die Chronik des Hauses Nummer 12. ${("und ein langer satz mit substanz. ".repeat(6000))}`);
    const z = await importOrdner(store, vault);
    expect(z.imported).toBe(1);
    expect(z.abgeschnitten).toBe(1);
    expect(alle().find((m) => m.title === "riesig")!.content.length).toBeLessThan(200_001);
  });
});

describe("import ordner: die Schleuse", () => {
  const MARKER = "SYMLINK-MARKER-4711";
  const draussen = () => fs.mkdtempSync(path.join(wurzel, "fremd-"));

  it("lehnt eine Datei ab, die per Symlink aus dem Wurzelordner läuft, und meldet den Grund", async () => {
    const fremd = draussen();
    const ziel = path.join(fremd, "fremd.md");
    fs.writeFileSync(ziel, `${MARKER}: die geheime Notiz liegt außerhalb des gewählten Ordners.`, "utf-8");
    fs.symlinkSync(ziel, path.join(vault, "verlinkt.md"));
    const z = await importOrdner(store, vault);
    expect(alle().map((m) => m.content).join("\n")).not.toContain(MARKER);
    expect(z.abgelehnt.map((a) => a.grund).join(" ")).toMatch(/symlink/i);
    expect(z.abgelehnte).toBe(1);
  });

  it("folgt keinem Symlink-Ordner, statt seine Dateien einzusaugen", async () => {
    const fremd = path.join(draussen(), "garten");
    fs.mkdirSync(fremd, { recursive: true });
    fs.writeFileSync(path.join(fremd, "beet.md"), `${MARKER}: ein ganzer Ordner außerhalb des erlaubten Baums.`, "utf-8");
    fs.symlinkSync(fremd, path.join(vault, "garten"));
    await importOrdner(store, vault);
    expect(alle().map((m) => m.content).join("\n")).not.toContain(MARKER);
  });

  it("weist einen Zielordner ab, der selbst ein Symlink ist", async () => {
    const fremd = draussen();
    fs.writeFileSync(path.join(fremd, "a.md"), `${MARKER}: hinter dem wurzelsymlink liegt ein ganzer Bestand.`, "utf-8");
    const link = path.join(wurzel, "wurzel-link");
    fs.symlinkSync(fremd, link);
    await expect(importOrdner(store, link)).rejects.toThrow(/symlink/i);
    expect(alle().map((m) => m.content).join("\n")).not.toContain(MARKER);
  });

  it("lies eine echte Datei im Ordner ganz normal — die Schleise ist kein Leseverbot", async () => {
    datei("echt.md", "Eine echte Datei im gewählten Ordner mit genug Text für einen Knoten.");
    const z = await importOrdner(store, vault);
    expect(z.abgelehnt).toEqual([]);
    expect(z.imported).toBe(1);
  });
});

describe("import ordner: Menge, Bremse, keine Sperre", () => {
  it("blockiert den Lauf nicht: 1200 Dateien halten eine andere Aufgabe am Leben", async () => {
    for (let i = 0; i < 1200; i++) {
      datei(`o${i % 12}/notiz-${i}.md`, `Notiz ${i}: Der Kunde Nummer ${i} bestellt die Lieferung am Monatsersten um acht Uhr.`);
    }
    let tick = 0;
    const timer = setInterval(() => tick++, 1);
    let dauer = 0;
    try {
      const start = performance.now();
      const z = await importOrdner(store, vault, { gegenBestand: false });
      dauer = performance.now() - start;
      expect(z.imported).toBe(1200);
    } finally {
      clearInterval(timer);
    }
    expect(tick).toBeGreaterThan(0);
    console.log(`  Mengenzaehler: 1200 dateien in ${Math.round(dauer)} ms (${(dauer / 1200).toFixed(2)} ms je datei)`);
  });

  it("gibt zu hören, wo ein langer Lauf steht — ein Herzschlag, keine Mauer", async () => {
    for (let i = 0; i < 300; i++) datei(`h${i % 10}/notiz-${i}.md`, `Herzschlag ${i}: Die Lieferung Nummer ${i} kommt am Dienstag in die Halle 3.`);
    const rufe: { verarbeitet: number; gesamt: number }[] = [];
    const z = await importOrdner(store, vault, { gegenBestand: false, fortschritt: (stand) => rufe.push(stand) });
    expect(z.imported).toBe(300);
    expect(rufe.length).toBeGreaterThanOrEqual(3);
    expect(rufe[rufe.length - 1]).toEqual({ verarbeitet: 300, gesamt: 300 });
  });

  it("sagt, wenn der Bestand über die Bremse läuft, und lies trotzdem alles", async () => {
    vi.stubEnv("KEPTA_MAX_ACTIVE", "4");
    try {
      for (let i = 0; i < 12; i++) datei(`b${i}.md`, `Bremsenlauf ${i}: Die Akte Nummer ${i} liegt bei der Anwältin im blauen Ordner.`);
      const z = await importOrdner(store, vault, { gegenBestand: false });
      expect(z.imported).toBe(12);
      expect(z.bremse).toEqual({ grenze: 4, bestand: 12, ueber: true });
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("hat keinen Schlüssel und keine Grenze: nichts an diesem Weg antwortet mit einer Sperre", async () => {
    for (let i = 0; i < 5; i++) datei(`s${i}.md`, `Grenzenloser Lauf ${i}: Die Garage am Markt 4 wurde im März gestrichen.`);
    const z = await importOrdner(store, vault);
    expect(z.imported).toBe(5);
    expect(JSON.stringify(z)).not.toMatch(/licence|license|upgrade|paywall|bezahlen|sperre|quota/i);
    expect(z.fehler).toEqual([]);
  });
});
