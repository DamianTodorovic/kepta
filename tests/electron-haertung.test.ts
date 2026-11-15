import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

// Die Electron-Huelle ist der Teil, den Nutzer herunterladen — und der Teil,
// in dem ein einzelnes falsches Flag aus einem lokalen Werkzeug ein Einfallstor
// macht. Die Haertung stand beim Nachpruefen vollstaendig da; damit sie das
// bleibt, steht sie ab jetzt hier. Ein statischer Test, weil sich der
// Hauptprozess in der Suite nicht starten laesst — er faengt genau die
// Aenderung ab, die man beim Umbauen versehentlich macht.

const quelle = fs.readFileSync(path.join(process.cwd(), "electron.js"), "utf-8");

describe("Electron-Haertung", () => {
  it("das Fenster laeuft ohne Node-Zugriff, isoliert und im Sandkasten", () => {
    expect(quelle).toMatch(/nodeIntegration:\s*false/);
    expect(quelle).toMatch(/contextIsolation:\s*true/);
    expect(quelle).toMatch(/sandbox:\s*true/);
  });

  it("erlaubt nirgends nodeIntegration oder abgeschaltete Isolation", () => {
    expect(quelle).not.toMatch(/nodeIntegration:\s*true/);
    expect(quelle).not.toMatch(/contextIsolation:\s*false/);
    expect(quelle).not.toMatch(/webSecurity:\s*false/);
    expect(quelle).not.toMatch(/allowRunningInsecureContent:\s*true/);
  });

  it("fuehrt Navigation nach draussen in den Systembrowser statt ins Fenster", () => {
    expect(quelle).toMatch(/will-navigate/);
    expect(quelle).toMatch(/event\.preventDefault\(\)/);
    expect(quelle).toMatch(/setWindowOpenHandler/);
    expect(quelle).toMatch(/shell\.openExternal/);
    // Ein Handler, der stumpf 'allow' zurueckgibt, waere schlimmer als keiner.
    expect(quelle).toMatch(/action:\s*['"]deny['"]/);
  });

  it("lehnt Geraeteberechtigungen ab — erlaubt ist nur, in die Zwischenablage zu SCHREIBEN", () => {
    // Bis 2.11 lehnte die Huelle wirklich alles ab — auch das Schreiben in die
    // Zwischenablage, und jeder Kopier-Knopf der App tat still nichts. Seit
    // 2.12 gilt genau eine Ausnahme; Kamera, Mikrofon, Standort und das LESEN
    // der Zwischenablage bleiben gesperrt.
    expect(quelle).toMatch(/setPermissionRequestHandler\(\(_wc, permission, callback\) => callback\(nurSchreiben\(permission\)\)\)/);
    expect(quelle).toMatch(/setPermissionCheckHandler\(\(_wc, permission\) => nurSchreiben\(permission\)\)/);
    const regel = /const nurSchreiben = \(permission\) => ([^;]+);/.exec(quelle)?.[1];
    expect(regel).toBe("permission === 'clipboard-sanitized-write'");
    const nurSchreiben = new Function("permission", `return ${regel};`) as (permission: string) => boolean;
    for (const recht of ["media", "geolocation", "notifications", "clipboard-read", "midi", "midiSysex", "pointerLock", "fullscreen", "openExternal", "hid", "serial", "usb"]) {
      expect(nurSchreiben(recht), recht).toBe(false);
    }
    expect(nurSchreiben("clipboard-sanitized-write")).toBe(true);
  });

  it("laesst keine eingebetteten Webviews zu", () => {
    expect(quelle).toMatch(/will-attach-webview/);
  });

  it("oeffnet fremde Fenster nur fuer den eigenen Rechner", () => {
    expect(quelle).toMatch(/hostname\s*===\s*['"]localhost['"]/);
    expect(quelle).toMatch(/hostname\s*===\s*['"]127\.0\.0\.1['"]/);
  });
});

  // Die App liefert keine Web-Schrift: index.css nutzt nur System-Schriften über
  // Variablen, kein @font-face, kein Schrift-Link in index.html. Die zwei Fremden
  // im Inhalts-Sicherheitsplan waren deshalb totes Einverständnis — jemand hängt
  // ein <link> an, und das Fenster holt beim ersten Start Schriften bei Google ab.
  // Bei einer App, deren Versprechen „läuft ganz auf diesem Rechner" ist, ist das
  // kein Formelfrage.
  describe("Der Inhalts-Sicherheitsplan holt keine Schrift von einem Fremdrechner", () => {
    const csp = quelle.match(/'Content-Security-Policy': \[(`[^`]+`)\]/)?.[1] ?? "";

    it("die Richtschnur steht überhaupt da", () => {
      expect(csp.length, "kein CSP-String in electron.js gefunden").toBeGreaterThan(40);
    });

    it("nennt keine Schrift-Auslieferung im style- und font-Ziel", () => {
      expect(csp).not.toMatch(/fonts\.googleapis\.com/);
      expect(csp).not.toMatch(/fonts\.gstatic\.com/);
      const fontSrc = csp.match(/font-src([^;]*)/)?.[1] ?? "";
      expect(fontSrc, `font-src erlaubt weiter: ${fontSrc.trim()}`).not.toMatch(/https?:/);
    });

    it("lässt die eingebetteten Schriften und Daten-Quellen zu", () => {
      const fontSrc = csp.match(/font-src([^;]*)/)?.[1] ?? "";
      expect(fontSrc).toContain("'self'");
      expect(fontSrc).toContain("data:");
    });
  });

// Der Rest des Zauns. Gemessen am ausgelieferten Fenster-Buendel ruft die
// Flaeche keinen Cloud-Host und malt kein fernes Bild (P8-AUSSEN-PFADE-0211.md
// §2b: 82 fetch-Ziele auf /api, 10 nachgelesene Variable, davon zwei localhost-
// Modell-Sonden). Was die CSP damals trotzdem erlaubte: acht Anbieter-Hoste in
// connect-src — eine Erlaubnis ohne Verbraucher — und jedes https-Bild in
// img-src. Beides ist hier die Latte, damit es nicht wieder einzieht.
describe("Der Inhalts-Sicherheitsplan ruft selber nichts nach aussen", () => {
  const csp = quelle.match(/'Content-Security-Policy': \[(`[^`]+`)\]/)?.[1] ?? "";

  /** Alle Quellen einer Richtschnur, als Einzelworte. */
  function quellen(richtschnur: string): string[] {
    return (csp.match(new RegExp(richtschnur + "([^;]*)"))?.[1] ?? "")
      .trim()
      .split(/\s+/)
      .filter(Boolean);
  }

  it("connect-src nennt nur die eigne Flaeche und diesen Rechner", () => {
    const auswaertig = quellen("connect-src").filter(
      (q) => !/^'self'$/.test(q) && !/^http:\/\/(localhost|127\.0\.0\.1)(:\*)?$/.test(q),
    );
    expect(auswaertig, "connect-src erlaubt weiter: " + auswaertig.join(" ")).toEqual([]);
  });

  it("img-src malt kein Bild von einem Fremdrechner", () => {
    const nackte = quellen("img-src").filter((q) => q === "https:" || q === "http:" || q === "*");
    expect(nackte, "img-src laesst jedes ferne Bild zu: " + nackte.join(" ")).toEqual([]);
  });

  it("laesst eingebettete Bilder und die Bilder von diesem Rechner zu", () => {
    const bild = quellen("img-src");
    expect(bild).toContain("'self'");
    expect(bild).toContain("data:");
    expect(bild.some((q) => /^http:\/\/(localhost|127\.0\.0\.1)/.test(q))).toBe(true);
  });

  it("in dem Plan steht kein Anbieter-Host aus dem Katalog", () => {
    const anbieter = csp.match(/https?:\/\/(api|models|generativelanguage)[a-z0-9.-]*\.[a-z]{2,}/gi) ?? [];
    expect(anbieter, "der Plan nennt Anbieter-Hoste: " + [...new Set(anbieter)].join(" ")).toEqual([]);
  });
});
