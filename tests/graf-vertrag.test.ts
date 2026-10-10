// A9 §1/§3/§6: der Graph als Dienst hat EIN Kuvert fuer beide Sichten. Dieser Test
// haelt das Kuvert als Dateivergleich fest (A9 §5.4), damit eine Flaeche dagegen
// bauen kann, bevor der Kern liefert. Jede Zeile hier ist vor Schritt 1 rot.
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import Ajv from "ajv";

const wurzel = process.cwd();
const lies = (p: string) => JSON.parse(fs.readFileSync(path.join(wurzel, p), "utf-8"));

describe("graf-vertrag: die Konstanten", () => {
  it("der Vertrag heisst graf-2 und die Welt ist 1000 Einheiten quadratisch", async () => {
    const v = await import("../src/core/graf-vertrag");
    expect(v.GRAF_VERTRAG).toBe("graf-2");
    expect(v.WELT_GROESSE).toBe(1000);
    expect(v.WELT_RAD).toBe(30);
    // Die Kappen sind Voreinstellungen, keine Geheimnisse: sie reisen als Feld mit.
    expect(v.KAPPE).toEqual({ knoten: 500, kanten: 2000, paarPruefungen: 150_000 });
    expect(Number.isInteger(v.LAYOUT_VERSION)).toBe(true);
    expect(v.LAYOUT_VERSION).toBeGreaterThanOrEqual(1);
  });

  it("Breite und Hoehe haben im Vertrag nichts verloren", async () => {
    const v = await import("../src/core/graf-vertrag");
    // A9 B-1/B-2: ein Client-Fenster darf in keine Rechnung eingehen.
    expect(Object.keys(v)).not.toContain("breite");
    expect(v.KAPPE).not.toHaveProperty("breite");
  });
});

describe("graf-vertrag: die goldene Fixtur", () => {
  const schema = () => lies("schemas/graf-antwort-v2.schema.json");
  const fixtur = () => lies("tests/fixtures/graf-antwort-v2.json");
  const pruefe = (obj: unknown) => {
    const ajv = new Ajv({ strict: false, allErrors: true });
    const fn = ajv.compile(schema());
    const ok = fn(obj) as boolean;
    return { ok, fehler: (fn.errors ?? []).map((e) => `${e.instancePath || "/"} ${e.message}`) };
  };

  it("erfuellt das Vertragsschema", () => {
    const { ok, fehler } = pruefe(fixtur());
    expect(fehler).toEqual([]);
    expect(ok).toBe(true);
  });

  it("eine echte Kante mit gemessenem Aehnlichkeitswert ist kein gueltiger Vertrag", () => {
    // A9 §2: echt traegt belege, keine Messgroesse. Wer die Zahl erfindet,
    // zeichnet eine Behauptung, die die Rechnung widerlegt (A5-06).
    const kaputt = fixtur();
    kaputt.kanten[0].sorte = "echt";
    kaputt.kanten[0].maess = { wert: 0.85, basis: "verlinkt", gemessen: true };
    expect(pruefe(kaputt).ok).toBe(false);
  });

  it("eine Aehnlichkeitskante ohne Messwert ist kein gueltiger Vertrag", () => {
    const kaputt = fixtur();
    kaputt.kanten[1].maess = { wert: null, basis: "jaccard", gemessen: true };
    expect(pruefe(kaputt).ok).toBe(false);
  });

  it("ein Kuvert, das sein Fenster kennt, ist kein gueltiger Vertrag", () => {
    const kaputt = fixtur();
    kaputt.breite = 1200;
    expect(pruefe(kaputt).ok).toBe(false);
  });

  it("die zwei Grade der Fixtur stimmen mit ihren eigenen Kanten ueberein", () => {
    // A9 §2.5: gradEcht aus der Belege-Summe, gradVermutet aus der Zahl der
    // Aehnlichkeitskanten. Ein Kuvert, dessen Knotenzahl nicht zu seinen Kanten
    // passt, kann keine Flaeche zeichnen — und ein Beispiel, das es nicht tut,
    // ist keine Goldene Fixtur.
    const f = fixtur();
    const echt = new Map<string, number>();
    const vermutet = new Map<string, number>();
    for (const k of f.kanten) {
      for (const ende of [k.quelle, k.ziel]) {
        if (k.sorte === "echt") echt.set(ende, (echt.get(ende) ?? 0) + k.belege);
        else vermutet.set(ende, (vermutet.get(ende) ?? 0) + 1);
      }
    }
    for (const n of f.knoten) {
      expect([n.id, n.gradEcht]).toEqual([n.id, echt.get(n.id) ?? 0]);
      expect([n.id, n.gradVermutet]).toEqual([n.id, vermutet.get(n.id) ?? 0]);
    }
  });

  it("am Beispiel gilt die Rechenpflicht: Bestand = Bild + Uebrig", () => {
    // A9 §3 Regel 1 — die schaerfste Wache des Abschnitts, hier zuerst am Beispiel.
    const f = fixtur();
    expect(f.bestand.knoten).toBe(f.knoten.length + f.kuerzung.uebrig.knoten);
    expect(f.bestand.kanten).toBe(f.kanten.length + f.kuerzung.uebrig.kanten);
    const allesUebrigenNull = Object.values(f.kuerzung.uebrig).every((n) => n === 0);
    expect(f.kuerzung.vollstaendig).toBe(allesUebrigenNull);
  });

  it("beide Sichten teilen dasselbe Kuvert", async () => {
    const v = await import("../src/core/graf-vertrag");
    expect(v.GRAF_SICHTEN).toEqual(["konzept", "notiz"]);
    // Das Kuvert ist eine Form, nicht zwei: beide Sichten bauen dasselbe Geruest.
    expect(v.leeresKuvert("notiz").vertrag).toBe("graf-2");
    expect(Object.keys(v.leeresKuvert("notiz")).sort()).toEqual(Object.keys(v.leeresKuvert("konzept")).sort());
  });
});
