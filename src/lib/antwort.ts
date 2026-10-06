// Eine Antwort bleibt eine Antwort: fremde Daten, die die Fläche nicht
// bestellt hat. Diese Datei ist die einzige Stelle, an der fremde Daten in
// die eigene Form gehoben werden — damit ein Teil-Response nicht die ganze
// Fläche mitnimmt.

/**
 * Bringt einen fremden Wert in die Form einer Schablone.
 *
 * Die Schablone ist ein Wert der erwarteten Art — meist die leere Fassung.
 * Was fehlt, wird ersetzt; was da ist, bleibt. `false` und `0` sind keine
 * fehlenden Werte, sie überleben.
 *
 * Warum das eine eigene Funktion ist und keine `?.`-Kette an jeder Stelle:
 *   Die Fläche liest `inbox.files.length`, `daten.todos.total`,
 *   `daten.contradictions.map(...)`. Antwortet ein Endpunkt unvollständig —
 *   Server im Hochlauf, ältere Fassung, Teilauswertung, ein Feld umgebaut —
 *   stand bisher die ganze Schicht da und verschwand. Derselbe Fehler hat
 *   einmal den Einstellungs-Bildschirm gekostet und einmal die Inbox-Leiste.
 *   Eine Kette optionaler Zugriffe versteckt jeden einzelnen davon; eine
 *   Grenze, die prüft, kann nicht übersehen werden.
 */
export function inForm<T>(wert: unknown, schablone: T): T {
  return fuehre(wert, schablone) as T;
}

function passtArt(wert: unknown, vorlage: unknown): boolean {
  if (Array.isArray(vorlage)) return Array.isArray(wert);
  if (typeof vorlage === "number") return typeof wert === "number" && Number.isFinite(wert);
  if (typeof vorlage === "string") return typeof wert === "string";
  if (typeof vorlage === "boolean") return typeof wert === "boolean";
  if (vorlage !== null && typeof vorlage === "object") {
    return wert !== null && typeof wert === "object" && !Array.isArray(wert);
  }
  // undefined, null, function, symbol, bigint in der Schablone: nichts prüfen.
  return true;
}

function fuehre(wert: unknown, vorlage: unknown): unknown {
  // Eine Liste ist nie die Musterliste: fehlt sie oder ist sie falscher Art,
  // steht sie leer da — ein Muster-Element ist Form, nicht Inhalt.
  if (Array.isArray(vorlage)) {
    if (!Array.isArray(wert)) return [];
    const element = vorlage[0];
    // Ohne Muster-Element ist die Form der Zeilen nicht erklärt; dann bleiben
    // sie, wie sie sind. Ein fehlendes Feld in einer Zeile malt leer.
    return element === undefined ? wert : wert.map((e) => fuehre(e, element));
  }
  // Ein Wert falscher Art ist kein Wert — er wird ersetzt, nicht durchgereicht.
  if (wert === undefined || wert === null || !passtArt(wert, vorlage)) {
    if (vorlage !== null && typeof vorlage === "object") {
      return fuehre({}, vorlage);
    }
    return vorlage;
  }
  if (vorlage !== null && typeof vorlage === "object") {
    const vor: Record<string, unknown> = vorlage as Record<string, unknown>;
    // Eine leere Schablone sagt nichts über die Felder aus — das ist die
    // Anmeldung eines freien Objekts (kinds: wer wie viel), nicht das Verbot
    // aller Felder. Sonst würde jeder Inhalt still gelöscht.
    if (Object.keys(vor).length === 0) return wert;
    const src = wert as Record<string, unknown>;
    // Was die Schablone nicht kennt, bleibt stehen: die Grenze schützt vor
    // FEHLENDEN Feldern, nicht vor überzähligen. Ein Feld, das niemand liest,
    // ist harmlos — ein Feld, das die Fläche liest und das hier fehlte, würde
    // still gelöscht (und genau das passiert mit einer optionalen Angabe wie
    // `by`, sobald die Schablone sie nicht aufzählt).
    const aus: Record<string, unknown> = { ...src };
    for (const key of Object.keys(vor)) aus[key] = fuehre(src[key], vor[key]);
    return aus;
  }
  return wert;
}
