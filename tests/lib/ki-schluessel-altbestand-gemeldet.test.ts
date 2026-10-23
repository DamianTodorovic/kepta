// @vitest-environment jsdom
// P4-2310 (a), 23.10.: der tote Rueckfall auf einen lesbaren Altbestand ist entfernt
// (src/lib/ai.ts, gewesene Zeile 582). Dieser Fall haelt beide Seiten der Entscheidung:
// der Leser der Maske (`altFund`) meldet die Reihe, und geloescht wird sie nicht still.
//
// Er ist der Fall zu diesem Koerper: vor dem Flicken rot (die Quelle traegt den Zweig
// noch, und der Fund bleibt ungemeldet), danach gruen. Die Doppel sind derselbe
// Einstellungs-Route-Doppel wie in tests/helfer/ki-routen.ts (er maskiert wie der Kern).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { kiRouten, kiSitzung } from "../helfer/ki-routen";

const HIER = path.dirname(fileURLToPath(import.meta.url));
const AI_QUELLE = path.resolve(HIER, "../../src/lib/ai.ts");
const verbindung = {
  providerId: "anthropic",
  apiKey: "sk-ant-ALTBESTAND-3f2a9c",
  baseUrl: "https://api.anthropic.com",
  model: "claude-sonnet-4-20250514",
};

beforeEach(() => localStorage.clear());
afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
});

describe("P4-2310 (a): der Altbestand wird gemeldet und nicht still geloescht", () => {
  it("meldet die maskierte Reihe, adoptiert nichts und sendet kein null", async () => {
    // Die Quelle traegt den toten Rueckfall nicht mehr.
    const quelle = fs.readFileSync(AI_QUELLE, "utf8");
    expect(quelle, "der tote Rueckfall steht wieder in ai.ts").not.toMatch(/ALTE_ABLAGEN\.map\(\(name\) => \(typeof d\[name\]/);

    const kern = kiRouten();
    const altbestand = JSON.stringify(verbindung);
    kern.bestand["ai_settings"] = altbestand;
    vi.stubGlobal("fetch", kern.anfrage);
    const { hydrateAISettings, saveAISettings, kiSchluesselStatus, loadAISettings } = await kiSitzung();

    // Boot: der Altbestand kann nicht gelesen werden, also traegt er keine Verbindung bei.
    const s = await hydrateAISettings();
    expect(s.apiKey, "ein unlesbarer Altbestand darf keinen Schluessel liefern").toBe("");
    expect(loadAISettings().apiKey).toBe("");

    // Gemeldet wird er trotzdem - mit Name und den letzten Zeichen.
    const status = await kiSchluesselStatus();
    expect(status.altFund).toEqual({ name: "ai_settings", gesetzt: true, ende: altbestand.slice(-4), form: "maske" });

    // Und die Spiegelung loescht ihn nicht: kein null im Leib, die Reihe bleibt liegen.
    await saveAISettings({ ...verbindung, apiKey: "sk-NEU-EINGEGEBEN-77" });
    await vi.waitFor(() => expect(kern.gesendet.length).toBeGreaterThan(0), { timeout: 5000 });
    for (const leib of kern.gesendet) {
      expect(leib["ai_settings"]).not.toBeNull();
      expect(leib["ki_gehirn_ai_settings"]).not.toBeNull();
    }
    expect(kern.bestand["ai_settings"]).toBe(altbestand);
  });
});
