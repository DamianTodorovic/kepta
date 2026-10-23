// @vitest-environment jsdom
// F13 Schritt 2 — die zweite Klappe.
//
// src/lib/settings.ts (main.tsx:10) huellt localStorage ein und spiegelt jeden
// Namen mit den Praefixen `kepta_` / `ki_gehirn_` in /api/settings — gebuendelt
// nach 400 ms. Der Sitzungsname der KI-Verbindung hiess `ki_gehirn_ai_settings`
// und traegt den Klartextschluessel: gemessen am gebauten Buendel auf Port 8812
// (f13-evidence/klage-buendel.txt) stand er nach dem Neustart wieder in der
// rohen Antwort, obwohl ai_settings langst getilgt und ai_connection versiegelt
// war. Diese Datei haelt den Vertrag gegen genau diese Schicht — mit der echten
// Huelle, nicht mit einem Doppel.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { spiegleEinstellungen } from "../../src/lib/settings";
import { kiRouten, kiSitzung as sitzung } from "../helfer/ki-routen";

const verbindung = {
  providerId: "anthropic",
  apiKey: "sk-ant-SPIEGEL-9f3k2",
  baseUrl: "https://api.anthropic.com",
  model: "claude-sonnet-4-20250514",
};

let kern: ReturnType<typeof kiRouten>;

/** Die Huelle buendelt 400 ms — ein wartender Lauf sieht nie einen Stapel aus dem vorherigen. */
async function ruhe(): Promise<void> {
  await new Promise((r) => setTimeout(r, 700));
}

beforeEach(async () => {
  localStorage.clear();
  kern = kiRouten();
  vi.stubGlobal("fetch", kern.anfrage);
  spiegleEinstellungen();
  await ruhe(); // was der vorherige Lauf noch nachtragen wollte
});

afterEach(async () => {
  localStorage.clear();
  await ruhe();
  vi.unstubAllGlobals();
});

describe("F13: die Einstellungs-Spiegelung darf das Geheimnis nicht tragen", () => {
  it("nach dem Bundel-Fenster liegt der Schluessel in keinem Schreibsatz und in keiner Zeile", async () => {
    const { saveAISettings } = await sitzung();
    await saveAISettings(verbindung);
    await ruhe();

    expect(kern.gesendet.length).toBeGreaterThan(0);
    expect(JSON.stringify(kern.gesendet)).not.toContain(verbindung.apiKey);
    expect(JSON.stringify(kern.bestand)).not.toContain(verbindung.apiKey);
  });

  it("kein Name, den die Spiegelung fuer ihre eigenen haelt, traegt den Schluessel", async () => {
    const { saveAISettings } = await sitzung();
    await saveAISettings(verbindung);
    await ruhe();

    const tragendeNamen = Object.entries(kern.bestand)
      .filter(([, wert]) => typeof wert === "string" && wert.includes(verbindung.apiKey))
      .map(([name]) => name);
    expect(tragendeNamen).toEqual([]);
    // die Verbindung selbst ist natuerlich gehalten
    expect(kern.bestand.ai_connection).toBeDefined();
  });

  it("die Reihe aus einer alteren Version wird gemeldet und bleibt liegen, nicht gelesen", async () => {
    // P4-2310 (a), 23.10.: der Rueckfall auf einen lesbaren Altbestand ist entfernt.
    // Der Fund wird gemeldet; geloescht wird er nicht (das war der blinde Wurf bis 3.2.44).
    const { hydrateAISettings, kiSchluesselStatus } = await sitzung();
    // so legte es die alte Version ab: gespiegelter localStorage-Inhalt in der DB
    kern.bestand.ki_gehirn_ai_settings = JSON.stringify(verbindung);
    localStorage.clear();

    const s = await hydrateAISettings();
    expect(s.apiKey).toBe("");
    expect((await kiSchluesselStatus()).altFund?.name).toBe("ki_gehirn_ai_settings");
    await ruhe();

    expect(kern.bestand.ki_gehirn_ai_settings).toBeDefined();
  });

  it("der Sitzungsname bleibt in der Page — die Datenbank kennt ihn nicht", async () => {
    const { saveAISettings } = await sitzung();
    await saveAISettings(verbindung);
    await ruhe();

    expect(Object.keys(kern.bestand)).not.toContain("ki_gehirn_ai_settings");
    expect(JSON.stringify(kern.bestand)).toContain("ai_connection");
  });
});
