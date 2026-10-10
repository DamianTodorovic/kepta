// Der ChatGPT-Import-Befehl: was ein Mensch sieht, wenn der Import ablehnt oder
// nichts findet. Zwei gemessene Fallen (A6-05/A6-06, in der Triage B-05/B-06):
// die Pfadwache meldete ihr Verbot auf Englisch und ohne Ausweg, und ein Export
// im falschen Format zählte „0 Memories" und ging mit Exit 0 raus.
import { describe, it, expect, beforeEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { KeptaStore } from "../src/core/store";
import { importChatgptKommando } from "../src/core/chatgpt-import";

let store: KeptaStore;
let dir: string;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "kepta-f5-import-"));
  store = new KeptaStore(path.join(dir, "t.db"));
});

/** stdout und stderr getrennt abgreifen — der Nutzer liest beides in einem Terminal. */
function funkt(argumente: string[]) {
  const aus: string[] = [];
  const fehl: string[] = [];
  const original = { log: console.log, error: console.error };
  console.log = (...a: unknown[]) => { aus.push(a.map(String).join(" ")); };
  console.error = (...a: unknown[]) => { fehl.push(a.map(String).join(" ")); };
  try {
    return { code: importChatgptKommando(store, argumente), aus: aus.join("\n"), fehl: fehl.join("\n") };
  } finally {
    console.log = original.log;
    console.error = original.error;
  }
}

/** Ein ChatGPT-Export der alten Form: „author" ist ein Wort, kein Objekt mit „role". */
function exportAltFormat(ordner: string): string {
  fs.mkdirSync(ordner, { recursive: true });
  const konversation = [
    {
      conversation_id: "conv-1",
      title: "Küchenumbau",
      mapping: {
        a: { id: "a", message: { id: "a", author: "user", create_time: 1700000000, content: { content_type: "multitext", parts: ["Der Küchenumbau kostet 18000 Euro."] } } },
        b: { id: "b", message: { id: "b", author: "assistant", create_time: 1700000005, content: { content_type: "multitext", parts: ["Notiert."] } } },
      },
    },
  ];
  const p = path.join(ordner, "conversations.json");
  fs.writeFileSync(p, JSON.stringify(konversation));
  return ordner;
}

describe("import chatgpt: die Absage mit Tat", () => {
  // D2-25, von Damian entschieden 10.10.: ein Terminal, eine Sprache — Englisch.
  // `kepta-mcp` geht an npm an ein internationales Publikum, und die ganze
  // übrige Fläche (Hilfe, Werkzeuge, README) ist englisch. Deutsch bleibt, wo ein
  // Mensch es wählt: README.de.md.
  it("lehnt einen Ort ausserhalb von Home und System-Temp ab, nennt beide erlaubten Pfade und den Ausweg", () => {
    const draussen = path.join("/Library", "Application Support", "kepta-f5-draussen", "export");
    const { code, fehl } = funkt(["chatgpt", draussen]);
    expect(code).not.toBe(0);
    expect(fehl).not.toContain("Only import from");
    expect(fehl).toContain("KEPTA reads only your home folder");
    expect(fehl).toContain(os.homedir());
    expect(fehl).toContain(os.tmpdir());
    expect(fehl).toContain("Downloads");
    expect(fehl).toContain(draussen);
  });

  it("spricht in einem Durchgang Englisch — kein deutsches Wort in der Ausgabe", () => {
    const { fehl, aus } = funkt(["chatgpt", path.join("/Volumes", "fremde-platte", "export")]);
    const text = `${aus}\n${fehl}`;
    expect(text).toMatch(/copy the export/);
    expect(text).toMatch(/run the command again/);
    expect(ohneUmlaute(text), `deutsche Sätze im englischen Terminal: ${text}`).toBe(true);
  });

  // R2: die Absage war 180 Zeichen auf einer Zeile.
  it("keine Zeile des Befehls ist länger als 80 Zeichen", () => {
    const ordner = exportAltFormat(path.join(dir, "alt"));
    const { fehl, aus } = funkt(["chatgpt", ordner]);
    for (const z of `${aus}\n${fehl}`.split("\n")) {
      expect([...z].length, `länger als 80: ${z}`).toBeLessThanOrEqual(80);
    }
  });
});

/** Ein Satz ohne ein einziges Zeichen, das nur im Deutschen vorkommt. */
function ohneUmlaute(text: string): boolean {
  return !/[äöüßÄÖÜ]/.test(text);
}

describe("import chatgpt: null ist kein Erfolg", () => {
  it("meldet einen Export im falschen Format nicht als Erfolg: Exit ungleich 0, Grund und --dry-run", () => {
    const ordner = exportAltFormat(path.join(dir, "alt"));
    const { code, aus, fehl } = funkt(["chatgpt", ordner]);
    expect(code).not.toBe(0);
    expect(aus).toContain("memories: 0 new · 0 updated · 0 unchanged");
    expect(fehl).toContain("no note stored");
    expect(fehl).toMatch(/export format/);
    expect(fehl).toContain("--dry-run");
    expect(ohneUmlaute(`${aus}\n${fehl}`), "deutscher Satz im englischen Befehl").toBe(true);
  });

  it("ein Import, der wirklich etwas gespeichert hat, bleibt bei Exit 0", () => {
    const ordner = path.join(dir, "neu");
    fs.mkdirSync(ordner);
    fs.writeFileSync(
      path.join(ordner, "conversations.json"),
      JSON.stringify([
        {
          conversation_id: "conv-2",
          title: "Billing",
          mapping: {
            a: { id: "a", message: { id: "a", author: { role: "user" }, create_time: 1700000000, content: { content_type: "text", parts: ["Weber is billed quarterly, never monthly."] } } },
          },
        },
      ])
    );
    expect(funkt(["chatgpt", ordner]).code).toBe(0);
    expect(store.getMemory("chatgpt:conv-2:a")).not.toBeNull();
  });
});
