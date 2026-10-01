// ChatGPT-Import-Tests: Parser (Mapping-Baum → geordnete Nachrichten), Extraktion
// (nur user, deterministische IDs, Zeitstempel Sekunden→ms), Idempotenz (Re-Import
// skipped statt verdoppelt) und die CLI (ZIP-Hinweis, Ordner-Auflösung, dry-run).
import { describe, it, expect, beforeEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { KeptaStore } from "../../src/core/store";
import { importChatgptExport, importChatgptKommando, userNachrichtZuMemory } from "../../src/core/chatgpt-import";

type Node = {
  message?: { id?: string; author?: { role?: string }; create_time?: number | null; content?: { content_type?: string; parts?: unknown[] } } | null;
};

/** Ein Mapping-Knoten im ChatGPT-Export-Format. */
function node(id: string, rolle: string | null, text: string | null, zeit: number | null, teile?: unknown[]): { id: string; message: Node["message"] } {
  return {
    id,
    message: rolle === null
      ? null
      : {
          id,
          author: { role: rolle },
          create_time: zeit,
          content: { content_type: "text", parts: teile ?? [text] },
        },
  };
}

/** Ein kleines, vollständiges Gespräch: system-Wurzel, user (ok), assistant, user (zu kurz). */
function gespräch(overrides: Record<string, Node> = {}): Record<string, Node> {
  return {
    root: node("root", "system", null, null),
    a: node("a", "user", "I prefer dark mode in every editor I use.", 1700000000),
    b: node("b", "assistant", "Noted — I will keep that in mind.", 1700000005),
    c: node("c", "user", "Thanks!", 1700000010),
    ...overrides,
  };
}

function exportDatei(dir: string, mapping: Record<string, Node>, titel = "Editor preferences", id = "conv-1"): string {
  const p = path.join(dir, `conversations-${id}.json`);
  fs.writeFileSync(p, JSON.stringify([{ conversation_id: id, title: titel, create_time: 1700000000, mapping }]));
  return p;
}

describe("ChatGPT-Import", () => {
  let store: KeptaStore;
  let dir: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "kepta-chatgpt-"));
    store = new KeptaStore(path.join(dir, "test.db"));
  });

  it("extrahiert nur user-Nachrichten als Memories, mit deterministischer ID und Sekunden→ms", () => {
    const z = importChatgptExport(store, [{ conversation_id: "conv-1", title: "Editor preferences", create_time: 1700000000, mapping: gespräch() }]);
    expect(z.imported).toBe(1);
    expect(z.assistantUebersprungen).toBe(1);
    expect(z.zuKurz).toBe(1);

    const m = store.getMemory("chatgpt:conv-1:a");
    expect(m).not.toBeNull();
    expect(m!.title).toBe("I prefer dark mode in every editor I use.");
    expect(m!.content).toContain("dark mode");
    expect(m!.validFrom).toBe(1_700_000_000_000);
    expect(m!.createdAt).toBe(1_700_000_000_000);
    expect(m!.confidence).toBe(0.7);
    expect(m!.tags).toContain("chatgpt-import");
    // Der Store-Klassifikator entscheidet den Typ — hier keine Degradierung zu „Fakt".
    expect(["semantic", "episodic", "procedural", "reference"]).toContain(m!.type);
  });

  it("ist idempotent: derselbe Export zweimal importiert → zweiter Lauf skipped", () => {
    const daten = [{ conversation_id: "conv-1", title: "T", create_time: 1700000000, mapping: gespräch() }];
    const erst = importChatgptExport(store, daten);
    expect(erst.imported).toBe(1);
    const zweit = importChatgptExport(store, daten);
    expect(zweit.imported).toBe(0);
    expect(zweit.updated).toBe(0);
    expect(zweit.skipped).toBe(1);
  });

  it("aktualisiert statt verdoppelt, wenn sich die Nachricht geändert hat", () => {
    const mapping = gespräch();
    const daten = [{ conversation_id: "conv-1", title: "T", create_time: 1700000000, mapping }];
    importChatgptExport(store, daten);
    mapping.a = node("a", "user", "I prefer light mode in every editor I use.", 1700000000);
    const z = importChatgptExport(store, daten);
    expect(z.updated).toBe(1);
    expect(store.getMemory("chatgpt:conv-1:a")!.content).toContain("light mode");
  });

  it("filtert Nicht-Text-Parts und joint mehrteilige Texte", () => {
    const mapping = { a: node("a", "user", null, 1700000000, ["Part one.", { type: "image" }, "Part two."]) };
    const z = importChatgptExport(store, [{ conversation_id: "conv-1", title: "T", mapping }]);
    expect(z.imported).toBe(1);
    expect(store.getMemory("chatgpt:conv-1:a")!.content).toBe("Part one.\nPart two.");
  });

  it("userNachrichtZuMemory: kurze Nachrichten → null; Titel kommt aus der ersten Zeile, ohne Markdown-Rauschen", () => {
    expect(userNachrichtZuMemory({ konversationsId: "c", nodeId: "n", text: "ok", zeitSekunden: 1 }, "T")).toBeNull();
    const input = userNachrichtZuMemory({ konversationsId: "c", nodeId: "n", text: "## Remember: deploy on Fridays only\nRest of the text.", zeitSekunden: 1700000123 }, "T")!;
    expect(input.title).toBe("Remember: deploy on Fridays only");
    expect(input.content).toContain("Rest of the text.");
  });

  describe("Kommandozeile", () => {
    it("liest conversations.json aus einem Ordner und schreibt Memories (Exit 0)", () => {
      const ordner = path.join(dir, "export");
      fs.mkdirSync(ordner);
      fs.writeFileSync(path.join(ordner, "conversations.json"), JSON.stringify([{ conversation_id: "conv-1", title: "T", mapping: gespräch() }]));
      const code = importChatgptKommando(store, ["chatgpt", ordner]);
      expect(code).toBe(0);
      expect(store.getMemory("chatgpt:conv-1:a")).not.toBeNull();
    });

    it("unbekannte Import-Quelle → Exit 2", () => {
      expect(importChatgptKommando(store, ["claude", dir])).toBe(2);
    });

    it("verweigert ZIPs mit Entpack-Hinweis (Exit 2, ohne Import)", () => {
      const zip = path.join(dir, "export.zip");
      fs.writeFileSync(zip, "PK-fake");
      const code = importChatgptKommando(store, [zip]);
      expect(code).toBe(2);
      expect(store.listMemories?.() ?? []).toHaveLength(0);
    });

    it("dry-run zählt, speichert aber nichts", () => {
      const p = exportDatei(dir, gespräch());
      const code = importChatgptKommando(store, [p, "--dry-run"]);
      expect(code).toBe(0);
      expect(store.getMemory("chatgpt:conv-1:a")).toBeNull();
    });

    it("kaputtes JSON → Exit 2 mit Meldung, kein Crash", () => {
      const p = path.join(dir, "broken.json");
      fs.writeFileSync(p, "{nicht json");
      expect(importChatgptKommando(store, [p])).toBe(2);
    });
  });
});
