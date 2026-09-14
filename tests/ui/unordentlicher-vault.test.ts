// @vitest-environment node
//
// Ein unordentlicher Obsidian-Vault, wie er wirklich aussieht: Ordnerpfade,
// YAML-Köpfe, Vorlagen mit {{date}} und <% %>, Callouts, Tabellen, HTML-Reste,
// Kommentare und Slugs als Dateinamen. Bis 2.11 stand all das roh in KEPTA
// Core — der ganze Vault landete als „Fakt“, jede Karte zeigte Rauten, „---“
// und Ordnerpfade. Dieser Test hält fest, dass die Oberfläche damit sauber
// aussieht und dass sich alte Bestände mit einem Klick neu einordnen lassen.
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import http from "node:http";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { KeptaStore } from "../../src/core/store";
import { importObsidianVault } from "../../src/core/obsidian";
import { starteOberflaeche, type Oberflaeche } from "../../src/ui/server";

const VAULT = [
  {
    name: "Projekte/Atlas/kickoff-atlas.md",
    content: [
      "---",
      "tags: [atlas, meeting]",
      "date: 2026-09-01",
      "status: done",
      "---",
      "# Kickoff Projekt Atlas",
      "",
      "> [!info] Dabei",
      "> Mara, Jonas, **Lea**",
      "",
      "Am Montag haben wir besprochen, dass der Relaunch im Oktober startet. Siehe [[Lumen & Co.|Lumen]].",
      "",
      "| Aufgabe | Wer |",
      "|---|---|",
      "| Staging aufsetzen | Jonas |",
      "| Texte | Lea |",
    ].join("\n"),
  },
  { name: "Anleitungen/drucker_einrichten.md", content: "# Drucker einrichten\n\n1. Kabel anschliessen\n2. Treiber laden\n3. Testseite drucken\n" },
  { name: "Templates/Daily Note.md", content: '---\ntitle: "{{date:YYYY-MM-DD}}"\ntags: [daily]\n---\n# {{date:dddd, D. MMMM}}\n\n## Heute\n- [ ] \n\n## Notizen\n<% tp.file.cursor() %>\n' },
  { name: "Inbox/2026-09-12 Telefonat mit Lumen.md", content: "Heute um 14 Uhr mit Mara von Lumen telefoniert. Sie wollen das Angebot bis Freitag.\n\n#lumen #telefonat\n" },
  { name: "Ressourcen/Rezepte/pasta-carbonara.md", content: '<div align="center"><img src="bild.png"></div>\n\n**Zutaten:** Spaghetti, Guanciale, Eier<br>Pecorino &amp; Pfeffer\n\n![[foto.jpg]]\n\n- [x] einkaufen\n- [ ] kochen\n' },
  { name: "Notizen/Glossar.md", content: "%%Entwurf, noch nicht fertig%%\nFreeze = keine Feature-Merges.\n\n```bash\nnpm run build\n```\n" },
];

let store: KeptaStore;
let ui: Oberflaeche;

beforeEach(async () => {
  store = new KeptaStore(path.join(fs.mkdtempSync(path.join(os.tmpdir(), "kepta-vault-")), "t.db"));
  ui = await starteOberflaeche(store, { port: 0 });
});
afterEach(async () => {
  await ui.close();
  store.close();
});

function anfrage(methode: string, pfad: string, opt: { body?: unknown; ohneToken?: boolean } = {}): Promise<{ status: number; json: any }> {
  return new Promise((ok, fail) => {
    const body = opt.body !== undefined ? JSON.stringify(opt.body) : undefined;
    const headers: Record<string, string> = {
      host: `127.0.0.1:${ui.port}`,
      ...(body !== undefined ? { "content-type": "application/json" } : {}),
      ...(methode !== "GET" && !opt.ohneToken ? { "x-kepta-token": ui.token } : {}),
    };
    const r = http.request({ host: "127.0.0.1", port: ui.port, method: methode, path: pfad, headers }, (res) => {
      let text = "";
      res.setEncoding("utf8");
      res.on("data", (c) => (text += c));
      res.on("end", () => ok({ status: res.statusCode!, json: JSON.parse(text) }));
    });
    r.on("error", fail);
    if (body !== undefined) r.write(body);
    r.end();
  });
}

const ROH = ["---", "**", "[[", "]]", "{{", "}}", "<%", "%>", "<div", "<img", "<br", "&amp;", "%%", "```", "|", "- [", "![", "]("];

describe("ein unordentlicher Vault in KEPTA Core", () => {
  it("jede Karte hat einen lesbaren Titel und eine Vorschau ohne Markdown-, YAML- und Vorlagen-Reste", async () => {
    expect(importObsidianVault(store, VAULT)).toMatchObject({ imported: VAULT.length, errors: [] });
    const { notes } = (await anfrage("GET", "/api/notes?limit=200")).json;
    const titel = Object.fromEntries(notes.map((n: { displayTitle: string; preview: string; template: boolean }) => [n.displayTitle, n]));
    expect(Object.keys(titel).sort()).toEqual([
      "2026-09-12 Telefonat mit Lumen",
      "Daily Note",
      "Drucker einrichten",
      "Glossar",
      "Kickoff Projekt Atlas",
      "Pasta carbonara",
    ]);
    for (const n of notes) {
      for (const roh of ROH) expect(n.preview, `${n.displayTitle}: ${roh}`).not.toContain(roh);
      expect(n.preview, n.displayTitle).not.toMatch(/(^|\s)#{1,6}\s/);
      expect(n.displayTitle).not.toMatch(/\/|\.md$|\{\{|_/);
    }
    expect(titel["Daily Note"].template).toBe(true);
    expect(titel["Kickoff Projekt Atlas"].template).toBe(false);
    expect(titel["Pasta carbonara"].preview).toBe("Zutaten: Spaghetti, Guanciale, Eier Pecorino & Pfeffer einkaufen · kochen");
    expect(titel["Glossar"].preview).toBe("Freeze = keine Feature-Merges. npm run build");
  });

  it("ordnet die Wissensarten nach dem Inhalt ein — nicht mehr alles als Fakt", async () => {
    importObsidianVault(store, VAULT);
    const { notes } = (await anfrage("GET", "/api/notes?limit=200")).json;
    const art = Object.fromEntries(notes.map((n: { displayTitle: string; type: string }) => [n.displayTitle, n.type]));
    expect(art["Drucker einrichten"]).toBe("procedural");
    expect(new Set(Object.values(art)).size).toBeGreaterThan(1);
    // Ein ausdrücklicher Typ im Frontmatter gilt weiter.
    importObsidianVault(store, [{ name: "Fakt.md", content: "---\ntype: reference\n---\n1. eins\n2. zwei" }]);
    expect(store.findByTitle("Fakt")?.type).toBe("reference");
  });

  it("die Detailansicht bekommt Callout und Tabelle als Baum — ohne die Überschrift doppelt", async () => {
    importObsidianVault(store, VAULT);
    const id = store.findByTitle("kickoff-atlas")!.id;
    const { note } = (await anfrage("GET", `/api/notes/${id}`)).json;
    expect(note.displayTitle).toBe("Kickoff Projekt Atlas");
    expect(note.body.map((b: { t: string }) => b.t)).toEqual(["quote", "p", "table"]);
    expect(note.body[0]).toMatchObject({ art: "info", titel: [{ t: "text", v: "Dabei" }] });
    expect(note.body[1].c).toContainEqual({ t: "wiki", ziel: "Lumen & Co.", v: "Lumen" });
  });

  it("Suchtreffer zeigen einen sauberen Ausschnitt und welche Begriffe passten", async () => {
    importObsidianVault(store, VAULT);
    const r = (await anfrage("GET", "/api/search?q=relaunch")).json;
    expect(r.hits[0].note.displayTitle).toBe("Kickoff Projekt Atlas");
    expect(r.hits[0].matchedTerms).toContain("relaunch");
    expect(r.hits[0].snippet).toContain("Relaunch");
    for (const roh of ROH) expect(r.hits[0].snippet).not.toContain(roh);
  });

  it("ein erneuter Import verdoppelt nichts — auch nicht Notizen mit dem alten Ordnerpfad als Titel", () => {
    store.createMemory({ title: "Anleitungen/drucker_einrichten", content: "alt" });
    expect(importObsidianVault(store, VAULT)).toMatchObject({ imported: VAULT.length - 1, updated: 1 });
    expect(store.countMemories().active).toBe(VAULT.length);
    expect(store.findByTitle("drucker_einrichten")?.content).toContain("Treiber laden");
    expect(importObsidianVault(store, VAULT)).toMatchObject({ imported: 0, updated: 0, skipped: VAULT.length });
  });

  it("ordnet alte „Fakten“ neu ein — mit Vorschau, einem Klick und einem zurück", async () => {
    const alt = store.createMemory({ title: "Backup einrichten", content: "1. Platte anschliessen\n2. Time Machine öffnen\n3. Jetzt sichern", type: "semantic", updatedAt: 1_700_000_000_000 });
    const vorschau = (await anfrage("GET", "/api/reclassify")).json;
    expect(vorschau).toMatchObject({ total: 1, changed: 1, before: { semantic: 1 }, after: { procedural: 1 }, into: { procedural: 1 } });
    expect(vorschau.examples).toEqual([{ title: "Backup einrichten", from: "semantic", to: "procedural" }]);
    expect(store.getMemory(alt.id)!.type).toBe("semantic");

    expect((await anfrage("POST", "/api/reclassify", { body: {}, ohneToken: true })).status).toBe(403);
    expect((await anfrage("POST", "/api/reclassify/undo", { body: {} })).status).toBe(409);
    expect((await anfrage("POST", "/api/reclassify", { body: {} })).json).toMatchObject({ changed: 1, applied: true, undo: true });
    // Das Änderungsdatum bleibt — die Notiz wurde ja nicht bearbeitet.
    expect(store.getMemory(alt.id)).toMatchObject({ type: "procedural", updatedAt: 1_700_000_000_000 });
    expect((await anfrage("GET", "/api/reclassify")).json.changed).toBe(0);

    expect((await anfrage("POST", "/api/reclassify/undo", { body: {} })).json).toEqual({ restored: 1 });
    expect(store.getMemory(alt.id)).toMatchObject({ type: "semantic", updatedAt: 1_700_000_000_000 });
    expect((await anfrage("POST", "/api/reclassify/undo", { body: {} })).status).toBe(409);
  });
});
