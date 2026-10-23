/**
 * Die Tuer nennt einen Grund, wenn sie eine Anfrage ablehnt oder der Anbieter
 * nicht antwortet: `grund` in server/router/chat.ts. Diese Datei uebersetzt die
 * Kennung in einen einzigen Satz in Menschensprache, mit dem naechsten Schritt.
 *
 * Unbekannte Kennungen kommen als null zurueck - der Aufrufer zeigt dann weiter
 * den Text der Tuer, statt etwas zu erfinden. Ein Grund, den niemand liest, ist
 * dasselbe Schweigen wie ein Fehler, den niemand wirft.
 *
 * Rein ASCII: die Flaeche ist englisch, und ein Umlaut in einem sichtbaren Wort
 * ist hier ein Anzeigefehler, kein Akzent.
 */

/**
 * Die Kennungen, die die Flaeche zeigt, und ihr Satz fuer einen Menschen.
 *
 * Nicht jede Kennung der Tuer steht hier: die fuenf der Wiederherstellungs-Route
 * (`fremder-host`, `fremde-herkunft`, `ohne-wiederherstellungs-kopf`,
 * `schluessel-nicht-lesbar`, `nicht-verschluesselt`) haben heute keinen Leser in
 * der Flaeche - `baueHuelle` fragt nur `r.ok`. Ein Satz ohne Leser waere Schmuck,
 * also steht er hier nicht, bis ein Leser da ist.
 */
const GRUND_TEXTE: Record<string, string> = {
  "kein-anbieter":
    "No model provider is chosen yet, so nothing was sent. Pick one under Settings, then ask again.",
  "kein-schluessel":
    "This provider needs an API key, so nothing left this computer. Add the key under Settings, or start a local model instead.",
  "anbieter-nicht-erreichbar":
    "The model service did not answer. Start it (for Ollama: ollama serve), or pick another provider under Settings.",
  "anbieter-lehnt-ab":
    "The provider refused this request. Check the key and the model name under Settings.",
  "antwort-nicht-lesbar":
    "The answer could not be read. Try again, or choose another model under Settings.",
  "nur-post":
    "That address only accepts POST requests - a form cannot trigger it; this is a note for the logs.",
  "chat-fehlgeschlagen":
    "The answer failed inside K3PTA. The reason is in the logs, not in the answer; ask again, or pick another model under Settings.",
  "import-leer":
    "The file arrived empty, so nothing was read. Pick the conversations.json from your export again; the logs show what came in.",
  "import-kein-json":
    "The file is not valid JSON, so nothing was read. Export conversations.json again from ChatGPT or Claude; the logs keep the first error.",
  "import-unbekanntes-format":
    "This file is neither a ChatGPT nor a Claude export, so nothing was imported. Pick conversations.json from one of those exports; the logs name the shape that arrived.",
};

/** Ein Satz fuer die Kennung, oder null, wenn die Kennung neu oder fehlt. */
export function grundText(grund: unknown): string | null {
  if (typeof grund !== "string" || grund.length === 0) return null;
  const satz = GRUND_TEXTE[grund];
  return typeof satz === "string" ? satz : null;
}

/** Die Liste der Kennungen, damit eine Wache oder ein Fall sie vollstaendig pruefen kann. */
export function grundKennungen(): string[] {
  return Object.keys(GRUND_TEXTE);
}
