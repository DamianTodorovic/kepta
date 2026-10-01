// Reparatur-Planung für Massen-Imports: eine Quelldatei, deren Teile mit einer
// älteren Extraktion eingelesen wurden — PDFs aus der alten Rohbyte-Extraktion
// (Glyph-Namen, Binärblöcke), HTML von vor dem Navigationsfilter —, wird
// anhand des neu extrahierten Texts neu verteilt: bestehende Teile werden
// aktualisiert, überzählige entfernt, fehlende ergänzt. Rein planend: Das
// Schreiben macht der Aufrufer (Server) über den Store.
//
// Die Chunk-Zuordnung läuft über den Teil-Suffix im Titel ("X — 2/5" oder
// "X — Teil 2/5") und, falls die alte Anzahl abweicht, über die Reihenfolge:
// Teil 1..n neu, alles darüber hinaus fliegt weg.

export interface ImportBestand {
  id: string;
  title: string;
  content: string;
}

export interface ReparaturPlan {
  updates: { id: string; title: string; content: string }[];
  entfaelle: string[];
  neu: { title: string; content: string }[];
}

export interface ReparaturOptionen {
  /** Basis-Titel für die Teile (Standard: aus dem Bestand abgeleitet). */
  basis?: string;
  /**
   * Wird an jeden Teil angehängt: die Quellen-Zeile ("\n\n— Source: <pfad>").
   *
   * Die erste Fassung (2.10.0) schrieb nur den neuen Text zurück. Die Teile
   * waren danach lesbar, aber ohne Herkunft — nicht mehr unter ihrer Datei
   * gruppiert, ohne Öffnen-Knopf und für eine zweite Reparatur unauffindbar.
   */
  anhang?: string;
}

const TEIL_SUFFIX = /\s+—\s*(?:Teil\s+)?(\d+)\/(\d+)\s*$/;
const MIT_TEIL = /—\s*Teil\s+\d+\/\d+\s*$/;

export function basisTitelVon(titel: string): string {
  return titel.replace(TEIL_SUFFIX, "").trim();
}

/**
 * Ordnet die neuen Textteile den bestehenden Einträgen zu.
 *
 * Die Titelform des Bestands bleibt erhalten: der Rechner-Scan schreibt
 * "X — 2/5", Datei-Drop und Inbox "X — Teil 2/5". Die erste Fassung schrieb
 * überall "Teil" und nahm den Scan-Teilen damit ihr Teil-Abzeichen.
 *
 * @param bestaende  die bisherigen Chunks dieser Quelle (Reihenfolge egal —
 *                   sortiert wird nach Teil-Nummer, ohne Suffix nach id)
 * @param neueTeile  die frisch extrahierten Textteile in Lesereihenfolge
 */
export function planeImportReparatur(
  bestaende: readonly ImportBestand[],
  neueTeile: readonly string[],
  optionen: ReparaturOptionen = {}
): ReparaturPlan {
  const plan: ReparaturPlan = { updates: [], entfaelle: [], neu: [] };
  // Ohne Bestand gibt es nichts zu reparieren — neue Imports sind Aufgabe des
  // normalen Imports. Ohne neuen Text ebenso: eine leere Extraktion darf nie
  // dazu führen, dass alle Teile einer Datei verschwinden.
  if (bestaende.length === 0 || neueTeile.length === 0) return plan;

  const basisName = (optionen.basis ?? basisTitelVon(bestaende[0].title) ?? "Dokument").trim() || "Dokument";
  const anhang = optionen.anhang ?? "";
  const mehrteilig = neueTeile.length > 1;
  const mitTeil = bestaende.some((b) => MIT_TEIL.test(b.title));

  const sortiert = [...bestaende].sort((a, b) => {
    const na = TEIL_SUFFIX.exec(a.title);
    const nb = TEIL_SUFFIX.exec(b.title);
    const pa = na ? Number(na[1]) : 0;
    const pb = nb ? Number(nb[1]) : 0;
    return pa - pb || a.id.localeCompare(b.id);
  });

  const anzahl = Math.max(sortiert.length, neueTeile.length);
  for (let i = 0; i < anzahl; i++) {
    const inhalt = neueTeile[i];
    const titel = mehrteilig
      ? `${basisName} — ${mitTeil ? "Teil " : ""}${i + 1}/${neueTeile.length}`
      : basisName;
    const bestand = sortiert[i];
    if (bestand && inhalt !== undefined) {
      plan.updates.push({ id: bestand.id, title: titel, content: inhalt + anhang });
    } else if (bestand && inhalt === undefined) {
      plan.entfaelle.push(bestand.id);
    } else {
      plan.neu.push({ title: titel, content: inhalt! + anhang });
    }
  }
  return plan;
}

/**
 * Wartet höchstens `ms` Millisekunden, dann gilt das Versprechen als
 * gescheitert. Für Dateizugriffe, die nie zurückkommen — auf macOS etwa, wenn
 * das System für einen geschützten Ordner um Erlaubnis fragt und niemand
 * antwortet. Das Versprechen selbst läuft weiter; nur das Warten endet.
 */
export function mitFrist<T>(versprechen: Promise<T>, ms: number, meldung: string): Promise<T> {
  return new Promise<T>((aufloesen, ablehnen) => {
    const uhr = setTimeout(() => ablehnen(new Error(meldung)), ms);
    versprechen.then(
      (wert) => { clearTimeout(uhr); aufloesen(wert); },
      (fehler: unknown) => { clearTimeout(uhr); ablehnen(fehler); }
    );
  });
}
