// 26.9.-Audit-Fund: dieselbe Port-Origin-Falle wie bei den AI-Settings, an
// acht weiteren Präferenz-Keys — Semantic-Schalter, TopK-Regler, Gruppierung,
// Wizard, AutoLearn, adaptives Profil, Scan-Wunsch. Der Spiegel in die
// verschlüsselte DB und die Hydration füllen nur FEHLENDE Keys.
// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { hydratePrefs, prefsObjekt, spiegelePrefs } from "../../src/lib/prefs";

const SP = "ui_prefs";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllTimers();
  localStorage.clear();
});

describe("Präferenzen: DB-Spiegelung überlebt den Portwechsel", () => {
  it("prefsObjekt liest nur vorhandene Keys", () => {
    localStorage.setItem("ki_gehirn_semantic", "false");
    localStorage.setItem("ki_gehirn_topK", "12");
    expect(prefsObjekt()).toEqual({ ki_gehirn_semantic: "false", ki_gehirn_topK: "12" });
  });

  it("hydratePrefs füllt fehlende Keys aus der Spiegelung — vorhandene bleiben", async () => {
    localStorage.setItem("ki_gehirn_semantic", "false"); // lokal frisch
    const gespiegelt = JSON.stringify({
      ki_gehirn_semantic: "true", // veraltet — darf nicht überschreiben
      ki_gehirn_topK: "12", // fehlt lokal — übernehmen
      ki_gehirn_wizard_dismissed: "1", // fehlt lokal — übernehmen
    });
    vi.stubGlobal("fetch", async () => ({ ok: true, json: async () => ({ [SP]: gespiegelt }) }) as Response);
    await hydratePrefs();
    expect(localStorage.getItem("ki_gehirn_semantic")).toBe("false");
    expect(localStorage.getItem("ki_gehirn_topK")).toBe("12");
    expect(localStorage.getItem("ki_gehirn_wizard_dismissed")).toBe("1");
  });

  it("spiegelePrefs schreibt das Präferenz-Objekt nach /api/settings (entprellt)", async () => {
    vi.useFakeTimers();
    const calls: { url: string; init?: RequestInit }[] = [];
    vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
      calls.push({ url, init });
      return { ok: true, json: async () => ({}) } as Response;
    });
    localStorage.setItem("ki_gehirn_topK", "7");
    spiegelePrefs();
    spiegelePrefs(); // entprellt: zweiter Aufruf innerhalb des Fensters zählt nicht
    await vi.advanceTimersByTimeAsync(1600);
    expect(calls.length).toBe(1);
    expect(calls[0].url).toBe("/api/settings");
    expect(JSON.parse(String(calls[0].init!.body)).ui_prefs).toContain('"ki_gehirn_topK":"7"');
    vi.useRealTimers();
  });

  it("offline: kein Absturz, nichts überschrieben", async () => {
    vi.stubGlobal("fetch", async () => {
      throw new Error("offline");
    });
    await hydratePrefs();
    expect(localStorage.getItem("ki_gehirn_semantic")).toBeNull();
  });

  // (c) aus dem A1-Nachtrag: die Hydration haengt an einem Feld der Settings-
  // Maske. Der Weg zur Flaeche ist die Form — `ui_prefs` wird als Zeichenkette
  // geschrieben (PUT), und der Route-Speicher nimmt nur Zeichenketten an. Wenn
  // die Maske auf der Kern-Seite das Feld je in einen Object-Koerper dreht,
  // duerfen die Nutzer-Praeferenzen nicht still verschwinden: jeder Neustart
  // verliert den Zufalls-Port-Origin, die Hydration waere dann der einzige Weg,
  // die Einstellungen zurueckzuholen — und ein stummer Ausfall waere ein
  // zurueckgesetzter Schalter fuer alle.
  it("nimmt ui_prefs auch als Objekt, nicht nur als Zeichenkette", async () => {
    vi.stubGlobal("fetch", async () => ({
      ok: true,
      json: async () => ({ ui_prefs: { ki_gehirn_semantic: "false", ki_gehirn_wizard_dismissed: "1" } }),
    }) as Response);
    await hydratePrefs();
    expect(localStorage.getItem("ki_gehirn_semantic")).toBe("false");
    expect(localStorage.getItem("ki_gehirn_wizard_dismissed")).toBe("1");
  });

  it("erfindet nichts, wenn die Maske ui_prefs streicht", async () => {
    vi.stubGlobal("fetch", async () => ({ ok: true, json: async () => ({ theme: "dark" }) }) as Response);
    await hydratePrefs();
    expect(localStorage.getItem("ki_gehirn_wizard_dismissed")).toBeNull();
  });

  // (c) aus dem A1-Nachtrag, als Wettlauf: der Rahmen spiegelt beim Mount, die
  // Antwort aus der Datenbank spaeter. In diesem Fenster schrieb der Spiegel eine
  // Spiegelung ohne den Assistenten-Merker — des Nutzers "Later" war aus der
  // Datenbank geloescht, und der Assistent kam zurueck. Die Ordnung ist die
  // Reparatur: erst lesen, dann schreiben.
  //
  // Eigener Modul-Neuaufbau: `gelesen` und der Entprell-Timer sind seitenweiter
  // Zustand. In einem Lauf, der schon gelesen hat, ist der Wettlauf per
  // Definition vorbei — also fangt dieser Test als erster Seite an.
  it("schreibt nie vor der ersten Antwort — und nie ohne die Entscheidung", async () => {
    vi.resetModules();
    const prefs = await import("../../src/lib/prefs");
    const schreib: { koerper: string; nachDerAntwort: boolean }[] = [];
    let antwortDa = false;
    vi.stubGlobal("fetch", (url: string, init?: RequestInit) => {
      const methode = init?.method ?? "GET";
      if (methode === "PUT") schreib.push({ koerper: String(init?.body), nachDerAntwort: antwortDa });
      if (String(url).includes("/api/settings") && methode === "GET") {
        return new Promise<Response>((loesen) => setTimeout(() => {
          antwortDa = true;
          loesen({ ok: true, json: async () => ({ ui_prefs: JSON.stringify({ ki_gehirn_wizard_dismissed: "1" }) }) } as Response);
        }, 2200));
      }
      return Promise.resolve({ ok: true, json: async () => ({}) } as Response);
    });
    localStorage.setItem("ki_gehirn_gruppierung", "datei");
    prefs.spiegelePrefs();          // der Rahmen spiegelt sofort beim Mount
    void prefs.hydratePrefs();      // ...und die Antwort kommt spaeter
    await new Promise((r) => setTimeout(r, 4200));
    expect(schreib.length, "es wurde gar nicht gespiegelt").toBeGreaterThan(0);
    for (const a of schreib) {
      expect(a.nachDerAntwort, `der Spiegel schrieb vor der Antwort (${a.koerper})`).toBe(true);
      expect(a.koerper, `der Spiegel loescht die Entscheidung (${a.koerper})`).toMatch(/ki_gehirn_wizard_dismissed/);
    }
    vi.unstubAllGlobals();
  });
});

// (b) aus dem A1-Nachtrag: die Entscheidung, ob ueberhaupt je ein Assistent zu
// sehen ist, liegt in der Datenbank — nicht im Browser. Das ist hier festgehalten,
// damit es eine belegte Abmachung ist und kein Fund beim naechsten Mal.
describe("Präferenzen: der Assistenten-Merker sitzt in der Datenbank", () => {
  it("ist nach dem Holen wieder im Spiegel — und damit in der Datenbank festgeschrieben", async () => {
    const gespiegelt = JSON.stringify({ ki_gehirn_wizard_dismissed: "1" });
    vi.stubGlobal("fetch", async () => ({ ok: true, json: async () => ({ ui_prefs: gespiegelt }) }) as Response);
    await hydratePrefs();
    expect(localStorage.getItem("ki_gehirn_wizard_dismissed")).toBe("1");
    // Der Key steht in PREF_KEYS, also geht er zurueck in die Datenbank, sobald
    // der Spiegel taetig wird: eine erhaltene Basis nimmt einer frischen
    // Anwendung die Entscheidung vorweg. Wer das aendern will, aendert hier
    // den Key, nicht den Timer — beide Haende sind getrennt.
    expect(prefsObjekt()).toEqual({ ki_gehirn_wizard_dismissed: "1" });
  });
});
