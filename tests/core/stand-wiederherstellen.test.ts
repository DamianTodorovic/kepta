// @vitest-environment node
//
// Punkt 83, dritter Koerper (Leitung 25.10. 13:05 MEZ (+0100)): WIEDERHERSTELLEN.
//
// Die Latte steht seit 24.10. 17:55 MEZ (+0100) im Blatt `p3-98-engine-spalte-2410.md`:
//   1. der ersetzte Text wird VORHER als Stand gesichert - Zahl vor der Schreibe lesen (`total` +1),
//      verlustfrei gegen die Nachbarschaft der Staende, nicht gegen einen Meldungstext;
//   2. zeichengleich und atomar - ein Fehlschlag in der Mitte laesst keinen halben Stand;
//   3. zwei Schritte an der Tuer (`confirm: "restore"`), gratis, Historie bleibt;
//   4. Preis p95 <= 1 ms (eigener Messkanal, sonst "nicht gemessen").
//
// Am Kopf d3a1cd1 gibt es kein restoreStand - dieser Fall faellt dort rot.
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { tmpdir } from "node:os";
import path from "node:path";
import fs from "node:fs";
import { KeptaStore } from "../../src/core/store";
import { defaultExtensions, type PolicyGate } from "../../src/core/extensions";

let store: KeptaStore | null = null;
let dir = "";
let dbPfad = "";

function oeffne(policy?: Partial<PolicyGate>): KeptaStore {
  dbPfad = path.join(dir, "t.db");
  const basis = defaultExtensions();
  return new KeptaStore(dbPfad, policy ? { ...basis, policy: { ...basis.policy, ...policy } } : basis);
}

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(tmpdir(), "kepta-restore-"));
  store = oeffne();
});

afterEach(() => {
  try { store?.close(); } catch { /* schon geschlossen */ }
  store = null;
  if (dir) fs.rmSync(dir, { recursive: true, force: true });
  dir = "";
});

const anlegen = (titel: string, inhalt: string) =>
  store!.createMemory({ title: titel, content: inhalt, tags: [] } as never);

describe("Wiederherstellen eines Stands", () => {
  it("sichert den ersetzten Text VORHER: total +1, Nachbarschaft unveraendert, zeichengleich", () => {
    const s = store!;
    const m = anlegen("Titel", "eins");
    s.updateMemory(m.id, { content: "zwei" }); // Stand: eins
    s.updateMemory(m.id, { content: "drei" }); // Staende (neu -> alt): zwei, eins
    const vorher = s.listStande(m.id);
    expect(vorher.total).toBe(2);
    const aeltester = vorher.staende[vorher.staende.length - 1]!;
    expect(aeltester.content).toBe("eins");

    const neu = s.restoreStand(m.id, aeltester.id);
    expect(neu?.content, "die Notiz traegt den gewaehlten Stand").toBe("eins");

    const nachher = s.listStande(m.id);
    expect(nachher.total, "die Zahl VOR der Schreibe plus eins").toBe(vorher.total + 1);
    expect(nachher.staende.slice(1).map((x) => x.content), "Nachbarschaft unveraendert").toEqual(
      vorher.staende.map((x) => x.content),
    );
    expect(nachher.staende[0]!.content, "der neue Stand ist der Text, der vorher aktuell war").toBe("drei");
    expect(s.getMemory(m.id)?.content).toBe("eins");
  });

  it("atomar: ein Fehler in Schritt zwei laesst keinen halben Stand und keinen halben Text", () => {
    const s1 = store!;
    const m = anlegen("Titel", "eins");
    s1.updateMemory(m.id, { content: "zwei" });
    const ziel = s1.listStande(m.id).staende[0]!;
    s1.close();
    store = null;

    // Zweiter Schritt scheitert echt: das PolicyGate verweigert die Schreibe. Die Sicherung
    // liegt zu diesem Zeitpunkt schon in der Transaktion und muss mit zurueckrollen.
    const s2 = oeffne({ canWrite: () => false });
    store = s2;
    // Kontrolle ZUERST: die Funktion muss es geben, sonst wirft der Fehlerfall nur ein TypeError
    // und der Fall waere gruen, ohne etwas zu pruefen (gemessen 13:02:54 MEZ (+0100)).
    expect(typeof s2.restoreStand, "restoreStand fehlt").toBe("function");
    const vor = s2.listStande(m.id);
    const textVor = s2.getMemory(m.id)?.content;
    expect(() => s2.restoreStand(m.id, ziel.id)).toThrow();
    const nach = s2.listStande(m.id);
    expect(nach.total, "kein Stand aus einer Schreibe, die nie kam").toBe(vor.total);
    expect(s2.getMemory(m.id)?.content, "der Text steht unveraendert").toBe(textVor);
  });

  it("unbekannter Stand: null, und keine Schreibe", () => {
    const s = store!;
    const m = anlegen("Titel", "eins");
    s.updateMemory(m.id, { content: "zwei" });
    const vor = s.listStande(m.id);
    expect(s.restoreStand(m.id, 999_999)).toBeNull();
    expect(s.listStande(m.id).total).toBe(vor.total);
    expect(s.getMemory(m.id)?.content).toBe("zwei");
  });
});
