// K3PTA Core — der Vertrag des Behauptungsfeldes, ein Blatt fuer alle Tueren.
//
// Warum diese Datei existiert: `beziehungen` war seit 3.2.97 an einer einzigen Stelle
// beschrieben (`server/router/memories.ts`). Die Agentenpforte (`src/core/mcp.ts`) kannte das
// Feld nicht — kein Vertrag, also auch keine Absage: ein Agent, das es dennoch schickte, bekam
// eine Notiz ohne Kante und eine Antwort ohne Widerspruch. Ein Feld, das zwei Tueren haben,
// darf nicht zweimal beschrieben werden, sonst streiten die Absagen um denselben Entwurf.
//
// Die drei Zustaende sind der Kern des Vertrags, nicht ein Detail:
//   · **nicht genannt** — die Hand hat die Aussagen nicht angefasst; es steht, was steht.
//   · **leere Liste** — "alle weg"; so loescht die Oberflaeche.
//   · **Liste** — setzen, was drin steht (gekappt vom Kern auf `BEHAUPTUNGEN_MAX`).
// Jede Notiz, die denselben Schreibweg mehrfach beruehrt (Agent, Scan, Nachzug, Oberflaeche),
// ruft dieselbe Lesung: ein viertes Feld zu erfinden, das der Aufrufer nicht schickt, waere der
// eigene Wortverlust.
//
// Abgewiesen wird **vor** jedem Schreibgriff, und zwar von beiden Tueren. Eine Notiz, die wegen
// eines falschen Wortes halb angelegt wird, ist ein Datenverlust mit Umweg: der Entwurf bleibt
// beim Client, die Absage nennt, was zu tun ist.

import { sanitizeTitle } from "./sanitize";
import { systemWort, type BehauptungEingabe } from "./wortschatz";

export interface BehauptungenLesung {
  /** Wurde das Feld geschickt? false heisst "nicht angefasst — nichts loeschen". */
  gesendet: boolean;
  liste: BehauptungEingabe[];
  /** Kein null-Fall, wenn etwas gesetzt werden darf; sonst der Grund fuer den Client. */
  ablehnung: string | null;
}

/**
 * Liest `beziehungen` aus einem Anfrage-Leib — REST wie MCP, identische Woerter, identische Grenze.
 */
export function behauptungenAus(body: Record<string, unknown>): BehauptungenLesung {
  const roh = body.beziehungen;
  if (roh === undefined) return { gesendet: false, liste: [], ablehnung: null };
  if (!Array.isArray(roh)) {
    return { gesendet: true, liste: [], ablehnung: "beziehungen must be a list of claims, each one {quelle, ziel, wort}" };
  }
  const liste: BehauptungEingabe[] = [];
  for (const x of roh) {
    if (!x || typeof x !== "object" || Array.isArray(x)) {
      return { gesendet: true, liste, ablehnung: "every claim needs three parts: who, the word, whom" };
    }
    const o = x as Record<string, unknown>;
    const quelle = sanitizeTitle(o.quelle);
    const ziel = sanitizeTitle(o.ziel);
    const wort = sanitizeTitle(o.wort);
    if (!quelle || !ziel || !wort) {
      return { gesendet: true, liste, ablehnung: "a claim with an empty part is not a claim - fill who, the word and whom" };
    }
    if (quelle.toLowerCase() === ziel.toLowerCase()) {
      return { gesendet: true, liste, ablehnung: "who and whom are the same term - a claim needs two different ends" };
    }
    if (systemWort(wort)) {
      return {
        gesendet: true,
        liste,
        ablehnung: `"${wort}" is the word the graph already uses for a mention, not for a claim — pick the word that says what is claimed, like manages or blocks`,
      };
    }
    liste.push({ quelle, ziel, wort });
  }
  return { gesendet: true, liste, ablehnung: null };
}
