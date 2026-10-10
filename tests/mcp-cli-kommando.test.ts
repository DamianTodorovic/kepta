import { describe, it, expect } from "vitest";
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// Q-06 / A6 B-02 — der Tippfehler-Strudel. Der Einstieg prüfte nur fünf bekannte Worte;
// alles Weitere fiel in starteMcp() und liess einen schweigenden stdin-Server entstehen:
// kein Fehler, kein Hinweis, keine Hilfe von aussen erreichbar. Ein Tippfehler im Befehl
// sah aus wie einhangender Rechner. Jetzt: Vorschlag, Befehlsliste, Exit 2 — und der
// Argument-lose Start (der normale Weg für Claude, Cursor & Co.) bleibt unangetastet.

const tsx = path.join(process.cwd(), "node_modules", ".bin", "tsx");
const quelle = path.join("src", "mcp-server.ts");

interface Lauf {
  code: number | null;
  aus: string;
  fehl: string;
}

/** Der echte Prozessstart, in einer eigenen HOME mit eigenem Schluessel. */
async function starte(args: string[], { warteMs = 25_000, stdinSchliessen = false } = {}): Promise<Lauf> {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "kepta-k2-cli-"));
  const kind = spawn(tsx, [quelle, ...args], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      HOME: home,
      KEPTA_DATA_DIR: path.join(home, ".kepta"),
      KEPTA_DB_KEY: "0f".repeat(32),
      TSX_DISABLE_CACHE: "1",
      XDG_CACHE_HOME: path.join(home, "cache"),
    },
    stdio: ["pipe", "pipe", "pipe"],
  });
  let aus = "";
  let fehl = "";
  kind.stdout.on("data", (b) => (aus += b.toString()));
  kind.stderr.on("data", (b) => (fehl += b.toString()));
  if (stdinSchliessen) {
    setTimeout(() => kind.stdin.end(), 1_200);
  } else {
    kind.stdin.end();
  }
  const code = await new Promise<number | null>((ok) => {
    const to = setTimeout(() => {
      kind.kill("SIGKILL");
      ok(null);
    }, warteMs);
    kind.on("exit", (c) => {
      clearTimeout(to);
      ok(c);
    });
    kind.on("error", () => {
      clearTimeout(to);
      ok(null);
    });
  });
  return { code, aus, fehl };
}

function gesamt(l: Lauf): string {
  return `${l.aus}\n${l.fehl}`;
}

describe("KEPTA-CLI: ein unbekannter Befehl startet keinen schweigenden Server", () => {
  it("Tippfehler 'rember' endet mit Exit 2 und nennt den naechsten Befehl", async () => {
    const l = await starte(["rember"]);
    expect(l.code, `Exit-Code ${l.code}, Ausgabe: ${gesamt(l).slice(0, 300)}`).toBe(2);
    expect(gesamt(l)).toMatch(/unknown command/i);
    expect(gesamt(l)).toMatch(/remember/);
  });

  it("ein erdachter Befehl endet ebenfalls mit Exit 2 — und die Liste ist sichtbar", async () => {
    const l = await starte(["zwerchgucker"]);
    expect(l.code, gesamt(l).slice(0, 300)).toBe(2);
    for (const befehl of ["remember", "recall", "timeline", "contradict", "stats", "demo", "import", "ui", "setup"]) {
      expect(gesamt(l), `Liste nennt ${befehl} nicht`).toContain(befehl);
    }
    // Der Argument-lose Start bleibt der MCP-Weg — die Meldung muss das unterscheiden.
    expect(gesamt(l)).toMatch(/stdin|mcp server/i);
  });

  // D2-02 hat die Regel verschärft: Hilfe ist eine Tür, kein Irrtum. Vor dieser
  // Welle war `--help` ein unbekannter Befehl (Exit 2) und damit die gebaute
  // Hilfetafel von aussen unerreichbar. clig.dev verlangt -h und --help.
  it("--help ist die Hilfetür: Tafel auf stdout, Exit 0, kein hängender stdin", async () => {
    const l = await starte(["--help"]);
    expect(l.code, gesamt(l).slice(0, 300)).toBe(0);
    expect(l.aus).toMatch(/KEPTA from the terminal/);
    expect(l.aus).toMatch(/remember/);
    expect(l.fehl).not.toMatch(/unknown/i);
  });

  it("-h und --version sind dieselben Türen", async () => {
    const hilfe = await starte(["-h"]);
    expect(hilfe.code, gesamt(hilfe).slice(0, 300)).toBe(0);
    expect(hilfe.aus).toMatch(/KEPTA from the terminal/);
    const fassung = await starte(["--version"]);
    expect(fassung.code, gesamt(fassung).slice(0, 300)).toBe(0);
    expect(fassung.aus).toMatch(/kepta \d+\.\d+\.\d+/);
  });

  it("ein Schalter, den es nicht gibt, endet mit Exit 2 und nennt die echten Schalter", async () => {
    const l = await starte(["--rund"]);
    expect(l.code, gesamt(l).slice(0, 300)).toBe(2);
    expect(l.fehl).toMatch(/unknown flag: --rund/);
    expect(l.fehl).toMatch(/--json/);
    // D2-03: ein Schalter hat keine Editier-Distanz zu einem Befehl.
    expect(l.fehl).not.toMatch(/did you mean/i);
  });

  // D2-19/20 hat das Bild ersetzt: der Pfad steht einmal, mit Version und
  // Zustand, und der Wartende erfährt, worauf er wartet. Das alte „stdio ready"
  // nannte die Datei zweimal und ließ den Menschen allein.
  it("ohne Argument startet der MCP-Server weiter — und sagt, worauf er wartet", async () => {
    const l = await starte([], { stdinSchliessen: true });
    expect(l.code, gesamt(l).slice(0, 400)).toBe(0);
    expect(gesamt(l)).toMatch(/\[kepta\] kepta \d+\.\d+\.\d+/);
    expect(gesamt(l)).toMatch(/waiting for an MCP client on stdin/i);
    expect(gesamt(l)).toMatch(/ctrl\+c/i);
    expect(gesamt(l)).not.toMatch(/unknown command/i);
  });

  it("die bekannten Befehle fallen nicht in die neue Bremse", async () => {
    const l = await starte(["ui"]);
    expect(l.code, gesamt(l).slice(0, 300)).not.toBe(2);
    // D2-42: der Block nennt jetzt die Flächen beim Namen statt „browser UI" und
    // „see the website" — geprüft in kli-mcp-hochlauf.
    expect(gesamt(l)).toMatch(/no window/i);
  });
});
