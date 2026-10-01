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

/** Ein zweites Ziel im selben Bund (z. B. der Plan-Zustand) — andere Dienst-/Konto-Marker. */
export interface SchluesselbundZiel {
  dienst: string;
  konto: string;
  /** macOS/Linux: sichtbares Label. */
  label?: string;
  /** Windows: Dateiname neben der Datenbank (Default: database-key.dpapi). */
  datei?: string;
}

export type Ausfuehren = (
  befehl: string,
  argumente: string[],
  optionen?: { input?: string; env?: Record<string, string> },
) => string;

/** Ein Programm aufrufen und seine Ausgabe lesen — synchron, denn der Store öffnet synchron. */
export const standardAusfuehren: Ausfuehren = (befehl, argumente, optionen) =>
  execFileSync(befehl, argumente, {
    encoding: "utf8",
    stdio: ["pipe", "pipe", "pipe"],
    input: optionen?.input,
    env: { ...process.env, ...(optionen?.env ?? {}) },
    timeout: 20_000,
  });

export interface Schluesselbund {
  readonly name: string;
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

/** macOS: /usr/bin/security endet mit Exit-Code 44, wenn es den Eintrag nicht gibt, und mit 45, wenn er schon existiert. */
export function macSchluesselbund(ausf: Ausfuehren = standardAusfuehren, ziel: SchluesselbundZiel = { dienst: DIENST, konto: KONTO, label: "KEPTA database key" }): Schluesselbund {
  return {
    name: "macOS Keychain",
    lesen() {
      try {
        return ausf("/usr/bin/security", ["find-generic-password", "-s", ziel.dienst, "-a", ziel.konto, "-w"]).trim() || null;
      } catch (e) {
        if (exitCode(e) === 44) return null;
        throw e;
      }
    },
    ablegen(hex) {
      // Der Schluessel steht in der Argumentliste — sehbar nur fuer Prozesse
      // desselben Kontos, die den Schluesselbund ohnehin fragen duerfen
      // (security liest sein Passwort nicht von stdin: der Prompt verlangt
      // zweimaliges Tippen). Das ist die dokumentierte, bewusste Schwaechung.
      //
      // Ohne -U: existiert der Eintrag schon, scheitert das Anlegen (Exit 45) —
      // und genau das ist der Lebensretter. Ein blinder Update hat am 22.9.
      // den echten Schluessel einer laufenden Installation ueberschrieben,
      // weil ein fehlerhafter Leseversuch (Keychain-ACL, haengendes security)
      // wie „noch kein Eintrag“ aussah. Anlegen ja — Ueberschreiben nie.
      try {
        ausf("/usr/bin/security", ["add-generic-password", "-s", ziel.dienst, "-a", ziel.konto, "-l", ziel.label ?? "KEPTA key", "-w", hex]);
      } catch (e) {
        if (exitCode(e) === 45) {
          throw new Error(
            `A key entry already exists in the ${bundName()} but could not be read — refusing to overwrite it. ` +
              `Restore the original key from your recovery key (Settings → System status → Show recovery key) ` +
              `with: security add-generic-password -s ${ziel.dienst} -a ${ziel.konto} -w <key>`,
          );
        }
        throw e;
      }
    },
  };
}

function bundName(): string {
  return "macOS Keychain";
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
    lesen() {
      if (!fs.existsSync(datei)) return null;
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
export function linuxSchluesselbund(ausf: Ausfuehren = standardAusfuehren, ziel: SchluesselbundZiel = { dienst: DIENST, konto: KONTO, label: "KEPTA database key" }): Schluesselbund {
  return {
    name: "Secret Service",
    lesen() {
      try {
        return ausf("secret-tool", ["lookup", "service", ziel.dienst, "account", ziel.konto]).trim() || null;
      } catch (e) {
        if (exitCode(e) === 1) return null;
        if ((e as { code?: string }).code === "ENOENT") {
          // Server, Container, schlanke Desktops: kein secret-tool. Der Grund soll
          // im Status verstaendlich stehen, nicht als "spawnSync secret-tool ENOENT".
          throw new Error("No Secret Service on this system (secret-tool not found, ENOENT) — install libsecret-tools, or set KEPTA_DB_KEY to a 64-character hex key.");
        }
        throw e;
      }
    },
    ablegen(hex) {
      // secret-tool liest das Geheimnis von stdin — es erscheint in keiner Argumentliste.
      ausf("secret-tool", [`store`, `--label=${ziel.label ?? "KEPTA key"}`, "service", ziel.dienst, "account", ziel.konto], { input: hex });
    },
  };
}

export function schluesselbundFuer(
  plattform: string,
  datenordner: string,
  ausf: Ausfuehren = standardAusfuehren,
  ziel?: SchluesselbundZiel,
): Schluesselbund | null {
  const z = ziel ?? { dienst: DIENST, konto: KONTO, label: "KEPTA database key", datei: "database-key.dpapi" };
  if (plattform === "darwin") return macSchluesselbund(ausf, z);
  if (plattform === "win32") return windowsSchluesselbund(path.join(datenordner, z.datei ?? "database-key.dpapi"), ausf);
  if (plattform === "linux") return linuxSchluesselbund(ausf, z);
  return null;
}

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
): Buffer {
  const ausUmgebung = env.KEPTA_DB_KEY?.trim();
  if (ausUmgebung) {
    if (!istSchluessel(ausUmgebung)) throw new Error("KEPTA_DB_KEY must be 64 hexadecimal characters (256 bits).");
    return Buffer.from(ausUmgebung, "hex");
  }
  if (!bund) {
    throw new Error("No keychain on this system — set KEPTA_DB_KEY to a 64-character hex key to encrypt the knowledge base.");
  }
  const vorhanden = bund.lesen();
  if (vorhanden) {
    if (!istSchluessel(vorhanden)) throw new Error(`The entry in the ${bund.name} is not a KEPTA key.`);
    return Buffer.from(vorhanden, "hex");
  }
  // Zweiter Leseversuch, BEVOR etwas angelegt wird: Ein fluechtiger Lesefehler
  // (Keychain-ACL, haengendes security, gesperrter Bund) darf nie wie „noch
  // kein Eintrag“ aussehen — sonst ueberschreibt das Anlegen den echten
  // Schluessel (22.9. genau so eine Datenkatastrophe ausgelöst und über die
  // Recovery gerettet). Findet der zweite Versuch einen Schluessel, ist das
  // der echte — keine Neuerzeugung.
  const zweiterVersuch = bund.lesen();
  if (zweiterVersuch) {
    if (!istSchluessel(zweiterVersuch)) throw new Error(`The entry in the ${bund.name} is not a KEPTA key.`);
    return Buffer.from(zweiterVersuch, "hex");
  }
  const neu = zufall(32).toString("hex");
  bund.ablegen(neu);
  if (bund.lesen() !== neu) {
    throw new Error(`The new key could not be read back from the ${bund.name} — nothing was encrypted.`);
  }
  return Buffer.from(neu, "hex");
}

/**
 * Der KeyProvider für App und MCP-Server: einmal pro Prozess gefragt, der
 * Schlüssel bleibt im Speicher des Prozesses. KEPTA_ENCRYPTION=off lässt die
 * Wissensbasis unverschlüsselt — nur für Werkzeuge, die rohes SQLite brauchen.
 */
export function schluesselbundKeyProvider(
  datenordner: string,
  plattform: string = process.platform,
  ausf: Ausfuehren = standardAusfuehren,
  env: Record<string, string | undefined> = process.env,
): KeyProvider {
  if (env.KEPTA_ENCRYPTION === "off") return { keyFor: () => null };
  const bund = schluesselbundFuer(plattform, datenordner, ausf);
  return {
    ablage: env.KEPTA_DB_KEY ? "KEPTA_DB_KEY" : bund?.name,
    keyFor: () => holeOderErzeugeSchluessel(bund, env),
  };
}
