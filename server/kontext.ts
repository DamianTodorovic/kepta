// Server-Kontext: alles, was die Router brauchen, ohne sich gegenseitig zu kennen.
// createApp (server/app.ts) baut ihn einmal und reicht ihn an jedes mountX durch.
import type { KeptaStore } from "../src/core/store";
import type { MemoryRecord as CoreMemory } from "../src/core/types";
import type { Limiter } from "./helfer/limiter";
import type { Umgebung, Eintrag } from "../src/lib/einrichtung";

/** Optionen für createApp — nur Tests setzen sie; die App startet ohne. */
export interface AppOptionen {
  /** Ersetzt die Lizenzprüfung (Tests); fehlt sie, zählt der hinterlegte Schlüssel. */
  lizenziert?: () => boolean;
  /** Der Pro-Tag: 24 h ab Erststart alle Pro-Funktionen ohne Limiten (echte App, nicht Tests). */
  probetag?: boolean;
  /** Where Claude, Cursor & Co. keep their settings — a temp folder in tests. */
  umgebung?: Umgebung;
  /** The MCP entry „Connect“ writes — the server inside the app, else npx. */
  eintrag?: Eintrag;
}

export interface ActivityEvent {
  type: "save" | "update" | "delete" | "search" | "consolidate";
  source: "app" | "agent";
  title?: string;
  ts: number;
}

export interface AppKontext {
  store: KeptaStore;
  /** Datenordner (~/.kepta) — Profil, Einstellungen-Archiv, Inbox, Scan-Konfiguration. */
  datenOrdner: string;
  optionen: AppOptionen;
  /** Rate-Limiter (einmal pro App gebaut). */
  limiter: Limiter;
  istLizenziert(): boolean;
  /** Aktivität an alle SSE-Abnehmer melden (Suche optional gedrosselt). */
  publishActivity(evt: Omit<ActivityEvent, "ts">, opts?: { throttleSearchMs?: number }): void;
  /**
   * Markiert, dass die App SELBST soeben geschrieben hat: der DB-Wächter meldet
   * die Änderung sonst als "von außen" — beim Rechner-Scan stand dann fälschlich
   * "An agent saved a node" auf dem Bildschirm.
   */
  markiereEigeneAenderung(): void;
  /**
   * Vollständige Liste via Paginierung — listMemories deckelt pro Seite, damit
   * Export, Trash-Listung und Replace-Import bei großen Gehirnen nichts still
   * abschneiden.
   */
  listAllMemories(opts?: { trash?: boolean }): CoreMemory[];
}
