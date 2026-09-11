// @vitest-environment node
//
// Der Datenbankschlüssel: erzeugt, im Schlüsselbund des Systems abgelegt,
// gegengelesen — und nie im Klartext in einer Argumentliste, wo es sich vermeiden
// lässt. Die Programme (security, PowerShell, secret-tool) werden hier durch
// einen Schlüsselbund im Speicher ersetzt.
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  DIENST,
  KONTO,
  istSchluessel,
  macSchluesselbund,
  windowsSchluesselbund,
  linuxSchluesselbund,
  schluesselbundFuer,
  holeOderErzeugeSchluessel,
  schluesselbundKeyProvider,
  standardAusfuehren,
  type Ausfuehren,
  type Schluesselbund,
} from "../../src/core/schluessel";

const SCHLUESSEL = "a".repeat(64);

function fehlerMitCode(status: number): Error {
  return Object.assign(new Error(`exit ${status}`), { status });
}

/** Ein Aufrufer, der alles mitschreibt und Antworten aus einer Liste gibt. */
function aufzeichner(antworten: Array<string | Error> = []) {
  const aufrufe: Array<{ befehl: string; argumente: string[]; input?: string; env?: Record<string, string> }> = [];
  const ausf: Ausfuehren = (befehl, argumente, optionen) => {
    aufrufe.push({ befehl, argumente, input: optionen?.input, env: optionen?.env });
    const a = antworten.shift();
    if (a instanceof Error) throw a;
    return a ?? "";
  };
  return { ausf, aufrufe };
}

/** Ein Schlüsselbund im Speicher. */
function speicherBund(start: string | null = null, verschluckt = false): Schluesselbund & { inhalt: string | null } {
  return {
    name: "Test-Bund",
    inhalt: start,
    lesen() { return this.inhalt; },
    ablegen(hex) { if (!verschluckt) this.inhalt = hex; },
  };
}

describe("istSchluessel", () => {
  it("verlangt genau 64 Hex-Zeichen", () => {
    expect(istSchluessel(SCHLUESSEL)).toBe(true);
    expect(istSchluessel("A".repeat(64))).toBe(true);
    expect(istSchluessel("a".repeat(63))).toBe(false);
    expect(istSchluessel("g".repeat(64))).toBe(false);
  });
});

describe("macOS: security", () => {
  it("liest den Eintrag und schneidet den Zeilenumbruch ab", () => {
    const { ausf, aufrufe } = aufzeichner([`${SCHLUESSEL}\n`]);
    expect(macSchluesselbund(ausf).lesen()).toBe(SCHLUESSEL);
    expect(aufrufe[0].befehl).toBe("/usr/bin/security");
    expect(aufrufe[0].argumente).toEqual(["find-generic-password", "-s", DIENST, "-a", KONTO, "-w"]);
  });

  it("Exit-Code 44 heisst: noch kein Schluessel", () => {
    const { ausf } = aufzeichner([fehlerMitCode(44)]);
    expect(macSchluesselbund(ausf).lesen()).toBeNull();
  });

  it("jeder andere Fehler wird nicht verschluckt", () => {
    const { ausf } = aufzeichner([fehlerMitCode(51)]);
    expect(() => macSchluesselbund(ausf).lesen()).toThrow("exit 51");
  });

  it("legt ab und ueberschreibt einen alten Eintrag (-U)", () => {
    const { ausf, aufrufe } = aufzeichner();
    macSchluesselbund(ausf).ablegen(SCHLUESSEL);
    expect(aufrufe[0].argumente).toEqual(expect.arrayContaining(["add-generic-password", "-U", "-s", DIENST, "-a", KONTO, "-w", SCHLUESSEL]));
  });
});

describe("Windows: DPAPI", () => {
  it("ohne Datei gibt es noch keinen Schluessel — PowerShell wird gar nicht erst gestartet", () => {
    const { ausf, aufrufe } = aufzeichner();
    expect(windowsSchluesselbund(path.join(os.tmpdir(), "gibt-es-nicht.dpapi"), ausf).lesen()).toBeNull();
    expect(aufrufe).toHaveLength(0);
  });

  it("liest ueber PowerShell; der Pfad geht ueber die Umgebung", () => {
    const datei = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "kepta-dpapi-")), "database-key.dpapi");
    fs.writeFileSync(datei, "Zm9v");
    const { ausf, aufrufe } = aufzeichner([`${SCHLUESSEL}\r\n`]);
    expect(windowsSchluesselbund(datei, ausf).lesen()).toBe(SCHLUESSEL);
    expect(aufrufe[0].befehl).toBe("powershell.exe");
    expect(aufrufe[0].env).toEqual({ KEPTA_SCHLUESSELDATEI: datei });
    expect(aufrufe[0].argumente.join(" ")).toContain("Unprotect");
  });

  it("legt ab, ohne dass der Schluessel in der Argumentliste steht", () => {
    const { ausf, aufrufe } = aufzeichner();
    windowsSchluesselbund("C:\\kepta\\database-key.dpapi", ausf).ablegen(SCHLUESSEL);
    expect(aufrufe[0].argumente.join(" ")).not.toContain(SCHLUESSEL);
    expect(aufrufe[0].env?.KEPTA_SCHLUESSEL).toBe(SCHLUESSEL);
    expect(aufrufe[0].argumente.join(" ")).toContain("Protect");
  });

  it("eine leere Antwort gilt als kein Schluessel", () => {
    const datei = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "kepta-dpapi-")), "database-key.dpapi");
    fs.writeFileSync(datei, "Zm9v");
    const { ausf } = aufzeichner(["\r\n"]);
    expect(windowsSchluesselbund(datei, ausf).lesen()).toBeNull();
  });
});

describe("Linux: secret-tool", () => {
  it("liest den Eintrag", () => {
    const { ausf, aufrufe } = aufzeichner([SCHLUESSEL]);
    expect(linuxSchluesselbund(ausf).lesen()).toBe(SCHLUESSEL);
    expect(aufrufe[0].argumente).toEqual(["lookup", "service", DIENST, "account", KONTO]);
  });

  it("Exit-Code 1 heisst: noch kein Schluessel; ein fehlendes Programm wird gemeldet", () => {
    expect(linuxSchluesselbund(aufzeichner([fehlerMitCode(1)]).ausf).lesen()).toBeNull();
    const fehlt = Object.assign(new Error("spawnSync secret-tool ENOENT"), { code: "ENOENT" });
    expect(() => linuxSchluesselbund(aufzeichner([fehlt]).ausf).lesen()).toThrow(/secret-tool not found, ENOENT.*KEPTA_DB_KEY/);
    expect(() => linuxSchluesselbund(aufzeichner([fehlerMitCode(3)]).ausf).lesen()).toThrow("exit 3");
  });

  it("legt ueber stdin ab, nicht ueber die Argumentliste", () => {
    const { ausf, aufrufe } = aufzeichner();
    linuxSchluesselbund(ausf).ablegen(SCHLUESSEL);
    expect(aufrufe[0].input).toBe(SCHLUESSEL);
    expect(aufrufe[0].argumente.join(" ")).not.toContain(SCHLUESSEL);
  });
});

describe("schluesselbundFuer", () => {
  it("waehlt je Betriebssystem den passenden Schluesselbund", () => {
    expect(schluesselbundFuer("darwin", "/d")?.name).toBe("macOS Keychain");
    expect(schluesselbundFuer("win32", "C:\\d")?.name).toBe("Windows DPAPI");
    expect(schluesselbundFuer("linux", "/d")?.name).toBe("Secret Service");
    expect(schluesselbundFuer("freebsd", "/d")).toBeNull();
  });
});

describe("holeOderErzeugeSchluessel", () => {
  it("nimmt KEPTA_DB_KEY, wenn gesetzt — und prueft ihn", () => {
    expect(holeOderErzeugeSchluessel(null, { KEPTA_DB_KEY: SCHLUESSEL }).toString("hex")).toBe(SCHLUESSEL);
    expect(() => holeOderErzeugeSchluessel(null, { KEPTA_DB_KEY: "zu-kurz" })).toThrow("64 hexadecimal");
  });

  it("ohne Schluesselbund und ohne KEPTA_DB_KEY: klare Meldung statt Klartext-Stille", () => {
    expect(() => holeOderErzeugeSchluessel(null, {})).toThrow("No keychain on this system");
  });

  it("nimmt einen vorhandenen Schluessel und lehnt einen fremden Eintrag ab", () => {
    expect(holeOderErzeugeSchluessel(speicherBund(SCHLUESSEL), {}).toString("hex")).toBe(SCHLUESSEL);
    expect(() => holeOderErzeugeSchluessel(speicherBund("kein-schluessel"), {})).toThrow("not a KEPTA key");
  });

  it("erzeugt einen neuen, legt ihn ab und liest ihn gegen", () => {
    const bund = speicherBund(null);
    const schluessel = holeOderErzeugeSchluessel(bund, {}, () => Buffer.alloc(32, 7));
    expect(schluessel.toString("hex")).toBe("07".repeat(32));
    expect(bund.inhalt).toBe("07".repeat(32));
  });

  it("verschluckt der Schluesselbund den neuen Schluessel, wird NICHT verschluesselt", () => {
    // Sonst waere die Wissensbasis mit einem Schluessel verschlossen, den niemand mehr hat.
    expect(() => holeOderErzeugeSchluessel(speicherBund(null, true), {}, () => Buffer.alloc(32, 7))).toThrow("could not be read back");
  });

  it("erzeugt echte Zufallsschluessel, wenn niemand einen vorgibt", () => {
    const a = holeOderErzeugeSchluessel(speicherBund(null), {});
    const b = holeOderErzeugeSchluessel(speicherBund(null), {});
    expect(a).toHaveLength(32);
    expect(a.equals(b)).toBe(false);
  });
});

describe("schluesselbundKeyProvider", () => {
  it("nennt die Ablage und liefert den Schluessel aus dem Schluesselbund", () => {
    const { ausf } = aufzeichner([SCHLUESSEL]);
    const provider = schluesselbundKeyProvider("/d", "darwin", ausf, {});
    expect(provider.ablage).toBe("macOS Keychain");
    expect(Buffer.from(provider.keyFor("/d/kepta.db")!).toString("hex")).toBe(SCHLUESSEL);
  });

  it("mit KEPTA_DB_KEY heisst die Ablage auch so", () => {
    const provider = schluesselbundKeyProvider("/d", "linux", aufzeichner().ausf, { KEPTA_DB_KEY: SCHLUESSEL });
    expect(provider.ablage).toBe("KEPTA_DB_KEY");
  });

  it("KEPTA_ENCRYPTION=off laesst die Wissensbasis unverschluesselt", () => {
    const provider = schluesselbundKeyProvider("/d", "darwin", aufzeichner().ausf, { KEPTA_ENCRYPTION: "off" });
    expect(provider.keyFor("/d/kepta.db")).toBeNull();
    expect(provider.ablage).toBeUndefined();
  });
});

describe("standardAusfuehren", () => {
  it("ruft ein Programm auf und gibt seine Ausgabe zurueck, auch mit stdin und Umgebung", () => {
    const aus = standardAusfuehren(
      process.execPath,
      ["-e", "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>process.stdout.write(s+process.env.KEPTA_PROBE))"],
      { input: "hallo-", env: { KEPTA_PROBE: "welt" } },
    );
    expect(aus).toBe("hallo-welt");
  });
});
