// Das Erlebnis-CLI: remember setzt Typ/Tags automatisch (die Store-Regeln —
// nicht „alles Fakt"), recall liefert sortierte Treffer mit eigenen Snippets,
// timeline sortiert alt→neu, contradict bleibt dry-run, stats zählt echt.
import { describe, it, expect, beforeEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { KeptaStore } from "../src/core/store";
import { defaultExtensions } from "../src/core/extensions";
import { remember, recall, timeline, contradict, stats, erlebnisKommando } from "../src/cli-erlebnis";

let store: KeptaStore;

beforeEach(() => {
  store = new KeptaStore(path.join(fs.mkdtempSync(path.join(os.tmpdir(), "cli-")), "t.db"));
});

const neueDb = () => path.join(fs.mkdtempSync(path.join(os.tmpdir(), "cli-")), "t.db");

/** Faengt, was ein Mensch im Terminal sieht: stdout, stderr und den Exit-Code. */
async function funkt(store: KeptaStore, befehl: string, args: string[] = []) {
  const aus: string[] = [];
  const fehl: string[] = [];
  const original = { log: console.log, error: console.error };
  console.log = (...a: unknown[]) => { aus.push(a.map(String).join(" ")); };
  console.error = (...a: unknown[]) => { fehl.push(a.map(String).join(" ")); };
  try {
    const code = await erlebnisKommando(store, befehl, args);
    return { code, aus: aus.join("\n"), fehl: fehl.join("\n") };
  } finally {
    console.log = original.log;
    console.error = original.error;
  }
}

/** Der Kopier-Unfall aus README.md: KEPTA_DB_KEY gesetzt, aber ungueltig — die Datei bleibt Klartext. */
function storeMitUngueltigemSchluessel(db: string) {
  return new KeptaStore(db, {
    ...defaultExtensions(),
    keys: {
      ablage: "KEPTA_DB_KEY",
      keyFor: () => {
        throw new Error("KEPTA_DB_KEY must be 64 hexadecimal characters (256 bits).");
      },
    },
  });
}

/** Derselbe Pfad mit gueltigem 256-Bit-Schluessel: die Datei wird beim Oeffnen verschluesselt. */
function storeMitSchluessel(db: string) {
  return new KeptaStore(db, {
    ...defaultExtensions(),
    keys: { ablage: "KEPTA_DB_KEY", keyFor: () => Buffer.alloc(32, 7) },
  });
}

/** Nur fuer den Lauf einen KEPTA_DB_KEY setzen (die Meldung nennt die Laenge aus der Umgebung). */
async function mitUmgebungsSchluessel<T>(wert: string, lauf: () => Promise<T>): Promise<T> {
  const vorher = process.env.KEPTA_DB_KEY;
  process.env.KEPTA_DB_KEY = wert;
  try {
    return await lauf();
  } finally {
    if (vorher === undefined) delete process.env.KEPTA_DB_KEY;
    else process.env.KEPTA_DB_KEY = vorher;
  }
}

describe("remember", () => {
  it("nummerierte Schritte → How-to (nicht Fakt); Tag #echo wird mitgenommen", () => {
    const r = remember(store, "1. Kabel anschließen\n2. Treiber laden\n3. Testseite drucken", ["echo"]);
    expect(r.typ).toBe("procedural");
    const m = store.getMemory(r.id)!;
    expect(m.tags).toContain("remember");
    expect(m.tags).toContain("echo");
  });

  it("leerer Text wirft eine klare Fehlermeldung", () => {
    expect(() => remember(store, "   ", [])).toThrow(/Nothing to remember/);
  });
});

describe("recall", () => {
  it("findet die Notiz, mit eigenem Snippet und Altern-Text", async () => {
    remember(store, "Production runs on the Hetzner CX42 in Nuremberg.", ["infra"]);
    const { treffer, total } = await recall(store, "Where does production run?");
    expect(total).toBeGreaterThanOrEqual(1);
    expect(treffer[0]!.titel).toContain("Hetzner");
    expect(treffer[0]!.snippet.length).toBeGreaterThan(5);
    expect(["today", /\dd ago/.source].some((x) => treffer[0]!.alter === x || new RegExp(x).test(treffer[0]!.alter))).toBe(true);
  });
});

describe("timeline", () => {
  it("sortiert alt → neu und filtert nach Thema", () => {
    const jetzt = Date.now();
    const alt = store.createMemory({ title: "Old decision", content: "We chose [[Postgres]].", validFrom: jetzt - 90 * 86_400_000, createdAt: jetzt - 90 * 86_400_000 });
    const neu = store.createMemory({ title: "New decision", content: "Postgres 16 upgrade planned, still [[Postgres]].", validFrom: jetzt - 5 * 86_400_000, createdAt: jetzt - 5 * 86_400_000 });
    store.createMemory({ title: "Unrelated", content: "Kaffee ist alle.", tags: ["kueche"] });
    const eintraege = timeline(store, "postgres");
    expect(eintraege.length).toBe(2);
    expect(eintraege[0]!.titel).toBe(alt.title);
    expect(eintraege[1]!.titel).toBe(neu.title);
    expect(eintraege[0]!.datum.length).toBe(10);
  });
});

describe("contradict", () => {
  it("dry-run: meldet Duplikate, ändert nichts", async () => {
    remember(store, "The production server is Hetzner CX42.", ["infra"]);
    remember(store, "The production server is Hetzner CX42.", ["infra"]);
    const vor = store.countMemories();
    const { anzahl, widersprueche } = await contradict(store);
    expect(anzahl).toBeGreaterThanOrEqual(1);
    expect(["embedding", "title+tags"]).toContain(widersprueche[0]!.grund);
    expect(store.countMemories()).toStrictEqual(vor);
  });
});

describe("stats", () => {
  it("zählt aktiv/trashed, Typen und echte Graph-Kanten", () => {
    remember(store, "1. Step one\n2. Step two", []);
    remember(store, "Fact about [[Alpha]].", []);
    remember(store, "Fact about [[Beta]] and [[Alpha]].", []);
    store.createMemory({ title: "Alpha", content: "The note the links point at." });
    // Den How-to-Notiz in den Papierkorb (NICHT Alpha — der trägt die Kanten):
    const howto = store.listMemories({}).find((m) => m.title.startsWith("1. Step"))!;
    store.trashMemory(howto.id);
    const s = stats(store);
    expect(s.notizen.active).toBe(3);
    expect(s.notizen.trashed).toBe(1);
    expect(Object.values(s.typen).reduce((a, b) => a + b, 0)).toBe(3);
    expect(s.graphKnoten).toBe(3);
    expect(s.graphKanten).toBeGreaterThanOrEqual(1);
    expect(s.verschluesselt).toBe(false);
  });
});

// Q-05 (A6-01, von der QA-Leitung nachgemessen): Der Kopier-Unfall aus
// README.md — KEPTA_DB_KEY mit Platzhalter → Klartext-Datei, Exit 0, und
// dieselbe Ausgabe sagte zwei Zeilen uebereinander „NOT encrypted" und
// „local · encrypted · unlimited". Der Slogan darf nur bei gemessener
// Verschluesselung stehen; sonst Grund, Zahl und Ausweg.
describe("stats: der Slogan haelt, was die Datei tut", () => {
  it("ohne Verschluesselung: kein verschluesselt-Slogan, dafuer Grund, Zahl der Hex-Zeichen und Ausweg", async () => {
    const db = neueDb();
    const store = storeMitUngueltigemSchluessel(db);
    try {
      const { code, aus } = await mitUmgebungsSchluessel("abcd1234", () => funkt(store, "stats"));
      expect(code).toBe(0);
      expect(aus).toContain("NOT encrypted");
      expect(aus).not.toContain("local · encrypted · unlimited");
      // D2 (b): Grund und Zustand stehen in EINER Zeile — zwei Zeilen, die
      // derselbe Zustand zweimal behaupten, waren der alte Fehler.
      // Das Gedankenstrich-Zeichen ist geklebt (U+00A0), damit es nie allein
      // umbricht — deshalb zwei Prüfungen statt eines einzigen Strings.
      expect(aus).toMatch(/NOT encrypted/);
      expect(aus).toMatch(/KEPTA_DB_KEY must be 64 hexadecimal/);
      expect(aus).toContain("you gave 8");
      expect(aus).toContain("openssl rand -hex 32");
      // B-03/A3-10: wer einen Schluessel hat, muss auch den Wiederherstellungsweg
      // sehen — die Adresse steht in SECURITY.md, nicht im Terminaltext.
      expect(aus).toContain("SECURITY.md");
      expect(fs.readFileSync(db).subarray(0, 15).toString()).toBe("SQLite format 3");
    } finally {
      store.close();
    }
  });

  it("mit Verschluesselung: der Slogan bleibt, und die Meldung nennt die Quelle des Schluessels", async () => {
    const db = neueDb();
    const store = storeMitSchluessel(db);
    try {
      const { code, aus } = await funkt(store, "stats");
      expect(code).toBe(0);
      expect(aus).toMatch(/state\s+encrypted/);
      // Der Slogan am Ende ist gewichen: R9 verlangt als letzten Satz einen Weg,
      // kein Lob. „no account, no cloud" steht dort, wo nachgeschlagen wird — in
      // der Hilfe.
      expect(aus).not.toContain("local · encrypted · unlimited");
      expect(aus).toContain("next:");
      expect(aus).toContain("key: KEPTA_DB_KEY");
      expect(aus).not.toContain("openssl rand");
      expect(fs.readFileSync(db).subarray(0, 15).toString()).not.toBe("SQLite format 3");
    } finally {
      store.close();
    }
  });

  it("KEPTA_ENCRYPTION=off: die Meldung sagt, dass sie abgeschaltet ist, und behauptet nichts", async () => {
    const db = neueDb();
    const vorher = process.env.KEPTA_ENCRYPTION;
    process.env.KEPTA_ENCRYPTION = "off";
    const store = new KeptaStore(db, { ...defaultExtensions(), keys: { keyFor: () => null } });
    try {
      const { aus } = await funkt(store, "stats");
      expect(aus).not.toContain("local · encrypted · unlimited");
      expect(aus).toContain("KEPTA_ENCRYPTION=off");
    } finally {
      if (vorher === undefined) delete process.env.KEPTA_ENCRYPTION;
      else process.env.KEPTA_ENCRYPTION = vorher;
      store.close();
    }
  });
});

// A1 hat gemessen: „remember" und „recall" stehen in keinem öffentlichen Papier.
// Also muss das Terminal selbst erklären, was der Befehl tut und was der nächste
// Schritt ist — hier, wo der Mensch tippt, nicht erst in der README.
describe("das Terminal erklärt sich selbst", () => {
  it("hilfe und Merken-Ausgabe nennen Befehl, Beispiel und den nächsten Schritt", async () => {
    const { code, aus } = await funkt(store, "help");
    expect(code).toBe(0);
    for (const befehl of ["remember", "recall", "timeline", "contradict", "stats", "demo", "import", "setup"]) {
      expect(aus, `hilfe erklärt ${befehl} nicht`).toContain(befehl);
    }
    expect(aus).toContain("kepta remember");
    expect(aus).toMatch(/[Nn]ext step/);

    const gemerkt = await funkt(store, "remember", ["Production runs on the Hetzner CX42."]);
    expect(gemerkt.code).toBe(0);
    expect(gemerkt.aus).toMatch(/[Nn]ext/);
    expect(gemerkt.aus).toContain("kepta recall");

    const unbekannt = await funkt(store, "status");
    expect(unbekannt.code).toBe(2);
    expect(unbekannt.fehl).toContain("unknown command: status");
    // D2-21/R10: ein Irrtum bekommt einen Block mit Weg, nicht die ganze Tafel.
    expect(unbekannt.fehl).toMatch(/next:.*--help/);
  });
});
// T-16 (A6-16): Der Kopf versprach „8 matches", die Liste zeigte fünf — ohne
// ein Wort darüber, dass abgeschnitten ist. Beide Zahlen müssen dastehen.
describe("recall: die Zahl und die Liste decken sich", () => {
  it("nennt beide Zahlen: was gezeigt wird und was gefunden wurde", async () => {
    remember(store, "Weber bills quarterly, never monthly", ["weber"]);
    const klein = await funkt(store, "recall", ["weber"]);
    const kopfKlein = klein.aus.split("\n").find((z) => z.includes("ranked by relevance"));
    expect(kopfKlein).toBe("1 match — ranked by relevance");

    const grosse = new KeptaStore(neueDb());
    try {
      for (let i = 0; i < 8; i++) remember(grosse, `Weber billing note ${i} — the standing quarterly rhythm for the Weber file`, ["weber", "billing"]);
      const total = (await recall(grosse, "weber billing")).total;
      expect(total).toBeGreaterThan(5);
      const { aus } = await funkt(grosse, "recall", ["weber", "billing"]);
      const kopf = aus.split("\n").find((z) => z.includes("ranked by relevance"));
      expect(kopf).toBe(`showing 5 of ${total} matches — ranked by relevance`);
    } finally {
      grosse.close();
    }
  });
});

// T-15 (A6-15): Das Terminal endete bei „k-mv0x… ↔ k-mv0y…" — zwei Kennungen,
// die niemand liest, und einem Werkzeug, das nur im KI-Klienten läuft.
describe("contradict: lesbar, was da durcheinandergerät", () => {
  it("zeigt Titel statt nackter Kennungen und sagt ehrlich, dass nichts geändert wurde", async () => {
    remember(store, "The production server is Hetzner CX42.", ["infra"]);
    remember(store, "The production server is Hetzner CX42.", ["infra"]);
    const { aus } = await funkt(store, "contradict");
    expect(aus).toContain('"The production server is Hetzner CX42."');
    expect(aus).not.toMatch(/^ {2}k-[0-9a-z]+/m);
    expect(aus).toContain("memory_consolidate");
    // D2-13: „Nothing was changed" und der Fußsatz mit dem „yet" sind zu einer
    // Kopfzeile geworden — der Kopf sagt, dass nichts geändert wurde.
    expect(aus).toMatch(/dry-run, nothing changed/);
    // A6-28: „1 candidates" — die Zahl und das Wort müssen zusammenpassen.
    expect(aus).toContain("1 candidate — dry-run");
  });

  it("schneidet nicht still ab: wenn mehr Kandidaten da sind als gezeigt werden, steht die Zahl da", async () => {
    for (let i = 0; i < 7; i++) remember(store, "The production server is Hetzner CX42 in Nuremberg.", ["infra"]);
    const { anzahl } = await contradict(store);
    expect(anzahl).toBeGreaterThan(20);
    const { aus } = await funkt(store, "contradict");
    expect(aus.split("\n").filter((z) => z.includes("↔")).length).toBe(20);
    expect(aus).toContain(`${anzahl - 20} more not listed`);
  });
});
