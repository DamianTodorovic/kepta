// @vitest-environment node
//
// Widersprüche: zwei Notizen, die über dieselbe Sache Verschiedenes sagen.
// Gefunden werden soll, was wirklich nicht zusammenpasst — und nichts sonst.
import { describe, it, expect } from "vitest";
import { findeWidersprueche, paarSchluessel, zahl, type Pruefnotiz } from "../../src/lib/widersprueche";

const n = (id: string, content: string, over: Partial<Pruefnotiz> = {}): Pruefnotiz => ({ id, title: id.toUpperCase(), content, type: "semantic", updatedAt: 1000, ...over });

describe("Widersprüche", () => {
  it("findet eine andere Uhrzeit für dieselbe Sache — die neuere Notiz zuerst", () => {
    const w = findeWidersprueche([n("a", "Backups run nightly at 02:00.", { updatedAt: 1000 }), n("b", "Backups now run nightly at 03:00.", { updatedAt: 2000 })]);
    expect(w).toEqual([
      {
        key: "a|b",
        newer: { id: "b", title: "B", sentence: "Backups now run nightly at 03:00.", value: "03:00", updatedAt: 2000 },
        older: { id: "a", title: "A", sentence: "Backups run nightly at 02:00.", value: "02:00", updatedAt: 1000 },
        about: expect.stringContaining("backups"),
      },
    ]);
  });

  it("vergleicht Beträge, Daten, Mengen und Prozente in jeder Schreibweise", () => {
    expect(findeWidersprueche([n("a", "The license costs 1.200 € per year."), n("b", "The license costs 1500 EUR per year.")])).toHaveLength(1);
    expect(findeWidersprueche([n("a", "The license costs 1.200 € per year."), n("b", "The license costs 1200 EUR per year.")])).toEqual([]);
    expect(findeWidersprueche([n("a", "The contract with Lumen ends on 30.09.2027."), n("b", "The contract with Lumen ends on 2028-09-30.")])).toHaveLength(1);
    expect(findeWidersprueche([n("a", "Backups are kept for 30 days on the NAS."), n("b", "Backups are kept for 14 days on the NAS.")])).toHaveLength(1);
    expect(findeWidersprueche([n("a", "The discount for Lumen is 10 % this year."), n("b", "The discount for Lumen is 15% this year.")])).toHaveLength(1);
    expect(findeWidersprueche([n("a", "Der Server startet täglich um 2 Uhr neu."), n("b", "Der Server startet täglich um 04:00 neu.", { type: "procedural" })])).toHaveLength(1);
  });

  it("schlägt keinen falschen Alarm", () => {
    const keiner = (notizen: Pruefnotiz[], warum: string) => expect(findeWidersprueche(notizen), warum).toEqual([]);
    keiner([n("a", "Backups run nightly at 02:00."), n("b", "Backups run nightly at 02:00 too.")], "gleicher Wert");
    keiner([n("a", "Backups run nightly at 02:00."), n("b", "Backups run nightly for 30 days.")], "andere Wertart");
    keiner([n("a", "Weekly meeting with Lumen at 10:00.", { type: "episodic" }), n("b", "Weekly meeting with Lumen at 14:00.", { type: "episodic" })], "Ereignisse");
    keiner([n("a", "Backups run nightly at 02:00."), n("b", "Backups run nightly at 03:00.", { supersededBy: "a" })], "schon ersetzt");
    keiner([n("a", "Backups run nightly at 02:00.", { deletedAt: 5 }), n("b", "Backups run nightly at 03:00.")], "im Papierkorb");
    keiner([n("a", "Backups run nightly at 02:00.\n\n— Source: /x/plan.pdf"), n("b", "Backups run nightly at 03:00.\n\n— Source: /x/plan.pdf")], "dieselbe Datei");
    keiner([n("a", "Backups run nightly at 02:00 or 03:00 on weekends."), n("b", "Backups run nightly at 03:00.")], "beide Werte im Satz");
    keiner([n("a", "The server restarts at 02:00."), n("b", "Lunch with Lumen at 13:00.")], "nichts gemeinsam");
    keiner([n("a", "Backups at 02:00."), n("b", "Backups at 03:00.")], "zu wenig Wörter");
    keiner([n("a", "Backups run nightly at 02:00. Backups run nightly at 03:00.")], "eine Notiz");
    // Beide Muster stammen aus einer echten Wissensbasis — dort waren alle zehn Treffer solche.
    keiner(
      [
        n("a", "Dev setup, MCP config and eval: coverage reaches 92 % of lines.", { title: "README — 2/11", type: "procedural" }),
        n("b", "Dev setup, MCP config and eval: coverage reaches 62 % of lines.", { title: "README — 5/17", type: "procedural" }),
      ],
      "Teile zerlegter Dateien"
    );
    keiner(
      [
        n("a", "How to get a shortcut for the chat window.\n\n— Source: chat · model ollama · 14.09.2026 18:09"),
        n("b", "What an artificial intelligence model is.\n\n— Source: chat · model ollama · 14.09.2026 18:10"),
      ],
      "Werte aus der Quellenzeile"
    );
    keiner(
      [
        n("a", "Test note from the inbox folder.\n\n— Quelle: Inbox test-notiz.md 31.8.2026, 15:32:29"),
        n("b", "Another test from the inbox folder.\n\n— Quelle: Inbox auto-test.txt 31.8.2026, 15:33:31"),
      ],
      "deutsche Quellenzeile älterer Versionen"
    );
    keiner(
      [n("a", "Always provide tracking and state a delivery time of 1-3 days."), n("b", "Provide tracking and state a realistic delivery time of 2-4 days.")],
      "Spannen"
    );
    keiner([n("a", "Backups run nightly from 02:00 to 03:00."), n("b", "Backups run nightly at 03:00.")], "Zeitfenster nennt den anderen Wert");
  });

  it("merkt sich „beides stimmt“", () => {
    const notizen = [n("a", "Backups run nightly at 02:00."), n("b", "Backups run nightly at 03:00.")];
    expect(findeWidersprueche(notizen, { ok: new Set([paarSchluessel("b", "a")]) })).toEqual([]);
    expect(findeWidersprueche(notizen, { limit: 0 })).toEqual([]);
  });

  it("liest Zahlen in jeder Schreibweise", () => {
    expect(zahl("1.200")).toBe("1200");
    expect(zahl("1,200")).toBe("1200");
    expect(zahl("12,50")).toBe("12.5");
    expect(zahl("1.234,56")).toBe("1234.56");
    expect(zahl("1,234.56")).toBe("1234.56");
    expect(zahl("1'000")).toBe("1000");
    expect(zahl("1.000.000")).toBe("1000000");
    expect(zahl("7")).toBe("7");
  });

  it("bleibt schnell bei vielen Notizen", () => {
    const viele = Array.from({ length: 3000 }, (_, i) => n(`n${i}`, `Server ${i % 50} backup window starts at ${String(i % 24).padStart(2, "0")}:00 for customer ${i}.`, { updatedAt: i }));
    const start = Date.now();
    findeWidersprueche(viele);
    expect(Date.now() - start).toBeLessThan(5000);
  });
});
