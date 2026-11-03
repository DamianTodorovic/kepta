// @vitest-environment jsdom
// P49/#31 — dritte Stelle: zwei eigne Einstellungen, die bisher lautlos verschwanden.
//
// Beide lesen etwas aus dem Speicher der Sitzung und verwerfen den Fehler wortlos:
//   src/lib/ai.ts:392      — die gewaehlte KI-Verbindung
//   src/lib/profile.ts:95  — das Profil des Nutzers
// Die Folge ist keine Absturzmeldung, sondern eine Flaeche, die etwas behauptet, was nicht
// stimmt: ohne lesbare Einstellung heisst es "kein Anbieter gewaehlt", obwohl jemand einen
// gewaehlt hat; ohne Profil fragte der Assistent von vorn. Der Grund darf dabei nicht
// verschwinden — nach aussen ein Rueckgriff, ins Protokoll eine Zeile, die den Fall nennt.
//
// FAHREN:  npx vitest run tests/lib/eigne-einstellungen-nennen-lesen-ihren-grund.test.ts
// Erwartung VOR der Heilung: beide Faelle rot (kein console.warn). Danach: gruen, und die
// Rueckgriffe bleiben, wie sie sind — der Test verlangt keinen Satz auf der Flaeche.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { loadAISettings } from "../../src/lib/ai";
import { loadProfile } from "../../src/lib/profile";

const protokolliert = () => (console.warn as unknown as { mock: { calls: unknown[][] } }).mock.calls.map((c) => String(c[0]));

describe("#31: eigne Einstellungen, die nicht zu lesen sind, nennen es im Protokoll", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });
  afterEach(() => vi.restoreAllMocks());

  it("sagt es, wenn die gespeicherte KI-Verbindung kaputt gelesen wird, und faellt auf den Katalog", () => {
    localStorage.setItem("aiVerbindung", '{ "providerId": ');
    const e = loadAISettings();
    expect(
      protokolliert().some((z) => /AI settings could not be read/i.test(z)),
      `kein Grund im Protokoll, geholt: ${JSON.stringify(e?.providerId ?? null)}; Protokoll: ${JSON.stringify(protokolliert())}`,
    ).toBe(true);
    expect(typeof e.providerId).toBe("string");
  });

  it("sagt es, wenn das gespeicherte Profil kaputt ist, und gibt weiter null", () => {
    localStorage.setItem("ki_gehirn_adaptive_profile", "{kein json");
    expect(loadProfile()).toBeNull();
    expect(
      protokolliert().some((z) => /profile could not be read/i.test(z)),
      `kein Grund im Protokoll; Protokoll: ${JSON.stringify(protokolliert())}`,
    ).toBe(true);
  });

  it("schweigt weiterhin richtig, wenn gar nichts gespeichert war — kein Fall, keine Meldung", () => {
    loadAISettings();
    expect(loadProfile()).toBeNull();
    expect(protokolliert()).toEqual([]);
  });
});
