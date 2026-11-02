// @vitest-environment jsdom
// Punkt 4, 2.11. abends — eine Einstellung, die abgewiesen wurde, sieht aus wie gespeichert.
//
// Drei Stellen, von mir selbst gelesen, bevor hier ein Fall stand:
//
//   * MachineScan.tsx:179-192 `sichereAuswahl` — ein PUT auf /api/scan/config ohne jede
//     Status-Frage, der Wurf geht in ein `catch { /* nicht gesichert — die Vorgabe gilt
//     weiter */ }`. Der Nutzer hakt ".pdf" aus, die Kappe antwortet 500, und der Knopf bleibt
//     umgeschaltet: auf dem Schirm steht seine Wahl, im Regal gilt die alte. Das ist dieselbe
//     Klasse wie die Quittungen von 3.2.119 — nur bei der eingriffsstaerksten Funktion im Haus.
//   * Settings.tsx:363-374 — die Modelle werden einmalig nachgeladen; scheitert der Call,
//     steht `catch { /* silent */ }`, und die Liste bleibt leer, als gaebe es keine Modelle.
//     Ein `modelError`-Kanal (role="alert", :851) existiert laengst — er wird in diesem Zweig
//     nur nie gefuellt.
//   * DossierView.tsx:106-112 — die Vorschlaege kommen von /api/dossier/suggestions; bei einer
//     Abweisung bleibt `vorschlaege` null und die Flaeche zeigt keinen Grund, warum nichts
//     vorgeschlagen wird.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MachineScan } from "../../src/components/MachineScan";
import { Settings } from "../../src/components/Settings";
import { DossierView } from "../../src/components/DossierView";
import { ToastProvider } from "../../src/components/ui/Toast";
import { saveAISettings, PROVIDERS } from "../../src/lib/ai";

// Dasselbe Regelwerk, das MachineScan.test.tsx:313 liefert — der Dialog prueft die Antwort
// erst, dann uebernimmt er (MachineScan.tsx:165-170), und ein zu duenner Stub laesst ihn ohne
// Dateiarten-Knoepfe da: der erste Versuch scheiterte am falschen Grund.
const REGELWERK = {
  niemals: { ordner: [".ssh", "keychains"], dateimuster: ["^\\.env$", "\\.pem$"], erklaerung: "Keys are never read." },
  uebersprungen: { ordner: ["node_modules", ".git"], erklaerung: "Build folders hold no knowledge." },
  lesbar: { endungen: [".md", ".txt", ".pdf"], erklaerung: "Only these yield text." },
  grenzen: { maxDateiBytes: 2_000_000, maxDateien: 20_000, maxTiefe: 12 },
  ihreEinstellung: { wurzeln: ["/home/x"], endungen: [".md", ".txt", ".pdf"], maxDateiBytes: 2_000_000, zusaetzlichAusgelassen: [] },
};

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem("ki_gehirn_wizard_dismissed", "1");
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe("Punkt 4: eine abgewiesene Einstellung darf nicht gespeichert aussehen", () => {
  it("sagt im Rechner-Scan, dass die Auswahl nicht ankam", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
      const ziel = String(url);
      if (ziel.includes("/api/scan/config") && String(init?.method) === "PUT") {
        return new Response(JSON.stringify({ error: "the scan is running" }), { status: 409 });
      }
      if (ziel.includes("/api/scan/policy")) return new Response(JSON.stringify(REGELWERK), { status: 200 });
      return new Response(JSON.stringify({ running: false, files: [] }), { status: 200 });
    }));
    const user = userEvent.setup();
    render(<MachineScan open onClose={() => {}} onImported={() => {}} />);
    await screen.findByText(/What K3PTA may read/i, undefined, { timeout: 6000 });
    await user.click(screen.getByRole("button", { name: ".pdf" }));
    const grund = await waitFor(() => {
      const t = document.body.textContent || "";
      if (!/did not stick|not saved|answered 409/i.test(t)) throw new Error(`die Flaeche schweigt: "${t.slice(0, 260)}"`);
      return t.replace(/\s+/g, " ");
    });
    expect(grund).toMatch(/409|did not stick/i);
  });

  it("nennt in den Einstellungen den Grund einer leeren Modell-Liste", async () => {
    const anbieter = PROVIDERS.find((p) => p.needsKey) ?? PROVIDERS[0];
    saveAISettings({ providerId: anbieter.id, apiKey: "sk-test", baseUrl: "https://api.openai.com/v1", model: anbieter.defaultModel });
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      const ziel = String(url);
      if (ziel.includes("/api/models")) return new Response(JSON.stringify({ error: "rate limited" }), { status: 429 });
      if (ziel.includes("/api/policy") || ziel.includes("/api/health")) return new Response(JSON.stringify({ ok: true, count: 0 }), { status: 200 });
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }));
    render(<ToastProvider><Settings /></ToastProvider>);
    const meldung = await waitFor(() => {
      const e = screen.queryByRole("alert");
      if (!e || !/429|did not|could not|rate/i.test(e.textContent || "")) throw new Error(`kein Grund auf dem Schirm: "${document.body.textContent?.slice(0, 200)}"`);
      return e;
    });
    expect(meldung.textContent).toMatch(/429|could not (be )?loaded|did not answer/i);
  });

  it("sagt im Dossier, warum nichts vorgeschlagen wird", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      const ziel = String(url);
      if (ziel.includes("/api/dossier")) {
        if (ziel.includes("suggestions")) return new Response(JSON.stringify({ error: "still indexing" }), { status: 503 });
        return new Response(JSON.stringify({ dossier: null }), { status: 200 });
      }
      return new Response(JSON.stringify({ memories: [], count: 0, total: 0 }), { status: 200 });
    }));
    render(<ToastProvider><DossierView onOpenMemory={() => {}} /></ToastProvider>);
    const grund = await waitFor(() => {
      const t = document.body.textContent || "";
      if (!/suggestions did not arrive|could not suggest|answered 503|did not answer/i.test(t)) throw new Error(`leere Flaeche ohne Grund: "${t.slice(0, 240)}"`);
      return t.replace(/\s+/g, " ");
    });
    expect(grund).toMatch(/503|did not arrive|did not answer/i);
  });
});
