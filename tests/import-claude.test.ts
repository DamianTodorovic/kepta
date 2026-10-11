// Der Claude-Export-Weg: JSON (conversations.json), JSONL (ein Gespräch pro
// Zeile) und der Projekt-Ordner (ein JSON je Gespräch). Vier Regeln, die dieser
// Test festhält, weil der ChatGPT-Weg sie vorgibt und die Sonde 10.10. gemessen
// hat, was fehlt:
//  1. Die Zeit kommt aus der Quelle. Fehlt sie, gilt der Importmoment — und die
//     Notiz sagt das selbst (Tag `zeit-import`), damit asOf den Bestand nicht
//     jünger oder älter macht, als er je war.
//  2. Eine Ladung hat einen Namen. Ohne Namen ist die zweite Ladung von der
//     ersten nicht zu trennen und damit nicht zurückholbar.
//  3. Dieselbe Aussage landet einmal. Ein zweites Wortlaut-Gleichnis ist ein
//     Kandidat für consolidate, nicht eine zweite Notiz.
//  4. dryRun zählt, was reinkäme — und warum etwas nicht reinkäme.
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { KeptaStore } from "../src/core/store";
import { searchMemories } from "../src/core/engine";
import { importClaudePfad, ladungVerwerfen } from "../src/core/import-claude";

let store: KeptaStore;
let wurzel: string;

beforeEach(() => {
  wurzel = fs.mkdtempSync(path.join(os.tmpdir(), "kepta-i1-claude-"));
  store = new KeptaStore(path.join(wurzel, "t.db"));
});
afterEach(() => {
  store.close();
  fs.rmSync(wurzel, { recursive: true, force: true });
});

/** Claude-Export, wie er aus dem Konto kommt: chat_messages mit sender/text. */
function exportDatei(name: string, gespraeche: unknown[]): string {
  const p = path.join(wurzel, name);
  fs.writeFileSync(p, JSON.stringify(gespraeche), "utf-8");
  return p;
}

function gespraech(uuid: string, titel: string, nachrichten: unknown[]): unknown {
  return { uuid, name: titel, created_at: "2024-03-04T10:00:00Z", chat_messages: nachrichten };
}

const notiz = (titel: string) => store.listMemories({ limit: 500 }).find((m) => m.title.startsWith(titel));

describe("import claude: die Zeit gehört der Quelle", () => {
  it("setzt Geltungsbeginn und Anlagezeit auf das Datum der Nachricht, nicht auf heute", async () => {
    const p = exportDatei("conversations.json", [
      gespraech("c1", "Küchenumbau", [
        { uuid: "m1", sender: "human", text: "Der Küchenumbau kostet 18000 Euro und dauert sechs Wochen.", created_at: "2024-03-04T10:00:00Z" },
      ]),
    ]);
    await importClaudePfad(store, p);
    const m = notiz("Der Küchenumbau");
    expect(m).toBeTruthy();
    expect(m!.validFrom).toBe(Date.parse("2024-03-04T10:00:00Z"));
    expect(m!.createdAt).toBe(Date.parse("2024-03-04T10:00:00Z"));
    expect(m!.tags).toContain("zeit-quelle");
  });

  it("kennt das Gesprächsdatum, wenn nur die Unterhaltung eines hat", async () => {
    const p = exportDatei("ohne-msg-zeit.json", [
      gespraech("c2", "Steuer", [{ uuid: "m1", sender: "human", text: "Die Steuererklärung geht am 15. Juli an das Finanzamt." }]),
    ]);
    await importClaudePfad(store, p);
    const m = notiz("Die Steuererklaerung") ?? notiz("Die Steuererklärung");
    expect(m!.validFrom).toBe(Date.parse("2024-03-04T10:00:00Z"));
  });

  it("lässt eine Nachricht ohne jedes Datum undatiert und kennzeichnet sie als Import", async () => {
    const vorDemImport = Date.now() - 1000 * 60 * 60 * 24 * 365;
    const p = path.join(wurzel, "undatiert.json");
    fs.writeFileSync(p, JSON.stringify([{ uuid: "c3", name: "Ideen", chat_messages: [{ uuid: "m1", sender: "human", text: "Der Garten soll im Frühling ein Hochbeet bekommen." }] }]), "utf-8");
    await importClaudePfad(store, p);
    const m = notiz("Der Garten");
    expect(m!.validFrom).toBeNull();
    expect(m!.createdAt).toBeGreaterThanOrEqual(vorDemImport);
    expect(m!.tags).toContain("zeit-import");

    // Die Zeitreise ist der Beweis: am 3. Juni darf die Datei nicht so tun,
    // als hätte der Nutzer den Inhalt schon damals gehabt.
    const fruher = await searchMemories(store, { query: "Garten Hochbeet Frühling", limit: 5, asOf: vorDemImport });
    expect(fruher.hits.map((h) => h.memory.id)).not.toContain(m!.id);
    const jetzt = await searchMemories(store, { query: "Garten Hochbeet Frühling", limit: 5 });
    expect(jetzt.hits.map((h) => h.memory.id)).toContain(m!.id);
  });
});

describe("import claude: formsprache und Absage", () => {
  it("versteht die drei realen Formen: sender/role und text/content, Datei wie Ordner", async () => {
    const ordner = path.join(wurzel, "Projekt");
    fs.mkdirSync(ordner);
    fs.writeFileSync(
      path.join(ordner, "1.json"),
      JSON.stringify([{ uuid: "a", name: "Form A", chat_messages: [{ uuid: "x1", sender: "human", text: "Form A: Der Server wird jeden Dienstag um 3 Uhr neu gestartet.", created_at: "2024-01-02T03:00:00Z" }] }]),
      "utf-8"
    );
    fs.writeFileSync(
      path.join(ordner, "2.json"),
      JSON.stringify([{ id: "b", title: "Form B", messages: [{ role: "user", content: "Form B: Die Kundin heißt Frau Berger und zahlt monatlich 400 Euro." }] }]),
      "utf-8"
    );
    fs.writeFileSync(
      path.join(ordner, "3.jsonl"),
      [
        JSON.stringify({ uuid: "c", name: "Form C", chat_messages: [{ uuid: "x2", author: { role: "user" }, content: { parts: ["Form C: Der Vertrag mit der Kanzlei läuft über zwei Jahre."] } }] }),
      ].join("\n"),
      "utf-8"
    );
    // Claude Code schreibt eine Zeile je Nachricht, nicht eine je Gespräch.
    fs.writeFileSync(
      path.join(ordner, "4.jsonl"),
      [
        JSON.stringify({ type: "user", sessionId: "s1", timestamp: "2024-06-01T08:00:00Z", message: { role: "user", content: [{ type: "text", text: "Form D: Die Sitzungswoche im Juni wurde auf den 12. gelegt." }] } }),
        JSON.stringify({ type: "assistant", sessionId: "s1", timestamp: "2024-06-01T08:00:05Z", message: { role: "assistant", content: [{ type: "text", text: "Diese Antwort von Claude bleibt außerhalb des Gedächtnisses." }] } }),
      ].join("\n"),
      "utf-8"
    );
    const z = await importClaudePfad(store, ordner);
    expect(z.dateien).toBe(4);
    expect(z.imported).toBe(4);
    expect(store.listMemories({ limit: 500 }).filter((m) => /Form [ABCD]:/.test(m.content)).length).toBe(4);
    // Zeile 1 der Datei ist keine Gesprächs-Form, sondern ein Nachrichtenstrom:
    // sein Datum kommt aus dem timestamp der Nachricht, nicht aus der Datei.
    expect(store.listMemories({ limit: 500 }).find((m) => m.content.includes("Form D"))?.validFrom).toBe(Date.parse("2024-06-01T08:00:00Z"));
    // Der Ordner ist ein Projekt-Export: ein JSON je Gespräch, keine ZIP.
    expect(z.quelle).toBe("claude");
  });

  it("weist einen Ordner ohne erkennbares Gespräch hörbar ab, statt still null Notizen zu liefern", async () => {
    const p = exportDatei("artfremd.json", [{ hierSteht: "nur ein Kassenbuch", werte: [1, 2, 3] }]);
    const z = await importClaudePfad(store, p);
    expect(z.imported).toBe(0);
    expect(z.gruende.map((g) => g.grund).join(" ")).toMatch(/sender|role|chat_messages|messages/i);
  });

  it("zählt Antworten von Claude als übersprungen und sagt es in der Zusammenfassung", async () => {
    const p = exportDatei("antworten.json", [
      gespraech("c9", "Nur Antworten", [
        { uuid: "m1", sender: "assistant", text: "Diese Antwort stammt von Claude und wird nicht gespeichert, weil sie abgeleitetes Wissen ist." },
      ]),
    ]);
    const z = await importClaudePfad(store, p);
    expect(z.imported).toBe(0);
    expect(z.assistantUebersprungen).toBe(1);
    expect(store.countMemories().active).toBe(0);
  });
});

describe("import claude: dryRun, Ladungsname, Duplikate", () => {
  it("sagt in der Vorschau, was reinkäme und warum etwas fehlt, und schreibt nichts", async () => {
    const p = exportDatei("vorschau.json", [
      gespraech("c1", "Vorschau", [
        { uuid: "m1", sender: "human", text: "Die Miete steigt im Januar auf 1450 Euro pro Monat." },
        { uuid: "m2", sender: "human", text: "ok" },
        { uuid: "m3", sender: "assistant", text: "Notiert habe ich das." },
        { uuid: "m4", sender: "human", text: "Die Miete steigt im Januar auf 1450 Euro pro Monat." },
      ]),
    ]);
    const vorher = store.countMemories().active;
    const z = await importClaudePfad(store, p, { dryRun: true });
    expect(store.countMemories().active).toBe(vorher);
    expect(z.trocken).toBe(true);
    expect(z.imported).toBe(1);
    expect(z.zuKurz).toBe(1);
    expect(z.assistantUebersprungen).toBe(1);
    expect(z.duplikateInDerLadung).toBe(1);
    expect(z.gruende.find((g) => g.grund === "zu kurz"))?.toEqual({ grund: "zu kurz", anzahl: 1 });
  });

  it("gibt jeder Ladung einen Namen, mit dem sie allein wieder verschwindet", async () => {
    const erste = exportDatei("erste.json", [gespraech("c1", "Erste", [{ uuid: "m1", sender: "human", text: "Erste Ladung: Der Drucker im Erdgeschoss ist ein HP Laserjet." }])]);
    const zweite = exportDatei("zweite.json", [gespraech("c2", "Zweite", [{ uuid: "m2", sender: "human", text: "Zweite Ladung: Der Drucker im ersten Stock ist ein Brother." }])]);
    const z1 = await importClaudePfad(store, erste, { ladung: "oktober-import" });
    const z2 = await importClaudePfad(store, zweite, { ladung: "november-import" });
    expect(z1.ladung).toBe("oktober-import");
    expect(store.listMemories({ limit: 500, tag: `ladung-${z2.ladung}` }).length).toBe(1);

    const verworfen = ladungVerwerfen(store, z2.ladung);
    expect(verworfen.abgegeben).toBe(1);
    expect(store.listMemories({ limit: 500 }).some((m) => m.content.includes("Brother"))).toBe(false);
    expect(store.listMemories({ limit: 500, tag: `ladung-${z1.ladung}` }).length).toBe(1);
    // Die erste Ladung bleibt unangetastet, und was im Papierkorb liegt, ist dort
    // und nicht weg — rückholbar.
    expect(store.countMemories().trashed).toBe(1);
  });

  it("lässt eine andere Quelle in Ruhe, die denselben Ladungsnamen trägt", async () => {
    const p = exportDatei("namensgleich.json", [gespraech("c1", "Namensgleich", [{ uuid: "m1", sender: "human", text: "Claude-Anteil: Der Notar heißt Herr Winkler und hat den Vertrag am 3. Mai beglaubigt." }])]);
    const z = await importClaudePfad(store, p, { ladung: "mai-ladung" });
    store.createMemory({ id: "datei:wurzel:notiz.md", title: "Ordner-Anteil", content: "Ordner-Anteil: Die Garage wurde im März gestrichen.", tags: ["import-datei", "ladung-mai-ladung"] });
    const verworfen = ladungVerwerfen(store, z.ladung);
    expect(verworfen.abgegeben).toBe(1);
    expect(verworfen.andereQuellen).toBe(1);
    expect(store.getMemory("datei:wurzel:notiz.md")?.deletedAt).toBeNull();
  });

  it("holt eine verworfene Notiz beim nächste Import derselben Datei zurück statt sie doppelt zu haben", async () => {
    const p = exportDatei("selbe.json", [gespraech("c1", "Selbe", [{ uuid: "m1", sender: "human", text: "Der Verein trifft sich am ersten Montag jedes Monats im Rathaus." }])]);
    const z1 = await importClaudePfad(store, p);
    ladungVerwerfen(store, z1.ladung);
    expect(store.countMemories().active).toBe(0);
    const z2 = await importClaudePfad(store, p);
    expect(z2.wiederhergestellt).toBe(1);
    expect(store.countMemories().active).toBe(1);
    expect(store.countMemories().trashed).toBe(0);
  });

  it("legt dieselbe Aussage aus zwei Quellen nicht zweimal ab, sondern meldet sie als Kandidat", async () => {
    const aussage = "Der Küchenumbau kostet 18000 Euro und dauert sechs Wochen.";
    store.createMemory({ id: "chatgpt:conv-1:n1", title: "Küchenumbau", content: aussage, tags: ["chatgpt-import"] });
    const p = exportDatei("duplikat.json", [gespraech("c1", "Duplikat", [{ uuid: "m1", sender: "human", text: aussage }])]);
    const z = await importClaudePfad(store, p);
    expect(z.bereitsVorhanden).toBe(1);
    expect(z.imported).toBe(0);
    expect(store.countMemories().active).toBe(1);
    expect(z.kandidaten[0]).toMatchObject({ bestehend: "chatgpt:conv-1:n1", grund: "gleicher wortlaut" });
  });

  it("prüft gegen den Bestand nur, wenn er darf, und meldet die ungeprüfte Menge", async () => {
    const zeilen = Array.from({ length: 5 }, (_, i) => ({ uuid: `c${i}`, name: `Ladung ${i}`, chat_messages: [{ uuid: `m${i}`, sender: "human", text: `Notiz ${i}: Die Rechnung Nummer ${i} geht an die Buchhaltung im Haus D.` }] }));
    const p = exportDatei("schnell.json", zeilen);
    const z = await importClaudePfad(store, p, { gegenBestand: false });
    expect(z.imported).toBe(5);
    expect(z.pruefungUebersprungen).toBe(5);
    expect(z.kandidaten.length).toBe(0);
    // Ausgeschaltete Prüfung heißt: kein Vorlauf über den Bestand, nichts versteckt.
    expect(z.pruefungVorlauf).toBeNull();
  });

  it("findet den zwilling auch ohne wortspur — geprüft wird der wortlaut, nicht der index", async () => {
    // Ein Text, dessen Wörter alle ein zeichen lang sind: contentTerms wirft sie
    // weg, die wortspur liefert dafür nichts. Ein Zwilling darf trotzdem nicht
    // zweimal landen.
    const zwilling = "a b c d e f g h i j k l m n o p";
    store.createMemory({ id: "chatgpt:z:1", title: "Zwilling", content: zwilling, tags: ["chatgpt-import"] });
    const p = exportDatei("ohnewortspur.json", [gespraech("c1", "Ohne Wortspur", [{ uuid: "m1", sender: "human", text: zwilling }])]);
    const z = await importClaudePfad(store, p);
    expect(z.bereitsVorhanden).toBe(1);
    expect(z.imported).toBe(0);
    expect(z.kandidaten[0]?.bestehend).toBe("chatgpt:z:1");
    expect(typeof z.pruefungVorlauf).toBe("number");
  });

  it("nennt eine private Notiz nicht beim Namen, wenn ihr Wortlaut schon da ist", async () => {
    const aussage = "Der Mietvertrag in der Lindenstraße läuft bis zum 31. August 2028.";
    store.createMemory({ id: "chatgpt:privat:1", title: "Vertrag", content: aussage, scope: "private", tags: ["chatgpt-import"] });
    const p = exportDatei("privat.json", [gespraech("c1", "Privat", [{ uuid: "m1", sender: "human", text: aussage }])]);
    const z = await importClaudePfad(store, p);
    expect(z.bereitsVorhanden).toBe(1);
    expect(store.countMemories().active).toBe(1);
    expect(z.kandidaten[0]?.bestehend).toBe("privat");
    expect(JSON.stringify(z)).not.toContain("chatgpt:privat:1");
  });

  it("lässt dieselbe Aussage aus einer nicht-privaten Quelle beim Namen", async () => {
    const aussage = "Der Küchenumbau kostet 18000 Euro und dauert sechs Wochen.";
    store.createMemory({ id: "datei:wurzel:notiz.md", title: "Küchenumbau", content: aussage, tags: ["import-datei"] });
    const p = exportDatei("oeffentlich.json", [gespraech("c1", "Öffentlich", [{ uuid: "m1", sender: "human", text: aussage }])]);
    const z = await importClaudePfad(store, p);
    expect(z.bereitsVorhanden).toBe(1);
    // Die Maskierung gilt nur für private Knoten — sonst wäre der Fund wertlos.
    expect(z.kandidaten[0]?.bestehend).toBe("datei:wurzel:notiz.md");
  });
});

describe("import claude: die Schleuse — derselbe Weg, den Q-18 für die Inbox härtete", () => {
  const MARKER = "SYMLINK-MARKER-97531";
  const draussen = () => fs.mkdtempSync(path.join(os.tmpdir(), "kepta-i1-fremd-"));
  const inhalt = (text: string) =>
    JSON.stringify([{ uuid: "f1", name: "Fremd", chat_messages: [{ uuid: "fm", sender: "human", text: `${MARKER}: ${text}` }] }]);
  const merkertext = () => store.listMemories({ limit: 500 }).map((m) => m.content).join("\n");

  it("lehnt eine Exportdatei ab, die per Symlink aus dem Wurzelordner läuft, und meldet den Grund", async () => {
    const fremd = draussen();
    const ziel = path.join(fremd, "fremd.json");
    fs.writeFileSync(ziel, inhalt("die geheime Aussage liegt außerhalb des erlaubten Ordners."), "utf-8");
    fs.symlinkSync(ziel, path.join(wurzel, "verlinkt.json"));
    const z = await importClaudePfad(store, wurzel);
    expect(merkertext()).not.toContain(MARKER);
    expect(z.abgelehnt.map((a) => a.grund).join(" ")).toMatch(/symlink/i);
    expect(z.imported).toBe(0);
  });

  it("folgt keinem Symlink-Ordner, statt seine Dateien einzusaugen", async () => {
    const fremd = draussen();
    const unterordner = path.join(fremd, "projekt");
    fs.mkdirSync(unterordner, { recursive: true });
    fs.writeFileSync(path.join(unterordner, "gespraeche.json"), inhalt("ein ganzer Ordner außerhalb."), "utf-8");
    fs.symlinkSync(unterordner, path.join(wurzel, "projekt"));
    await importClaudePfad(store, wurzel);
    expect(merkertext()).not.toContain(MARKER);
  });

  it("eine echte Datei im Wurzelordner wird weiterhin übernommen — die Schleise ist kein Leseverbot", async () => {
    fs.writeFileSync(path.join(wurzel, "echt.json"), JSON.stringify([{ uuid: "e1", name: "Echt", chat_messages: [{ uuid: "em", sender: "human", text: "Eine echte Exportdatei im Ordner mit genug Text für einen Knoten." }] }]), "utf-8");
    const z = await importClaudePfad(store, wurzel);
    expect(z.abgelehnt).toEqual([]);
    expect(z.imported).toBe(1);
  });

  it("weist einen Zielordner ab, der selbst ein Symlink ist, statt ihm zu folgen", async () => {
    const fremd = draussen();
    fs.writeFileSync(path.join(fremd, "a.json"), inhalt("hinter dem wurzelsymlink."), "utf-8");
    const link = path.join(wurzel, "wurzel-link");
    fs.symlinkSync(fremd, link);
    await expect(importClaudePfad(store, link)).rejects.toThrow(/symlink/i);
    expect(merkertext()).not.toContain(MARKER);
  });

  it("lässt nur die erlaubten Wurzeln zu und nennt beide, wenn jemand daran vorbeileiten will", async () => {
    const verboteneWurzel = path.join(os.tmpdir(), "..", "..", "Library", "Application Support", "kepta-i1-fremd");
    await expect(importClaudePfad(store, verboteneWurzel)).rejects.toThrow(/home|temp/i);
  });
});

describe("import claude: Menge, Bremse, keine Sperre", () => {
  it("blockiert den Lauf nicht: eine andere Aufgabe kommt während des Imports dran", async () => {
    const gespraeche = Array.from({ length: 400 }, (_, i) => ({
      uuid: `c${i}`,
      name: `Mengenlauf ${i}`,
      chat_messages: [{ uuid: `m${i}`, sender: "human", text: `Menge ${i}: Der Kunde Nummer ${i} wünscht die Lieferung am Monatsersten um acht.` }],
    }));
    const p = exportDatei("menge.json", gespraeche);
    let tick = 0;
    const timer = setInterval(() => tick++, 1);
    try {
      const z = await importClaudePfad(store, p, { gegenBestand: false });
      expect(z.imported).toBe(400);
    } finally {
      clearInterval(timer);
    }
    expect(tick).toBeGreaterThan(0);
  });

  it("lässt keine datei im projektordner fallen: 1.200 gespräch-dateien gehen alle durch", async () => {
    const ordner = path.join(wurzel, "gross");
    fs.mkdirSync(ordner, { recursive: true });
    for (let i = 0; i < 1200; i++) {
      fs.writeFileSync(
        path.join(ordner, `gespraeche-${i}.json`),
        JSON.stringify([{ uuid: `c${i}`, name: `Ladung ${i}`, chat_messages: [{ uuid: `m${i}`, sender: "human", text: `Projekt ${i}: Die Akte Nummer ${i} liegt bei der Anwältin im blauen Ordner.` }] }]),
        "utf-8"
      );
    }
    const z = await importClaudePfad(store, ordner);
    expect(z.dateien).toBe(1200);
    expect(z.imported).toBe(1200);
    expect(z.abgelehnte).toBe(0);
    expect(store.countMemories().active).toBe(1200);
  });

  it("gibt zu hören, wo ein langer Lauf steht — ein Herzschlag, keine Mauer", async () => {
    const gespraeche = Array.from({ length: 300 }, (_, i) => ({
      uuid: `h${i}`,
      name: `Herzschlag ${i}`,
      chat_messages: [{ uuid: `hm${i}`, sender: "human", text: `Herzschlag ${i}: Die Lieferung Nummer ${i} kommt am Dienstag in die Halle 3.` }],
    }));
    const p = exportDatei("herzschlag.json", gespraeche);
    const rufe: { verarbeitet: number; gesamt: number }[] = [];
    const z = await importClaudePfad(store, p, { gegenBestand: false, fortschritt: (stand) => rufe.push(stand) });
    expect(z.imported).toBe(300);
    expect(rufe.length).toBeGreaterThanOrEqual(3);
    expect(rufe[rufe.length - 1]).toEqual({ verarbeitet: 300, gesamt: 300 });
  });

  it("sagt, wenn die Ladung über die Bremse läuft, und läuft trotzdem durch", async () => {
    vi.stubEnv("KEPTA_MAX_ACTIVE", "3");
    try {
      const zeilen = Array.from({ length: 10 }, (_, i) => ({
        uuid: `c${i}`,
        name: `Bremsenlauf ${i}`,
        chat_messages: [{ uuid: `m${i}`, sender: "human", text: `Bremse ${i}: Die Akte Nummer ${i} liegt bei der Anwältin im Ordner blau.` }],
      }));
      const p = exportDatei("bremse.json", zeilen);
      const z = await importClaudePfad(store, p, { gegenBestand: false });
      expect(z.imported).toBe(10);
      expect(z.bremse).toEqual({ grenze: 3, bestand: 10, ueber: true });
    } finally {
      vi.unstubAllEnvs();
    }
  });
});
