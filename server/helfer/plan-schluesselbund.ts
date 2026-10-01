// Der Plan-/Anker-Schluesselbund: getrennte Schluesselbund-Eintraege vom
// Datenbank-Schluessel (app.kepta.plan statt app.kepta.database). Der offene
// Kern 3.1.x bindet schluesselbundFuer an den Datenbank-Eintrag — der
// ziel-Parameter (SchluesselbundZiel) wurde dort entfernt. Diese App-Fassade
// haelt das 2.13.x-Verhalten der Plan-Hermetik 1:1 fest:
//   - macOS Keychain: eigene dienst/konto-Eintraege, Anlegen ja,
//     Ueberschreiben nie (Exit 45 = Lebensretter vom 22.9.)
//   - Windows DPAPI: ziel.datei ?? "database-key.dpapi" (2.13.x-Verhalten)
//   - Linux Secret Service: eigene service/account-Attribute
// Keine Kern-Aenderung: der Kern bleibt 1:1 (kein Verhalten gefaked).
import fs from "node:fs";
import path from "node:path";
import {
  standardAusfuehren,
  windowsSchluesselbund,
  type Schluesselbund,
  type Ausfuehren,
} from "../../src/core/schluessel";

export interface SchluesselbundZiel {
  dienst: string;
  konto: string;
  label?: string;
  /** Nur Windows: Name der DPAPI-Datei im Datenordner. */
  datei?: string;
}

function exitCode(e: unknown): number | undefined {
  return (e as { status?: number }).status;
}

/** macOS: /usr/bin/security endet mit Exit-Code 44, wenn es den Eintrag nicht gibt, und mit 45, wenn er schon existiert. */
function zielMacBund(ziel: SchluesselbundZiel, ausf: Ausfuehren): Schluesselbund {
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
      // Ohne -U: existiert der Eintrag schon, scheitert das Anlegen (Exit 45) —
      // und genau das ist der Lebensretter. Anlegen ja — Überschreiben nie.
      try {
        ausf("/usr/bin/security", ["add-generic-password", "-s", ziel.dienst, "-a", ziel.konto, "-l", ziel.label ?? "KEPTA key", "-w", hex]);
      } catch (e) {
        if (exitCode(e) === 45) {
          throw new Error(
            "A key entry already exists in the macOS Keychain but could not be read — refusing to overwrite it. " +
              `Restore the original entry with: security add-generic-password -s ${ziel.dienst} -a ${ziel.konto} -w <key>`,
          );
        }
        throw e;
      }
    },
  };
}

/** Linux: Secret Service (GNOME Keyring, KWallet) über secret-tool — Exit-Code 1, wenn es nichts gibt. */
function zielLinuxBund(ziel: SchluesselbundZiel, ausf: Ausfuehren): Schluesselbund {
  return {
    name: "Secret Service",
    lesen() {
      try {
        return ausf("secret-tool", ["lookup", "service", ziel.dienst, "account", ziel.konto]).trim() || null;
      } catch (e) {
        if (exitCode(e) === 1) return null;
        if ((e as { code?: string }).code === "ENOENT") {
          throw new Error("No Secret Service on this system (secret-tool not found, ENOENT) — install libsecret-tools, or set KEPTA_PLAN_KEY to a 64-character hex key.");
        }
        throw e;
      }
    },
    ablegen(hex) {
      // secret-tool liest das Geheimnis von stdin — es erscheint in keiner Argumentliste.
      ausf("secret-tool", ["store", `--label=${ziel.label ?? "KEPTA key"}`, "service", ziel.dienst, "account", ziel.konto], { input: hex });
    },
  };
}

/**
 * Der Schluesselbund fuer ein Ziel des Plan-Zustands: getrennt vom
 * Datenbank-Eintrag, auf jeder Plattform die 2.13.x-Mechanik.
 */
export function zielSchluesselbund(
  ziel: SchluesselbundZiel,
  plattform: string,
  datenordner: string,
  ausf: Ausfuehren = standardAusfuehren,
): Schluesselbund | null {
  if (plattform === "darwin") return zielMacBund(ziel, ausf);
  if (plattform === "win32") return windowsSchluesselbund(path.join(datenordner, ziel.datei ?? "database-key.dpapi"), ausf);
  if (plattform === "linux") return zielLinuxBund(ziel, ausf);
  return null;
}
