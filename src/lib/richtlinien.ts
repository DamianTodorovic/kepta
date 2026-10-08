// Verwaltete Konfiguration und zentrale Richtlinien — die MDM-Schicht.
//
// Eine Organisation legt EINE Datei ab (macOS: /Library/Application Support/
// KEPTA/managed-settings.json, Linux: /etc/kepta/managed-settings.json,
// Windows: %PROGRAMDATA%\KEPTA\managed-settings.json, oder KEPTA_MANAGED_CONFIG)
// und die App gehorcht: Cloud-Chat verboten, Rechner-Scan verboten,
// Privacy-Shield erzwungen, Team-Rollen gesetzt.
// Kein Telefonieren nach Hause, keine Zusatz-Infrastruktur — eine Datei.
//
// Früher durfte die Datei auch eine Lizenz vor eintragen (air-gapped
// Ausrollung). Die herunterladbare App hat seit 10.10.2026 kein
// Schlüssel-System mehr: zwei solche Felder in einer bestehenden Datei werden
// weiterhin ignoriert (Whitelist unten), die App stürzt nicht darüber ab.
//
// Fehlt die Datei, ist alles wie immer: nichts ist verwaltet, nichts eingeschränkt.
// Ist sie kaputt, wird sie ignoriert (mit Zeile im Log) — eine falsche Richtlinie
// darf die App nie unbenutzbar machen.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export interface VerwalteteEinstellungen {
  /** Zentrale Richtlinien: Schlüssel → Zielzustand. */
  richtlinien?: {
    /** Cloud-Modelle im Chat verbieten (nur lokale Modelle wie Ollama bleiben). */
    chat_cloud?: "deny";
    /** Rechner-Scan komplett verbieten. */
    machine_scan?: "deny";
    /** Privacy-Shield erzwingen — der Nutzer kann ihn nicht abschalten. */
    privacy_shield?: "force_on";
  };
  /**
   * Team-Rollen (Milestone E1): wer darf auf `team:*`-Scopes lesen/schreiben?
   * Die Durchsetzung liegt in src/lib/team.ts. actorIds kleingeschrieben; fehlt
   * eine Person, gilt standardRolle (sonst viewer — sicherer Default).
   */
  team?: {
    name?: string;
    rollen?: Record<string, string>;
    standardRolle?: string;
  };
}

const DATEINAME = path.join("KEPTA", "managed-settings.json");

/** Kandidatenpfade in der Prüfreihenfolge — der erste lesbarer Fund gewinnt. */
export function kandidatenPfade(umgebung: NodeJS.ProcessEnv = process.env): string[] {
  const pfade: string[] = [];
  if (umgebung.KEPTA_MANAGED_CONFIG) pfade.push(umgebung.KEPTA_MANAGED_CONFIG);
  if (process.platform === "darwin") pfade.push(path.join("/Library", "Application Support", DATEINAME));
  if (process.platform === "linux") pfade.push(path.join("/etc", DATEINAME));
  if (process.platform === "win32") {
    const programData = umgebung.PROGRAMDATA || path.join("C:", "ProgramData");
    pfade.push(path.join(programData, DATEINAME));
  }
  // Für Tests und ungewöhnliche Setups: neben dem Benutzerprofil.
  pfade.push(path.join(os.homedir(), ".config", DATEINAME));
  return pfade;
}

let letztePruefung = 0;
let zwischenspeicher: { gelesen: number; wert: VerwalteteEinstellungen | null } = { gelesen: 0, wert: null };

/**
 * Die verwaltete Konfiguration — oder null, wenn es sie nicht gibt. Wird höchstens
 * alle zwei Sekunden neu gelesen (Admins ändern die Datei im Betrieb, ohne dass
 * die App jeden Request die Platte belastet).
 */
export function liesVerwaltet(umgebung: NodeJS.ProcessEnv = process.env): VerwalteteEinstellungen | null {
  const jetzt = Date.now();
  if (jetzt - letztePruefung < 2000) return zwischenspeicher.wert;
  letztePruefung = jetzt;
  for (const pfad of kandidatenPfade(umgebung)) {
    let roh: string;
    try {
      roh = fs.readFileSync(pfad, "utf8");
    } catch {
      continue;
    }
    try {
      const daten = JSON.parse(roh) as VerwalteteEinstellungen;
      const wert: VerwalteteEinstellungen = {};
      if (daten.richtlinien && typeof daten.richtlinien === "object") {
        const gefiltert: Partial<NonNullable<VerwalteteEinstellungen["richtlinien"]>> = {};
        for (const schluessel of ["chat_cloud", "machine_scan", "privacy_shield"] as const) {
          const wertSelbst = (daten.richtlinien as Record<string, unknown>)[schluessel];
          if (schluessel === "privacy_shield" ? wertSelbst === "force_on" : wertSelbst === "deny") {
            (gefiltert as Record<string, "deny" | "force_on">)[schluessel] = wertSelbst as "deny" | "force_on";
          }
        }
        if (Object.keys(gefiltert).length > 0) wert.richtlinien = gefiltert as NonNullable<VerwalteteEinstellungen["richtlinien"]>;
      }
      if (daten.team && typeof daten.team === "object") {
        const team: NonNullable<VerwalteteEinstellungen["team"]> = {};
        if (typeof daten.team.name === "string" && daten.team.name.trim()) team.name = daten.team.name.trim();
        if (daten.team.rollen && typeof daten.team.rollen === "object") {
          const rollen: Record<string, string> = {};
          for (const [actor, rolle] of Object.entries(daten.team.rollen as Record<string, unknown>)) {
            if (typeof actor === "string" && actor.trim() && typeof rolle === "string") rollen[actor.trim().toLowerCase()] = rolle;
          }
          if (Object.keys(rollen).length > 0) team.rollen = rollen;
        }
        if (typeof daten.team.standardRolle === "string" && daten.team.standardRolle.trim()) team.standardRolle = daten.team.standardRolle.trim();
        if (Object.keys(team).length > 0) wert.team = team;
      }
      zwischenspeicher = { gelesen: jetzt, wert: Object.keys(wert).length ? wert : null };
      return zwischenspeicher.wert;
    } catch {
      // Kaputte Datei: weiter zum nächsten Kandidaten; nichts wird blockiert.
      continue;
    }
  }
  zwischenspeicher = { gelesen: jetzt, wert: null };
  return null;
}

/** Test-Hilfe: den Zwischenspeicher leeren (nur Tests sollen das dürfen). */
export function richtlinienCacheLeeren(): void {
  letztePruefung = 0;
  zwischenspeicher = { gelesen: 0, wert: null };
}

/** Eine einzelne Richtlinie — oder undefined, wenn nicht verwaltet. */
export function richtlinie(schluessel: "chat_cloud" | "machine_scan" | "privacy_shield", umgebung: NodeJS.ProcessEnv = process.env): "deny" | "force_on" | undefined {
  return liesVerwaltet(umgebung)?.richtlinien?.[schluessel];
}

/**
 * Ist der Chat-Zielhost lokal (Ollama, LM Studio, eigener Server)? Richtlinie
 * chat_cloud=deny erlaubt genau diese — die Daten verlassen das Haus nicht.
 */
export function istLokalerHost(url: string | undefined | null): boolean {
  if (!url) return true; // ohne URL gibt es keinen fremden Host (Standard-Ollama läuft lokal)
  try {
    const host = new URL(url).hostname;
    return host === "localhost" || host === "127.0.0.1" || host === "::1" || host === "[::1]" || host.endsWith(".local");
  } catch {
    return false;
  }
}
