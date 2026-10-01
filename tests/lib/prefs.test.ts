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
});
