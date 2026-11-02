// @vitest-environment jsdom
// Punkt 7, 2.11. — der Satz, der seine eigene Richtung zweimal nannte.
//
// Zwei Erstleser ohne Projektkenntnis (dieselbe Datei, zwei unabhaengige Laeufe, 2.11.) haben
// denselben Untertitel zurueckgewiesen: `what happened since less than a minute ago`. Grund im
// Baum: `vor(seit)` liefert date-fns mit `addSuffix: true` — also "less than a minute ago" — und
// die Flaeche stellte "since" davor. "since … ago" ist kein Englisch; ein Satz, den man zweimal
// lesen muss, ist kein Text fuer Nutzer, sondern ein Rest aus dem Werkzeugkasten.
//
// Diese Datei haelt beide Seiten: die Spanne als Wort (fuer jede Groessenordnung und die
// Randfaelle), und den gemalten Satz — mit der Spanne, und ohne die doppelte Richtung.
import { afterEach, describe, expect, it, vi } from "vitest";
import { render, waitFor } from "@testing-library/react";
import { TodayView, spannenText } from "../../src/components/TodayView";
import { ToastProvider } from "../../src/components/ui/Toast";

const SEK = 1000;
const MIN = 60 * SEK;
const STU = 60 * MIN;
const TAG = 24 * STU;
const JETZT = Date.parse("2026-11-02T07:00:00Z");

describe("Punkt 7: die Spanne seit dem letzten Besuch ist ein Satzteil, keine Richtungsangabe", () => {
  it("sagt minute, wo keine zwei Minuten um sind", () => {
    expect(spannenText(JETZT - 3 * SEK, JETZT), "drei Sekunden").toBe("minute");
    expect(spannenText(JETZT - 90 * SEK, JETZT), "neunzig Sekunden").toBe("minute");
    expect(spannenText(JETZT - 119 * SEK, JETZT), "zwei Minuten minus eine Sekunde").toBe("minute");
  });

  it("zaehlt Minuten von zwei an, und sagt eine Stunde, nicht 1 hours", () => {
    expect(spannenText(JETZT - 2 * MIN, JETZT)).toBe("2 minutes");
    expect(spannenText(JETZT - 37 * MIN, JETZT)).toBe("37 minutes");
    expect(spannenText(JETZT - 61 * MIN, JETZT)).toBe("an hour");
    expect(spannenText(JETZT - 3 * STU, JETZT)).toBe("3 hours");
  });

  it("sagt a day und a year, nicht 1 days und 1 years", () => {
    expect(spannenText(JETZT - 25 * STU, JETZT)).toBe("a day");
    expect(spannenText(JETZT - 3 * TAG, JETZT)).toBe("3 days");
    expect(spannenText(JETZT - 31 * TAG, JETZT)).toBe("a month");
    expect(spannenText(JETZT - 65 * TAG, JETZT)).toBe("2 months");
    expect(spannenText(JETZT - 400 * TAG, JETZT)).toBe("a year");
    expect(spannenText(JETZT - 800 * TAG, JETZT)).toBe("2 years");
  });

  it("erfindet keine Vergangenheit, wenn die Uhr zuruecksteht", () => {
    expect(spannenText(JETZT + 10 * TAG, JETZT), "ein Stand aus der Zukunft").toBe("minute");
  });
});

describe("Punkt 7: der gemalte Untertitel sagt, was er meint", () => {
  afterEach(() => { vi.unstubAllGlobals(); });

  function zeige() {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      since: Date.now() - 3 * TAG, created: { total: 4 }, todos: {}, contradictions: null, expiring: "keine",
    }), { status: 200 })));
    return render(
      <ToastProvider><TodayView aktiv onOpenMemory={() => {}} onGo={() => {}} /></ToastProvider>
    ).container;
  }

  it("nennt eine Spanne in einem Satz, den man nicht zweimal lesen muss", async () => {
    const container = zeige();
    await waitFor(() => expect(container.textContent).toMatch(/what happened/));
    const satz = ((container.textContent || "").match(/what happened[^·]*/) ?? [""])[0].trim();
    expect(satz, `der Untertitel nennt keine Spanne: "${satz}"`)
      .toMatch(/in the last (minute|a minute|an hour|\d+ (minutes|hours|days|months|years)|a (day|month|year))/);
    expect(satz, `der Untertitel nennt seine Richtung zweimal: "${satz}"`).not.toMatch(/\bsince\b.*\bago\b/i);
    expect(satz, `ein Werkzeugkasten-Wort steht in einem Nutzersatz: "${satz}"`)
      .not.toMatch(/less than a minute ago|about 1 hour/i);
  });
});
