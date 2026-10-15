// Rate-Limiter — einmal pro App gebaut (server/app.ts), von den Routern genutzt.
// Schützt vor Brute-Force / DoS; die Grenzen sind lokal bewusst großzügig.
import rateLimit from "express-rate-limit";

export interface Limiter {
  global: ReturnType<typeof rateLimit>;
  chat: ReturnType<typeof rateLimit>;
  clip: ReturnType<typeof rateLimit>;
  write: ReturnType<typeof rateLimit>;
}

/**
 * Die Datenkante je Minute. Abgeleitet, nicht gefuehlt: gemessen 15.10. 05:0x in
 * der Fenster-Strasse macht EINE Flächenladung 21 bis 23 Anfragen an `/api`, und
 * die Flaeche pollt im Normalbetrieb weiter (Dashboard.tsx:653 alle 4 s = 15/min,
 * :428 alle 12 s = 5/min). Mit der alten Kante von 180 haette eine einzige lange
 * Sitzung mit offenem Graph die eigene Tuer zugemacht — derselbe Leib, den die
 * 820-er Aufnahme zeigt, nur von innen. 600 ist das Vierfache dessen, was die
 * Oberflaeche bei Arbeit braucht, und immer noch eine Kante gegen eine Schleife.
 */
export const DATEN_KANTE = 600;

/**
 * Die Schreibkante je Minute. 60 war zu klein: gemessen 15.10. 05:56 fiel der
 * zweite Abnahme-Lauf genau hier — ein POST bekam keinen Leib, und ein Helfer las
 `.id` von undefined ab (tests/server-permanent.test.ts:41). Ein Import, ein
 * Aufräumen oder eine Reparatur mit mehr als sechzig Schreibungen in einer Minute
 * war bisher schlicht abgewiesen. 600 ist dieselbe Groessenordnung wie die Lese-
 * kante: ein Vielfaches dessen, was die Oberflaeche bei Arbeit braucht, und immer
 * noch ein Ende fuer eine Schleife.
 */
export const SCHREIB_KANTE = 600;

export function erstelleLimiter(): Limiter {
  return {
    // Der Begrenzer gilt der Tuer, nicht dem Fenster. Gemessen 15.10. 04:2x: die
    // Fenster-Strasse lud die Flaeche zwolfmal schnell hintereinander — und bei
    // 820 px stand statt des Graphen der nackte Leib
    // `{"error":"Too many requests — please wait a moment."}` im Browser
    // (audit-2026-10-09/leitung-bilder/graph-820x1180.png). Grund: app.ts setzt
    // diese Mittelware vor ALLE Routen, also auch auf das Dokument und die
    // statischen Gueter. Ein Nutzer darf nicht an der eigenen Oberflaeche ein
    // Kontingent verbrauchen koennen; API und MCP bleiben gedeckelt.
    global: rateLimit({
      windowMs: 60_000,
      max: DATEN_KANTE,
      standardHeaders: true,
      legacyHeaders: false,
      skip: (req) => !/^\/(api|mcp)(\/|$)/.test(req.path),
      message: { error: "Too many requests — please wait a moment." },
    }),
    chat: rateLimit({ windowMs: 60_000, max: 20, standardHeaders: true, legacyHeaders: false, message: { error: "Chat Rate-Limit: max 20/min" } }),
    clip: rateLimit({ windowMs: 60_000, max: 12, standardHeaders: true, legacyHeaders: false, message: { error: "Clip Rate-Limit: max 12/min" } }),
    // Schreibdrossel: groß genug für jede Aufraeumaktion, klein genug, dass ein
    // verirrter Aufruf nicht die ganze Wissensbasis in einem Rutsch bewegt.
    write: rateLimit({ windowMs: 60_000, max: SCHREIB_KANTE, standardHeaders: true, legacyHeaders: false, message: { error: `Schreib-Limit: max ${SCHREIB_KANTE}/min` } }),
  };
}
