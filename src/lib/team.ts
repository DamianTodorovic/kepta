// KEPTA Team-Scopes und Rollen (Milestone E1).
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
// Geschaltet wird das Ganze allein durch diese Datei. Früher war zusätzlich eine
// Business-/Enterprise-Lizenz nötig; seit die herunterladbare App kein
// Schlüssel-System mehr hat (10.10.2026), wäre diese Bedingung eine dauerhafte
// Sperre eines vorhandenen Werkzeugs — also weg. Nicht-team-Scopes ("local",
// "user:*", "agent:*") verhält sich diese Policy exakt wie der bisherige Default
// (immer ja), und ohne Rollen-Datei bleibt team:* dicht: lesen UND schreiben.
//
// Bewusst NICHT hier: Synchronisation zwischen Rechnern, SSO, Workspaces-UI
// (Milestones E2+). E1 liefert die Durchsetzungsschicht, auf der die
// weiteren Milestones aufbauen.
import type { ActorContext, KeptaExtensions, MemoryRef } from "../core/extensions";
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

const TEAM_PREFIX = "team:";
export function istTeamScope(scope: string | undefined): boolean {
  return typeof scope === "string" && scope.startsWith(TEAM_PREFIX);
}

/** Team lesen: eine Rollen-Datei muss da sein — dann darf JEDE gelistete Person (und viewer-Default) lesen. */
function teamLesen(konfig: TeamKonfig | null, ref: MemoryRef): boolean {
  if (!istTeamScope(ref.scope)) return true; // Nicht-Team-Scopes: unverändert wie immer
  return konfig !== null; // ohne Rollen-Datei: dicht bleibt dicht
}

/** Team schreiben: nur team:*-Scopes, nur mit Rollen-Datei, und nur mit Schreibrecht (admin/member). */
function teamSchreiben(konfig: TeamKonfig | null, actor: ActorContext, ref: MemoryRef): boolean {
  if (!istTeamScope(ref.scope)) return true; // Nicht-Team-Scopes: unverändert wie immer
  if (!teamLesen(konfig, ref)) return false;
  return darfSchreiben(rolleFuer(konfig!, actor.actorId));
}

/**
 * Die Team-Policy als Extensions-Fragment (der `policy`-Gate). Anhängen an
 * defaultExtensions() im Bootstrap. Nicht-Team-Scopes sind schlicht immer frei
 * (exakt der bisherige Default: ALLOW_ALL).
 */
export function teamPolicy(holeKonfig: () => TeamKonfig | null = () => liesTeamKonfig()): Pick<KeptaExtensions, "policy"> {
  const gate = {
    canRead: (_actor: ActorContext, ref: MemoryRef): boolean => teamLesen(holeKonfig(), ref),
    canWrite: (actor: ActorContext, ref: MemoryRef): boolean => teamSchreiben(holeKonfig(), actor, ref),
    filterResults: (actor: ActorContext, rows: MemoryRef[]): MemoryRef[] => {
      const konfig = holeKonfig();
      return rows.filter((r) => teamLesen(konfig, r));
    },
  };
  return { policy: gate };
}

/** Übersicht für /api/team — ehrlich auch ohne Rollen-Datei (team: null). */
export function teamUebersicht(actorId = "lokal", verwaltet: VerwalteteEinstellungen | null = liesVerwaltet()): { team: { name?: string; rollen: Record<string, TeamRolle>; meineRolle: TeamRolle } | null } {
  const konfig = liesTeamKonfig(verwaltet);
  return {
    team: konfig ? { name: konfig.name, rollen: konfig.rollen, meineRolle: rolleFuer(konfig, actorId) } : null,
  };
}
