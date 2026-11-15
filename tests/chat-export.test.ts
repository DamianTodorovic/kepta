// @vitest-environment node
//
// KI-Verlauf-Import (src/lib/chat-export.ts): ChatGPT- und Claude-Exporte
// werden zu Markdown für die Obsidian-Pipeline. Der Parser liest nur bekannte
// Felder, überspringt Müll und bricht nie ab — ein kaputtes Gespräch darf nie
// den Rest blockieren.
import { describe, it, expect } from "vitest";
import { chatExportZuMarkdown, erkenneFormat } from "../src/lib/chat-export";

const CHATGPT_EXPORT = [
  {
    title: "Vierteljahresrechnung",
    create_time: 1709251200, // 2024-03-01
    update_time: 1709254800,
    current_node: "k3",
    mapping: {
      root: { parent: null, children: ["k1"] },
      k1: {
        parent: "root",
        children: ["k2"],
        message: { author: { role: "user" }, content: { content_type: "text", parts: ["Wie rechnet ich Vierteljahre ab?"] } },
      },
      k2: {
        parent: "k1",
        children: ["k3"],
        message: { author: { role: "assistant" }, content: { content_type: "text", parts: ["Pro Quartal: Umsatz × Stundensatz."] } },
      },
      k3: {
        parent: "k2",
        children: [],
        message: { author: { role: "user" }, content: { content_type: "text", parts: ["Und bei Ratezahlungen?"] } },
      },
      kSystem: {
        parent: "root",
        children: [],
        message: { author: { role: "system" }, content: { content_type: "text", parts: ["Du bist ein Assistent."] } },
      },
      kTool: {
        parent: "root",
        children: [],
        message: { author: { role: "tool" }, content: { content_type: "tool_use", parts: [] } },
      },
    },
  },
  // Zweites Gespräch mit anderem Titel, gleiches Datum — Titel dürfen kollidieren.
  {
    title: "Vierteljahresrechnung",
    create_time: 1709251200,
    current_node: "a2",
    mapping: {
      root: { parent: null, children: ["a1"] },
      a1: { parent: "root", children: ["a2"], message: { author: { role: "user" }, content: { content_type: "text", parts: ["Noch eine Frage"] } } },
      a2: { parent: "a1", children: [], message: { author: { role: "assistant" }, content: { content_type: "text", parts: ["Sichere Antwort."] } } },
    },
  },
];

const CLAUDE_EXPORT = [
  {
    uuid: "c1",
    name: "Umzugsplanung",
    created_at: "2026-01-15T10:00:00.000Z",
    updated_at: "2026-01-15T11:00:00.000Z",
    chat_messages: [
      { sender: "human", text: "Ich ziehe nach Berlin — was muss ich ummelden?" },
      { sender: "assistant", text: "Melde dich innerhalb von zwei Wochen um.", content: [{ type: "text", text: "Zusatz: Anmeldung beim Bürgeramt." }] },
    ],
  },
];

describe("erkenneFormat", () => {
  it("erkennt beide Export-Formate und lehnt Fremdes ab", () => {
    expect(erkenneFormat(CHATGPT_EXPORT)).toBe("chatgpt");
    expect(erkenneFormat(CLAUDE_EXPORT)).toBe("claude");
    expect(erkenneFormat([])).toBeNull();
    expect(erkenneFormat(null)).toBeNull();
    expect(erkenneFormat([{ foo: 1 }])).toBeNull();
    expect(erkenneFormat("kein array")).toBeNull();
  });
});

describe("chatExportZuMarkdown — ChatGPT", () => {
  const r = chatExportZuMarkdown(CHATGPT_EXPORT)!;

  it("liefert beide Gespräche als Markdown-Dateien", () => {
    expect(r).not.toBeNull();
    expect(r!.format).toBe("chatgpt");
    expect(r!.gespraeche).toBe(2);
    expect(r!.dateien).toHaveLength(2);
  });

  it("liest die Nachrichten in Reihenfolge, ohne System-/Werkzeugzeilen", () => {
    const inhalt = r!.dateien[0]!.content;
    expect(inhalt).toContain("**Q:** Wie rechnet ich Vierteljahre ab?");
    expect(inhalt).toContain("**A:** Pro Quartal");
    expect(inhalt).toContain("**Q:** Und bei Ratezahlungen?");
    expect(inhalt).not.toContain("Assistent.");
    expect(inhalt).not.toContain("tool_use");
  });

  it("setzt Frontmatter mit Titel, Tag und created — Titel sind eindeutig trotz gleichem Namen", () => {
    const [erste, zweite] = r!.dateien;
    expect(erste!.content).toContain('title: "Vierteljahresrechnung — 2024-03-01"');
    expect(erste!.content).toContain("tags: [chatgpt-import]");
    expect(erste!.content).toContain("created: 2024-03-01");
    expect(zweite!.content).not.toBe(erste!.content);
    expect(erste!.name).not.toBe(zweite!.name);
    expect(erste!.name).toMatch(/^chat-export\/2024-03-01-0000-Vierteljahresrechnung\.md$/);
  });

  it("kein Gespräch wird übersprungen", () => {
    expect(r!.uebersprungen).toBe(0);
  });
});

describe("chatExportZuMarkdown — Claude", () => {
  const r = chatExportZuMarkdown(CLAUDE_EXPORT)!;

  it("überführt name → Titel und human/assistant → Q/A, ohne Text-Doppel", () => {
    expect(r!.format).toBe("claude");
    expect(r!.gespraeche).toBe(1);
    const inhalt = r!.dateien[0]!.content;
    expect(inhalt).toContain('title: "Umzugsplanung — 2026-01-15"');
    expect(inhalt).toContain("**Q:** Ich ziehe nach Berlin");
    expect(inhalt).toContain("**A:** Melde dich");
    expect(inhalt).toContain("Anmeldung beim Bürgeramt.");
    // Der Text steht in .text UND content[].text — nur einmal aufnehmen:
    expect(inhalt.match(/Melde dich/g)).toHaveLength(1);
  });
});

describe("chatExportZuMarkdown — Müll und Grenzen", () => {
  it("überspringt einseitige und leere Gespräche, ohne zu werfen", () => {
    const r = chatExportZuMarkdown([
      { title: "nur frage", mapping: { root: { parent: null, children: ["f"] }, f: { parent: "root", children: [], message: { author: { role: "user" }, content: { content_type: "text", parts: ["Hallo?"] } } } } },
      null,
      "müll",
      { title: "leer", mapping: {} },
    ])!;
    expect(r!.gespraeche).toBe(0);
    expect(r!.uebersprungen).toBe(4);
    expect(r!.dateien).toHaveLength(0);
  });

  it("ohne erkennbares Format: null statt Exception", () => {
    expect(chatExportZuMarkdown({ kein: "export" })).toBeNull();
    expect(chatExportZuMarkdown(undefined)).toBeNull();
  });

  it("kappet überlange Beiträge", () => {
    const lang = "x".repeat(20000);
    const r = chatExportZuMarkdown([{
      title: "lang", create_time: 1709251200, current_node: "b2",
      mapping: {
        root: { parent: null, children: ["b1"] },
        b1: { parent: "root", children: ["b2"], message: { author: { role: "user" }, content: { content_type: "text", parts: ["frage"] } } },
        b2: { parent: "b1", children: [], message: { author: { role: "assistant" }, content: { content_type: "text", parts: [lang] } } },
      },
    }])!;
    expect(r!.dateien[0]!.content).toContain("…[gekürzt]");
    expect(r!.dateien[0]!.content.length).toBeLessThan(lang.length);
  });

  it("begrenzt die Gesprächszahl", () => {
    const viele = Array.from({ length: 10 }, (_, i) => ({
      title: `Chat ${i}`, create_time: 1709251200 + i, current_node: "b2",
      mapping: {
        root: { parent: null, children: ["b1"] },
        b1: { parent: "root", children: ["b2"], message: { author: { role: "user" }, content: { content_type: "text", parts: [`frage ${i}`] } } },
        b2: { parent: "b1", children: [], message: { author: { role: "assistant" }, content: { content_type: "text", parts: [`antwort ${i}`] } } },
      },
    }));
    const r = chatExportZuMarkdown(viele, { maxGespraeche: 3 })!;
    expect(r!.gespraeche).toBe(3);
    expect(r!.dateien).toHaveLength(3);
  });
});
