// @vitest-environment node
//
// Punkt 103 (Leitung 25.10. 12:52 MESZ): zwei Regeltexte fuer dieselbe Sache.
//
// Vorher, am Kopf d3a1cd1 (25.10. 12:49 MESZ) von meiner Hand gelesen:
//   src/lib/herkunft.ts:25  laesst localhost, *.localhost, jedes 127.x.x.x und [::1] durch
//   src/lib/richtlinien.ts:136 laesst ::1 und .local durch, prueft aber NUR die exakte 127.0.0.1
// Der Riss: 127.0.0.2 ist fuer den Host-Waechter "dieser Rechner" und fuer die
// Chat-Richtlinie "Ausland"; x.localhost ebenso.
//
// Dieser Fall haelt EIN Kriterium: beide Verbraucher antworten auf dieselbe Adresse gleich -
// bis auf die benannte Stufe .local, die im Haus bleibt, aber nicht dieser Rechner ist.
import { describe, it, expect } from "vitest";
import { hostIstDieserRechner } from "../../src/lib/herkunft";
import { istLokalerHost } from "../../src/lib/richtlinien";

/** Die URL-Form, die beide Verbraucher sehen koennen. */
const alsUrl = (host: string) => `http://${host}/`;

describe("Punkt 103: ein Kriterium fuer beide Verbraucher", () => {
  it("dieser Rechner: beide sagen fuer dieselbe Adresse dasselbe", () => {
    const dieserRechner = ["localhost", "localhost:4747", "127.0.0.1", "127.0.0.1:3000", "127.0.0.2", "127.9.9.9", "[::1]", "[::1]:3000"];
    for (const h of dieserRechner) {
      const url = alsUrl(h);
      expect(hostIstDieserRechner(h), `herkunft: ${h}`).toBe(true);
      expect(istLokalerHost(url), `richtlinie: ${url}`).toBe(true);
    }
  });

  it("fremd: beide sagen fuer dieselbe Adresse dasselbe", () => {
    const fremd = ["evil.example", "evil.example:3000", "localhost.evil.example", "127.0.0.1.evil.example", "10.0.0.5", "192.168.1.20"];
    for (const h of fremd) {
      const url = alsUrl(h);
      expect(hostIstDieserRechner(h), `herkunft: ${h}`).toBe(false);
      expect(istLokalerHost(url), `richtlinie: ${url}`).toBe(false);
    }
  });

  it("der alte Riss ist zu: 127.0.0.2 und x.localhost sind an BEIDEN Stellen dieser Rechner", () => {
    for (const h of ["127.0.0.2", "x.localhost"]) {
      expect(hostIstDieserRechner(h), `herkunft: ${h}`).toBe(true);
      expect(istLokalerHost(alsUrl(h)), `richtlinie: ${h}`).toBe(true);
    }
  });

  it("die eine benannte Stufe: foo.local bleibt im Haus, ist aber nicht dieser Rechner", () => {
    expect(hostIstDieserRechner("foo.local"), "herkunft: foo.local").toBe(false);
    expect(istLokalerHost(alsUrl("foo.local")), "richtlinie: foo.local").toBe(true);
  });

  it("die leeren Faelle bleiben, wie sie waren: kein Host und keine URL sind lokal", () => {
    expect(hostIstDieserRechner(undefined)).toBe(true);
    expect(istLokalerHost(undefined)).toBe(true);
    expect(istLokalerHost("")).toBe(true);
  });

  it("der Host-Kopf darf keine Klammern schlucken: [::1]:3000 ist ::1, [::2] nicht", () => {
    expect(hostIstDieserRechner("[::1]:3000")).toBe(true);
    expect(hostIstDieserRechner("[::2]")).toBe(false);
  });
});
