// D2-26 … D2-35 — die Agentenfläche ist ein Interface, kein Log. Ein Feldname in
// einer Beschreibung ist ein Vertrag (D2-26: `memory_forget` schrieb „valid_to",
// das Schema heisst `validTo` — ein Agent, der der Prosa folgt, schickt ein Feld,
// das es nicht gibt). Diese Wache hält die Sprache der acht Werkzeuge und ihrer
// Fehlerantworten auf demselben Niveau, das das Terminal seit E4 hat.
//
// Die drei bestehenden Verträge, die hier mitschwingen müssen, weil F1 sie gebaut
// hat: asOf nennt „epoch" + eine 13-stellige Zahl (mcp-asof), confirm nennt
// „supersede" (mcp-consolidate-bestaetigung), supersedeBy nennt „required"
// (mcp-forget-supersede).
import { describe, it, expect, beforeEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";
import { KeptaStore } from "../src/core/store";
import { TOOLS, handleRpc, type JsonRpcRequest } from "../src/core/mcp";

interface Schema {
  properties?: Record<string, { description?: string; default?: unknown; type?: unknown }>;
  required?: string[];
}
interface Werkzeug {
  name: string;
  title: string;
  description: string;
  inputSchema: Schema;
  outputSchema?: Schema;
  annotations?: { readOnlyHint?: boolean; destructiveHint?: boolean; idempotentHint?: boolean };
}

const werkzeuge = TOOLS as unknown as Werkzeug[];
const storePfad = path.join(fs.mkdtempSync(path.join(tmpdir(), "kepta-werkzeugtext-")), "t.db");

/** Alle Feldnamen, die in irgend einem Schema des Werkzeugs wirklich existieren. */
function feldnamen(w: Werkzeug): Set<string> {
  const namen = new Set<string>();
  for (const schema of [w.inputSchema, w.outputSchema]) {
    for (const key of Object.keys(schema?.properties ?? {})) namen.add(key);
    // verschachtelte Objekte (hits[], writeGate{}, duplicateWarning{})
    for (const feld of Object.values(schema?.properties ?? {})) {
      const inner = feld as { properties?: Record<string, unknown>; items?: { properties?: Record<string, unknown> } };
      for (const key of Object.keys(inner.properties ?? {})) namen.add(key);
      for (const key of Object.keys(inner.items?.properties ?? {})) namen.add(key);
    }
  }
  return namen;
}

describe("Feldnamen in Prosa sind Verträge (D2-26)", () => {
  it("keine Beschreibung nennt ein snake_case-Feld, das kein Schema hat", () => {
    const werknamen = new Set(werkzeuge.map((w) => w.name));
    for (const w of werkzeuge) {
      // Nur Felder sind gemeint, keine Werkzeugnamen: memory_consolidate schreibt
      // sich mit Unterstrich und ist trotzdem richtig.
      const funde = [...w.description.matchAll(/\b[a-z]+_[a-z_]+\b/g)]
        .map((m) => m[0])
        .filter((t) => !werknamen.has(t));
      expect(funde, `${w.name}: Prosafelder, die kein Agent schicken kann: ${funde.join(", ")}`).toEqual([]);
    }
  });

  it("jedes CamelCase-Wort in einer Beschreibung existiert wirklich in einem Schema", () => {
    const alle = new Set<string>();
    for (const w of werkzeuge) for (const n of feldnamen(w)) alle.add(n);
    const erlaubnis = new Set(["kepta"]);
    for (const w of werkzeuge) {
      const genannten = [...w.description.matchAll(/\b[a-z]+[A-Z][a-zA-Z]*/g)]
        .map((m) => m[0])
        .filter((t) => !erlaubnis.has(t) && t !== "superseded" && t !== "structured");
      for (const feld of genannten) {
        expect(alle.has(feld), `${w.name}: Beschreibung nennt "${feld}" — das Feld gibt es in keinem Schema`).toBe(true);
      }
    }
  });
});

describe("Acht Beschreibungen, ein Skelett (D2-27, D2-28)", () => {
  it("jedes Feld in jedem inputSchema hat einen eigenen Text", () => {
    const ohne: string[] = [];
    for (const w of werkzeuge) {
      for (const [feld, schema] of Object.entries(w.inputSchema.properties ?? {})) {
        if (!(`${schema.description ?? ""}`.trim().length > 0)) ohne.push(`${w.name}.${feld}`);
      }
    }
    expect(ohne, `Felder ohne Beschreibung: ${ohne.join(", ")}`).toEqual([]);
  });

  it("Titel und Länge folgen der Kanon-Form", () => {
    const erwartet: Record<string, string> = {
      memory_search: "Search memory",
      memory_save: "Save memory",
      memory_update: "Update memory",
      memory_delete: "Delete memory",
      memory_list: "List memories",
      memory_graph: "Read graph",
      memory_consolidate: "Consolidate memories",
      memory_forget: "Invalidate memory",
    };
    for (const w of werkzeuge) {
      expect(w.title, `${w.name}: Titel`).toBe(erwartet[w.name]);
      expect([...w.description].length, `${w.name}: ${[...w.description].length} Zeichen — Zielband 120 bis 180`).toBeGreaterThanOrEqual(120);
      expect([...w.description].length, `${w.name}: ${[...w.description].length} Zeichen — Zielband 120 bis 180`).toBeLessThanOrEqual(180);
    }
  });

  it("jede Beschreibung sagt, was zurückkommt, und jede schreibende nennt den Weg zurück", () => {
    const lesende = ["memory_search", "memory_list", "memory_graph"];
    for (const w of werkzeuge) {
      expect(w.description, `${w.name}: kein Wort darüber, was zurückkommt`).toMatch(/returns|lists|reports|gives|answers|shows/i);
      if (!lesende.includes(w.name)) {
        expect(w.description, `${w.name}: schreibt, nennt aber keinen Weg zurück`).toMatch(/undo|supersededBy|memory_list|trash|dryRun|confirm/i);
      }
    }
  });

  it("save und update weisen aufeinander — ein Agent wählt sonst das Erste, was er findet (D2-35)", () => {
    const save = werkzeuge.find((w) => w.name === "memory_save")!;
    const update = werkzeuge.find((w) => w.name === "memory_update")!;
    expect(save.description).toMatch(/memory_update/);
    expect(update.description).toMatch(/memory_save/);
  });

  it("memory_search warnt vor dem leeren Treffer, der kein leerer Speicher ist (D2-33)", () => {
    expect(werkzeuge.find((w) => w.name === "memory_search")!.description).toMatch(/index|shortly after|re-run/i);
  });
});

describe("Zahlenfelder sprechen dieselbe Sprache (D2-34)", () => {
  it("jeder Epoch-Wert nennt ein Beispiel, confidence nennt die Richtung", () => {
    for (const w of werkzeuge) {
      for (const [feld, schema] of Object.entries(w.inputSchema.properties ?? {})) {
        const text = `${schema.description ?? ""}`;
        if (/(epoch|milliseconds|time|date|valid)/i.test(feld) && /integer/.test(`${schema.type}`)) {
          expect(text, `${w.name}.${feld}: kein Beispiel, das ein Agent abschreiben kann`).toMatch(/\d{13}/);
        }
        if (feld === "confidence") expect(text, `${w.name}.confidence: keine Richtung`).toMatch(/0 *=.*1 *=/);
        expect(text, `${w.name}.${feld}: default gehört ins Schema, nicht in den Text`).not.toMatch(/\bdefault\b/i);
      }
    }
  });

  it("limit hat in search und list dieselbe Grenze im Text", () => {
    const such = `${werkzeuge.find((w) => w.name === "memory_search")!.inputSchema.properties?.limit?.description ?? ""}`;
    const list = `${werkzeuge.find((w) => w.name === "memory_list")!.inputSchema.properties?.limit?.description ?? ""}`;
    expect(such).toMatch(/1-100/);
    expect(list).toMatch(/1-200/);
  });
});

describe("Annotations: ein Client sieht die Klasse, ohne Prosa zu lesen (D2-30)", () => {
  it("alle acht tragen readOnlyHint, delete trägt destructiveHint", () => {
    const lesende = ["memory_search", "memory_list", "memory_graph"];
    for (const w of werkzeuge) {
      expect(w.annotations, `${w.name}: keine annotations — ein Client kann löschen nicht von lesen unterscheiden`).toBeTruthy();
      expect(w.annotations!.readOnlyHint, `${w.name}: readOnlyHint`).toBe(lesende.includes(w.name));
    }
    expect(werkzeuge.find((w) => w.name === "memory_delete")!.annotations!.destructiveHint).toBe(true);
    expect(werkzeuge.find((w) => w.name === "memory_save")!.annotations!.destructiveHint).toBe(false);
  });
});

describe("Ein Agent bekommt dieselbe Höflichkeit wie ein Mensch (D2-31)", () => {
  let laden: KeptaStore;
  beforeEach(() => {
    laden = new KeptaStore(storePfad);
  });

  async function ruf(name: string, args: Record<string, unknown>): Promise<{ text: string; isError?: boolean; struktur?: Record<string, unknown> }> {
    const req: JsonRpcRequest = { jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } };
    const res = await handleRpc({ store: laden, transport: "stdio" }, req);
    if (!res || !("result" in res)) throw new Error("Erwartete Ergebnis-Antwort");
    const inhalt = res.result as unknown as { content: { text: string }[]; isError?: boolean; structuredContent?: Record<string, unknown> };
    return { text: inhalt.content[0]?.text ?? "", isError: inhalt.isError, struktur: inhalt.structuredContent };
  }

  it("ein naher Tippfall bekommt den nächsten Namen, ein erdachter bekommt die Liste", async () => {
    // two cases, nicht einer: „memory_sav" ist ein Versehen, das man geraten kann;
    // „memory_gibtsnicht" ist Fantasie — da hilft nur die volle Liste.
    const vertipst = await ruf("memory_sav", {});
    expect(vertipst.isError).toBe(true);
    expect(vertipst.text).toMatch(/Unknown tool: memory_sav/);
    expect(vertipst.text, vertipst.text).toMatch(/Closest: memory_save/);
    expect(vertipst.text).toMatch(/Tools:/);

    const erfunden = await ruf("memory_gibtsnicht", {});
    expect(erfunden.text).toMatch(/Unknown tool: memory_gibtsnicht/);
    for (const name of ["memory_search", "memory_save", "memory_forget"]) {
      expect(erfunden.text, `die Liste nennt ${name} nicht`).toContain(name);
    }
  });

  it("jede Fehlerantwort sagt, was scheiterte, warum und was jetzt", async () => {
    const res = await ruf("memory_delete", { id: "gibt-es-nie" });
    expect(res.isError).toBe(true);
    expect(res.text).toMatch(/not found/i);
    expect(res.text, res.text).toMatch(/next:/);
    const suche = await ruf("memory_search", { query: "   " });
    expect(suche.text, suche.text).toMatch(/next:/);
  });

  it("ein Erfolgstext ist kompakt, nicht zweimal dasselbe Objekt", async () => {
    const res = await ruf("memory_save", { title: "Werkzeugtext-Notiz", content: "Inhalt für die Kompaktheit" });
    expect(res.text.includes("\n  \""), `Text ist weiterhin zweizeilig eingerückt:\n${res.text}`).toBe(false);
    // Kein willkürlicher Grenzwert: gemessen wird gegen dieselbe Struktur in
    // Eingrückung — D2-32 zählte +31 % Tokens genau deshalb.
    const eingerueckt = JSON.stringify(res.struktur, null, 2).length;
    expect(res.text.length, `kompakt (${res.text.length}) schlägt eingerückt (${eingerueckt}) nicht`).toBeLessThan(eingerueckt);
  });
});
