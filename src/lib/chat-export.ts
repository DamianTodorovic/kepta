// KI-Verlauf importieren — ChatGPT- und Claude-Datenexporte werden zu
// Markdown-Dateien aufbereitet und über die Obsidian-Import-Pipeline ins
// Gehirn geholt (Tags, created-Datum, Titel-Dedup: ein erneuter Import
// aktualisiert, statt zu verdoppeln). Damit wechselt jemand zu K3PTA und
// behält sein Gedächtnis — genau dafür ist WS5 gebaut.
//
// Beide Formate sind undokumentiert und ändern sich gelegentlich: der Parser
// liest nur Felder, die er kennt, überspringt den Rest und bricht nie ab —
// ein Gespräch mit Müll wird übersprungen, der Rest kommt durch.

export interface ChatMarkdownDatei {
  name: string;
  content: string;
}

export interface ChatMarkdownErgebnis {
  format: "chatgpt" | "claude";
  dateien: ChatMarkdownDatei[];
  /** Gespräche, die in Markdown überführt wurden. */
  gespraeche: number;
  /** Gespräche ohne verwertbaren Inhalt (leer, nur System-/Werkzeugnachrichten). */
  uebersprungen: number;
}

/** Längster einzelner Beitrag im Markdown — lange Code-Antworten werden gekappt. */
const BEITRAG_MAX = 12000;
/** Sicherheitsgrenze gegen riesige Exporte (ChatGPT-Zipps können tausende Gespräche tragen). */
const GESPRAECHE_MAX = 5000;

/** Sprechender Dateiname ohne Pathogene: kein /, kein \, kein Steuerzeichen, kurz. */
function dateiName(titel: string, datum: string, index: number): string {
  const basis = titel
    .normalize("NFC")
    .replace(/[\\/:*?"<>|\x00-\x1f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 60) || "Chat";
  return `chat-export/${datum || "undatiert"}-${String(index).padStart(4, "0")}-${basis}.md`;
}

/** Titel + Datum in einen eindeutigen, aber wiedereinlesbaren Titel. */
function notizTitel(titel: string, datum: string, index: number): string {
  const basis = titel.trim().slice(0, 120) || "Chat";
  return datum ? `${basis} — ${datum.slice(0, 10)}` : `${basis} (${index + 1})`;
}

function kappe(text: string, max: number = BEITRAG_MAX): string {
  const rein = text.replace(/\r\n/g, "\n").trim();
  return rein.length > max ? `${rein.slice(0, max)}\n…[gekürzt]` : rein;
}

export function erkenneFormat(daten: unknown): "chatgpt" | "claude" | null {
  if (!Array.isArray(daten) || daten.length === 0) return null;
  const probe = daten.find((e) => e && typeof e === "object") as Record<string, unknown> | undefined;
  if (!probe) return null;
  if ("mapping" in probe) return "chatgpt";
  if ("chat_messages" in probe) return "claude";
  return null;
}

interface Wechsel {
  frage: boolean;
  text: string;
}

/** ChatGPT: mapping-Knoten vom current_node zur Wurzel laufen und umdrehen. */
function chatgptWechsel(gespraech: Record<string, unknown>): Wechsel[] {
  const mapping = (gespraech.mapping ?? {}) as Record<string, { message?: { author?: { role?: string }; content?: { content_type?: string; parts?: unknown[] }; create_time?: number }; parent?: string | null; children?: string[] }>;
  let knoten: string | undefined = typeof gespraech.current_node === "string" ? gespraech.current_node : undefined;
  if (!knoten || !mapping[knoten]) knoten = Object.keys(mapping)[0];
  const kette: string[] = [];
  const gesehen = new Set<string>();
  while (knoten && mapping[knoten] && !gesehen.has(knoten)) {
    gesehen.add(knoten);
    kette.push(knoten);
    knoten = mapping[knoten].parent ?? undefined;
  }
  kette.reverse();
  const wechsel: Wechsel[] = [];
  for (const id of kette) {
    const m = mapping[id]?.message;
    const rolle = m?.author?.role;
    if (rolle !== "user" && rolle !== "assistant") continue;
    if (m?.content?.content_type !== "text" || !Array.isArray(m.content.parts)) continue;
    const text = m.content.parts.filter((p): p is string => typeof p === "string").join("\n").trim();
    if (!text) continue;
    wechsel.push({ frage: rolle === "user", text });
  }
  return wechsel;
}

/** Claude: chat_messages in Reihenfolge; Text steckt in .text oder in content[].text. */
function claudeWechsel(gespraech: Record<string, unknown>): Wechsel[] {
  const nachrichten = Array.isArray(gespraech.chat_messages) ? (gespraech.chat_messages as Record<string, unknown>[]) : [];
  const wechsel: Wechsel[] = [];
  for (const n of nachrichten) {
    const rolle = n.sender;
    if (rolle !== "human" && rolle !== "assistant") continue;
    const teile: string[] = [];
    if (typeof n.text === "string" && n.text.trim()) teile.push(n.text);
    if (Array.isArray(n.content)) {
      for (const block of n.content) {
        if (block && typeof block === "object" && typeof (block as { text?: unknown }).text === "string") {
          teile.push((block as { text: string }).text);
        }
      }
    }
    const text = [...new Set(teile)].join("\n").trim();
    if (!text) continue;
    wechsel.push({ frage: rolle === "human", text });
  }
  return wechsel;
}

function iso(datum: unknown): string {
  if (typeof datum === "number" && Number.isFinite(datum)) {
    const d = new Date(datum * 1000);
    return Number.isNaN(d.getTime()) ? "" : d.toISOString();
  }
  if (typeof datum === "string" && datum) {
    const d = new Date(datum);
    return Number.isNaN(d.getTime()) ? "" : d.toISOString();
  }
  return "";
}

function markdownFuer(titel: string, datumIso: string, quelle: string, wechsel: Wechsel[]): string {
  const kopf = [
    "---",
    `title: ${JSON.stringify(titel)}`,
    `tags: [${quelle}-import]`,
    datumIso ? `created: ${datumIso}` : null,
    "---",
    "",
  ].filter((z): z is string => z !== null);
  const koerper: string[] = [];
  for (const w of wechsel) {
    koerper.push(`**${w.frage ? "Q" : "A"}:** ${kappe(w.text)}`);
    koerper.push("");
  }
  return [...kopf, ...koerper].join("\n").trimEnd() + "\n";
}

/**
 * Export-Daten (das conversations.json aus dem ChatGPT- bzw. Claude-Export,
 * bereits als JSON geparst) in Markdown-Dateien überführen. Wirft nie —
 * Unbekanntes wird übersprungen und gezählt.
 */
export function chatExportZuMarkdown(
  daten: unknown,
  opts: { maxGespraeche?: number } = {},
): ChatMarkdownErgebnis | null {
  const format = erkenneFormat(daten);
  if (!format || !Array.isArray(daten)) return null;
  const quelle = format;
  const dateien: ChatMarkdownDatei[] = [];
  const max = opts.maxGespraeche ?? GESPRAECHE_MAX;
  let gespraeche = 0;
  let uebersprungen = 0;
  for (const eintrag of daten.slice(0, max)) {
    if (!eintrag || typeof eintrag !== "object") { uebersprungen++; continue; }
    const g = eintrag as Record<string, unknown>;
    const rohTitel = typeof g.title === "string" ? g.title : typeof g.name === "string" ? g.name : "";
    const datumIso = iso(g.create_time) || iso(g.created_at) || iso(g.update_time) || iso(g.updated_at);
    const wechsel = format === "chatgpt" ? chatgptWechsel(g) : claudeWechsel(g);
    // Weniger als ein Frage-Antwort-Paar ist kein Gedächtniswert (nur "hi" ohne Antwort u. ä.).
    const fragen = wechsel.filter((w) => w.frage).length;
    const antworten = wechsel.length - fragen;
    if (antworten === 0 || wechsel.length < 2) { uebersprungen++; continue; }
    const titel = notizTitel(rohTitel, datumIso, gespraeche);
    dateien.push({
      name: dateiName(rohTitel, datumIso.slice(0, 10), gespraeche),
      content: markdownFuer(titel, datumIso, quelle, wechsel),
    });
    gespraeche++;
  }
  return { format, dateien, gespraeche, uebersprungen };
}
