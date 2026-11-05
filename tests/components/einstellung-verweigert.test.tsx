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

// P61 (Leitung 5.11. 09:39:53 MEZ, Punkt 4) — die ANDRE Richtung derselben Kante. 3.2.152 hielt
// den Wortlaut eines Fremden von der Flaeche zurueck. Vier Stellen warfen aber einen kahlen
// `Error("HTTP " + status)` in einen Fang, der mit `absage` einen Satz fuer STILLE malt:
// Settings.tsx:411 (Gesundheit), Settings.tsx:421 (Werkzeugliste), ActivityView.tsx:216
// (Audit-Export), MemoryPreview.tsx:113 (Stand zurueckholen). Die Tuer hatte geantwortet — 503,
// 429, 500 — und ihre Zahl fiel unter den Tisch, waehrend der Satz behauptete, sie habe nicht
// geantwortet. Das ist eine falsche Auskunft ueber den Zustand der eignen Tuer, nicht nur eine
// fehlende Zahl.
//
// Faelle zuerst, gefahren: 3 rot bei 4 gruen (09:39:53 gesetzt, direkt danach gelesen). Die
// Messung des ganzen Rot-Stands liegt in /tmp/red-p61.json (mtime 09:40:44 MEZ). Erwartung VOR
// dem Flicken: die vier Zahl-Faelle rot (kein HTTP-Wert auf dem
// Schirm) und der Gesundheits-Stille-Fall rot (der Satz behauptet Stille, wo er Ankuft sagen
// muss). Die Kontrollen sind in beiden Staenden gruen und verhindern, dass die Heilung den
// rohen Wortlaut eines Fremden durchlaesst.
describe("P61: eine Antwort der Tuer heisst nicht Stille", () => {
  /** Die Geraete-Schublade ist die einzige Flaeche, die diese zwei Türen fragt. */
  async function schublade() {
    const user = userEvent.setup();
    render(<ToastProvider><Settings /></ToastProvider>);
    await waitFor(() => expect(document.body.textContent).toMatch(/AI & data/));
    await user.click(screen.getByRole("button", { name: /MCP \/ API/i }));
    return user;
  }

  it("nennt die 503 der Gesundheits-Tuer, statt zu behaupten, sie habe nicht geantwortet", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      const ziel = String(url);
      if (ziel.includes("/api/health")) return new Response(JSON.stringify({ error: "store busy" }), { status: 503 });
      if (ziel.includes("/api/mcp/tools")) return new Response(JSON.stringify({ tools: [] }), { status: 200 });
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }));
    await schublade();
    const grund = await waitFor(() => {
      const t = document.body.textContent || "";
      if (!/health check/i.test(t)) throw new Error(`die Zeile fehlt: "${t.slice(0, 240)}"`);
      return t.replace(/\s+/g, " ");
    });
    expect(grund, "503 ist eine Antwort — die Zahl gehoert auf den Schirm").toMatch(/HTTP 503/);
    expect(grund, "und der Satz darf keine Stille behaupten, wo eine Antwort stand").not.toMatch(/did not answer/i);
  });

  it("sagt die Stille der Gesundheits-Tuer als Stille, ohne das Wort des Browsers", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      const ziel = String(url);
      if (ziel.includes("/api/health")) throw new TypeError("Failed to fetch");
      if (ziel.includes("/api/mcp/tools")) return new Response(JSON.stringify({ tools: [] }), { status: 200 });
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }));
    await schublade();
    const grund = await waitFor(() => {
      const t = document.body.textContent || "";
      if (!/health check did not/i.test(t)) throw new Error(`die Stille wird nicht gemeldet: "${t.slice(0, 240)}"`);
      return t.replace(/\s+/g, " ");
    });
    expect(grund, "ohne Antwort heisst die Zeile Ankuft, nicht Antwort").toMatch(/did not arrive/i);
    expect(grund, "und ihr Wortlaut bleibt im Protokoll").not.toMatch(/Failed to fetch/i);
  });

  it("nennt die 429 der Werkzeug-Tuer, statt den Grund fallen zu lassen", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      const ziel = String(url);
      if (ziel.includes("/api/health")) return new Response(JSON.stringify({ ok: true, count: 0 }), { status: 200 });
      if (ziel.includes("/api/mcp/tools")) return new Response(JSON.stringify({ error: "Write limit" }), { status: 429 });
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }));
    await schublade();
    const grund = await waitFor(() => {
      const t = document.body.textContent || "";
      if (!/tool list could not be read/i.test(t)) throw new Error(`die Absage fehlt: "${t.slice(0, 240)}"`);
      return t.replace(/\s+/g, " ");
    });
    expect(grund, "429 ist eine Antwort der eignen Tuer und darf nicht als Grundlos enden").toMatch(/HTTP 429/);
  });

  // KONTROLLE, in beiden Staenden gruen: die Heilung darf den Fremden nicht durchlassen.
  it("KONTROLLE: ein Abbruch ohne Antwort bleibt ohne Zahl und ohne Wort des Browsers", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      const ziel = String(url);
      if (ziel.includes("/api/health")) return new Response(JSON.stringify({ ok: true, count: 0 }), { status: 200 });
      if (ziel.includes("/api/mcp/tools")) throw new TypeError("Failed to fetch");
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }));
    await schublade();
    const grund = await waitFor(() => {
      const t = document.body.textContent || "";
      if (!/tool list could not be read/i.test(t)) throw new Error(`die Absage fehlt: "${t.slice(0, 240)}"`);
      return t.replace(/\s+/g, " ");
    });
    expect(grund, "Stille hat keine Zahl").not.toMatch(/HTTP \d/);
    expect(grund, "und kein Wort von aussen").not.toMatch(/Failed to fetch/i);
  });
});
