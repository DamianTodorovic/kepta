// @vitest-environment node
//
// Das Dossier: alles zu einer Person, einem Projekt oder Thema auf einer Seite
// — nach Art geordnet, ohne Fremdes, und als Markdown zum Weitergeben.
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { KeptaStore } from "../../src/core/store";
import { saveWithIndex } from "../../src/core/mcp";
import { dossier, dossierAlsMarkdown, kernsatz, vorschlaege } from "../../src/lib/dossier";

let store: KeptaStore;
const KICKOFF = Date.UTC(2026, 8, 1);

beforeEach(() => {
  store = new KeptaStore(path.join(fs.mkdtempSync(path.join(os.tmpdir(), "kepta-dossier-")), "t.db"));
  saveWithIndex(store, { title: "Atlas relaunch", content: "The Atlas relaunch starts in October. Budget approved by Lumen.", type: "semantic", tags: ["atlas", "lumen"] });
  saveWithIndex(store, { title: "Atlas kickoff", content: "Kickoff for Atlas with Mara and Jonas.\n\n- [ ] send the Atlas deck", type: "episodic", tags: ["atlas", "meeting"], validFrom: KICKOFF });
  saveWithIndex(store, { title: "Deploy Atlas", content: "1. Build the Atlas site\n2. Deploy it to staging", type: "procedural", tags: ["atlas"] });
  saveWithIndex(store, { title: "Atlas contract", content: "Framework contract for Atlas with Lumen & Co.", type: "reference", tags: ["contract"] });
  saveWithIndex(store, { title: "Pasta recipe", content: "Spaghetti, guanciale, eggs and pecorino.", type: "procedural", tags: ["cooking"] });
});
afterEach(() => store.close());

describe("Dossier", () => {
  it("sammelt alles zu einem Thema — nach Art geordnet, ohne Fremdes", async () => {
    const d = await dossier(store, "Atlas");
    expect(d.topic).toBe("Atlas");
    expect(d.total).toBe(4);
    expect(d.kinds).toEqual({ semantic: 1, episodic: 1, procedural: 1, reference: 1 });
    expect(d.facts.map((e) => [e.title, e.sentence])).toEqual([["Atlas relaunch", "The Atlas relaunch starts in October."]]);
    expect(d.timeline.map((e) => [e.title, e.at])).toEqual([["Atlas kickoff", KICKOFF]]);
    expect(d.howtos.map((e) => e.title)).toEqual(["Deploy Atlas"]);
    expect(d.documents.map((e) => e.title)).toEqual(["Atlas contract"]);
    expect(d.todos).toEqual([{ id: expect.any(String), title: "Atlas kickoff", text: "send the Atlas deck" }]);
    expect(d.related.map((r) => r.tag)).toEqual(expect.arrayContaining(["lumen", "meeting", "contract"]));
    expect(d.related.map((r) => r.tag)).not.toContain("atlas");
    expect(d.first).not.toBeNull();
  });

  it("als Markdown zum Weitergeben", async () => {
    const md = dossierAlsMarkdown(await dossier(store, "Atlas"), () => "1 Sep 2026");
    expect(md).toContain("# Dossier: Atlas");
    expect(md).toContain("_4 notes · 1 Sep 2026 – 1 Sep 2026_");
    expect(md).toContain("## Key points\n\n- **Atlas relaunch** — The Atlas relaunch starts in October.");
    expect(md).toContain("## Timeline\n\n- 1 Sep 2026 — **Atlas kickoff**");
    expect(md).toContain("## Open to-dos\n\n- [ ] send the Atlas deck _(Atlas kickoff)_");
    expect(md).toContain("Related: ");
  });

  it("ein unbekanntes Thema ist leer, ein leeres ein verständlicher Fehler", async () => {
    const d = await dossier(store, "Zebra");
    expect(d.total).toBe(0);
    expect(dossierAlsMarkdown(d)).toContain("_0 notes_");
    await expect(dossier(store, "   ")).rejects.toThrow("Tell K3PTA who or what the dossier is about.");
  });

  it("findet den Satz, der am meisten über das Thema sagt", () => {
    expect(kernsatz("---\ntitle: x\n---\n# Heading\nShort.\nThe **backup** runs nightly at two in the morning.", "backup")).toBe("The backup runs nightly at two in the morning.");
    expect(kernsatz("kurz")).toBe("kurz");
    expect(kernsatz("A".repeat(300)).length).toBeLessThanOrEqual(221);
  });

  it("schneidet Sätze nicht nach Abkürzungen ab", () => {
    // Die ersten drei Muster stammen aus dem Dossier zu „Lumen & Co.“ im Demo-Bestand.
    expect(kernsatz("The signed Lumen & Co. retainer is 4,500 EUR per quarter.", "lumen")).toBe("The signed Lumen & Co. retainer is 4,500 EUR per quarter.");
    expect(kernsatz("Leads [[Lumen & Co.]] and [[Veltmann Architects]]. Prefers short written updates.", "veltmann")).toBe("Leads Lumen & Co. and Veltmann Architects.");
    expect(kernsatz("Order: Brightwater, Nordwind and [[Lumen & Co.]]. Coordinated by Elena.", "nordwind")).toBe("Order: Brightwater, Nordwind and Lumen & Co.");
    expect(kernsatz("Termin mit Dr. Weiss am Montag, z. B. um zehn Uhr. Danach das Mittagessen.", "weiss")).toBe("Termin mit Dr. Weiss am Montag, z. B. um zehn Uhr.");
    expect(kernsatz("Wait for it... The backup runs at night.", "backup")).toBe("The backup runs at night.");
  });

  it("schlägt die größten Tags und Themen vor", () => {
    const v = vorschlaege(store);
    expect(v.tags[0]).toEqual({ name: "atlas", count: 3 });
    expect(Array.isArray(v.topics)).toBe(true);
  });
});
