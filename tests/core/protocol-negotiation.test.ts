import { describe, it, expect } from "vitest";
import { negotiateVersion, PROTOCOL_VERSIONS, LATEST_PROTOCOL_VERSION } from "../../src/core/mcp";

// Ein Client, der eine aeltere Protokollversion spricht, muss eine bekommen, die er
// versteht. Vorher lief jede unbekannte Anfrage auf die neueste Version hinaus —
// Claude Desktop bat um 2025-03-26, bekam 2026-07-28 und brach ab:
// "Server's protocol version is not supported". Der Server war fuer den haeufigsten
// Client der Welt unbenutzbar, und die Testsuite sah es nicht, weil sie nur die drei
// Versionen prueft, die er ohnehin kennt.
const AELTESTE = [...PROTOCOL_VERSIONS].sort()[0];

describe("negotiateVersion", () => {
  it("gibt jede bekannte Version unveraendert zurueck", () => {
    for (const v of PROTOCOL_VERSIONS) expect(negotiateVersion(v)).toBe(v);
  });

  it("bietet bei einer unbekannten aelteren Version die hoechste an, die nicht neuer ist", () => {
    // 2025-03-26 ist eine echte MCP-Version, die KEPTA nicht fuehrt. Zwischen
    // 2024-11-05 und 2025-06-18 gelegen, muss 2024-11-05 herauskommen.
    expect(negotiateVersion("2025-03-26")).toBe("2024-11-05");
    expect(negotiateVersion("2025-07-01")).toBe("2025-06-18");
    expect(negotiateVersion("2026-01-01")).toBe("2025-06-18");
  });

  it("antwortet nie mit einer Version, die neuer ist als die erfragte", () => {
    for (const gefragt of ["2024-12-01", "2025-03-26", "2025-09-09", "2026-02-02"]) {
      expect(negotiateVersion(gefragt) <= gefragt).toBe(true);
    }
  });

  it("bleibt bei der neuesten, wenn der Client noch neuer ist", () => {
    // Ein Client aus der Zukunft kann selbst herunterhandeln; ihm die neueste
    // anzubieten, die wir haben, ist richtig.
    expect(negotiateVersion("2027-01-01")).toBe(LATEST_PROTOCOL_VERSION);
  });

  it("faellt bei fehlender oder unsinniger Angabe auf etwas zurueck, das jeder versteht", () => {
    // Ohne Angabe ist der Client nicht regelkonform. Die aelteste unterstuetzte
    // Version versteht dann am ehesten noch jemand.
    expect(negotiateVersion(undefined)).toBe(AELTESTE);
    expect(negotiateVersion(null)).toBe(AELTESTE);
    expect(negotiateVersion(42)).toBe(AELTESTE);
    expect(negotiateVersion("")).toBe(AELTESTE);
  });
});
