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
// Die neuen Exporte (ohneSchluessel, LESE-/SCHREIB_TIMEOUT_MS, wegweiser) werden
// wegweiser) werden Namespace-weise geholt: im roten Stand fehlen sie noch, und
// jeder Befund soll einzeln rot werden — nicht die ganze Datei auf einmal.
import * as schluesselModul from "../../src/core/schluessel";

const SCHLUESSEL = "a".repeat(64);

function fehlerMitCode(status: number): Error {
  return Object.assign(new Error(`exit ${status}`), { status });
}

/** Ein Aufrufer, der alles mitschreibt und Antworten aus einer Liste gibt. */
function aufzeichner(antworten: Array<string | Error> = []) {
  const aufrufe: Array<{ befehl: string; argumente: string[]; input?: string; env?: Record<string, string>; timeout?: number }> = [];
  const ausf: Ausfuehren = (befehl, argumente, optionen) => {
    aufrufe.push({ befehl, argumente, input: optionen?.input, env: optionen?.env, timeout: optionen?.timeout });
    const a = antworten.shift();
    if (a instanceof Error) throw a;
    return a ?? "";
  };
  return { ausf, aufrufe };
}

/** Der von A1 different gemessene Fehlertext — so, wie execFileSync ihn wirft:
 *  die ganze Argumentliste im Text, der Grund auf stderr, der Code in status. */
function befehlFehler(hex: string): Error {
  return Object.assign(
    new Error(
      `Command failed: /usr/bin/security add-generic-password -s ${DIENST} -a ${KONTO} -l KEPTA database key -w ${hex}\n` +
        "security: SecKeychainItemCreateFromContent (<default>): The authorization was canceled by the user.",
    ),
    {
      status: 1,
      stderr: "security: SecKeychainItemCreateFromContent (<default>): The authorization was canceled by the user.",
    },
  );
}
const BEFEHL_FEHLER = (hex: string) => befehlFehler(hex);

/** Eine Zeitsammlung für die Fortschrittszeilen (A1-10: leerer Bildschirm). */
function meldesammlung() {
  const zeilen: string[] = [];
  return { zeilen, melden: (text: string) => zeilen.push(text) };
}

/** Ein Schlüsselbund im Speicher. */
function speicherBund(start: string | null = null, verschluckt = false): Schluesselbund & { inhalt: string | null } {
  return {
    name: "Test-Bund",
    wegweiser: "test-bund lookup",
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

  it("jeder andere Fehler wird nicht verschluckt — aber uebersetzt (A1-22)", () => {
    const { ausf } = aufzeichner([fehlerMitCode(51)]);
    expect(() => macSchluesselbund(ausf).lesen()).toThrow(/exited with code 51/);
  });

  it("legt an, OHNE zu überschreiben — kein -U mehr (22.9.-Lebensretter)", () => {
    const { ausf, aufrufe } = aufzeichner();
    macSchluesselbund(ausf).ablegen(SCHLUESSEL);
    expect(aufrufe[0].argumente).toEqual(expect.arrayContaining(["add-generic-password", "-s", DIENST, "-a", KONTO, "-w", SCHLUESSEL]));
    expect(aufrufe[0].argumente).not.toContain("-U");
  });

  it("Exit 45 (Eintrag existiert, Lesen schlug fehl) verweigert das Überschreiben mit Wegweiser", () => {
    const { ausf } = aufzeichner([fehlerMitCode(45)]);
    expect(() => macSchluesselbund(ausf).ablegen(SCHLUESSEL)).toThrow(/refusing to overwrite/);
  });

  // ---- A1-05 ----
  it("A1-05: ein misslungenes Ablegen nennt den Schlüssel nie — und auch nicht die Kommandozeile", () => {
    const { ausf } = aufzeichner([BEFEHL_FEHLER(SCHLUESSEL)]);
    let meldung = "";
    try {
      macSchluesselbund(ausf).ablegen(SCHLUESSEL);
    } catch (e) {
      meldung = (e as Error).message;
    }
    expect(meldung).not.toContain(SCHLUESSEL);
    expect(meldung).not.toMatch(/[0-9a-f]{64}/);
    expect(meldung).not.toMatch(/Command failed/); // A1-22: kein child_process-Rohtext
    expect(meldung).toContain("could not store its new key");
    expect(meldung).toContain("authorization was canceled by the user");
  });

  it("A1-05: die Tilgung hält einem echten execFileSync-Fehlertext stand", () => {
    // Der BefehlsText kommt von node:child_process selbst — Argumente werden
    // ahnungslos aneinandergereiht, der Schlüssel steht drin.
    const hex = "b".repeat(64);
    let roh = "";
    try {
      standardAusfuehren(process.execPath, ["-e", "process.exit(1)", "-w", hex], { timeout: 5_000 });
    } catch (e) {
      roh = (e as Error).message;
    }
    expect(roh).toContain(hex); // so begann A1-05
    expect(schluesselModul.ohneSchluessel(roh, hex)).not.toContain(hex);
    expect(schluesselModul.ohneSchluessel(roh, hex)).toContain("-w <key redacted>");
  });

  // ---- A1-10 ----
  it("A1-10: Lesen hat eine kurze Geduld — ein hängender Bund kostet nicht 20 Sekunden", () => {
    const { ausf, aufrufe } = aufzeichner([SCHLUESSEL]);
    macSchluesselbund(ausf).lesen();
    expect(aufrufe[0].timeout).toBe(schluesselModul.LESE_TIMEOUT_MS);
    expect(schluesselModul.LESE_TIMEOUT_MS / 1000).toBeLessThanOrEqual(3);
    expect(schluesselModul.LESE_TIMEOUT_MS).toBeLessThan(schluesselModul.SCHREIB_TIMEOUT_MS);
  });

  it("A1-10: beim Ablegen bleibt die Geduld gross — der Nutzer soll einen Dialog beantworten können", () => {
    const { ausf, aufrufe } = aufzeichner();
    macSchluesselbund(ausf).ablegen(SCHLUESSEL);
    expect(aufrufe[0].timeout).toBe(schluesselModul.SCHREIB_TIMEOUT_MS);
    expect(schluesselModul.SCHREIB_TIMEOUT_MS / 1000).toBeGreaterThanOrEqual(20);
  });

  it("A1-10: ein hängender Bund meldet die Wartezeit und den Ausweg, nicht nur ETIMEDOUT", () => {
    const hang = Object.assign(new Error("spawnSync /usr/bin/security ETIMEDOUT"), { code: "ETIMEDOUT" });
    const { ausf } = aufzeichner([hang]);
    let meldung = "";
    try {
      macSchluesselbund(ausf).lesen();
    } catch (e) {
      meldung = (e as Error).message;
    }
    expect(meldung).toContain("did not answer in time");
    expect(meldung).toContain("KEPTA_DB_KEY");
    expect(meldung).toContain("SECURITY.md");
  });

  it("A1-22: kein Rohtext aus child_process geht nach aussen", () => {
    const faelle: Array<[unknown, string]> = [
      [Object.assign(new Error("spawnSync /usr/bin/security ETIMEDOUT"), { code: "ETIMEDOUT" }), "did not answer in time"],
      [Object.assign(new Error("spawnSync /usr/bin/security ENOENT"), { code: "ENOENT" }), "not on this system"],
      [fehlerMitCode(51), "exited with code 51"],
      [befehlFehler("c".repeat(64)), "authorization was canceled by the user"],
    ];
    for (const [fehler, menschlich] of faelle) {
      const { ausf } = aufzeichner([fehler instanceof Error ? fehler : new Error(String(fehler))]);
      let meldung = "";
      try {
        macSchluesselbund(ausf).lesen();
      } catch (e) {
        meldung = (e as Error).message;
      }
      expect(meldung).toContain(menschlich);
      expect(meldung).not.toMatch(/spawnSync/);
      expect(meldung).not.toMatch(/Command failed/);
      expect(meldung).not.toMatch(/[0-9a-f]{64}/);
      expect(meldung).toContain("KEPTA_DB_KEY");
    }
  });

  it("A1-22: ein Fehler mit eigener Stimme behaelt sie — nur uebersetzt, nie als Rohsatz", () => {
    const { ausf } = aufzeichner([fehlerMitCode(51)]);
    let meldung = "";
    try {
      macSchluesselbund(ausf).lesen();
    } catch (e) {
      meldung = (e as Error).message;
    }
    expect(meldung).toContain("exited with code 51");
    expect(meldung).toContain(`security find-generic-password -s ${DIENST} -a ${KONTO} -w`);
  });

  it("A1-08: jeder Schlüsselbund kennt den Befehl, der seinen Schlüssel zurückholt", () => {
    expect(macSchluesselbund(aufzeichner().ausf).wegweiser).toBe(
      `security find-generic-password -s ${DIENST} -a ${KONTO} -w`,
    );
    expect(linuxSchluesselbund(aufzeichner().ausf).wegweiser).toBe(
      `secret-tool lookup service ${DIENST} account ${KONTO}`,
    );
    expect(windowsSchluesselbund("C:\\kepta\\database-key.dpapi", aufzeichner().ausf).wegweiser).toContain(
      "database-key.dpapi",
    );
  });

  it("A1-08: ein fremder Eintrag nennt den Rückhol-Befehl statt nur abzulehnen", () => {
    const bund = macSchluesselbund(aufzeichner(["fremd\n"]).ausf);
    expect(() => holeOderErzeugeSchluessel(bund, {})).toThrow(/not a KEPTA key[\s\S]*security find-generic-password/);
  });

  it("A1-08: Exit 45 schickt den Nutzer nicht auf einen Befehl, der selbst mit 45 scheitert", () => {
    const { ausf } = aufzeichner([fehlerMitCode(45)]);
    let meldung = "";
    try {
      macSchluesselbund(ausf).ablegen(SCHLUESSEL);
    } catch (e) {
      meldung = (e as Error).message;
    }
    expect(meldung).toContain("refusing to overwrite");
    expect(meldung).not.toMatch(/add-generic-password/); // der alte Wegweiser war die Tat selbst
    expect(meldung).toContain(`security find-generic-password -s ${DIENST} -a ${KONTO} -w`);
    expect(meldung).toContain("Nothing was changed");
  });

  it("A1-08: die Quelle des Schlüssels steht in der Ablage — für die Meldung des Stores", () => {
    const provider = schluesselbundKeyProvider("/d", "darwin", aufzeichner([SCHLUESSEL]).ausf, {});
    expect(provider.ablage).toBe("macOS Keychain");
    const ausDerUmgebung = schluesselbundKeyProvider("/d", "darwin", aufzeichner().ausf, { KEPTA_DB_KEY: SCHLUESSEL });
    expect(ausDerUmgebung.ablage).toBe("KEPTA_DB_KEY");
    expect(() => holeOderErzeugeSchluessel(null, { KEPTA_DB_KEY: "zu-kurz" })).toThrow(/KEPTA_DB_KEY/);
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
    expect(() => linuxSchluesselbund(aufzeichner([fehlerMitCode(3)]).ausf).lesen()).toThrow(/exited with code 3/);
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

describe("loch im bildschirm: der Nutzer sieht, was laeuft (A1-10)", () => {
  it("eine Zeile vor dem ersten Blick in den Schluesselbund — fuer beide Versuche nur eine", () => {
    const { zeilen, melden } = meldesammlung();
    const bund = speicherBund(SCHLUESSEL);
    holeOderErzeugeSchluessel(bund, {}, undefined, melden);
    expect(zeilen).toHaveLength(1);
    expect(zeilen[0]).toContain("Test-Bund");
  });

  it("beide Versuche leer: eine zweite Zeile, bevor ein neuer Schluessel angelegt wird", () => {
    const { zeilen, melden } = meldesammlung();
    holeOderErzeugeSchluessel(speicherBund(null), {}, () => Buffer.alloc(32, 7), melden);
    expect(zeilen.some((z) => /dialog|permission/i.test(z))).toBe(true);
    expect(zeilen[0]).toMatch(/checking/i);
  });

  it("die Zeile kommt auch in der Pipe — blockierend ist der Aufruf, nicht der Bildschirm", () => {
    // A1-10-Nachmessung: im ersten Entwurf hing die Zeile an process.stderr.isTTY.
    // In einer Pipe (Messharke, CI, Client) war der Bildschirm deshalb trotzdem 20 s
    // leer. stderr ist beim MCP-Server der Diagnosekanal, stdout traegt die Antwort —
    // die Zeile darf bedingungslos auf stderr.
    const wirklich = process.stderr.write.bind(process.stderr);
    let geschrieben = "";
    process.stderr.write = ((chunk: string | Uint8Array) => {
      geschrieben += chunk.toString();
      return true;
    }) as typeof process.stderr.write;
    try {
      holeOderErzeugeSchluessel(speicherBund(SCHLUESSEL), {});
    } finally {
      process.stderr.write = wirklich;
    }
    expect(geschrieben).toContain("checking the Test-Bund");
  });

  it("mit KEPTA_DB_KEY wird kein Bund angefasst — also auch keine Zeile", () => {
    const { zeilen, melden } = meldesammlung();
    holeOderErzeugeSchluessel(speicherBund(SCHLUESSEL), { KEPTA_DB_KEY: SCHLUESSEL }, undefined, melden);
    expect(zeilen).toHaveLength(0);
  });

  it("zwei Leseversuche vor dem Anlegen bleiben — der 22.9.-Lebensretter wirkt weiter", () => {
    // Wache, kein Befund: A1-10 verkuerzt nur das Warten, nicht die Zahl der Versuche.
    let leseAufrufe = 0;
    let gespeichert: string | null = null;
    const bund: Schluesselbund = {
      name: "macOS Keychain",
      wegweiser: "security find-generic-password",
      lesen: () => {
        leseAufrufe += 1;
        return gespeichert;
      },
      ablegen: (hex) => {
        gespeichert = hex;
      },
    };
    holeOderErzeugeSchluessel(bund, {}, () => Buffer.alloc(32, 7));
    expect(leseAufrufe).toBe(3); // zwei vor dem Anlegen, einer zum Gegenlesen
  });
});

describe("schreibrecht am datenordner (A1-16)", () => {
  function ordner(modus: number | null) {
    const basis = fs.mkdtempSync(path.join(os.tmpdir(), "kepta-schreibrecht-"));
    const ordnerName = path.join(basis, "daten");
    fs.mkdirSync(ordnerName);
    if (modus !== null) fs.chmodSync(ordnerName, modus);
    return { basis, ordnerName };
  }

  it("existierender, nicht beschreibbarer Ordner: Pfad, Grund und Pruefbefehl — VOR jedem Bund-Aufruf", () => {
    const { ordnerName } = ordner(0o500);
    const { ausf, aufrufe } = aufzeichner([`${SCHLUESSEL}\n`]);
    let meldung = "";
    try {
      schluesselbundKeyProvider(ordnerName, "darwin", ausf, {});
    } catch (e) {
      meldung = (e as Error).message;
    } finally {
      fs.chmodSync(ordnerName, 0o700);
    }
    expect(meldung).toContain(ordnerName);
    expect(meldung).toMatch(/not writable/i);
    expect(meldung).toContain(`ls -ld ${ordnerName}`);
    expect(aufrufe).toHaveLength(0); // der Bund wird gar nicht erst gefragt
  });

  it("ein Ordner, den es noch nicht gibt, ist kein Fehler — der Store legt ihn an", () => {
    const { ordnerName } = ordner(null);
    expect(() => schluesselbundKeyProvider(ordnerName, "darwin", aufzeichner([`${SCHLUESSEL}\n`]).ausf, {})).not.toThrow();
  });

  it("beschreibbarer Ordner laeuft durch, auch mit KEPTA_ENCRYPTION=off", () => {
    const { ordnerName } = ordner(0o700);
    expect(() => schluesselbundKeyProvider(ordnerName, "darwin", aufzeichner([`${SCHLUESSEL}\n`]).ausf, {})).not.toThrow();
    expect(() => schluesselbundKeyProvider(ordnerName, "darwin", aufzeichner().ausf, { KEPTA_ENCRYPTION: "off" })).not.toThrow();
  });

  it("die Umwelt darf den Befehl nicht verlieren: derselbe Text in jedem Wortlaut", () => {
    const { ordnerName } = ordner(0o500);
    let meldung = "";
    try {
      schluesselbundKeyProvider(ordnerName, "linux", aufzeichner().ausf, { KEPTA_DB_KEY: SCHLUESSEL });
    } catch (e) {
      meldung = (e as Error).message;
    } finally {
      fs.chmodSync(ordnerName, 0o700);
    }
    expect(meldung).toMatch(/KEPTA_DATA_DIR/);
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

  it("erster Leseversuch leer, zweiter findet den Schluessel: kein Anlegen, kein Überschreiben", () => {
    // 22.9.-Lebensretter: ein flüchtiger Lesefehler darf nie wie „noch kein
    // Eintrag“ aussehen. Der zweite Versuch findet den echten Schlüssel —
    // dann darf ablegen() nie angerufen werden.
    let leseAufrufe = 0;
    const bund = {
      name: "macOS Keychain",
      lesen() {
        leseAufrufe += 1;
        return leseAufrufe >= 2 ? SCHLUESSEL : null;
      },
      wegweiser: "security find-generic-password",
      ablegen() {
        throw new Error("ABLEGEN DARF NICHT PASSIEREN — der echte Schlüssel wurde im zweiten Leseversuch gefunden");
      },
    };
    expect(holeOderErzeugeSchluessel(bund, {}).toString("hex")).toBe(SCHLUESSEL);
    expect(leseAufrufe).toBe(2);
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

describe("ohne schluessel keine datei — Damians Entscheidung vom 10.10.2026", () => {
  function ordner(mitDatei: boolean) {
    const basis = fs.mkdtempSync(path.join(os.tmpdir(), "kepta-ohne-schluessel-"));
    if (mitDatei) fs.writeFileSync(path.join(basis, "kepta.db"), "SQLite format 3\0");
    return basis;
  }
  const haenger = () => Object.assign(new Error("spawnSync /usr/bin/security ETIMEDOUT"), { code: "ETIMEDOUT" });

  it("(a) neue Basis + unerschwinglicher Bund: Abbruch beim Bauen des Providers", () => {
    const d = ordner(false);
    const { ausf } = aufzeichner([haenger()]);
    let meldung = "";
    try {
      schluesselbundKeyProvider(d, "darwin", ausf, {});
    } catch (e) {
      meldung = (e as Error).message;
    }
    expect(meldung).toMatch(/was not created|no file/i);
    expect(meldung).toContain("KEPTA_DB_KEY");
    expect(meldung).toContain("openssl rand -hex 32");
    expect(meldung).toContain("KEPTA_ENCRYPTION=off");
    expect(fs.existsSync(path.join(d, "kepta.db"))).toBe(false);
  });

  it("(b) bestehende Basis + unerschwinglicher Bund: der Provider Bau sperrt niemanden aus", () => {
    const d = ordner(true);
    const { ausf } = aufzeichner([haenger(), haenger()]);
    expect(() => schluesselbundKeyProvider(d, "darwin", ausf, {})).not.toThrow();
    // keyFor darf weiterhin scheitern — die erklaerung uebernimmt der Store, die
    // Datei bleibt, wie sie ist. Nur die Neuanlage wird hart verweigert.
  });

  it("(c) ausdruecklich abgeschaltet ist keine noch so stille Panne: KEPTA_ENCRYPTION=off", () => {
    const d = ordner(false);
    const provider = schluesselbundKeyProvider(d, "darwin", aufzeichner().ausf, { KEPTA_ENCRYPTION: "off" });
    expect(provider.keyFor(path.join(d, "kepta.db"))).toBeNull();
    expect(fs.existsSync(path.join(d, "kepta.db"))).toBe(false); // der Provider schreibt keine Datei, das macht der Store
  });

  it("A1-04: ein 63-er Schluessel bricht die Neuanlage ab, mit der fehlenden Zahl im Wortlaut", () => {
    const d = ordner(false);
    let meldung = "";
    try {
      schluesselbundKeyProvider(d, "darwin", aufzeichner().ausf, { KEPTA_DB_KEY: "a".repeat(63) });
    } catch (e) {
      meldung = (e as Error).message;
    }
    expect(meldung).toMatch(/got 63, need 64/);
    expect(meldung).toContain("openssl rand -hex 32");
    expect(meldung).toMatch(/was not created|no file/i);
    expect(fs.existsSync(path.join(d, "kepta.db"))).toBe(false);
  });

  it("A1-04: dieselbe Zahl bei bestehender Datei — erklaeren, nicht aussperren", () => {
    const d = ordner(true);
    const provider = schluesselbundKeyProvider(d, "darwin", aufzeichner().ausf, { KEPTA_DB_KEY: "a".repeat(63) });
    expect(() => provider.keyFor(path.join(d, "kepta.db"))).toThrow(/got 63, need 64/);
  });

  it("ein gesetzter, gueltiger Schluessel laeuft durch, ohne den Bund zu fragen", () => {
    const d = ordner(false);
    const { ausf, aufrufe } = aufzeichner();
    const provider = schluesselbundKeyProvider(d, "darwin", ausf, { KEPTA_DB_KEY: SCHLUESSEL });
    expect(Buffer.from(provider.keyFor(path.join(d, "kepta.db"))!).toString("hex")).toBe(SCHLUESSEL);
    expect(aufrufe).toHaveLength(0);
  });

  it("der Schluessel wird einmal geholt und nicht zweimal beim Bund geklopft", () => {
    // Ein Schluesselbund, der antwortet: lesen gibt Zurückgelesenes, ablegen merkt sich
    // den Wert, den KEPTA in der Argumentliste vorbietet.
    let gespeichert: string | null = null;
    let zaehler = 0;
    const ausf: Ausfuehren = (_befehl, argumente) => {
      zaehler += 1;
      if (argumente[0] === "find-generic-password") return gespeichert ?? "";
      gespeichert = argumente[argumente.indexOf("-w") + 1];
      return "";
    };
    const d = ordner(false);
    const provider = schluesselbundKeyProvider(d, "darwin", ausf, {});
    const erster = Buffer.from(provider.keyFor(path.join(d, "kepta.db"))!).toString("hex");
    const zweiter = Buffer.from(provider.keyFor(path.join(d, "kepta.db"))!).toString("hex");
    expect(erster).toMatch(/^[0-9a-f]{64}$/);
    expect(zweiter).toBe(erster);
    expect(zaehler).toBe(4); // lesen, lesen, ablegen, gegenlesen — kein zweiter Durchlauf
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
