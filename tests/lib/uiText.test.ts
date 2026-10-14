// @vitest-environment jsdom
//
// Texte und Schriftgroesse. K3PTA ist englisch — der Deutsch-Umschalter aus
// 2.10 ist entfernt (11.9.2026).
import { describe, it, expect, beforeEach } from "vitest";
import { t, getZoom, setZoom, wendeZoomAn, TEXTE } from "../../src/lib/uiText";

describe("uiText", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("t() liefert den englischen Text und fällt auf den Schlüssel zurück", () => {
    expect(t("nav.knowledge")).toBe("Knowledge");
    expect(t("list.byFile")).toBe("By file");
    expect(t("gibt.es.nicht")).toBe("gibt.es.nicht");
  });

  it("eine alte Spracheinstellung aus 2.10 ändert nichts mehr", () => {
    localStorage.setItem("ki_gehirn_sprache", "de");
    expect(t("nav.knowledge")).toBe("Knowledge");
    expect(t("list.noSource")).toBe("No source");
  });

  it("kein Eintrag ist deutsch", () => {
    const deutsch = /[äöüÄÖÜß]|\b(und|oder|nicht|Wissen|Einstellungen|Suche|Datei|Quelle|Heute|Alle)\b/;
    for (const [k, v] of Object.entries(TEXTE)) {
      expect(v.trim().length, `${k} ist leer`).toBeGreaterThan(0);
      expect(deutsch.test(v), `${k}: „${v}“ ist nicht englisch`).toBe(false);
    }
  });

  it("Zoom kennt nur 100/115/130 — alles andere fällt auf 100", () => {
    setZoom(130);
    expect(getZoom()).toBe(130);
    localStorage.setItem("ki_gehirn_zoom", "999");
    expect(getZoom()).toBe(100);
  });
});

describe("wendeZoomAn", () => {
  it("setzt body.zoom und räumt bei 100 % auf", () => {
    setZoom(115);
    wendeZoomAn();
    expect(document.body.style.zoom).toBe("1.15");
    setZoom(100);
    wendeZoomAn();
    expect(document.body.style.zoom).toBe("");
  });
});

describe("uiText: kaputtes localStorage", () => {
  it("t(), setZoom und getZoom überleben ein werfendes localStorage", () => {
    const original = window.localStorage;
    Object.defineProperty(window, "localStorage", {
      value: {
        getItem: () => { throw new Error("kaputt"); },
        setItem: () => { throw new Error("kaputt"); },
      },
      configurable: true,
    });
    try {
      setZoom(130); // darf nicht werfen
      expect(getZoom()).toBe(100);
      expect(t("nav.chat")).toBe("Chat");
    } finally {
      Object.defineProperty(window, "localStorage", { value: original, configurable: true });
    }
  });
});
