// Der eine API-Client des Frontends — statt 38 verstreuter fetch()-Aufrufe mit
// je eigener Fehlerbehandlung. Der Wrapper liest den K3PTA-Fehlervertrag
// ({ error: string }) und wirft Error-Meldungen, die direkt in die Oberfläche
// gehören. Darüber hinaus bleibt es fetch: JSON rein, JSON raus, keine Magie.

export class ApiFehler extends Error {
  readonly status: number;
  constructor(meldung: string, status: number) {
    super(meldung);
    this.name = "ApiFehler";
    this.status = status;
  }
}

/** Fehlertext aus einer Antwort ziehen — K3PTA nennt Fehler unter "error". */
async function fehlerAus(res: Response): Promise<string> {
  try {
    const data = (await res.json()) as { error?: unknown };
    const fehler = (data as { error?: unknown })?.error;
    if (typeof fehler === "string" && fehler) return fehler;
  } catch { /* kein JSON im Fehlerfall */ }
  return `HTTP ${res.status}`;
}

/** GET → geparstes JSON; Fehler als ApiFehler mit Server-Meldung. */
export async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new ApiFehler(await fehlerAus(res), res.status);
  return (await res.json()) as T;
}

/** POST/PUT/DELETE mit JSON-Body → geparstes JSON; Fehler als ApiFehler. */
export async function sendJson<T>(url: string, body: unknown, methode: "POST" | "PUT" | "DELETE" = "POST"): Promise<T> {
  const res = await fetch(url, {
    method: methode,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });
  if (!res.ok) throw new ApiFehler(await fehlerAus(res), res.status);
  return (await res.json()) as T;
}

/**
 * Wie getJson, aber Fehler landen als Text statt als Exception — für die
 * Stellen, die einen Zustand anzeigen (null) statt den Vorgang abzubrechen.
 */
export async function getJsonOderNull<T>(url: string): Promise<T | null> {
  try {
    return await getJson<T>(url);
  } catch {
    return null;
  }
}
