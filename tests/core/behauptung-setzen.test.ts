// @vitest-environment node
//
// Punkt 126 — eine Hand muss eine Behauptung schreiben koennen.
//
// Gemessen 29.10. 08:19:52 MESZ an Damians echtem Bestand (`/api/graph?limit=500`, eine der
// drei erlaubten Lesungen): 1 468 Relationen im Auszug, 1 468 davon Systemwoerter (776
// co-mentions, 692 mentions), 0 Typwoerter. Die Flaeche malt das Wort an der Linie, zaehlt die
// Aussagen und nennt seit 3.2.88 auch ihren Zoom-Boden — aber kein Schreibweg der App legt ein
// Wort hin. `verknuepfeNotiz` (src/core/store.ts:1159) kennt nur `mentions` und `co-mentions`,
// und keine der 17 Routen-Dateien schreibt eine Relation.
//
// Darum diese Datei: der Kern bekommt die Behauptung als Eingabe, und der Leser, den die
// Oberflaeche braucht, um zu zeigen, was schon steht.

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { tmpdir } from "node:os";
import path from "node:path";
import fs from "node:fs";
import { KeptaStore } from "../../src/core/store";

process.env.KEPTA_NO_AUTOSTART = "1";
process.env.KEPTA_ENCRYPTION = "off";

let dir = "";
let prevHome: string | undefined;
let store: KeptaStore;

beforeEach(async () => {
  dir = fs.mkdtempSync(path.join(tmpdir(), "kepta-behauptung-"));
  prevHome = process.env.HOME;
  process.env.HOME = dir;
  process.env.KEPTA_DATA_DIR = dir;
  const { KeptaStore: Store } = await import("../../src/core/store");
  store = new Store(path.join(dir, "test.db")) as unknown as KeptaStore;
});

afterEach(() => {
  try { store.close(); } catch { /* schon zu */ }
  process.env.HOME = prevHome;
  // Raeumen ist ein Pflichtgriff, nicht ein Dank: die Suite hat 45 Ordner ohne
  // Raeumgriff hinterlassen (Punkt 112), und ein Laeufer, der stirbt, raumt nichts.
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* weg */ }
});

function notiz(titel: string, inhalt: string) {
  const angelegt = store.createMemory({ title: titel, content: inhalt, tags: [] });
  return angelegt;
}

describe("126 die Behauptung im Kern", () => {
  it("zwei Begriffe und ein Wort werden eine Kante mit diesem Wort", () => {
    const n = notiz("Protokoll der Uebergabe", "Nordwind uebergibt an Elena.");
    store.verknuepfeNotiz(n.id, n.title, ["nordwind"], [
      { quelle: "Nordwind", ziel: "Elena", wort: "betreut" },
    ]);
    const kanten = store.behauptungenVonNotiz(n.id);
    expect(kanten, "keine Behauptung gelesen").toHaveLength(1);
    expect(kanten[0].wort, "das Wort ist nicht das, was die Hand geschrieben hat").toBe("betreut");
    expect(kanten[0].quelle).toBe("nordwind");
    expect(kanten[0].ziel).toBe("elena");
  });

  it("beide Enden haengen an der Notiz — ein Ende ohne Begriffsknoten ist eine Kante ins Leere", () => {
    // `entitaetsNetz` (src/lib/graphLayout.ts:2200) laesst eine Behauptung nur zeichnen,
    // wenn beide Enden im Bild stehen. Ohne diese Zeile waere die Kante geschrieben und
    // unsichtbar — der Nutzer sieht nichts und die Zahl steigt.
    const n = notiz("Protokoll der Uebergabe", "Ein Text ohne Wiki-Links.");
    store.verknuepfeNotiz(n.id, n.title, [], [
      { quelle: "Nordwind", ziel: "Elena", wort: "betreut" },
    ]);
    const begriffe = store.entityNamesForMemory(n.id);
    expect(begriffe, "Nordwind ist kein Begriff an dieser Notiz").toContain("nordwind");
    expect(begriffe, "Elena ist kein Begriff an dieser Notiz").toContain("elena");
  });

  it("zwei Laeufe mit derselben Behauptung sind eine Kante", () => {
    const n = notiz("Protokoll", "Nordwind und Elena.");
    for (let i = 0; i < 3; i++) {
      store.verknuepfeNotiz(n.id, n.title, ["nordwind", "elena"], [
        { quelle: "nordwind", ziel: "elena", wort: "betreut" },
      ]);
    }
    expect(store.behauptungenVonNotiz(n.id), "dieselbe Aussage dreimal gespeichert").toHaveLength(1);
  });

  it("nimmt die Hand die Behauptung weg, faellt sie — und die Begriffe bleiben", () => {
    const n = notiz("Protokoll", "Nordwind und Elena.");
    store.verknuepfeNotiz(n.id, n.title, ["nordwind", "elena"], [
      { quelle: "nordwind", ziel: "elena", wort: "betreut" },
    ]);
    expect(store.behauptungenVonNotiz(n.id)).toHaveLength(1);
    store.verknuepfeNotiz(n.id, n.title, ["nordwind", "elena"], []);
    expect(store.behauptungenVonNotiz(n.id), "eine weggenommene Behauptung steht noch im Bestand").toHaveLength(0);
    // Die Begriffe der Notiz bleiben stehen: sie kommen aus dem Text, nicht aus dem Feld.
    // (Dass dieselbe Speichrung auch die Mitnennungs-Kanten neu setzt, haelt bereits
    // tests/rest-verknuepfung.test.ts - hier geht es nur um die eigne Klaue.)
    expect(store.entityNamesForMemory(n.id), "das Feld hat die Begriffe mitgerissen").toContain("nordwind");
  });

  it("ein Systemwort, ein leeres Wort und MUELL werden nicht gesetzt, und der Lauf wirft nicht", () => {
    // "mentions" malt die Flaeche nie (`SYSTEM_WOERTER`, src/lib/graphLayout.ts:287):
    // jemandem ein Wort zu setzen, das er nicht sehen kann, ist eine still verschenkte Tat.
    const n = notiz("Protokoll", "Nordwind und Elena.");
    store.verknuepfeNotiz(n.id, n.title, ["nordwind"], [
      { quelle: "nordwind", ziel: "elena", wort: "mentions" },
      { quelle: "nordwind", ziel: "elena", wort: "   " },
      { quelle: "", ziel: "elena", wort: "betreut" },
      { quelle: "nordwind", ziel: "", wort: "betreut" },
    ]);
    expect(store.behauptungenVonNotiz(n.id), "eine abgewiesene Behauptung steht im Bestand").toHaveLength(0);
  });

  it("eine lange Liste wird gekappt, nicht verschluckt", () => {
    const n = notiz("Protokoll", "Nordwind.");
    const viele = Array.from({ length: 40 }, (_, i) => ({ quelle: "nordwind", ziel: `partner ${i}`, wort: `belegt ${i}` }));
    const gesetzt = store.verknuepfeNotiz(n.id, n.title, ["nordwind"], viele);
    const kanten = store.behauptungenVonNotiz(n.id);
    expect(kanten.length, "die Kappe ist keine Zahl, sondern ein Gefuehl").toBeLessThanOrEqual(20);
    expect(kanten.length, "nichts gesetzt, obwohl 40 Behauptungen kamen").toBeGreaterThan(0);
    expect(typeof gesetzt, "der Rueckgabewert hat seine Form verloren").toBe("number");
  });
});
