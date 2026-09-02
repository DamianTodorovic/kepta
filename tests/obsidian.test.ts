import { describe, it, expect, beforeEach } from "vitest";
import { tmpdir } from "node:os";
import path from "node:path";
import fs from "node:fs";
import { KeptaStore } from "../src/core/store";
import { memoryToMarkdown, importMarkdownFile, importObsidianVault, parseFrontmatter } from "../src/core/obsidian";

function freshStore(): KeptaStore {
  const dir = fs.mkdtempSync(path.join(tmpdir(), "kepta-obsidian-"));
  return new KeptaStore(path.join(dir, "test.db"));
}

describe("Frontmatter-Parser", () => {
  it("parst Metadaten und trennt den Body", () => {
    const { meta, body, hasFrontmatter } = parseFrontmatter(
      "---\ntitle: Docker Setup\ntags: [rust, ops]\ntype: procedural\nconfidence: 0.8\n---\n\nInhalt hier"
    );
    expect(hasFrontmatter).toBe(true);
    expect(meta.title).toBe("Docker Setup");
    expect(meta.tags).toEqual(["rust", "ops"]);
    expect(meta.type).toBe("procedural");
    expect(meta.confidence).toBe(0.8);
    expect(body).toContain("Inhalt hier");
  });

  it("unterstützt Block-Listen und ISO-Daten", () => {
    const { meta } = parseFrontmatter("---\ntags:\n  - a\n  - b\nvalid_to: 2026-12-31T23:59:59.000Z\n---\nx");
    expect(meta.tags).toEqual(["a", "b"]);
    expect(typeof meta.valid_to).toBe("string");
  });

  it("Notizen ohne Frontmatter liefern reinen Body", () => {
    const res = parseFrontmatter("nur text");
    expect(res.hasFrontmatter).toBe(false);
    expect(res.body).toBe("nur text");
  });
});

describe("Roundtrip Export → Import", () => {
  let store: KeptaStore;
  beforeEach(() => {
    store = freshStore();
  });

  it("bewahrt Titel, Tags, Typ, Gültigkeit und Inhalt", () => {
    const created = store.createMemory({
      title: "Server: Setup (2026)",
      content: "Wichtig: [[Nginx]] und Postgres",
      tags: ["ops", "server"],
      type: "procedural",
      confidence: 0.9,
      validTo: Date.parse("2027-01-01"),
    });
    const { filename, markdown } = memoryToMarkdown(created);
    expect(filename).toBe("Server Setup (2026).md");

    const other = freshStore();
    const res = importMarkdownFile(other, { name: filename, content: markdown });
    expect(res.status).toBe("imported");
    const back = res.record;
    expect(back.title).toBe("Server: Setup (2026)");
    expect(back.tags).toEqual(["ops", "server"]);
    expect(back.type).toBe("procedural");
    expect(back.confidence).toBeCloseTo(0.9);
    expect(back.validTo).toBe(created.validTo);
    expect(back.content).toContain("[[Nginx]]");
    expect(back.id).toBe(created.id); // kepta_id bleibt stabil
  });

  it("importiert echte Obsidian-Notiz mit Wiki-Links als Entitäten+Relationen", () => {
    const res = importMarkdownFile(store, {
      name: "Projekt KEPTA.md",
      content: "---\ntags: [projekt]\n---\n\nDas Gehirn für Agenten, gebaut mit [[Rust]] und [[SQLite]].",
    });
    expect(res.status).toBe("imported");

    const g = store.getGraph("rust", 2);
    expect(g.entities.map((e) => e.name)).toContain("projekt kepta");
    const relations = g.relations.map((r) => r.relation);
    expect(relations).toContain("references");
  });

  it("Notiz ohne Frontmatter: Titel aus Dateiname", () => {
    const res = importMarkdownFile(store, { name: "Einkaufsliste.md", content: "Milch, Brot" });
    expect(res.record.title).toBe("Einkaufsliste");
    expect(res.record.content).toBe("Milch, Brot");
  });

  it("Batch-Import zählt imported/updated/skipped korrekt", () => {
    const files = [
      { name: "a.md", content: "Inhalt A" },
      { name: "b.md", content: "---\ntitle: B\n---\nInhalt B" },
      { name: "empty.md", content: "   " },
    ];
    const first = importObsidianVault(store, files);
    expect(first.imported).toBe(2);
    expect(first.skipped).toBe(1);
    const second = importObsidianVault(store, files);
    expect(second.imported).toBe(0);
  });

  it("Re-Import unveränderter Dateien zählt als updated", () => {
    const files = [{ name: "wieder.md", content: "---\ntitle: Wieder\n---\nInhalt" }];
    expect(importObsidianVault(store, files).imported).toBe(1);
    const again = importObsidianVault(store, files);
    expect(again.updated).toBe(1);
    expect(again.imported).toBe(0);
  });

  it("fängt Fehler pro Datei ab und sammelt sie in errors", () => {
    // Erzwingt einen Fehler in importMarkdownFile über einen werfenden upsertMemory-Stub.
    const original = store.upsertMemory.bind(store);
    let calls = 0;
    store.upsertMemory = ((input: never) => {
      calls++;
      if (calls === 1) throw new Error("Simulierter DB-Fehler");
      return original(input);
    }) as typeof store.upsertMemory;
    const files = [
      { name: "kaputt.md", content: "Inhalt der kracht" },
      { name: "heil.md", content: "Inhalt der klappt" },
    ];
    const res = importObsidianVault(store, files);
    expect(res.errors.length).toBe(1);
    expect(res.errors[0]).toContain("kaputt.md");
    expect(res.skipped).toBeGreaterThanOrEqual(1);
    expect(res.imported).toBe(1); // die heile Datei kommt durch
    // Stub zurücksetzen
    store.upsertMemory = original;
  });
});
