// Der eine API-Client des Frontends — statt 38 verstreuter fetch()-Aufrufe mit
// je eigener Fehlerbehandlung. Der Wrapper liest den K3PTA-Fehlervertrag
// ({ error: string }) und wirft Error-Meldungen, die direkt in die Oberfläche
// gehören. Darüber hinaus bleibt es fetch: JSON rein, JSON raus, keine Magie.

export class ApiFehler extends Error {
  readonly status: number;
  /** Der Satz, der auf der Flaeche stehen darf — ein Text, den diese Tuer schrieb. */
  readonly satz: string;
  /**
   * @param meldung ein Satz, den diese App oder ihre eigne Tuer geschrieben hat — nie der
   *                Wortlaut einer Bibliothek (siehe src/lib/absage.ts)
   * @param status  die Zahl aus der Antwort; 0 heisst, dass dieser Punkt keinen HTTP-Status
   *                hat — ein Fehler mitten im Strom oder ein leerer Strom
   */
  constructor(meldung: string, status = 0) {
    super(meldung);
    this.name = "ApiFehler";
    this.status = status;
    this.satz = meldung;
  }
}

/** Hoechstlaenge eines Tuer-Satzes, der auf der Flaeche stehen darf. */
const SATZ_KAPPE = 160;

/**
 * Der Text, den unsre eigne Tuer unter `error` mitschickt — oder der Falltext dahinter.
 *
 * Die Formpruefung ist kein Misstrauen gegen die Tuer, sondern gegen die Antwort: ein Leib
 * von einem Hoerer ohne unsre Unterschrift (3.2.128), ein Kopf einer HTML-Fehlerseite oder ein
 * abgefangener Proxy-Text wird hier zur Zahl. Sonst landet genau der Pfad auf dem Knopf, den
 * 3.2.130 am echten Fenster gefunden hat.
 */
/**
 * Die Form eines Pfads — nicht jedes Schragsstrich. "max 20/min" ist eine Auskunft,
 * "/Users/a/.kepta/kepta.db" ist eine Blamage; die Kante muss beide auseinanderhalten,
 * sonst verschwindet genau der Grund, den die Tuer dem Menschen zeigen will.
 */
const PFAD_FORM = /\\|~\/|(?:^|[\s("'=])\/[\w.-]+\/[\w.-]+|(?:^|[\s("'=(])\.{1,2}[./\\]/;

export function tuerSatz(feld: unknown, falltext: string): string {
  if (typeof feld !== "string") return falltext;
  const text = feld.trim();
  if (!text || text.length > SATZ_KAPPE) return falltext;
  if (/[\r\n]/.test(text)) return falltext;
  if (PFAD_FORM.test(text)) return falltext;
  return text;
}

/** Fehlertext aus einer Antwort ziehen — K3PTA nennt Fehler unter "error". */
async function fehlerAus(res: Response): Promise<string> {
  try {
    const data = (await res.json()) as { error?: unknown };
    return tuerSatz(data?.error, `HTTP ${res.status}`);
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
