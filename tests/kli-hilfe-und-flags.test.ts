// D2-02, D2-03, D2-09 / Z5 — die drei Dinge, die jedes Werkzeug hat und KEPTA
// nicht hatte: Hilfe hinter -h und --help, ein Maschinenformat, und Exit-Codes,
// die sagen, was passiert ist. Dazu D2-03: alles, was mit `-` beginnt, ist ein
// Schalter — niemals ein Befehl, den man korrigieren könnte.
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { APP_VERSION } from "../src/core/version";
import { farbeAn } from "../src/cli-erlebnis";
import { lauf, notizenSetzen, sandkiste } from "./kli-helfer";

const WEBER = "Ms. Weber is billed quarterly, never monthly";

describe("die Hilfetüren sind erreichbar (D2-02)", () => {
  for (const tür of ["help", "-h", "--help"]) {
    it(`“${tür}” druckt die Tafel auf stdout, Exit 0, und öffnet keine Datenbank`, async () => {
      const k = sandkiste();
      const l = await lauf([tür], k);
      expect(l.code, `stdout: ${l.aus}\nstderr: ${l.fehl}`).toBe(0);
      expect(l.aus).toMatch(/KEPTA from the terminal/);
      for (const befehl of ["remember", "recall", "timeline", "contradict", "stats", "demo", "setup"]) {
        expect(l.aus, `die Tafel erklärt ${befehl} nicht`).toContain(befehl);
      }
      expect(l.fehl).toBe("");
      // Hilfe ist eine Auskunft, kein Zugriff: kein Datenordner, keine Schlüsseldatei.
      expect(fs.existsSync(path.join(k.home, ".kepta")), `${tür} hat die Datenbank angelegt`).toBe(false);
    });
  }
});

describe("--version (D2-02: ohne Zahl kein Fehlerbericht)", () => {
  it("nennt Name und Version, Exit 0, und verlangt dafür keinen Schlüssel", async () => {
    const k = sandkiste();
    const l = await lauf(["--version"], k);
    expect(l.code, l.fehl).toBe(0);
    expect(l.aus, l.aus).toContain(`kepta ${APP_VERSION}`);
    expect(l.aus.split("\n").length).toBeLessThanOrEqual(2);
    expect(fs.existsSync(path.join(k.home, ".kepta")), "--version hat die Datenbank angelegt").toBe(false);
  });

  it("-V ist dieselbe Tür", async () => {
    expect((await lauf(["-V"], sandkiste())).code).toBe(0);
  });
});

describe("ein Schalter ist kein Befehl (D2-03)", () => {
  it("ein unbekanntes Flag wird als Flag abgewiesen — und nicht als Tippfall auf „ui“ geraten", async () => {
    const l = await lauf(["--farbig"], sandkiste());
    expect(l.code, l.fehl).toBe(2);
    expect(l.fehl).toMatch(/unknown flag: --farbig/);
    expect(l.fehl).not.toMatch(/did you mean/i);
    expect(l.fehl).toMatch(/--json/);
  });

  it("auch vor ein Wort gesetzte Flags geraten nicht in die Editier-Distanz", async () => {
    const l = await lauf(["--helpme"], sandkiste());
    expect(l.code).toBe(2);
    expect(l.fehl).toMatch(/unknown flag/);
    expect(l.fehl).not.toMatch(/did you mean/i);
  });

  it("ein Flag hinter dem Befehl wird nicht zum Suchtext (D2-09)", async () => {
    const k = sandkiste();
    notizenSetzen(k, [WEBER]);
    const l = await lauf(["recall", "weber", "--groesse", "3"], k);
    expect(l.code, l.fehl).toBe(2);
    expect(l.fehl).toMatch(/unknown flag: --groesse/);
    expect(l.fehl).not.toMatch(/No matches/);
  });
});

describe("--json für Maschinen (D2-08)", () => {
  const vier = ["stats", "recall", "timeline", "contradict"] as const;

  for (const befehl of vier) {
    it(`${befehl} --json liefert ein kompaktes JSON-Objekt ohne Farbe und ohne next`, async () => {
      const k = sandkiste();
      notizenSetzen(k, [WEBER]);
      const l = await lauf([befehl, ...(befehl === "recall" || befehl === "timeline" ? ["weber"] : []), "--json"], k);
      expect(l.code, `stdout: ${l.aus}\nstderr: ${l.fehl}`).toBe(0);
      expect(l.aus.includes("\x1b["), "Farbcodes im Maschinenformat").toBe(false);
      expect(l.aus.trim().split("\n").length, `erwartet ein Objekt in einer Zeile, bekam:\n${l.aus}`).toBe(1);
      const objekt = JSON.parse(l.aus);
      expect(objekt).toBeTypeOf("object");
      expect(l.aus).not.toMatch(/next:/);
      for (const feld of Object.keys(objekt)) expect(/^[a-z][a-zA-Z]*$/.test(feld), `Feldname ${feld} ist nicht englisch-kleinStartbuchstabe`).toBe(true);
    });
  }

  it("die Zahlen im JSON sind dieselben wie in der Prosa", async () => {
    const k = sandkiste();
    notizenSetzen(k, [WEBER, "Second note about weber billing", "Third note for weber"]);
    const prose = await lauf(["stats"], k);
    const json = await lauf(["stats", "--json"], k);
    const objekt = JSON.parse(json.aus) as { notes: number };
    const proseNotizen = Number(prose.aus.match(/(\d+) active/)?.[1]);
    expect(objekt.notes, `json: ${json.aus}\nprosa:\n${prose.aus}`).toBe(proseNotizen);
  });
});

describe("Exit-Code: Erfolg 0, Fehler nicht 0 (clig.dev)", () => {
  it("merken mit leerem Text endet nicht mit Erfolg", async () => {
    const l = await lauf(["remember", "   "], sandkiste());
    expect(l.code, `stdout: ${l.aus}\nstderr: ${l.fehl}`).not.toBe(0);
    expect(l.fehl).toMatch(/nothing to remember/i);
    expect(l.aus).toBe("");
  });

  it("erfolgreiches Merken endet mit 0", async () => {
    expect((await lauf(["remember", WEBER], sandkiste())).code).toBe(0);
  });
});

// D2-07 / Z4: clig.dev handelt Farbe verhandelbar — NO_COLOR, TERM=dumb und
// --no-color sind Pflichteingänge, und stdout, das keine Konsole ist, ist es
// auch. Die Matrix wird an der Entscheidung selbst gemessen, nicht an einer
// Pipe: eine Pipe ist immer stumm, damit bewiese sie nichts.
describe("die Farbentscheidung (D2-07)", () => {
  const ke = (o: { tty?: boolean; umgebung?: Record<string, string | undefined>; argv?: string[] }) =>
    farbeAn({ tty: o.tty ?? false, umgebung: o.umgebung ?? {}, argumente: o.argv ?? [] });

  it("ein Schalter, der nichts kostet: kein TTY, keine Farbe", () => {
    expect(ke({ tty: false })).toBe(false);
  });

  it("echtes Terminal, nichts gesetzt: Farbe", () => {
    expect(ke({ tty: true })).toBe(true);
  });

  it("NO_COLOR ist gesetzt: aus, auch im Terminal", () => {
    expect(ke({ tty: true, umgebung: { NO_COLOR: "1" } })).toBe(false);
  });

  it("TERM=dumb: aus, auch im Terminal", () => {
    expect(ke({ tty: true, umgebung: { TERM: "dumb" } })).toBe(false);
  });

  it("--no-color: aus, auch im Terminal", () => {
    expect(ke({ tty: true, argv: ["--no-color"] })).toBe(false);
  });

  it("--color=always gewinnt über NO_COLOR und über die Pipe", () => {
    expect(ke({ tty: false, umgebung: { NO_COLOR: "1" }, argv: ["--color=always"] })).toBe(true);
  });

  it("--color=always steht über --no-color — die Satzung nennt genau diese Rangfolge", () => {
    // Zwei widersprüchliche Wünsche in einem Aufruf: Die Regel in D2-07
    // entscheidet, nicht der gesunde Menschenverstand des Implementierers.
    expect(ke({ tty: true, argv: ["--color=always", "--no-color"] })).toBe(true);
  });

  it("--color=never ist dieselbe Absage wie --no-color", () => {
    expect(ke({ tty: true, argv: ["--color=never"] })).toBe(false);
  });

  it("NO_COLOR mit leerem Wert ist kein Wunsch", () => {
    // Der Standard zählt den Wert nicht, nur die Existenz — aber ein leerer
    // NO_COLOR in einer Umgebung ist meist ein Unfall, kein Beschluss.
    expect(ke({ tty: true, umgebung: { NO_COLOR: "" } })).toBe(true);
  });
});

