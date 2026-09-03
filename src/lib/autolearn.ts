// Auto-Learn — aus einer Chat-Antwort einen Wissens-Knoten gewinnen.
//
// Die Extraktion läuft gegen ein Sprachmodell, dessen Ausgabe man nicht kontrolliert.
// Reasoning-Modelle (Qwen3, DeepSeek-R1 u. a.) stellen ihrer Antwort einen
// <think>-Block oder blosze Prosa voran. Ein naiver Ausschnitt vom ersten "{"
// bis zum letzten "}" greift dann daneben — genau daran ist die erste Fassung
// still gescheitert. Deshalb hier: Reasoning entfernen, dann das erste
// vollständig balancierte Objekt lesen, Zeichenketten und Maskierungen beachten.

/** Obergrenze für den Hintergrundaufruf. Ohne Limit hängt er bei langsamen lokalen Modellen. */
export const AUTO_LEARN_TIMEOUT_MS = 45_000;

/** Bis hierher wird die Antwort an das Extraktionsmodell übergeben. */
const MAX_ANSWER_CHARS = 4000;

export interface AutoLearnNode {
  title: string;
  tags: string[];
  summary: string;
}

/** Entfernt <think>/<thinking>-Blöcke; ein nicht geschlossener Block gilt bis zum Ende. */
export function stripReasoning(text: string): string {
  return text
    .replace(/<think(?:ing)?>[\s\S]*?<\/think(?:ing)?>/gi, "")
    .replace(/<think(?:ing)?>[\s\S]*$/i, "")
    .trim();
}

/**
 * Liefert das erste vollständig balancierte JSON-Objekt als Zeichenkette.
 * Klammern innerhalb von Zeichenketten und maskierte Anführungszeichen zählen nicht.
 */
export function extractJsonObject(text: string): string | null {
  const start = text.indexOf("{");
  if (start === -1) return null;

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = start; i < text.length; i++) {
    const ch = text[i];

    if (escaped) {
      escaped = false;
      continue;
    }
    if (ch === "\\") {
      escaped = true;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;

    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return null;
}

function normalizeTags(input: unknown): string[] {
  const raw = Array.isArray(input) ? input : [];
  const cleaned = raw
    .map((t) => String(t).toLowerCase().replace(/[^a-z0-9äöüß-]/g, ""))
    .filter(Boolean);
  return [...new Set([...cleaned.slice(0, 5), "auto-learn"])].slice(0, 6);
}

/** Wandelt die Modellausgabe in einen speicherbaren Knoten. Null, wenn nichts Brauchbares drinsteht. */
export function parseNode(raw: string, fallbackSummary: string): AutoLearnNode | null {
  const jsonStr = extractJsonObject(stripReasoning(raw));
  if (!jsonStr) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonStr);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;

  const o = parsed as Record<string, unknown>;
  const title = String(o.title ?? "").trim().slice(0, 80) || "Auto-Knoten";
  const summary = String(o.summary ?? "").trim().slice(0, 2000) || fallbackSummary;

  return { title, tags: normalizeTags(o.tags), summary };
}

/** Lohnt sich der zusätzliche Modellaufruf für diese Antwort überhaupt? */
export function shouldLearn(answer: string): boolean {
  const t = answer.trim();
  if (!t) return false;
  return t.length >= 60 || t.includes("\n");
}

export function buildExtractPrompt(answer: string): string {
  return (
    'Extrahiere aus folgender KI-Antwort einen Wissens-Knoten. Antworte NUR als JSON ' +
    '{"title":"kurzer Titel max 60 Zeichen","tags":["tag1","tag2"],' +
    '"summary":"kompakte Zusammenfassung 2-4 Sätze, keine Floskeln"}. ' +
    "Kein Vorwort, keine Erklärung, kein Markdown-Codeblock.\n\nAntwort:\n" +
    answer.slice(0, MAX_ANSWER_CHARS)
  );
}
