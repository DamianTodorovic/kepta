// Der Nachweis, dass die Zusage-Pforte in beide Richtungen greift — ohne einen
// Lastlauf. Eine *gemessene* Verweigerung waere wieder eine Zeitmessung unter
// Last und damit kein Beweis; bewiesen wird an den Zahlen, die der Lauf von
// 14:49 wirklich gemeldet hat.
import { describe, it, expect } from "vitest";
import { hoechsteZulaessigeBaseline, zeitZusagePforte, ZUSAGE_TEIL } from "./zeit-zusage";

describe("zeit-zusage: die Pforte spricht, wo sie darf, und schweigt, wo sie muss", () => {
  it("eine gesetzte Sonde schliesst die Pforte — hoerbar, mit beiden Zahlen", () => {
    // Die echten Zahlen aus `anteil-kosten-allein-144944.log`: die Sonde meldete
    // 11,03 ms vorher und 10,21 ms nachher und hielt das fuer „ruhig"
    // (Grenze 20 ms). Der Fall kostete 18,9 ms Median und fiel durch ein Urteil,
    // das in diesem Fenster gar nicht sprechen durfte.
    const pforte = zeitZusagePforte("eine zusaetzliche Notiz … <= 15 ms", 15, [11.03, 10.21]);
    expect(pforte.urteilbar, pforte.meldung).toBe(false);
    expect(pforte.grenzeMs).toBe(7.5);
    expect(pforte.baselineMs).toBe(11.03);
    // Die Meldung nennt beide Zahlen — sonst ist die Verweigerung ein Rauschen.
    expect(pforte.meldung).toContain("15");
    expect(pforte.meldung).toContain("11.03");
    expect(pforte.meldung).toContain("7.5");
    expect(pforte.meldung).toMatch(/^kein Urteil/);
  });

  it("eine ruhige Sonde oeffnet die Pforte — dieselbe Zusage, ruhigeres Fenster", () => {
    // Die echten Zahlen aus `mutation-allein-12-10-1258.log` und
    // `kosten-nach-scharf-12-10-1306.log`: Baselines 6,34 / 6,28 / 6,27 ms, und
    // der Fall kostete 10,0 ms Median gegen die bestellten 15.
    const pforte = zeitZusagePforte("eine zusaetzliche Notiz … <= 15 ms", 15, [6.34, 6.28]);
    expect(pforte.urteilbar, pforte.meldung).toBe(true);
    expect(pforte.meldung).toBe("");
    expect(pforte.baselineMs).toBe(6.34);
  });

  it("keine Pforte rueettelt an einer Zusage — die Grenze ist die Haelfte, sonst nichts", () => {
    // Die bestellten Zahlen bleiben, wo sie sind; die Pforte redet nur darueber,
    // ob ein Urteil in diesem Fenster sprechen darf.
    expect(ZUSAGE_TEIL).toBe(2);
    for (const zusage of [5, 15, 120, 750]) {
      expect(hoechsteZulaessigeBaseline(zusage)).toBe(zusage / 2);
      const streng = zeitZusagePforte(`Zusage ${zusage} ms`, zusage, [zusage / 2 + 0.01]);
      expect(streng.urteilbar, `bei ${zusage} ms Zusage darf ${streng.baselineMs} ms nicht urteilen`).toBe(false);
      const locker = zeitZusagePforte(`Zusage ${zusage} ms`, zusage, [zusage / 2]);
      expect(locker.urteilbar, `bei ${zusage} ms Zusage darf ${zusage / 2} ms urteilen`).toBe(true);
    }
  });

  it("ohne Baseline spricht kein Zeit-Urteil", () => {
    const pforte = zeitZusagePforte("500 Knoten", 120, [Number.NaN]);
    expect(pforte.urteilbar).toBe(false);
    expect(pforte.baselineMs).toBeNull();
    expect(pforte.meldung).toMatch(/^kein Urteil/);
  });
});
