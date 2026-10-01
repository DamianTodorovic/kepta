// KEPTA Enterprise — Team-Scopes und Rollen (Milestone E1).
//
// Team-Daten leben in Scopes der Form `team:<name>` — technisch ganz normale
// Scopes, die dieselbe verschlüsselte Datei nutzen wie alles andere. Wer sie
// lesen und schreiben darf, entscheidet die Rollen-Matrix in der VERWALTETEN
// Konfiguration (managed-settings.json — MDM, zentrale Richtlinie, eine Datei):
//
//   "team": {
//     "name": "Kanzlei Weber",
//     "rollen": { "petra": "admin", "jonas": "member", "gast": "viewer" },
//     "standardRolle": "viewer"
//   }
//
//   admin  → team:* lesen und schreiben
//   member → team:* lesen und schreiben
//   viewer → team:* nur lesen
//
// Freigeschaltet wird das Ganze durch die LIZENZ-Edition: business oder
// enterprise. Ohne diese Edition ist team:* für alle dicht (lesen UND
// schreiben) — Team-Daten sind lizenzierte Daten. Nicht-team-Scopes ("local",
// "user:*", "agent:*") verhält sich diese Policy exakt wie der bisherige
// Default (immer ja) — das Verhalten von Pro bleibt unangetastet.
//
// Bewusst NICHT hier: Synchronisation zwischen Rechnern, SSO, Workspaces-UI
// (Milestones E2+). E1 liefert die Durchsetzungsschicht, auf der die
// weiteren Milestones aufbauen.
import type { ActorContext, KeptaExtensions, MemoryRef } from "../core/extensions";
import type { Edition } from "../core/lizenz";
import { pruefeSchluessel } from "../core/lizenz";
import type { KeptaStore } from "../core/store";
import { liesVerwaltet, type VerwalteteEinstellungen } from "./richtlinien";

export type TeamRolle = "admin" | "member" | "viewer";

export interface TeamKonfig {
  name?: string;
  rollen: Record<string, TeamRolle>;
  standardRolle?: TeamRolle;
}

const ROLLEN: TeamRolle[] = ["admin", "member", "viewer"];

/** Team-Abschnitt aus der verwalteten Datei — nur gültige Werte, sonst null. */
export function liesTeamKonfig(verwaltet: VerwalteteEinstellungen | null = liesVerwaltet()): TeamKonfig | null {
  const roh = verwaltet?.team;
  if (!roh || typeof roh !== "object") return null;
  const rollen: Record<string, TeamRolle> = {};
  for (const [actor, rolle] of Object.entries(roh.rollen ?? {})) {
    const id = actor.trim().toLowerCase();
    if (!id) continue;
    if (rolle === "admin" || rolle === "member" || rolle === "viewer") rollen[id] = rolle;
  }
  const standard = roh.standardRolle;
  const konfig: TeamKonfig = {
    ...(typeof roh.name === "string" && roh.name.trim() ? { name: roh.name.trim() } : {}),
    rollen,
    ...(standard && (ROLLEN as string[]).includes(standard) ? { standardRolle: standard as TeamRolle } : {}),
  };
  return konfig;
}

/** Rolle eines Actors: gelistete Rolle gewinnt, sonst standardRolle, sonst viewer (sicherer Default). */
export function rolleFuer(konfig: TeamKonfig, actorId: string): TeamRolle {
  const id = actorId.trim().toLowerCase();
  return konfig.rollen[id] ?? konfig.standardRolle ?? "viewer";
}

/** Schreibt diese Rolle auf team:*-Scopes? (viewer nicht) */
export function darfSchreiben(rolle: TeamRolle): boolean {
  return rolle === "admin" || rolle === "member";
}

export interface TeamEditionQuelle {
  /** Die Edition der aktuell GÜLTIGEN Lizenz — oder undefined (free/pro ohne Team). */
  edition(): Edition | undefined;
}

/** Edition aus dem Store lesen: hinterlegter Schlüssel (Einstellungen) oder MDM-Vorauslage — identische Prüfung wie der Lizenz-Router. */
export function editionAusStore(store: KeptaStore): Edition | undefined {
  try {
    const einstellungen = store.einstellungen();
    const name = einstellungen["license_name"];
    const schluessel = einstellungen["license_key"];
    if (name && schluessel) {
      const pruefung = pruefeSchluessel(name, schluessel);
      if (pruefung.gueltig) return pruefung.edition;
    }
    const verwaltet = liesVerwaltet();
    if (verwaltet?.license_name && verwaltet.license_key) {
      const pruefung = pruefeSchluessel(verwaltet.license_name, verwaltet.license_key);
      if (pruefung.gueltig) return pruefung.edition;
    }
  } catch {
    // Kaputte Konfiguration darf niemals die App unbenutzbar machen — wie überall in der MDM-Schicht.
  }
  return undefined;
}

const TEAM_PREFIX = "team:";
export function istTeamScope(scope: string | undefined): boolean {
  return typeof scope === "string" && scope.startsWith(TEAM_PREFIX);
}

/** Team lesen: Edition + Rollen-Datei müssen da sein — dann darf JEDE gelistete Person (und viewer-Default) lesen. */
function teamLesen(quelle: TeamEditionQuelle, konfig: TeamKonfig | null, ref: MemoryRef): boolean {
  if (!istTeamScope(ref.scope)) return true; // Nicht-Team-Scopes: unverändert wie immer
  const edition = quelle.edition();
  if (edition !== "business" && edition !== "enterprise") return false; // Team-Daten sind lizenzierte Daten
  return konfig !== null; // ohne Rollen-Datei: dicht bleibt dicht
}

/** Team schreiben: nur team:*-Scopes, nur mit Edition + Rollen-Datei, und nur mit Schreibrecht (admin/member). */
function teamSchreiben(quelle: TeamEditionQuelle, konfig: TeamKonfig | null, actor: ActorContext, ref: MemoryRef): boolean {
  if (!istTeamScope(ref.scope)) return true; // Nicht-Team-Scopes: unverändert wie immer
  if (!teamLesen(quelle, konfig, ref)) return false;
  return darfSchreiben(rolleFuer(konfig!, actor.actorId));
}

/**
 * Die Team-Policy als Extensions-Fragment (der `policy`-Gate). Anhängen an
 * defaultExtensions() im Bootstrap — überall dort, wo das Lizenz-Editionsfenster
 * bekannt ist. Nicht-Team-Scopes sind schlicht immer frei (exakt der bisherige
 * Default: ALLOW_ALL).
 */
export function teamPolicy(quelle: TeamEditionQuelle, holeKonfig: () => TeamKonfig | null = () => liesTeamKonfig()): Pick<KeptaExtensions, "policy"> {
  const gate = {
    canRead: (_actor: ActorContext, ref: MemoryRef): boolean => teamLesen(quelle, holeKonfig(), ref),
    canWrite: (actor: ActorContext, ref: MemoryRef): boolean => teamSchreiben(quelle, holeKonfig(), actor, ref),
    filterResults: (actor: ActorContext, rows: MemoryRef[]): MemoryRef[] => {
      const konfig = holeKonfig();
      return rows.filter((r) => teamLesen(quelle, konfig, r));
    },
  };
  return { policy: gate };
}

/** Übersicht für /api/team — ehrlich auch im Free-Fall (team: null). Seats ergänzt der Router aus der Lizenzprüfung. */
export function teamUebersicht(store: KeptaStore, actorId = "lokal"): { edition: Edition | undefined; team: { name?: string; rollen: Record<string, TeamRolle>; meineRolle: TeamRolle } | null } {
  const verwaltet = liesVerwaltet();
  const edition = editionAusStore(store);
  const konfig = liesTeamKonfig(verwaltet);
  const teamAktiv = (edition === "business" || edition === "enterprise") && konfig !== null;
  return {
    edition,
    team: teamAktiv && konfig
      ? { name: konfig.name, rollen: konfig.rollen, meineRolle: rolleFuer(konfig, actorId) }
      : null,
  };
}
