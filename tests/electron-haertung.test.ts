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
