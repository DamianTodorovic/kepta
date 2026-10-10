// Der Schlüssel der Wissensdatenbank: 256 Bit Zufall, verwahrt im
// Schlüsselbund des Betriebssystems — nie im Klartext auf der Platte.
//
// macOS: Schlüsselbund über /usr/bin/security. Windows: DPAPI (an das
// Windows-Konto gebunden) über PowerShell. Linux: Secret Service über
// secret-tool. Ohne Schlüsselbund (Server, Container) nur über KEPTA_DB_KEY —
// schwächer, denn dann steht der Schlüssel in der Umgebung des Prozesses.
//
// Wogegen das schützt: gegen jeden, der die Datei, eine Kopie oder ein Backup in
// die Hand bekommt, und gegen eine ausgebaute Platte. Wogegen nicht: gegen
// Schadsoftware, die unter demselben Benutzerkonto läuft — sie darf den
// Schlüsselbund so fragen wie KEPTA selbst.
import { execFileSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type { KeyProvider } from "./extensions";

export const DIENST = "app.kepta.database";
export const KONTO = "kepta";

/**
 * Wie lange ein Blick in den Schlüsselbund dauern darf (A1-10). Ein `security`, das
 * nach zwei Sekunden nicht geantwortet hat, antwortet auch nach zwanzig nicht — und
 * die Geduld gehört dem Freigabe-Dialog beim **Ablagen**, nicht dem Lesen.
 */
export const LESE_TIMEOUT_MS = 2_500;

/**
 * Wie lange das Ablegen dauern darf. Hier wartet ein echter Freigabe-Dialog auf
 * eine tippende Hand — die Geduld ist der Preis, nicht der Defekt, und sie bleibt
 * deshalb bewusst bei den zwanzig Sekunden (A1-10: lesen kurz, schreiben geduldig).
 */
export const SCHREIB_TIMEOUT_MS = 20_000;

export type Ausfuehren = (
  befehl: string,
  argumente: string[],
  optionen?: { input?: string; env?: Record<string, string>; timeout?: number },
) => string;

/** Ein Programm aufrufen und seine Ausgabe lesen — synchron, denn der Store öffnet synchron. */
export const standardAusfuehren: Ausfuehren = (befehl, argumente, optionen) =>
  execFileSync(befehl, argumente, {
    encoding: "utf8",
    stdio: ["pipe", "pipe", "pipe"],
    input: optionen?.input,
    env: { ...process.env, ...(optionen?.env ?? {}) },
    timeout: optionen?.timeout ?? SCHREIB_TIMEOUT_MS,
  });

export interface Schluesselbund {
  readonly name: string;
  /** Der Befehl, der den abgelegten Schlüssel von Hand zurückholt (SECURITY.md). */
  readonly wegweiser: string;
  /** Der abgelegte Schlüssel als Hex — oder null, wenn es noch keinen gibt. */
  lesen(): string | null;
  ablegen(hex: string): void;
}

export function istSchluessel(wert: string): boolean {
  return /^[0-9a-f]{64}$/i.test(wert);
}

function exitCode(e: unknown): number | undefined {
  return (e as { status?: number }).status;
}

function fehlertext(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

/**
 * execFileSync setzt die ganze Argumentliste in seinen "Command failed"-Text — und
 * in dieser Liste steht der Schlüssel (A1-05). Wer die Zeile in ein Issue kopiert,
 * veröffentlicht den Schlüssel zu seinem eigenen Gedächtnis. Also: Grund stehen
 * lassen, Geheimnis tilgen.
 */
export function ohneSchluessel(text: string, hex: string): string {
  return text
    .split(hex)
    .join("<key redacted>")
    .replace(/(-w[ =])\s*[0-9a-f]{64}/gi, "$1<key redacted>");
}

/**
 * Was child_process meldet, ist ein Rohsatz, kein Satz für einen Menschen:
 * `spawnSync /usr/bin/security ETIMEDOUT`, `Command failed: <programm> <argumente…>`
 * (A1-22) — und in genau dieser Kommandozeile steht der Schlüssel (A1-05). Der Grund
 * wird deshalb aus Exit-Code, Zeitüberschreitung und stderr gelesen; die
 * Kommandozeile wird nie zitiert. Faustregel dieser Scheibe: kein Fehler geht nach
 * aussen, der sich nicht in einem Satz erklären lässt.
 */
function menschlicherGrund(e: unknown, timeoutMs: number): string {
  const err = e as { code?: string; status?: number; stderr?: string };
  if (err.code === "ETIMEDOUT") return `it did not answer in time (KEPTA waited ${timeoutMs / 1000} seconds and gave up)`;
  if (err.code === "ENOENT") return "the helper program is not on this system";
  const grund = (err.stderr ?? "").trim().replace(/^(security|secret-tool):\s*/, "");
  if (typeof err.status === "number") return grund ? `it exited with code ${err.status}: ${grund}` : `it exited with code ${err.status}`;
  return grund || "it refused the request";
}

/** Der Ausweg, der wirklich funktioniert — nicht "irgendwas mit Schlüsselbund". */
function ausweg(bund: Pick<Schluesselbund, "name" | "wegweiser">): string {
  return (
    `If this session has no keychain (SSH, CI, a container) or the ${bund.name} is locked, set KEPTA_DB_KEY to a ` +
    `64-character hex key (openssl rand -hex 32). To read back the key that is already stored: ${bund.wegweiser} ` +
    `(SECURITY.md, "Keep a copy of the key").`
  );
}

/** Ein Lesefehler aus dem Schlüsselbund: Grund in Menschengestalt, dann der Ausweg. */
function lesefehler(e: unknown, bund: Pick<Schluesselbund, "name" | "wegweiser">): Error {
  return new Error(
    `KEPTA could not read its key from the ${bund.name} — ${menschlicherGrund(e, LESE_TIMEOUT_MS)}. ` +
      `Nothing was changed and nothing was encrypted. ${ausweg(bund)}`,
  );
}

/** macOS: /usr/bin/security endet mit Exit-Code 44, wenn es den Eintrag nicht gibt. */
export function macSchluesselbund(ausf: Ausfuehren = standardAusfuehren): Schluesselbund {
  const name = "macOS Keychain";
  const wegweiser = `security find-generic-password -s ${DIENST} -a ${KONTO} -w`;
  const bund: Schluesselbund = {
    name,
    wegweiser,
    lesen() {
      try {
        return ausf("/usr/bin/security", ["find-generic-password", "-s", DIENST, "-a", KONTO, "-w"], { timeout: LESE_TIMEOUT_MS }).trim() || null;
      } catch (e) {
        if (exitCode(e) === 44) return null;
        throw lesefehler(e, { name, wegweiser });
      }
    },
    ablegen(hex) {
      // Der Schlüssel steht in der Argumentliste — sehbar nur für Prozesse
      // desselben Kontos, die den Schlüsselbund ohnehin fragen dürften
      // (security liest sein Passwort nicht von stdin: der Prompt verlangt
      // zweimaliges Tippen). Das ist die dokumentierte, bewusste Schwächung.
      // Nur ihr eigener Fehlertext darf sie nicht wiederholen (A1-05).
      //
      // Ohne -U: existiert der Eintrag schon, scheitert das Anlegen (Exit 45) —
      // und genau das ist der Lebensretter. Ein blinder Update hat am 22.9.
      // den echten Schlüssel einer laufenden Installation überschrieben,
      // weil ein fehlerhafter Leseversuch (Keychain-ACL, hängendes security)
      // wie „noch kein Eintrag“ aussah. Anlegen ja — Überschreiben nie.
      // (Der 2.13.4-Fix aus der App, am 26.9. in den Kern portiert — das
      // npm-Paket öffnet dieselbe Datenbank und trug die Gefahr bis dahin.)
      try {
        ausf("/usr/bin/security", ["add-generic-password", "-s", DIENST, "-a", KONTO, "-l", "KEPTA database key", "-w", hex], {
          timeout: SCHREIB_TIMEOUT_MS,
        });
      } catch (e) {
        if (exitCode(e) === 45) {
          // Der alte Wegweiser war die Tat selbst: add-generic-password ohne -U
          // scheitert an genau diesem Eintrag wiederum mit 45.
          throw new Error(
            `A key entry already exists in the ${name} but could not be read — refusing to overwrite it. ` +
              `Nothing was changed and nothing was encrypted. Read the stored key back with: ${wegweiser} ` +
              `(SECURITY.md, "Keep a copy of the key") and start again with that key in KEPTA_DB_KEY, ` +
              `or run KEPTA once from a Terminal where the Keychain can ask you.`,
          );
        }
        throw new Error(
          ohneSchluessel(
            `KEPTA could not store its new key in the ${name} — ${menschlicherGrund(e, SCHREIB_TIMEOUT_MS)}. ` +
              `Nothing was encrypted and your knowledge base was left untouched. ${ausweg(bund)}`,
            hex,
          ),
        );
      }
    },
  };
  return bund;
}

/**
 * Windows: DPAPI. Der Schlüssel liegt verschlüsselt neben der Datenbank und
 * lässt sich nur unter demselben Windows-Konto wieder öffnen. Er wandert über
 * die Umgebung in PowerShell, nicht über die Argumentliste.
 */
export function windowsSchluesselbund(datei: string, ausf: Ausfuehren = standardAusfuehren): Schluesselbund {
  const ps = (skript: string, env: Record<string, string>) =>
    ausf("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", skript], { env });
  return {
    name: "Windows DPAPI",
    wegweiser:
      `powershell -NoProfile -Command "Add-Type -AssemblyName System.Security; ` +
      `[Text.Encoding]::ASCII.GetString([Security.Cryptography.ProtectedData]::Unprotect(` +
      `[Convert]::FromBase64String((Get-Content '${datei}')), $null, 'CurrentUser'))"`,
    lesen() {
      if (!fs.existsSync(datei)) return null;
      // Kein kurzer Lese-Timeout wie auf macOS: hier hängt nichts an einem
      // Daemon, sondern an einem PowerShell-Kaltstart — der ist auf manchen
      // Rechnern schlicht langsam und würde mit 5 s zur Fehldiagnose.
      return ps(
        "Add-Type -AssemblyName System.Security; " +
          "$b = [Convert]::FromBase64String([IO.File]::ReadAllText($env:KEPTA_SCHLUESSELDATEI)); " +
          "[Text.Encoding]::ASCII.GetString([Security.Cryptography.ProtectedData]::Unprotect($b, $null, 'CurrentUser'))",
        { KEPTA_SCHLUESSELDATEI: datei },
      ).trim() || null;
    },
    ablegen(hex) {
      ps(
        "Add-Type -AssemblyName System.Security; " +
          "$b = [Security.Cryptography.ProtectedData]::Protect([Text.Encoding]::ASCII.GetBytes($env:KEPTA_SCHLUESSEL), $null, 'CurrentUser'); " +
          "[IO.File]::WriteAllText($env:KEPTA_SCHLUESSELDATEI, [Convert]::ToBase64String($b))",
        { KEPTA_SCHLUESSEL: hex, KEPTA_SCHLUESSELDATEI: datei },
      );
    },
  };
}

/** Linux: Secret Service (GNOME Keyring, KWallet) über secret-tool — Exit-Code 1, wenn es nichts gibt. */
export function linuxSchluesselbund(ausf: Ausfuehren = standardAusfuehren): Schluesselbund {
  const name = "Secret Service";
  const wegweiser = `secret-tool lookup service ${DIENST} account ${KONTO}`;
  return {
    name,
    wegweiser,
    lesen() {
      try {
        return ausf("secret-tool", ["lookup", "service", DIENST, "account", KONTO], { timeout: LESE_TIMEOUT_MS }).trim() || null;
      } catch (e) {
        if (exitCode(e) === 1) return null;
        if ((e as { code?: string }).code === "ENOENT") {
          // Server, Container, schlanke Desktops: kein secret-tool. Der Grund soll
          // im Status verständlich stehen, nicht als "spawnSync secret-tool ENOENT".
          throw new Error("No Secret Service on this system (secret-tool not found, ENOENT) — install libsecret-tools, or set KEPTA_DB_KEY to a 64-character hex key.");
        }
        throw lesefehler(e, { name, wegweiser });
      }
    },
    ablegen(hex) {
      // secret-tool liest das Geheimnis von stdin — es erscheint in keiner Argumentliste.
      ausf("secret-tool", ["store", "--label=KEPTA database key", "service", DIENST, "account", KONTO], { input: hex });
    },
  };
}

export function schluesselbundFuer(
  plattform: string,
  datenordner: string,
  ausf: Ausfuehren = standardAusfuehren,
): Schluesselbund | null {
  if (plattform === "darwin") return macSchluesselbund(ausf);
  if (plattform === "win32") return windowsSchluesselbund(path.join(datenordner, "database-key.dpapi"), ausf);
  if (plattform === "linux") return linuxSchluesselbund(ausf);
  return null;
}

/**
 * Eine Zeile, bevor der erste Blick in den Schlüsselbund geht (A1-10). Vorher sah
 * der Nutzer bis zu zwanzig Sekunden lang nichts als einen leeren Bildschirm und
 * nahm Strg+C für die plausibelste Handlung. Der Satz muss VOR dem Aufruf stehen:
 * `spawnSync` ist blockierend per Bauart, ein Fortschritt währenddes sen ist in
 * diesem Aufruf nicht möglich. Bewusst **nicht** an ein TTY gebunden — nachgelesen:
 * in einer Pipe (Messharke, CI, ein Client, der den Server über Pipes hält) war der
 * Bildschirm mit TTY-Gate trotzdem zwanzig Sekunden leer. stdout trägt die
 * JSON-RPC-Antwort, stderr ist der Diagnosekanal; hier stört die Zeile niemanden.
 */
export type Melden = (text: string) => void;

const aufFermeldung: Melden = (text) => {
  process.stderr.write(`[kepta] ${text}\n`);
};

/**
 * Der Datenbankschlüssel: aus KEPTA_DB_KEY, sonst aus dem Schlüsselbund. Gibt es
 * dort noch keinen, wird einer erzeugt, abgelegt und GEGENGELESEN — erst wenn er
 * wirklich wieder herauskommt, darf mit ihm verschlüsselt werden. Sonst wäre die
 * Wissensbasis mit einem Schlüssel verschlossen, den niemand mehr hat.
 */
export function holeOderErzeugeSchluessel(
  bund: Schluesselbund | null,
  env: Record<string, string | undefined> = process.env,
  zufall: (n: number) => Buffer = (n) => crypto.randomBytes(n),
  melden: Melden = aufFermeldung,
): Buffer {
  const ausUmgebung = env.KEPTA_DB_KEY?.trim();
  if (ausUmgebung) {
    // A1-04: ein Tippfehler in dieser Variablen war bis anhin ein stiller Fall —
    // die Zahl in der Meldung ist der Grund, den der Nutzer selbst prüfen kann.
    if (!istSchluessel(ausUmgebung)) {
      throw new Error(
        `KEPTA_DB_KEY must be 64 hexadecimal characters (256 bits) — got ${ausUmgebung.length}, need 64. ` +
          `Generate one with: openssl rand -hex 32. Nothing was written.`,
      );
    }
    return Buffer.from(ausUmgebung, "hex");
  }
  if (!bund) {
    throw new Error(
      "No keychain on this system — no macOS Keychain, no Windows DPAPI, no Linux Secret Service — so KEPTA has nowhere to keep a key. " +
        "Set KEPTA_DB_KEY to a 64-character hex key (openssl rand -hex 32) to encrypt the knowledge base.",
    );
  }
  // A1-10: der Nutzer sieht, dass gewartet wird, bevor die erste Zeile spaeter kommt.
  melden(`checking the ${bund.name} for your KEPTA key`);
  const vorrat = (wert: string | null): Buffer | null => {
    if (!wert) return null;
    // A1-08: ein fremder Eintrag ist nicht "kein Schluessel" und auch kein
    // Bund-Defekt — die Meldung nennt, was sie prueft und wie man nachsieht.
    if (!istSchluessel(wert)) {
      throw new Error(
        `The entry in the ${bund.name} is not a KEPTA key (expected 64 hex characters, got ${wert.length}). ` +
          `Nothing was changed. Look at that entry with: ${bund.wegweiser} (SECURITY.md, "Keep a copy of the key").`,
      );
    }
    return Buffer.from(wert, "hex");
  };
  const vorhanden = vorrat(bund.lesen());
  if (vorhanden) return vorhanden;
  // Zweiter Leseversuch, BEVOR etwas angelegt wird: Ein flüchtiger Lesefehler
  // (Keychain-ACL, hängendes security, gesperrter Bund) darf nie wie „noch
  // kein Eintrag“ aussehen — sonst überschreibt das Anlegen den echten
  // Schlüssel (22.9. genau so eine Datenkatastrophe ausgelöst und über die
  // Recovery gerettet). Findet der zweite Versuch einen Schlüssel, ist das
  // der echte — keine Neuerzeugung. Unangetastet, auch wenn das Warten kostet.
  const zweiterVersuch = vorrat(bund.lesen());
  if (zweiterVersuch) return zweiterVersuch;
  melden(`no key in the ${bund.name} yet — storing a new one; if a dialog asks, allow it (KEPTA never overwrites a key)`);
  const neu = zufall(32).toString("hex");
  bund.ablegen(neu);
  if (bund.lesen() !== neu) {
    throw new Error(
      `The new key could not be read back from the ${bund.name} — nothing was encrypted and your knowledge base was left untouched. ` +
        `Check the entry with: ${bund.wegweiser}, or set KEPTA_DB_KEY to a key you hold (openssl rand -hex 32).`,
    );
  }
  return Buffer.from(neu, "hex");
}

/**
 * Ein Ordner, den der eigene Nutzer nicht beschreiben darf, ist weder ein
 * Schlüsselbund-Problem noch ein SQLite-Rätsel — aber SQLite nannte ihn bisher nur
 * als "unable to open database file", ohne Pfad und ohne Grund (A1-16). Geprüft
 * wird hier, an der Schwelle vor dem Store: was hier geworfen wird, erreicht den
 * Nutzer, bevor die Datenbank-Engine den Rohsatz antwortet.
 */
function pruefeSchreibrecht(datenordner: string): void {
  if (!fs.existsSync(datenordner)) return; // der Store legt den Ordner selbst an
  try {
    fs.accessSync(datenordner, fs.constants.W_OK);
  } catch (e) {
    throw new Error(
      `The knowledge base folder is not writable by your user: ${datenordner} (${(e as { code?: string }).code ?? "EACCES"}). ` +
        `Nothing was opened and nothing was written. Check with: ls -ld ${datenordner} — ` +
        `either give your account write access (chmod u+w, or chown) or point KEPTA_DATA_DIR at a folder you own.`,
    );
  }
}

/** Derselbe Ordner, dieselbe Datei wie `defaultDbPath()` in store.ts — hier nötig,
 *  um vor der ersten Anlage fragen zu können, ob es die Basis schon gibt. */
const DATENBANK_DATEI = "kepta.db";

/**
 * Der KeyProvider für App und MCP-Server: der Schlüssel wird einmal geholt und bleibt
 * im Speicher des Prozesses.
 *
 * Grenze (Damian, 10.10.2026, wörtlich: **„Abbrechen: ohne Schluessel keine Datei."**):
 * Wer eine Wissensbasis **anlegt**, bekommt keine Datei, wenn KEPTA keinen Schlüssel
 * sicher verwahren kann. Ein Wurf aus `keyFor()` allein reicht dafür nicht — `store.ts`
 * fängt ihn als `hinweis` und legt die Klartext-Datei trotzdem an (A1-04, Q-05). Also
 * wird der Schlüssel **hier** geholt, vor jeder Öffnung: was hier wirft, verhindert
 * die Neuanlage. Zwei Leitplanken: eine **bestehende** Datei wird niemals verweigert
 * (die Härtung darf niemanden aus seiner eigenen Wissensbasis aussperren), und
 * `KEPTA_ENCRYPTION=off` bleibt die bestellte Ausnahme — ausdrücklich abgeschaltet
 * ist etwas anderes als stillschweigend gescheitert.
 */
export function schluesselbundKeyProvider(
  datenordner: string,
  plattform: string = process.platform,
  ausf: Ausfuehren = standardAusfuehren,
  env: Record<string, string | undefined> = process.env,
): KeyProvider {
  pruefeSchreibrecht(datenordner);
  if (env.KEPTA_ENCRYPTION === "off") return { keyFor: () => null };
  const bund = schluesselbundFuer(plattform, datenordner, ausf);
  let aufgeloest: Buffer | null = null;
  const provider: KeyProvider = {
    ablage: env.KEPTA_DB_KEY ? "KEPTA_DB_KEY" : bund?.name,
    keyFor: () => (aufgeloest ??= holeOderErzeugeSchluessel(bund, env)),
  };
  const datenbank = path.join(datenordner, DATENBANK_DATEI);
  if (!fs.existsSync(datenbank)) {
    try {
      provider.keyFor(datenbank);
    } catch (e) {
      throw new Error(
        `KEPTA did not create a knowledge base — no file was written. ${fehlertext(e)} ` +
          `If you mean to run without encryption, say so on purpose: KEPTA_ENCRYPTION=off.`,
      );
    }
  }
  return provider;
}
