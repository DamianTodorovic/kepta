// Anlagen, die ihren Status pruefen, statt ihn wegzuwerfen.
//
// Der Blindfleck, um den es hier geht (gemessen 13.10. 12:26, `tests/server.test.ts:481`):
// der Helfer, der die private Notiz anlegte, gab die Antwort zurück und liess ihren
// Status liegen. Ging die Anlage fehl — 429 aus einer Kappe, 404, 401 von einem
// fremden Horcher — stand drei Zeilen spaeter `expected 200 to be 404` im Bericht, und
// die Meldung verdaechtigte den Privatheits-Floor (`src/core/mcp.ts:601`), obwohl nie
// eine Notiz angelegt war. Ein Fall, der wegen einer abgewiesenen Anlage einen
// Pfad-Verdacht meldet, ist ein Defekt der Wache, nicht des Pfads.
//
// Diese Funktion nennt darum im Fehltext, WAS nicht angelegt wurde, den Status, den
// Leib-Kopf — und die Deutung, die ein Mensch sonst aus dem Protokoll lesen müsste:
// ein Leib `{}` bei 401/404 ist die Signatur einer Antwort in `text/plain`. Diese App
// antwortet auf jeder Route mit JSON und einem `error`-Feld; `{}` als Leib kommt von
// einem Horcher, der nicht der geprüfte ist (`tests/helfer/hoerer.ts` beschreibt den
// Nachbau, der das 13.10. dreimal hintereinander gefangen hat).
//
// Der Schnitt ist bewusst keine Bibliotheksform: die eine Anlage kommt aus supertest,
// die andere aus `fetch` — beide dürfen hier stehen, ohne dass eine Typenpflicht die
// Dateien verkettet.
export interface AntwortSchnitt {
  status: number;
  body?: unknown;
  text?: string;
}

/** Die Antworten, mit denen eine Anlage als angelegt gilt. */
export const ANLAGE_ZULASSIG = [200, 201, 202, 204] as const;

/**
 * Wirft, wenn die Antwort keine Zulassung ist, mit dem Grund in der Meldung. `was`
 * benennt die Anlage in Worten, damit der Fehltext nicht raten lässt, welche Anfrage
 * gemeint war. Gibt die Antwort zurück, wenn sie zulaessig ist — Anlagen, die eine id
 * brauchen, lesen sie direkt weiter.
 */
export function anlage<T extends AntwortSchnitt>(antwort: T, was: string, zulassig: readonly number[] = ANLAGE_ZULASSIG): T {
  if (zulassig.includes(antwort.status)) return antwort;
  const leib = String(antwort.text ?? JSON.stringify(antwort.body ?? "") ?? "").replace(/\s+/g, " ").slice(0, 240);
  const leererLeib = antwort.body === undefined || (typeof antwort.body === "object" && antwort.body !== null && Object.keys(antwort.body).length === 0);
  const deutung =
    (antwort.status === 401 || antwort.status === 404) && leererLeib
      ? " — der Leib ist leer, und diese App antwortet auf JEDER Route mit JSON samt `error`-Feld: das ist ein Horcher, der nicht der geprüfte ist (Port-Klasse, tests/helfer/hoerer.ts)."
      : antwort.status === 429
        ? " — 429 ist eine Kappe aus der Prozess-Umwelt (KEPTA_MAX_ACTIVE, server.ts), kein Pfadfehler: die Anlage war es, nicht der geprüfte Weg."
        : "";
  throw new Error(`Anlage fehlgeschlagen: ${was} — Status ${antwort.status} (erlaubt: ${zulassig.join("/")}), Antwort: ${leib || "(leer)"}${deutung}`);
}
