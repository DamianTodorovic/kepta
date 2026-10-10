// Helfer für die CLI-Zieltests (D2). Gemessen wird immer der echte Prozess in
// einer eigenen HOME mit echtem 64-er Schlüssel — kein Mock, weil ein Mock das
// Bild zeigen würde, das der Test erfindet, nicht das Bild am Schirm.
import { spawn } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { KeptaStore } from "../src/core/store";
import { defaultExtensions } from "../src/core/extensions";
import { schluesselbundKeyProvider } from "../src/core/schluessel";
import { remember, erlebnisKommando } from "../src/cli-erlebnis";

export const TSX = path.join(process.cwd(), "node_modules", ".bin", "tsx");
export const QUELLE = path.join("src", "mcp-server.ts");

export interface Lauf {
  code: number | null;
  aus: string;
  fehl: string;
}

export interface Sandkiste {
  home: string;
  schluessel: string;
  umgebung: Record<string, string | undefined>;
  dbPfad: string;
}

/** HOME, Datenordner und Cache in einen Temp-Ordner, Schlüssel aus openssl-Klasse Entropie. */
export function sandkiste(praefix = "kepta-kli-"): Sandkiste {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), praefix));
  const schluessel = crypto.randomBytes(32).toString("hex");
  return {
    home,
    schluessel,
    dbPfad: path.join(home, ".kepta", "kepta.db"),
    umgebung: {
      ...process.env,
      HOME: home,
      KEPTA_DATA_DIR: path.join(home, ".kepta"),
      KEPTA_DB_KEY: schluessel,
      TSX_DISABLE_CACHE: "1",
      XDG_CACHE_HOME: path.join(home, "cache"),
    },
  };
}

/** PATH auf einen Ordner mit nur `node` — damit `setup` das echte `claude` nie findet. */
export function pfadOhneClaude(): string {
  const ordner = fs.mkdtempSync(path.join(os.tmpdir(), "kepta-kli-path-"));
  fs.symlinkSync(process.execPath, path.join(ordner, "node"));
  return `${ordner}:/usr/bin:/bin`;
}

/** Notizen über denselben Weg, den ein Mensch benutzt: remember mit Klassifikation und Index. */
export function notizenSetzen(kiste: Sandkiste, texte: string[], tags: string[] = ["weber"]): void {
  // Die Kapsel entscheidet, ob verschlüsselt wird — säte man mit Schlüssel und
  // liesse ohne, meldete der Kern zu Recht einen Konflikt, und der Test hätte
  // ihn selbst gebaut.
  const umgebung: Record<string, string | undefined> = { KEPTA_DB_KEY: kiste.schluessel };
  if (kiste.umgebung.KEPTA_ENCRYPTION === "off") umgebung.KEPTA_ENCRYPTION = "off";
  const store = new KeptaStore(kiste.dbPfad, {
    ...defaultExtensions(),
    keys: schluesselbundKeyProvider(path.dirname(kiste.dbPfad), process.platform, undefined, umgebung),
  });
  try {
    for (const t of texte) remember(store, t, tags);
  } finally {
    store.close();
  }
}

async function warteAufEnde(kind: ReturnType<typeof spawn>, warteMs: number): Promise<number | null> {
  return new Promise<number | null>((ok) => {
    const zuspaet = setTimeout(() => {
      kind.kill("SIGKILL");
      ok(null);
    }, warteMs);
    kind.on("exit", (c) => {
      clearTimeout(zuspaet);
      ok(c);
    });
    kind.on("error", () => {
      clearTimeout(zuspaet);
      ok(null);
    });
  });
}

/** Der Befehl, wie ein Mensch ihn laufen lässt: alles lesen, bis der Prozess endet. */
export async function lauf(args: string[], kiste: Sandkiste, { warteMs = 30_000, stdin = "" }: { warteMs?: number; stdin?: string } = {}): Promise<Lauf> {
  const kind = spawn(TSX, [QUELLE, ...args], { cwd: process.cwd(), env: kiste.umgebung, stdio: ["pipe", "pipe", "pipe"] });
  let aus = "";
  let fehl = "";
  kind.stdout.setEncoding("utf8");
  kind.stderr.setEncoding("utf8");
  kind.stdout.on("data", (b: string) => (aus += b));
  kind.stderr.on("data", (b: string) => (fehl += b));
  kind.stdin.end(stdin);
  const code = await warteAufEnde(kind, warteMs);
  return { code, aus, fehl };
}

/**
 * D2-01 / Z1: `… | head -N`. Der Leser holt sich N Zeilen und schließt die Pipe;
 * der Kind-Prozess schreibt danach weiter. Genau dieser Moment war ein Absturz.
 */
export async function laufMitFrueherPipe(args: string[], kiste: Sandkiste, { zeilen = 1, warteMs = 30_000 }: { zeilen?: number; warteMs?: number } = {}): Promise<Lauf> {
  const kind = spawn(TSX, [QUELLE, ...args], { cwd: process.cwd(), env: kiste.umgebung, stdio: ["ignore", "pipe", "pipe"] });
  let aus = "";
  let fehl = "";
  let gesehen = 0;
  let abbestellt = false;
  kind.stdout.setEncoding("utf8");
  kind.stderr.setEncoding("utf8");
  kind.stdout.on("data", (b: string) => {
    if (abbestellt) return;
    aus += b;
    gesehen += (b.match(/\n/g) ?? []).length;
    if (gesehen >= zeilen) {
      abbestellt = true;
      kind.stdout.destroy();
    }
  });
  kind.stderr.on("data", (b: string) => (fehl += b));
  const code = await warteAufEnde(kind, warteMs);
  return { code, aus, fehl };
}

/** Ein Befehl im selben Prozess, Bild eingefangen — schnell, und dieselbe Ausgabe. */
export async function bild(store: KeptaStore, befehl: string, args: string[] = []): Promise<Lauf> {
  const aus: string[] = [];
  const fehl: string[] = [];
  const original = { log: console.log, error: console.error };
  console.log = (...a: unknown[]) => void aus.push(a.map(String).join(" "));
  console.error = (...a: unknown[]) => void fehl.push(a.map(String).join(" "));
  try {
    const code = await erlebnisKommando(store, befehl, args);
    return { code, aus: aus.join("\n"), fehl: fehl.join("\n") };
  } finally {
    console.log = original.log;
    console.error = original.error;
  }
}

/** Ein Speicher ohne Schlüssel (Klartext-Datei im Temp) — für die Textmuster-Prüfung. */
export function speicher(praefix = "kepta-kli-muster-"): KeptaStore {
  return new KeptaStore(path.join(fs.mkdtempSync(path.join(os.tmpdir(), praefix)), "t.db"));
}

/**
 * Zeilen ohne ANSI-Farbcodes — das Bild, das ein Mensch liest. Ein
 * geschützter Leerzeichen (U+00A0, gesetzt wo nichts umbrechen darf) wird zum
 * normalen Leerzeichen: für die Lesbarkeit ist er einer, für die Länge auch.
 */
export function ohneFarbe(text: string): string {
  // eslint-disable-next-line no-control-regex
  return text.replace(/\x1b\[[0-9;]*m/g, "").replace(/\u00a0/g, " ");
}

/** Zeilenlängen messen (Zeichen, nicht Bytes) — D2-13 hat mit demselben Zähler gemessen. */
export function ueberBreite(text: string, max = 80): { zeile: string; laenge: number }[] {
  return ohneFarbe(text)
    .split("\n")
    .map((z) => ({ zeile: z, laenge: [...z].length }))
    .filter((z) => z.laenge > max);
}

/** Alles, was nach einem Stack aussieht — R10 verbietet ihn in jeder Ausgabe. */
export function stackZeilen(text: string): string[] {
  return text.split("\n").filter((z) => /^\s+at \S/.test(z) || z.includes("node:internal") || /\bEPIPE\b/.test(z) || /Emitted 'error' event/.test(z));
}
