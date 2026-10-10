// @vitest-environment jsdom
// F13 — der KI-Schluessel der App.
//
// Ausgangslage: der Kern maskiert GET /api/settings (A3-09, F3). Die App holte
// ihren Zugangsschluessel genau dort heraus — nach der Maske war er nach jedem
// Neustart weg. Diese Datei haelt den Vertrag, den die App jetzt erfuellt: der
// Schluessel ueberlebt den Neustart, und die API sieht ihn im Klartext nie.
//
// Der Doppel hier ist die MASKE, nicht der Server (tests/helfer/ki-routen.ts):
// der echte Server mit verschluesselnder Datenbank und eigenem Horcher steht
// in tests/lib/ki-schluessel-neustart.test.ts.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GEHEIM_MUSTER, GEHEIM_NAMEN, kiRouten, kiSitzung as sitzung, type KiRouten } from "../helfer/ki-routen";

const verbindung = {
  providerId: "anthropic",
  apiKey: "sk-ant-BEAWEIS-9f3k2-4f2a",
  baseUrl: "https://api.anthropic.com",
  model: "claude-sonnet-4-20250514",
};

/** Die Spiegelung laeuft hinterher her — bis der letzte Schreibsatz ankam. */
async function warteAufSpiegel(kern: KiRouten, mindestens = 1): Promise<void> {
  await vi.waitFor(() => expect(kern.gesendet.length).toBeGreaterThanOrEqual(mindestens), { timeout: 5000 });
}

beforeEach(() => localStorage.clear());
afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
});

describe("F13: die API sieht den Schluessel nie", () => {
  it("jeder Schreibvorgang der App haelt das Geheimnis aus dem Leib heraus", async () => {
    const { saveAISettings } = await sitzung();
    const kern = kiRouten();
    vi.stubGlobal("fetch", kern.anfrage);
    await saveAISettings(verbindung);

    expect(kern.gesendet.length).toBeGreaterThan(0);
    for (const leib of kern.gesendet) {
      expect(JSON.stringify(leib)).not.toContain(verbindung.apiKey);
    }
    // nicht nur der Netzleitext: auch im Bestand liegt kein Klartext
    expect(JSON.stringify(kern.bestand)).not.toContain(verbindung.apiKey);
  });

  it("der Spiegel liegt unter einem Namen, den die Maske durchlaesst", async () => {
    const { saveAISettings } = await sitzung();
    const kern = kiRouten(); // maskiert wie der Kern
    vi.stubGlobal("fetch", kern.anfrage);
    await saveAISettings(verbindung);
    await warteAufSpiegel(kern);

    const spiegelName = Object.keys(kern.bestand).find((n) => !GEHEIM_NAMEN.has(n) && !GEHEIM_MUSTER.test(n));
    expect(spiegelName).toBeTruthy();
    const sicht = await (await kern.anfrage("/api/settings")).json() as Record<string, unknown>;
    expect(JSON.stringify(sicht)).not.toContain(verbindung.apiKey);
    expect(Object.keys(sicht).length).toBeGreaterThan(0);
  });

  it("der alte Klartext-Blob ai_settings wird nicht mehr geschrieben", async () => {
    const { saveAISettings } = await sitzung();
    const kern = kiRouten();
    vi.stubGlobal("fetch", kern.anfrage);
    await saveAISettings(verbindung);
    await warteAufSpiegel(kern);
    expect(kern.bestand.ai_settings).toBeUndefined();
  });
});

describe("F13: der Schluessel ueberlebt den Neustart", () => {
  it("leerer Browserspeicher (neuer Port) → hydrate bringt Provider, Modell UND Schluessel zurueck", async () => {
    const { saveAISettings, hydrateAISettings, loadAISettings } = await sitzung();
    const kern = kiRouten();
    vi.stubGlobal("fetch", kern.anfrage);
    await saveAISettings(verbindung);

    localStorage.clear(); // der Neustart: neuer Origin, leerer Speicher
    const s = await hydrateAISettings();
    expect(s.providerId).toBe("anthropic");
    expect(s.model).toBe("claude-sonnet-4-20250514");
    expect(s.apiKey).toBe(verbindung.apiKey);
    expect(loadAISettings().apiKey).toBe(verbindung.apiKey);
  });

  it("ein zweiter Neustart ohne erneutes Speichern bringt denselben Schluessel", async () => {
    const { saveAISettings, hydrateAISettings } = await sitzung();
    const kern = kiRouten();
    vi.stubGlobal("fetch", kern.anfrage);
    await saveAISettings({ ...verbindung, extractModel: "gemma3:4b" });
    await warteAufSpiegel(kern);

    localStorage.clear();
    const erstes = await hydrateAISettings();
    localStorage.clear();
    const zweites = await hydrateAISettings();
    expect(zweites.apiKey).toBe(erstes.apiKey);
    expect(zweites.apiKey).toBe(verbindung.apiKey);
    expect(zweites.extractModel).toBe("gemma3:4b");
  });

  it("zwei Spiegelungen hintereinander: der letzte Stand gewinnt, kein Geheimnis liegt offen", async () => {
    const { saveAISettings, hydrateAISettings } = await sitzung();
    const kern = kiRouten();
    vi.stubGlobal("fetch", kern.anfrage);
    await saveAISettings({ ...verbindung, apiKey: "sk-ant-ERST" });
    await saveAISettings({ ...verbindung, apiKey: "sk-ant-ZWEIT" });
    await warteAufSpiegel(kern, 2);

    localStorage.clear();
    const s = await hydrateAISettings();
    expect(s.apiKey).toBe("sk-ant-ZWEIT");
    expect(JSON.stringify(kern.bestand)).not.toContain("sk-ant-ERST");
    expect(JSON.stringify(kern.bestand)).not.toContain("sk-ant-ZWEIT");
  });

  it("lokaler Provider ohne Schluessel ('local') ueberlebt denselben Weg", async () => {
    const { saveAISettings, hydrateAISettings } = await sitzung();
    const kern = kiRouten();
    vi.stubGlobal("fetch", kern.anfrage);
    await saveAISettings({ providerId: "ollama", apiKey: "local", baseUrl: "http://localhost:11434/v1", model: "llama3.2" });
    await warteAufSpiegel(kern);

    localStorage.clear();
    const s = await hydrateAISettings();
    expect(s.apiKey).toBe("local");
    expect(s.model).toBe("llama3.2");
  });

  it("vorhandener lokaler Speicher wird nicht von der Spiegelung ueberschrieben", async () => {
    const { saveAISettings, hydrateAISettings } = await sitzung();
    const kern = kiRouten();
    vi.stubGlobal("fetch", kern.anfrage);
    await saveAISettings(verbindung);
    await warteAufSpiegel(kern);

    saveAISettings({ ...verbindung, apiKey: "sk-ant-HIER", model: "claude-haiku" });
    const s = await hydrateAISettings();
    expect(s.apiKey).toBe("sk-ant-HIER");
    expect(s.model).toBe("claude-haiku");
  });
});

describe("F13: die Wanderung des Bestands von vor dem Update", () => {
  /** So hat die App vor F13 gespiegelt: der ganze Blob als Klartext. */
  async function legeAltenBlob(kern: KiRouten) {
    await kern.anfrage("/api/settings", { method: "PUT", body: JSON.stringify({ ai_settings: JSON.stringify(verbindung) }) });
    kern.gesendet.length = 0;
  }

  it("liest den Klartext-Blob, verschliesst ihn und tilgt ihn", async () => {
    const { hydrateAISettings } = await sitzung();
    const kern = kiRouten(false); // die App-Route war unmaskiert — nur so ist der Blob lesbar
    vi.stubGlobal("fetch", kern.anfrage);
    await legeAltenBlob(kern);
    expect(kern.bestand.ai_settings).toContain(verbindung.apiKey);

    localStorage.clear();
    const s = await hydrateAISettings();
    expect(s.apiKey).toBe(verbindung.apiKey);

    // danach: kein Klartext mehr im Bestand, die Verbindung trotzdem gehalten
    expect(kern.bestand.ai_settings).toBeUndefined();
    expect(JSON.stringify(kern.bestand)).not.toContain(verbindung.apiKey);

    kern.gesendet.length = 0;
    localStorage.clear();
    expect((await hydrateAISettings()).apiKey).toBe(verbindung.apiKey);
  });

  it("kann der Umschlag nicht gebaut werden, bleibt der alte Blob stehen — kein Nutzer wird ausgesperrt", async () => {
    const { hydrateAISettings } = await sitzung();
    const kern = kiRouten(false, null); // keine Verschluesselung → kein Verschluss zur Hand
    vi.stubGlobal("fetch", kern.anfrage);
    await legeAltenBlob(kern);

    localStorage.clear();
    const s = await hydrateAISettings();
    expect(s.apiKey).toBe(verbindung.apiKey);
    expect(kern.bestand.ai_settings).toBeDefined();
  });

  it("ist der alte Blob nur als Anzeige zu sehen, erfindet die App keinen Schluessel", async () => {
    const { hydrateAISettings } = await sitzung();
    const kern = kiRouten(true); // maskiert: der Wert ist von hier nicht mehr zu holen
    vi.stubGlobal("fetch", kern.anfrage);
    await legeAltenBlob(kern);
    kern.gesendet.length = 0;

    localStorage.clear();
    const s = await hydrateAISettings();
    expect(s.apiKey).toBe("");
    await new Promise((r) => setTimeout(r, 50));
    expect(kern.gesendet.length).toBe(0); // nichts wird zurueckgeschrieben
    expect(kern.bestand.ai_settings).toContain(verbindung.apiKey); // der Blob bleibt liegen, wie er war
  });
});

describe("F13: Ehrlichkeit ueber den Verschluss", () => {
  it("mit Verschluss: status meldet die Ablage des Schluessels", async () => {
    const { saveAISettings, kiSchluesselStatus } = await sitzung();
    const kern = kiRouten();
    vi.stubGlobal("fetch", kern.anfrage);
    await saveAISettings(verbindung);

    const status = await kiSchluesselStatus();
    expect(status.verschlossen).toBe(true);
    expect(status.ablage).toBe("macOS Keychain");
  });

  it("ohne Verschluss: status meldet offen, und ein Klartext liegt trotzdem nirgends im Bestand", async () => {
    const { saveAISettings, kiSchluesselStatus } = await sitzung();
    const kern = kiRouten(true, null);
    vi.stubGlobal("fetch", kern.anfrage);
    await saveAISettings(verbindung);
    await warteAufSpiegel(kern);

    const status = await kiSchluesselStatus();
    expect(status.verschlossen).toBe(false);
    expect(status.ablage).toBeNull();
    expect(JSON.stringify(kern.bestand)).not.toContain(verbindung.apiKey);
  });

  it("ohne Verschluss bleibt die Verbindung erhalten, nur der Schluessel muss neu eingesetzt werden", async () => {
    const { saveAISettings, hydrateAISettings } = await sitzung();
    const kern = kiRouten(true, null);
    vi.stubGlobal("fetch", kern.anfrage);
    await saveAISettings(verbindung);
    await warteAufSpiegel(kern);

    localStorage.clear();
    const s = await hydrateAISettings();
    expect(s.providerId).toBe("anthropic");
    expect(s.model).toBe("claude-sonnet-4-20250514");
    expect(s.apiKey).toBe("");
  });

  it("Trennen loescht den Umschlag aus der Datenbank", async () => {
    const { saveAISettings, disconnectAI, loadAISettings, hydrateAISettings } = await sitzung();
    const kern = kiRouten();
    vi.stubGlobal("fetch", kern.anfrage);
    await saveAISettings(verbindung);
    await warteAufSpiegel(kern);
    localStorage.clear();
    expect((await hydrateAISettings()).apiKey).toBe(verbindung.apiKey);

    disconnectAI();
    await warteAufSpiegel(kern, 2);

    expect(loadAISettings().apiKey).toBe("");
    expect(JSON.stringify(kern.bestand)).not.toContain(verbindung.apiKey);
    localStorage.clear();
    expect((await hydrateAISettings()).apiKey).toBe("");
  });

  it("anderer Datenbankschluessel (zurueckgespielte Sicherung): Verbindung bleibt, Schluessel leer, kein Absturz", async () => {
    const kern = kiRouten();
    vi.stubGlobal("fetch", kern.anfrage);
    let ai = await sitzung();
    await ai.saveAISettings(verbindung);
    ai = await sitzung();
    localStorage.clear();
    expect((await ai.hydrateAISettings()).apiKey).toBe(verbindung.apiKey);
    await new Promise((r) => setTimeout(r, 20));

    // dieselbe Spiegelung, aber die Installation antwortet mit einem anderen Schluessel
    const anderer = kiRouten(true, "ff".repeat(32));
    anderer.bestand.ai_connection = kern.bestand.ai_connection;
    vi.stubGlobal("fetch", anderer.anfrage);
    ai = await sitzung();
    localStorage.clear();
    const s = await ai.hydrateAISettings();
    expect(s.providerId).toBe("anthropic");
    expect(s.model).toBe("claude-sonnet-4-20250514");
    expect(s.apiKey).toBe("");
  });

  it("kaputter Spiegelinhalt fuehrt zu Defaults statt zu einem Absturz", async () => {
    const kern = kiRouten();
    kern.bestand.ai_connection = "{ kaputt ]";
    vi.stubGlobal("fetch", kern.anfrage);
    const { hydrateAISettings } = await sitzung();
    localStorage.clear();
    expect((await hydrateAISettings()).providerId).toBe("openai");
  });

  it("antwortet die Route mit einem Fehler, bleibt die Sitzung bei ihren Defaults", async () => {
    vi.stubGlobal("fetch", async () => new Response("{}", { status: 500 }));
    const { hydrateAISettings } = await sitzung();
    localStorage.clear();
    const s = await hydrateAISettings();
    expect(s.providerId).toBe("openai");
    expect(s.apiKey).toBe("");
  });

  it("Trennen bei einem lokalen Provider: in der Sitzung bleibt 'local', ein Modell geht weg", async () => {
    const { saveAISettings, disconnectAI, loadAISettings } = await sitzung();
    const kern = kiRouten();
    vi.stubGlobal("fetch", kern.anfrage);
    await saveAISettings({ providerId: "ollama", apiKey: "local", baseUrl: "http://localhost:11434/v1", model: "llama3.2" });

    disconnectAI();
    await warteAufSpiegel(kern, 2);
    expect(loadAISettings().apiKey).toBe("local");
    expect(loadAISettings().model).toBe("");
    // der Spiegel traegt kein Modell mehr — nach der bestehenden Regel uebernimmt
    // er nichts, und ein Neustart faellt auf die Defaults zurueck (wie vor F13)
    expect(JSON.parse(kern.bestand.ai_connection).model).toBe("");
  });
});
