// Schluesselfoermigen Text maskieren, bevor aus einer Datei eine Notiz wird.
//
// #76, gemessen am echten Bestand (eigener Lauf, lesend über die laufende App,
// 14.702 Notizen): 79 Notizen tragen eines der fünf Anbietermuster, 143 Stellen
// einen 64-Zeichen-Hex-Lauf. Die Herkunft ist die eigene Arbeitsmappe — Papiere
// über Schlüssel, die der Rechner-Scan eingesammelt hat. Was in der Wissensbasis
// steht, lesen angeschlossene Agenten über MCP; ein Klartextschlüssel zwischen
// ihnen ist kein Schönheitsfehler.
//
// Die Grenze ist die schwierige Hälfte. 132 von 143 Hex-Läufen liegen nackt im
// Fließtext: Prüfummen, Record-Hashes, Commit-Belege. Wer die mitmaskiert, heilt
// kein Leck und zerstört die Belegkette. Also:
//   * die fünf Anbieterformen immer — sie kommen in der Natur fast nur als Wert vor
//   * ein Hexlauf NUR dann, wenn ein schlüsselartiger Name ihm zugewiesen ist
//   * ein Text ÜBER Schlüssel bleibt Zeichen für Zeichen erhalten
//
// Die Maske nennt die Familie und die Länge des Werts (`sk-…MASKIERT(43)`), denn
// „hier stand etwas, 43 Stellen" ist für einen Prüfer eine Auskunft und für
// einen Angreifer nichts.

/** Eine Familie, wie die Aufgabe sie nennt. Nicht mehr, nicht weniger. */
export interface SchluesselMuster {
  name: string;
  re: RegExp;
  /** Wie viele Zeichen vom Anfang bleiben stehen — die Familie, nie der Wert. */
  praefix: number;
}

export const SCHLUESSEL_MUSTER: readonly SchluesselMuster[] = [
  { name: "sk-ant", re: /\bsk-ant-[A-Za-z0-9_-]{16,}\b/g, praefix: 7 },
  { name: "sk", re: /\bsk-[A-Za-z0-9]{16,}\b/g, praefix: 3 },
  { name: "ghp", re: /\bghp_[A-Za-z0-9]{16,}\b/g, praefix: 4 },
  { name: "xox", re: /\bxox[baprs]-[A-Za-z0-9-]{8,}\b/g, praefix: 5 },
  { name: "AKIA", re: /\bAKIA[0-9A-Z]{12,}\b/g, praefix: 4 },
];

/**
 * Ein 64-Zeichen-Hex gilt nur als Schlüssel, wenn ihm etwas schlüsselartig
 * vorangestellt ist: `KEPTA_DB_KEY = …`, `"api_key": "…"`, `token:`. Das
 * schliessende Anführungszeichen hinter dem Namen ist Teil der Form — in JSON
 * steht es immer dort. Ohne diese Zuweisung ist derselbe Lauf eine Prüfumme,
 * und die gehört in einen Beleg.
 */
export const ZUWEISUNG_RE =
  /((?:api[_-]?key|apikey|auth[_-]?token|access[_-]?token|refresh[_-]?token|secret|passwort|password|schl[üu]ssel|key|token)"?\s*[:=]\s*["']?)([0-9a-f]{64})\b/gi;

export interface Maskierung {
  text: string;
  /** Wie viele Stellen in diesem Text maskiert wurden. */
  maskiert: number;
  /** Aufgeschlüsselt nach Familie — die Fläche nennt eine Zahl, der Prüfer die Arten. */
  arten: Record<string, number>;
}

/**
 * Eine Maske, die nie selbst wieder als Wert gelesen wird: `…MASKIERT(<länge>)`
 * enthält nach dem Präfix ein `(`, und keines der Muster lässt das durch.
 */
export function maskiereSchluessel(text: string): Maskierung {
  if (typeof text !== "string" || text === "") return { text: text ?? "", maskiert: 0, arten: {} };
  let out = text;
  let maskiert = 0;
  const arten: Record<string, number> = {};
  const zaehle = (name: string) => { maskiert++; arten[name] = (arten[name] ?? 0) + 1; };

  for (const m of SCHLUESSEL_MUSTER) {
    m.re.lastIndex = 0;
    out = out.replace(m.re, (wert) => {
      zaehle(m.name);
      return `${wert.slice(0, m.praefix)}…MASKIERT(${wert.length})`;
    });
  }

  ZUWEISUNG_RE.lastIndex = 0;
  out = out.replace(ZUWEISUNG_RE, (_g, anfang: string, hex: string) => {
    zaehle("zuweisung");
    return `${anfang}…MASKIERT(${hex.length})`;
  });

  return { text: out, maskiert, arten };
}
