// @vitest-environment jsdom
//
// Quellen- und Chunk-Erkennung nach den Import-Konventionen:
// Rechner-Scan haengt "— Source: <pfad>" an, der Clipper stellt
// "Source: <url>" voran, mehrteilige Imports tragen " — 2/5" im Titel.
import { describe, it, expect, vi } from "vitest";
import {
  parseQuelle,
  parseChunkTitel,
  basisTitel,
  inhaltOhneQuelle,
  dateiName,
} from "../../src/lib/quelle";
import type { Memory } from "../../src/types";

function mem(over: Partial<Memory> = {}): Memory {
  return {
    id: "m1",
    userId: "u",
    title: "Notiz",
    content: "Inhalt",
    tags: [],
    createdAt: 1_000,
    updatedAt: 1_000,
    ...over,
  };
}

describe("parseQuelle", () => {
  it("Rechner-Scan: '— Source: <pfad>' ergibt datei mit Name und Typ", () => {
    const q = parseQuelle(mem({
      content: "Extracted text…\n\n— Source: /Users/da/Desktop/FangLotse/Gewerbe-Ummeldung.pdf",
      tags: ["machine-scan", "pdf"],
    }));
    expect(q).toEqual({
      art: "datei",
      pfad: "/Users/da/Desktop/FangLotse/Gewerbe-Ummeldung.pdf",
      name: "Gewerbe-Ummeldung.pdf",
      dateiTyp: "pdf",
    });
  });

  it("URL-Clipper: 'Source: <url>' am Anfang ergibt url mit Hostname ohne www", () => {
    const q = parseQuelle(mem({
      content: "Source: https://www.arxiv.org/abs/x\n\nVolltext…",
      tags: ["clip", "arxivorg"],
    }));
    expect(q).toEqual({ art: "url", url: "https://www.arxiv.org/abs/x", name: "arxiv.org" });
  });

  it("Inbox-Auto-Import wird erkannt", () => {
    const q = parseQuelle(mem({ content: "Text\n\n— Source: inbox eingereicht.pdf 2026-09-07" }));
    expect(q).toEqual({ art: "inbox", name: "eingereicht.pdf 2026-09-07" });
  });

  it("Handnotiz ohne Quelle: null", () => {
    expect(parseQuelle(mem({ content: "Einfach so getippt." }))).toBeNull();
  });

  it("Windows-Pfade liefern den Dateinamen hinter dem letzten Backslash", () => {
    expect(dateiName("C:\\Users\\da\\brief.docx")).toBe("brief.docx");
  });
});

describe("parseChunkTitel", () => {
  it("liest ' — 2/5' als Teil 2 von 5", () => {
    expect(parseChunkTitel("Gewerbe-Ummeldung — 2/5")).toEqual({ nr: 2, von: 5 });
  });

  it("null ohne Chunk-Suffix oder bei unsinnigen Zahlen", () => {
    expect(parseChunkTitel("Gewerbe-Ummeldung")).toBeNull();
    expect(parseChunkTitel("Gewerbe-Ummeldung — 5/2")).toBeNull();
    expect(parseChunkTitel("Gewerbe-Ummeldung — 0/5")).toBeNull();
  });

  it("basisTitel streift das Suffix und fasst alle Teile zusammen", () => {
    expect(basisTitel("Gewerbe-Ummeldung — 2/5")).toBe("Gewerbe-Ummeldung");
    expect(basisTitel("Gewerbe-Ummeldung")).toBe("Gewerbe-Ummeldung");
  });

  it("liest auch ' — Teil 2/5' — so benennen Datei-Drop und Inbox ihre Teile", () => {
    // Vorher trugen genau diese Importe kein Teil-Abzeichen.
    expect(parseChunkTitel("Gewerbe-Ummeldung — Teil 2/5")).toEqual({ nr: 2, von: 5 });
    expect(basisTitel("Gewerbe-Ummeldung — Teil 2/5")).toBe("Gewerbe-Ummeldung");
  });
});

describe("inhaltOhneQuelle", () => {
  it("entfernt die Scan-Quellzeile am Ende", () => {
    const text = inhaltOhneQuelle("Erste Zeile.\n\nZweite.\n\n— Source: /tmp/a.pdf");
    expect(text).toBe("Erste Zeile.\n\nZweite.");
  });

  it("entfernt den Clipper-URL-Prefix am Anfang", () => {
    const text = inhaltOhneQuelle("Source: https://example.com\n\nDer Artikel.");
    expect(text).toBe("Der Artikel.");
  });

  it("entschlackt Drittfache Leerzeilen", () => {
    expect(inhaltOhneQuelle("a\n\n\n\nb")).toBe("a\n\nb");
  });
});

describe("oeffneQuelle", () => {
  it("öffnet URLs im Browser (window.open)", async () => {
    const oeffnen = vi.fn();
    Reflect.deleteProperty(window, "open");
    Object.defineProperty(window, "open", { value: oeffnen, writable: true, configurable: true });
    const { oeffneQuelle } = await import("../../src/lib/quelle");
    const ok = await oeffneQuelle({ art: "url", url: "https://arxiv.org/abs/x", name: "arxiv.org" });
    expect(ok).toBe(true);
    expect(oeffnen).toHaveBeenCalledOnce();
  });

  it("Dateien gehen an den lokalen Server; Nicht-OK wird als Fehlschlag gemeldet", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 404 })));
    const { oeffneQuelle } = await import("../../src/lib/quelle");
    expect(await oeffneQuelle({ art: "datei", pfad: "/Users/da/weg.pdf", name: "weg.pdf" })).toBe(false);
  });

  it("Netzwerkfehler beim Server-Aufruf werden abgefangen", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("netz weg"); }));
    const { oeffneQuelle } = await import("../../src/lib/quelle");
    expect(await oeffneQuelle({ art: "datei", pfad: "/Users/da/x.pdf", name: "x.pdf" })).toBe(false);
  });

  it("Inbox-Vermerke sind reine Info — oeffneQuelle lehnt sie ab", async () => {
    const { oeffneQuelle } = await import("../../src/lib/quelle");
    expect(await oeffneQuelle({ art: "inbox", name: "eingereicht.pdf" })).toBe(false);
  });

  it("parseQuelle ignoriert 'Source:'-Zeilen ohne http-Präfix", () => {
    const q = parseQuelle(mem({ content: "Source: not-a-url\n\nText" }));
    expect(q).toBeNull();
  });
});
