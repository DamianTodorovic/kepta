import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "node:net";

// Regressionsschutz für den Startfehler aus v2.2.0 (Commit 3e888f3):
// In electron.js stand `srv.address.port` statt `srv.address().port`.
// `address` ist eine Methode — als Eigenschaft gelesen liefert sie undefined.
// Die Folge war heimtueckisch: getFreePort() hat nicht abgelehnt, sondern undefined
// geliefert, der catch-Zweig griff also nie und ueberschrieb dabei den Standard 3000.
// Zwei Zeilen spaeter warf `serverPort.toString()` einen TypeError — ausserhalb des
// try-Blocks, weshalb createWindow() nie erreicht wurde. Ergebnis: Prozess lebt,
// kein Fenster, kein Port, kein Absturzbericht.
//
// electron.js laesst sich nicht importieren (ESM-Einstiegspunkt, zieht "electron" und
// startet beim Laden die App). Deshalb wird die Funktion aus der echten Quelle geloest
// und gegen das echte net-Modul ausgefuehrt — der Test prueft damit den ausgelieferten
// Code und nicht eine Kopie davon.

const electronJsPath = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "electron.js",
);
const source = readFileSync(electronJsPath, "utf8");

/** Loest den Quelltext von getFreePort() aus electron.js und macht ihn aufrufbar. */
function loadGetFreePort(): () => Promise<number> {
  const match = source.match(/function getFreePort\(\)\s*\{[\s\S]*?\n\}/);
  if (!match) {
    throw new Error(
      "getFreePort() in electron.js nicht gefunden — umbenannt oder verschoben? " +
        "Dann gehoert dieser Regressionstest angepasst, nicht geloescht.",
    );
  }
  const factory = new Function("createServer", `${match[0]}\nreturn getFreePort;`);
  return factory(createServer) as () => Promise<number>;
}

describe("electron.js — Port-Ermittlung beim Start", () => {
  it("liefert einen echten, nutzbaren Port", async () => {
    const port = await loadGetFreePort()();

    expect(Number.isInteger(port)).toBe(true);
    expect(port).toBeGreaterThan(0);
    expect(port).toBeLessThanOrEqual(65535);
  });

  it("liefert einen Port, mit dem process.env.PORT gesetzt werden kann", async () => {
    // Genau hier ist die App frueher gestorben: undefined.toString() hat geworfen.
    const port = await loadGetFreePort()();

    expect(() => String(port)).not.toThrow();
    expect(String(port)).toMatch(/^\d+$/);
  });

  it("dokumentiert den Vertrag: net-Server.address ist eine Methode", async () => {
    const srv = createServer();
    await new Promise<void>((resolve) => srv.listen(0, resolve));

    try {
      expect(typeof srv.address).toBe("function");
      // Der urspruengliche Fehler in einer Zeile:
      expect((srv.address as unknown as Record<string, unknown>).port).toBeUndefined();
      // Korrekt ist der Aufruf:
      const addr = srv.address();
      expect(addr).not.toBeNull();
      expect(typeof (addr as { port: number }).port).toBe("number");
    } finally {
      await new Promise<void>((resolve) => srv.close(() => resolve()));
    }
  });

  it("greift nirgends per Eigenschaft auf .address.port zu", () => {
    const offending = source
      .split("\n")
      .map((line, i) => ({ line: line.trim(), no: i + 1 }))
      .filter(({ line }) => /\.address\s*\.\s*port/.test(line));

    expect(
      offending,
      "`.address.port` ist immer undefined — gemeint ist `.address().port`.\n" +
        offending.map(({ no, line }) => `  electron.js:${no}: ${line}`).join("\n"),
    ).toEqual([]);
  });

  it("faellt bei fehlendem Port auf den Standardport zurueck", () => {
    // Der catch-Zweig muss den Standard wirklich wiederherstellen, und eine
    // Plausibilitaetspruefung muss einen unbrauchbaren Port abfangen, bevor
    // process.env.PORT gesetzt wird.
    expect(source).toMatch(/catch\s*\([^)]*\)\s*\{[\s\S]*?serverPort\s*=\s*3000\s*;/);
    expect(source).toMatch(/Number\.isInteger\(serverPort\)/);
  });
});
