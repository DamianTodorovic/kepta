// @vitest-environment jsdom
// Aufgabe #31, 23.10. (Brief 76, Stand Fassung 3.2.43 / Kopf f5b1039) - die Flaeche holt beim
// Booten den Klartext-Schluessel, ohne dass jemand etwas tut, und schreibt ihn unmaskiert in
// ihren eignen Speicher (src/lib/ai.ts:429 `legeFest`, Zeile 430 der eigentliche Wurf; die
// Ruecklese-Zeile 472 verlangt eine Zeichenkette, die die Maske nie liefert).
//
// ZWEI SEITEN, EIN LAUF. Seite A bleibt beim Menschen: das Feld ist gefuellt, der Wert ueberlebt
// den Neustart. Seite B schliesst das Leck: dieselbe rohe Anfrage an die Einstellungs-Route, die
// den Klartext bekam, bekommt ihn nicht mehr - und in dem Speicher, den die Flaeche selbst fuellt
// (localStorage unter `aiVerbindung`, src/lib/ai.ts:215), liegt er auch nicht mehr.
//
// WANDERUNG (dritte Seite): eine Bestandsinstallation darf nicht ausgesperrt werden. Ohne
// Verschluss bleibt die Arbeitskopie liegen; genommen wird sie erst, wenn die Tuer einen
// Umschlag traegt, der denselben Schluessel aufmacht.
//
// NICHT GEFAHREN. Die Leitung faehrt sie, bevor sie den Flicken setzt:
//   cd ~/kepta-app && npx vitest run tests/lib/ki-schluessel-kein-klartext-im-speicher.test.ts
// Vor dem Flicken sind 1, 2, 4 und 5 rot, 3, 6 und 7 sind gruen (Kontrollen auf geliefertes
// Verhalten, damit die Heilung kein Blendschuss ist).
//
// Doppel ist die Einstellungs-Route (tests/helfer/ki-routen.ts) - sie maskiert wie der Kern seit
// F3, nach seinem Muster und seinem Namen-Set. Der Verschluss kommt ueber die
// Wiederherstellungs-Route desselben Doubles. Der Speicher der Flaeche ist echtes jsdom-localStorage.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GEHEIM_MUSTER, GEHEIM_NAMEN, kiRouten, kiSitzung, type KiRouten } from "../helfer/ki-routen";

const verbindung = {
  providerId: "anthropic",
  apiKey: "sk-ant-BEAWEIS-9f3k2-4f2a",
  baseUrl: "https://api.anthropic.com",
  model: "claude-sonnet-4-20250514",
};

/** Der Name, unter dem die Flaeche ihre Verbindung selbst ablegt (src/lib/ai.ts:215). */
const SPEICHER_NAME = "aiVerbindung";
/** Der Name, unter dem der Umschlag bei der Tuer liegt (src/lib/ai.ts:229). */
const SPIEGEL_NAME = "ai_connection";

async function warteAufSpiegel(kern: KiRouten, mindestens = 1): Promise<void> {
  await vi.waitFor(() => expect(kern.gesendet.length).toBeGreaterThanOrEqual(mindestens), { timeout: 5000 });
}

/** Alles, was die Flaeche in ihren eignen Speicher legt, als ein Text. */
function speicherText(): string {
  let t = "";
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k) t += k + "=" + String(localStorage.getItem(k)) + "\n";
  }
  return t;
}

/** Rohe Anfrage wie von einem fremden Prozess: kein App-Code, keine eignen Koepfe. */
async function roheAntwort(kern: KiRouten): Promise<string> {
  const r = await kern.anfrage("/api/settings");
  return await r.text();
}

beforeEach(() => localStorage.clear());
afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
});

describe("#31 Seite A und B: kein Klartext im Speicher der Flaeche, die Funktion bleibt", () => {
  it("1: eine versiegelte Speicherung laesst den Schluessel aus dem Browserspeicher heraus", async () => {
    const kern = kiRouten();
    vi.stubGlobal("fetch", kern.anfrage);
    const { saveAISettings, loadAISettings } = await kiSitzung();

    await saveAISettings(verbindung);
    await warteAufSpiegel(kern);
    // die Spiegelung muss den Umschlag tragen, sonst ist das Folgende eine Sperre
    expect(kern.bestand[SPIEGEL_NAME]).toMatch(/^.{0,400}"schluessel":"v1\./);

    await vi.waitFor(() => expect(speicherText()).not.toContain(verbindung.apiKey), { timeout: 5000 });
    // Seite A: dieselbe Flaeche, derselbe Wert, ohne ihn auf der Platte zu haben
    expect(loadAISettings().apiKey).toBe(verbindung.apiKey);
    // Seite B: die rohe Anfrage an dieselbe Route nennt ihn nicht
    expect(await roheAntwort(kern)).not.toContain(verbindung.apiKey);
  });

  it("2: eine Bestandszeile mit Klartext wird beim Booten herausgenommen, wenn ein Umschlag da ist", async () => {
    const kern = kiRouten();
    vi.stubGlobal("fetch", kern.anfrage);
    const { saveAISettings, hydrateAISettings, loadAISettings } = await kiSitzung();
    await saveAISettings(verbindung);
    await warteAufSpiegel(kern);

    // ein Neustart: neuer Origin, leerer Speicher - die Tuer traegt den Umschlag
    localStorage.clear();
    const wieder = await hydrateAISettings();
    expect(wieder.apiKey).toBe(verbindung.apiKey);
    expect(loadAISettings().apiKey).toBe(verbindung.apiKey);
    expect(speicherText()).not.toContain(verbindung.apiKey);
    const roh = JSON.parse(String(localStorage.getItem(SPEICHER_NAME))) as { apiKey?: string };
    expect(roh.apiKey).toBe("");
  });

  it("3: KONTROLLE - ohne Umschlag bei der Tuer bleibt die Arbeitskopie liegen (keine Sperre)", async () => {
    const kern = kiRouten(true, null); // Installation ohne Datenbank-Schluessel: nichts versiegelbar
    vi.stubGlobal("fetch", kern.anfrage);
    const { hydrateAISettings, loadAISettings } = await kiSitzung();
    localStorage.setItem(SPEICHER_NAME, JSON.stringify(verbindung));

    const s = await hydrateAISettings();
    expect(s.apiKey).toBe(verbindung.apiKey);
    expect(loadAISettings().apiKey).toBe(verbindung.apiKey);
    // die Arbeitskopie darf nicht weg sein, wenn es keinen Umschlag gibt, der sie ersetzt
    expect(speicherText()).toContain(verbindung.apiKey);
  });
});

describe("#31: die Maskierung hat einen Leser", () => {
  it("4: ein maskierter Altbestand wird gemeldet, mit Name und den letzten Zeichen", async () => {
    const kern = kiRouten();
    const altbestand = JSON.stringify(verbindung);
    kern.bestand["ai_settings"] = altbestand;
    expect(GEHEIM_NAMEN.has("ai_settings") || GEHEIM_MUSTER.test("ai_settings")).toBe(true);
    vi.stubGlobal("fetch", kern.anfrage);

    const sicht = await (await kern.anfrage("/api/settings")).json() as Record<string, unknown>;
    expect(typeof sicht["ai_settings"]).toBe("object"); // die Tuer nennt ihn nicht

    const { kiSchluesselStatus } = await kiSitzung();
    const status = await kiSchluesselStatus();
    expect(status.verschlossen).toBe(true);
    // P4-2310 (a): das Feld `form` sagt seit dem 23.10., wie die Reihe aus der Tuer
    // kommt - "maske" hier, "klartext" waere eine Tuer von vor der Maske. Gelesen
    // wird sie in beiden Faellen nicht mehr (der Rueckfall ist entfernt).
    expect(status.altFund).toEqual({ name: "ai_settings", gesetzt: true, ende: altbestand.slice(-4), form: "maske" });
  });

  it("5: ein unlesbarer Altbestand wird von der Spiegelung nicht geloescht", async () => {
    const kern = kiRouten();
    kern.bestand["ai_settings"] = JSON.stringify(verbindung);
    vi.stubGlobal("fetch", kern.anfrage);
    const { saveAISettings } = await kiSitzung();

    await saveAISettings({ ...verbindung, apiKey: "sk-NEU-EINGEGEBEN-1" });
    await warteAufSpiegel(kern);

    for (const leib of kern.gesendet) {
      expect(leib["ai_settings"]).not.toBeNull();
      expect(leib["ki_gehirn_ai_settings"]).not.toBeNull();
    }
    expect(kern.bestand["ai_settings"]).toBeTruthy();
  });

  it("6: KONTROLLE - ohne Altbestand raeumt die Spiegelung die alten Reihen weiter", async () => {
    const kern = kiRouten();
    vi.stubGlobal("fetch", kern.anfrage);
    const { saveAISettings } = await kiSitzung();

    await saveAISettings(verbindung);
    await warteAufSpiegel(kern);
    expect(kern.gesendet.some((leib) => leib["ai_settings"] === null)).toBe(true);
  });
});

describe("#31: der Boot holt den Schluessel, aber nur in die Sitzung", () => {
  it("7: nach dem Rueckweg ist der Speicher der Flaeche leer von ihm, die Tuer antwortet ohne ihn", async () => {
    const kern = kiRouten();
    vi.stubGlobal("fetch", kern.anfrage);
    const { saveAISettings, hydrateAISettings } = await kiSitzung();
    await saveAISettings(verbindung);
    await warteAufSpiegel(kern);

    localStorage.clear();
    const antworten: string[] = [];
    const ur = kern.anfrage;
    vi.stubGlobal("fetch", async (u: string, i?: RequestInit) => {
      const r = await ur(u, i);
      antworten.push(u + "=" + await r.clone().text());
      return r;
    });
    const s = await hydrateAISettings();

    expect(s.apiKey).toBe(verbindung.apiKey);
    for (const a of antworten) expect(a).not.toContain(verbindung.apiKey);
    expect(speicherText()).not.toContain(verbindung.apiKey);
  });
});
