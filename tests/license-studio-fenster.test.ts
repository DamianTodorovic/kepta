// @vitest-environment node
//
// Das Fenster von K3PTA License Studio (tools/license-studio/index.html) in
// jsdom — mit window.studio so, wie contextBridge es anlegt: als nicht
// konfigurierbare Eigenschaft. Genau daran scheiterte die erste Fassung:
// `const studio = window.studio` ist dann ein SyntaxError, das ganze Skript
// lief nicht, und die Statuszeile blieb bei „Prüfe …“ stehen.
import { describe, it, expect, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

type Fenster = Window & typeof globalThis;
const laden = createRequire(import.meta.url);
const { JSDOM, VirtualConsole } = laden("jsdom") as {
  JSDOM: new (html: string, optionen: object) => { window: Fenster };
  VirtualConsole: new () => { on(ereignis: string, tun: (e: Error) => void): void };
};

const HTML = fs.readFileSync(path.join(process.cwd(), "tools", "license-studio", "index.html"), "utf8");
const EINTRAG = { nummer: 7, name: "Sarah Mandel", key: "AAAAA-BBBBB-CCCCC", notiz: "Harbor Advisory", ausgestelltAm: "2026-09-13T12:00:00.000Z", edition: "enterprise" as const };
const STATUS = { schluessel: true, passt: true, anzahl: 1, gesperrt: [] as number[], sperrlisteGefunden: true, listeDatei: "/Users/damian/Library/Application Support/KEPTA License Studio/licenses.json", listenFehler: null };

function oeffne(ueberschreiben: Record<string, unknown> = {}, bestaetigt = true) {
  const fehler: string[] = [];
  const konsole = new VirtualConsole();
  konsole.on("jsdomError", (e) => fehler.push(e.message));
  const studio = Object.assign({
    status: vi.fn(async () => STATUS),
    ausstellen: vi.fn(async (_name: string, _notiz: string) => ({ ok: true, eintrag: EINTRAG, neu: true })),
    pruefen: vi.fn(async (_name: string, _key: string) => ({ gueltig: false, nummer: null, gesperrt: false, gehoertZu: { name: "Sarah Mandel", nummer: 7 } })),
    liste: vi.fn(async () => ({ ok: true, liste: [EINTRAG] })),
    sperren: vi.fn(async (_nummer: number, _gesperrt: boolean) => ({ ok: true, geschrieben: true, gesperrt: [7] })),
    nachricht: vi.fn(async (name: string, nummer: number, key: string, sprache: string) => `${sprache === "en" ? "Hi" : "Hallo"} ${name} ${nummer} ${key}`),
    hinweise: vi.fn(async (_name: string) => [] as string[]),
    kopieren: vi.fn(async (_text: string) => true),
    zeigeListe: vi.fn(async () => true),
  }, ueberschreiben);
  const fragen: string[] = [];
  const dom = new JSDOM(HTML, {
    runScripts: "dangerously",
    virtualConsole: konsole,
    beforeParse(window: Fenster) {
      // Wie contextBridge.exposeInMainWorld: nicht konfigurierbar, nicht überschreibbar.
      Object.defineProperty(window, "studio", { value: studio, writable: false, configurable: false, enumerable: true });
      window.Element.prototype.scrollIntoView = () => {};
      window.confirm = (frage?: string) => { fragen.push(String(frage)); return bestaetigt; };
    },
  });
  const doc = dom.window.document;
  const el = <T extends HTMLElement = HTMLElement>(id: string) => doc.getElementById(id) as T;
  const tippe = (id: string, wert: string) => {
    el<HTMLInputElement>(id).value = wert;
    el(id).dispatchEvent(new dom.window.Event("input", { bubbles: true }));
  };
  // Erst schließen, wenn die Seite fertig ist: offene Antworten (etwa ladeStatus()
  // nach dem Ausstellen) liefen sonst in ein geschlossenes Dokument.
  const zu = async () => {
    await new Promise((r) => setTimeout(r, 30));
    dom.window.close();
  };
  return { fenster: dom.window, doc, el, tippe, studio, fehler, fragen, zu };
}

async function bis(bedingung: () => boolean): Promise<void> {
  for (let i = 0; i < 100; i++) {
    if (bedingung()) return;
    await new Promise((r) => setTimeout(r, 10));
  }
  throw new Error("Zustand nicht erreicht");
}

describe("das Fenster von K3PTA License Studio", () => {
  it("läuft mit window.studio aus contextBridge — ohne Skriptfehler, Status grün, Knopf aktiv", async () => {
    const { el, fehler, zu } = oeffne();
    await bis(() => el("status").className === "status gut");
    expect(fehler).toEqual([]);
    expect(el("status").textContent).toContain("Signaturschlüssel bereit");
    expect(el<HTMLButtonElement>("erzeugen").disabled).toBe(false);
    expect(el("zahl").textContent).toBe("1");
    expect(el("sperr-info").hidden).toBe(true);
    expect(el("listen-pfad").textContent).toBe("~/Library/Application Support/K3PTA License Studio/licenses.json");
    await zu();
  });

  it("ohne Signaturschlüssel: Hinweis zum Einrichten, Knopf gesperrt", async () => {
    const { el, zu } = oeffne({ status: async () => ({ ...STATUS, schluessel: false, passt: false }) });
    await bis(() => el("status").className === "status schlecht");
    expect(el("status").textContent).toContain("node scripts/license-keypair.mjs");
    expect(el<HTMLButtonElement>("erzeugen").disabled).toBe(true);
    await zu();
  });

  it("passt der Schlüssel nicht zur App, bleibt der Knopf gesperrt", async () => {
    const { el, zu } = oeffne({ status: async () => ({ ...STATUS, passt: false }) });
    await bis(() => el("status").className === "status schlecht");
    expect(el("status").textContent).toContain("passt nicht zu K3PTA");
    expect(el<HTMLButtonElement>("erzeugen").disabled).toBe(true);
    await zu();
  });

  it("ausstellen: Name und Notiz gehen an den Hauptprozess; Nummer, Schlüssel und Nachricht erscheinen, auch auf Englisch", async () => {
    const { el, doc, tippe, studio, fehler, zu } = oeffne();
    await bis(() => !el<HTMLButtonElement>("erzeugen").disabled);
    tippe("name", "Sarah Mandel");
    tippe("notiz", "Harbor Advisory");
    el<HTMLFormElement>("form-aus").requestSubmit();
    await bis(() => !el("ergebnis").hidden);
    expect(studio.ausstellen).toHaveBeenCalledWith("Sarah Mandel", "Harbor Advisory", "enterprise", undefined);
    expect(el("erg-name").textContent).toBe("Sarah Mandel");
    expect(el("erg-nummer").textContent).toBe("0007");
    expect(el("erg-key").textContent).toBe(EINTRAG.key);
    expect(el("erg-datum").textContent).toContain("ausgestellt und geprüft");
    await bis(() => el<HTMLTextAreaElement>("nachricht").value.startsWith("Hallo"));
    expect(studio.nachricht).toHaveBeenCalledWith("Sarah Mandel", 7, EINTRAG.key, "de", "enterprise", undefined);
    expect(el<HTMLInputElement>("name").value).toBe("");
    doc.querySelector<HTMLButtonElement>('#sprache button[data-sprache="en"]')!.click();
    await bis(() => el<HTMLTextAreaElement>("nachricht").value.startsWith("Hi"));
    el("nachricht-kopieren").click();
    await bis(() => studio.kopieren.mock.calls.length === 1);
    expect(studio.kopieren).toHaveBeenCalledWith(`Hi Sarah Mandel 7 ${EINTRAG.key}`);
    el("key-kopieren").click();
    await bis(() => studio.kopieren.mock.calls.length === 2);
    expect(studio.kopieren).toHaveBeenLastCalledWith(EINTRAG.key);
    expect(fehler).toEqual([]);
    await zu();
  });

  it("gab es den Namen schon: „dieselbe Lizenz“; ein Fehler wird angezeigt", async () => {
    const wieder = oeffne({ ausstellen: async () => ({ ok: true, eintrag: EINTRAG, neu: false }) });
    await bis(() => !wieder.el<HTMLButtonElement>("erzeugen").disabled);
    wieder.el<HTMLFormElement>("form-aus").requestSubmit();
    await bis(() => !wieder.el("ergebnis").hidden);
    expect(wieder.el("erg-datum").textContent).toContain("dieselbe Lizenz, derselbe Schlüssel");
    await wieder.zu();

    const kaputt = oeffne({ ausstellen: async () => ({ ok: false, fehler: "Bitte den Namen des Kunden eingeben." }) });
    await bis(() => !kaputt.el<HTMLButtonElement>("erzeugen").disabled);
    kaputt.el<HTMLFormElement>("form-aus").requestSubmit();
    await bis(() => !kaputt.el("fehler-aus").hidden);
    expect(kaputt.el("fehler-aus").textContent).toBe("Bitte den Namen des Kunden eingeben.");
    expect(kaputt.el("ergebnis").hidden).toBe(true);
    await kaputt.zu();
  });

  it("Hinweise zum Namen erscheinen beim Tippen", async () => {
    const { el, tippe, zu } = oeffne({ hinweise: async () => ["Umlaute oder Sonderzeichen: …"] });
    tippe("name", "Jürgen Müller");
    await bis(() => el("hinweise").children.length === 1);
    expect(el("hinweise").textContent).toContain("Umlaute");
    await zu();
  });

  it("prüfen: gültig mit Nummer, gesperrt — oder: zu wem der Schlüssel gehört", async () => {
    let antwort: Record<string, unknown> = { gueltig: false, nummer: null, gesperrt: false, gehoertZu: { name: "Sarah Mandel", nummer: 7 } };
    const { el, doc, tippe, studio, zu } = oeffne({ pruefen: vi.fn(async () => antwort) });
    doc.querySelector<HTMLButtonElement>('nav button[data-ansicht="pruefen"]')!.click();
    expect(el("pruefen").hidden).toBe(false);
    tippe("p-name", "Sara Mandel");
    el<HTMLTextAreaElement>("p-key").value = EINTRAG.key;
    el<HTMLFormElement>("form-pruef").requestSubmit();
    await bis(() => !el("p-ergebnis").hidden);
    expect(studio.pruefen).toHaveBeenCalledWith("Sara Mandel", EINTRAG.key);
    expect(el("p-ergebnis").textContent).toContain("gehört zu „Sarah Mandel“ (Nr. 0007)");

    antwort = { gueltig: false, nummer: 7, gesperrt: true, gehoertZu: null };
    el<HTMLFormElement>("form-pruef").requestSubmit();
    await bis(() => el("p-ergebnis").textContent!.includes("Gesperrt — Lizenz Nr. 0007"));

    antwort = { gueltig: true, nummer: 7, gesperrt: false, gehoertZu: null };
    el<HTMLFormElement>("form-pruef").requestSubmit();
    await bis(() => el("p-ergebnis").textContent!.startsWith("✓ Gültig — Lizenz Nr. 0007"));
    await zu();
  });

  it("die Liste: Nummer und Name als Text — kein HTML aus fremder Hand; suchen; ⌘1–3 wechseln die Ansicht", async () => {
    const boese = { ...EINTRAG, name: '<img src=x onerror="window.__boese=1">', notiz: "" };
    const { el, doc, tippe, fenster, zu } = oeffne({ liste: async () => ({ ok: true, liste: [boese] }) });
    fenster.dispatchEvent(new fenster.KeyboardEvent("keydown", { key: "3", metaKey: true }));
    await bis(() => doc.querySelectorAll("#zeilen tr").length === 1);
    expect(el("liste").hidden).toBe(false);
    expect(doc.querySelector("#zeilen img")).toBeNull();
    expect(el("zeilen").textContent).toContain("<img");
    expect(el("zeilen").textContent).toContain("0007");
    expect(el("zeilen").textContent).toContain("—");
    expect((fenster as unknown as { __boese?: number }).__boese).toBeUndefined();
    tippe("suche", "0007");
    expect(doc.querySelectorAll("#zeilen tr").length).toBe(1);
    tippe("suche", "niemand");
    expect(doc.querySelectorAll("#zeilen tr").length).toBe(0);
    expect(el("leer").textContent).toBe("Kein Treffer.");
    fenster.dispatchEvent(new fenster.KeyboardEvent("keydown", { key: "2", metaKey: true }));
    expect(el("pruefen").hidden).toBe(false);
    await zu();
  });

  it("sperren: erst nach Rückfrage — danach steht die Nummer im Hinweis, der Knopf heißt „Entsperren“", async () => {
    let gesperrt = false;
    const { el, doc, studio, fragen, zu } = oeffne({
      status: async () => ({ ...STATUS, gesperrt: gesperrt ? [7] : [] }),
      liste: async () => ({ ok: true, liste: [{ ...EINTRAG, ...(gesperrt ? { gesperrt: true } : {}) }] }),
      sperren: vi.fn(async () => { gesperrt = true; return { ok: true, geschrieben: true, gesperrt: [7] }; }),
    });
    doc.querySelector<HTMLButtonElement>('nav button[data-ansicht="liste"]')!.click();
    await bis(() => doc.querySelectorAll("#zeilen tr").length === 1);
    const knopf = () => [...doc.querySelectorAll<HTMLButtonElement>("#zeilen button")].find((b) => /sperren$/i.test(b.textContent ?? ""))!;
    expect(knopf().textContent).toBe("Sperren");
    knopf().click();
    await bis(() => studio.sperren.mock.calls.length === 1);
    expect(fragen[0]).toContain("Lizenz Nr. 0007 (Sarah Mandel) sperren?");
    expect(studio.sperren).toHaveBeenCalledWith(7, true);
    await bis(() => !el("sperr-info").hidden && knopf().textContent === "Entsperren");
    expect(el("sperr-info").textContent).toContain("Gesperrt: Nr. 0007");
    expect(el("zeilen").textContent).toContain("gesperrt");
    await zu();
  });

  it("wer bei der Rückfrage abbricht, sperrt nichts", async () => {
    const { doc, studio, fragen, zu } = oeffne({}, false);
    doc.querySelector<HTMLButtonElement>('nav button[data-ansicht="liste"]')!.click();
    await bis(() => doc.querySelectorAll("#zeilen tr").length === 1);
    [...doc.querySelectorAll<HTMLButtonElement>("#zeilen button")].find((b) => b.textContent === "Sperren")!.click();
    await bis(() => fragen.length === 1);
    expect(studio.sperren).not.toHaveBeenCalled();
    await zu();
  });
});
