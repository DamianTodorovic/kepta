// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { gehoertUns, ladeEinstellungen, spiegleEinstellungen, starteEinstellungen } from "../../src/lib/settings";

// Der Fehler dahinter: die Electron-Huelle laesst sich vom Betriebssystem einen
// FREIEN Port geben und laedt das Fenster von http://127.0.0.1:<port>. Der Port
// ist bei jedem Start ein anderer — und localStorage haengt am Ursprung, also
// an Schema, Host UND Port. Jeder Neustart bekam damit einen leeren Speicher:
// Thema, Knotenfarben, KI-Zugang, topK, Auto-Lernen — alles schien verloren.

beforeEach(() => {
  // Die Huelle aus einem vorherigen Test wieder abnehmen — den echten Speicher
  // zurueckstellen, nicht die Eigenschaft loeschen (sonst gibt es gar keinen).
  const h = window.localStorage as unknown as { __keptaHuelle?: boolean; __keptaEcht?: Storage };
  if (h?.__keptaHuelle && h.__keptaEcht) {
    const echt = h.__keptaEcht;
    Object.defineProperty(window, "localStorage", { configurable: true, get: () => echt });
  }
  window.localStorage.clear();
});
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

describe("Welche Schluessel gehoeren K3PTA", () => {
  it("erkennt die eigenen und laesst fremde in Ruhe", () => {
    expect(gehoertUns("kepta_type_colors")).toBe(true);
    expect(gehoertUns("ki_gehirn_topK")).toBe(true);
    expect(gehoertUns("theme")).toBe(true);
    expect(gehoertUns("irgendwas_anderes")).toBe(false);
    expect(gehoertUns("sentry_session")).toBe(false);
  });
});

describe("Einstellungen kommen nach dem Neustart zurueck", () => {
  it("legt die abgelegten Werte in den Browserspeicher", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      theme: "dark", kepta_type_colors: '{"semantic":"#ff3366"}', ki_gehirn_topK: "50",
    }), { status: 200 })));
    const n = await ladeEinstellungen();
    expect(n).toBe(3);
    expect(localStorage.getItem("theme")).toBe("dark");
    expect(localStorage.getItem("ki_gehirn_topK")).toBe("50");
  });

  it("ueberschreibt nicht, was gerade im Browser steht", async () => {
    // Wer die Anwendung benutzt hat, darf durch das Nachladen nichts
    // zurueckgesetzt bekommen.
    localStorage.setItem("theme", "light");
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ theme: "dark" }), { status: 200 })));
    await ladeEinstellungen();
    expect(localStorage.getItem("theme")).toBe("light");
  });

  it("nimmt nichts an, was nicht K3PTA gehoert", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      fremd: "boese", theme: "dark",
    }), { status: 200 })));
    await ladeEinstellungen();
    expect(localStorage.getItem("fremd")).toBeNull();
    expect(localStorage.getItem("theme")).toBe("dark");
  });

  it("bleibt still, wenn kein Server antwortet", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("offline"); }));
    await expect(ladeEinstellungen()).resolves.toBe(0);
  });
});

describe("Jede Aenderung wird mitgeschrieben", () => {
  it("schickt gesetzte Werte gebuendelt an den Server", async () => {
    const rufe: unknown[] = [];
    vi.stubGlobal("fetch", vi.fn(async (_u: string, o?: RequestInit) => {
      if (o?.method === "PUT") rufe.push(JSON.parse(String(o.body)));
      return new Response("{}", { status: 200 });
    }));
    spiegleEinstellungen();
    localStorage.setItem("theme", "dark");
    localStorage.setItem("ki_gehirn_topK", "50");
    await new Promise((r) => setTimeout(r, 700));
    // EIN Aufruf fuer beide — nicht einer je Tastendruck.
    expect(rufe).toHaveLength(1);
    expect(rufe[0]).toEqual({ theme: "dark", ki_gehirn_topK: "50" });
  });

  it("meldet auch das Loeschen einer Einstellung", async () => {
    const rufe: Record<string, unknown>[] = [];
    vi.stubGlobal("fetch", vi.fn(async (_u: string, o?: RequestInit) => {
      if (o?.method === "PUT") rufe.push(JSON.parse(String(o.body)));
      return new Response("{}", { status: 200 });
    }));
    spiegleEinstellungen();
    localStorage.setItem("theme", "dark");
    localStorage.removeItem("theme");
    await new Promise((r) => setTimeout(r, 700));
    expect(rufe[0].theme).toBeNull();
  });

  it("laesst fremde Schluessel unangetastet", async () => {
    const rufe: Record<string, unknown>[] = [];
    vi.stubGlobal("fetch", vi.fn(async (_u: string, o?: RequestInit) => {
      if (o?.method === "PUT") rufe.push(JSON.parse(String(o.body)));
      return new Response("{}", { status: 200 });
    }));
    spiegleEinstellungen();
    localStorage.setItem("fremdes_werkzeug", "x");
    await new Promise((r) => setTimeout(r, 700));
    expect(rufe).toHaveLength(0);
    expect(localStorage.getItem("fremdes_werkzeug")).toBe("x");
  });

  it("haengt sich nur einmal ein", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 200 })));
    spiegleEinstellungen();
    const ersteHuelle = window.localStorage;
    spiegleEinstellungen();
    expect(window.localStorage).toBe(ersteHuelle);
  });

  it("starteEinstellungen macht beides", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ theme: "dark" }), { status: 200 })));
    await starteEinstellungen();
    expect(localStorage.getItem("theme")).toBe("dark");
    expect((window.localStorage as unknown as Record<string, unknown>).__keptaHuelle).toBe(true);
  });
});

// Befund F4 aus dem Persona-Durchlauf vom 8.9.2026: nach dem Leeren des
// Speichers und einem Neuladen stand die alte Gruppierung wieder da, und der
// Einrichtungsassistent erschien nicht. clear() raeumte nur den Browser —
// settings.json im Datenordner behielt alles und spielte es zurueck.
describe("Leeren und Schliessen", () => {
  it("clear() leert auch den Datenordner, fremde Schluessel bleiben draussen", async () => {
    const rufe: Record<string, unknown>[] = [];
    vi.stubGlobal("fetch", vi.fn(async (_u: string, o?: RequestInit) => {
      if (o?.method === "PUT") rufe.push(JSON.parse(String(o.body)));
      return new Response("{}", { status: 200 });
    }));
    spiegleEinstellungen();
    localStorage.setItem("ki_gehirn_gruppierung", "datei");
    localStorage.setItem("ki_gehirn_wizard_dismissed", "1");
    localStorage.setItem("fremdes_werkzeug", "x");
    await new Promise((r) => setTimeout(r, 700));
    localStorage.clear();
    await new Promise((r) => setTimeout(r, 700));
    expect(rufe).toHaveLength(2);
    expect(rufe[1]).toEqual({ ki_gehirn_gruppierung: null, ki_gehirn_wizard_dismissed: null });
    expect(localStorage.getItem("fremdes_werkzeug")).toBeNull();
  });

  it("schickt beim Schliessen des Fensters sofort, was noch wartet", async () => {
    const aufrufe: RequestInit[] = [];
    vi.stubGlobal("fetch", vi.fn(async (_u: string, o?: RequestInit) => {
      if (o?.method === "PUT") aufrufe.push(o);
      return new Response("{}", { status: 200 });
    }));
    spiegleEinstellungen();
    localStorage.setItem("theme", "dark");
    window.dispatchEvent(new Event("pagehide"));
    // Sofort statt nach 400 ms — und so, dass der Aufruf das Schliessen uebersteht.
    expect(aufrufe).toHaveLength(1);
    expect(aufrufe[0].keepalive).toBe(true);
    expect(JSON.parse(String(aufrufe[0].body))).toEqual({ theme: "dark" });
    await new Promise((r) => setTimeout(r, 700));
    // Der gebuendelte Aufruf faellt weg — nichts wird doppelt geschickt.
    expect(aufrufe).toHaveLength(1);
  });
});
