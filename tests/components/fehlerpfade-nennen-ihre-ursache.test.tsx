// @vitest-environment jsdom
// Drei stille Pfade, ein Schnitt: eine Absage muss die Ursache nennen, die sie kennt.
//
// Vorgeschlagen am 2.11. in `audit-2026-10-09/feldzug/P4-UEBRIGE-VIER-0211.md` (Punkte 1, 3, 4),
// gebaut am 3.11. Der vierte Punkt (der dreiwertige Team-Zustand in Dashboard.tsx) ist eine
// Aenderung am Seitenleisten-Vertrag und faehrt eine eigne Landung.
//
// Was hier zusammengehoert: drei Stellen, an denen die App etwas wegwirft, ohne es zu sagen.
//   1. Chat.tsx, Kopieren: die Meldung beschuldigt "your browser", in einer App ohne Browser,
//      deren eigne Policy das Schreiben ausdruecklich erlaubt (`tests/electron-haertung.test.ts`).
//      Der Fall dazu liegt bei den andern Kopier-Faellen in `tests/components/Chat.test.tsx`.
//   2. MachineScan.tsx, Regelwerk holen: `if (!r.ok) return;` — der Dialog steht da, ohne
//      ueber seine Regeln zu sprechen, und kein Wort sagt warum.
//   3. OnboardingWizard.tsx, der Wunsch "darf die Maschine gescannt werden":
//      `catch { /* ignore */ }` — schlaegt das Schreiben fehl, vergisst die App die
//      Entscheidung des Nutzers, und beim naechsten Start kommt dieselbe Frage.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { MachineScan } from "../../src/components/MachineScan";
import { OnboardingWizard } from "../../src/components/OnboardingWizard";

beforeEach(() => {
  localStorage.clear();
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("2. MachineScan: ein Regelwerk, das nicht ankommt, wird genannt", () => {
  it("meldet die Zahl, wenn das Regelwerk nicht antwortet", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (String(url).includes("/api/scan/policy")) return new Response(JSON.stringify({ error: "intern" }), { status: 500 });
        return new Response(JSON.stringify({ ok: true }), { status: 200 });
      })
    );
    render(<MachineScan open onClose={() => {}} onImported={() => {}} />);
    await waitFor(() => expect(screen.getByText(/scan rules did not arrive/i)).toBeTruthy());
    expect(screen.getByText(/answered 500/i)).toBeTruthy();
  });

  it("meldet das Ausbleiben, wenn die Tuer gar nicht antwortet", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (String(url).includes("/api/scan/policy")) throw new Error("ECONNREFUSED");
        return new Response(JSON.stringify({ ok: true }), { status: 200 });
      })
    );
    render(<MachineScan open onClose={() => {}} onImported={() => {}} />);
    await waitFor(() => expect(screen.getByText(/scan rules did not arrive/i)).toBeTruthy());
    expect(screen.getByText(/did not answer/i)).toBeTruthy();
  });
});

describe("3. OnboardingWizard: ein Wunsch, der nicht gespeichert wird, sagt das", () => {
  async function zuSchrittVier(user: ReturnType<typeof userEvent.setup>) {
    await user.type(screen.getByPlaceholderText("e.g. Alex"), "Damian");
    for (let i = 0; i < 3; i++) {
      await user.click(screen.getByRole("button", { name: /Next/i }));
    }
    await screen.findByText(/Almost there/i, undefined, { timeout: 4000 });
  }

  it("nennt die Zeile, wenn der Rechner das Speichern blockiert", async () => {
    const user = userEvent.setup();
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 })));
    // Die Platte nimmt nichts an: genau der Fall, der bis heute verschluckt wurde.
    const setItem = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("QuotaExceededError");
    });
    render(<OnboardingWizard open onClose={() => {}} onComplete={() => {}} />);
    await zuSchrittVier(user);
    await user.click(screen.getAllByRole("checkbox").at(-1) as HTMLInputElement);
    await user.click(screen.getByRole("button", { name: /Save these/i }));
    await waitFor(() => expect(screen.getByText(/will not be kept/i)).toBeTruthy());
    expect(screen.getByText(/blocked saving/i)).toBeTruthy();
    expect(setItem).toHaveBeenCalled();
  });

  it("sagt nichts, wenn der Wunsch wirklich sitzt (Gegenprobe)", async () => {
    const user = userEvent.setup();
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 })));
    render(<OnboardingWizard open onClose={() => {}} onComplete={() => {}} />);
    await zuSchrittVier(user);
    await user.click(screen.getAllByRole("checkbox").at(-1) as HTMLInputElement);
    await user.click(screen.getByRole("button", { name: /Save these/i }));
    await waitFor(() => expect(localStorage.getItem("kepta_scan_wunsch")).toBe("1"));
    expect(screen.queryByText(/will not be kept/i)).toBeNull();
  });
});
