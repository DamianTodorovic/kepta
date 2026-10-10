// ChatGPT-Export-Importer — die Kompatibilitätsfalle: „Your history is yours."
//
// Ein ChatGPT-Datenexport (Einstellungen → Datenkontrolle → Daten exportieren)
// enthält conversations.json: eine Liste von Gesprächen als Node-Bäume. Der
// Importer zieht daraus Memories — bewusst nur aus NUTZER-Nachrichten (was der
// Nutzer gesagt, entschieden, gefragt hat, ist die Quelle der Wahrheit über ihn);
// Assistant-Antworten sind abgeleitetes Wissen und werden gezählt, aber nicht
// gespeichert. IDs sind deterministisch (chatgpt:<conversation>:<node>), damit
// ein erneuter Import aktualisiert statt verdoppelt — Re-Import ist idempotent.
//
// Aufruf: npx -y kepta-mcp import chatgpt <conversations.json | entpackter-Export-Ordner>
// (Das Original-Export-Archiv ist eine ZIP — erst entpacken; der Runner liest
// bewusst ohne ZIP-Abhängigkeit, das npm-Bundle erlaubt nur eine.)
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { KeptaStore } from "./store";
import { normalizeTags } from "./store";
import type { MemoryInput, MemoryRecord } from "./types";
import { indexMemory } from "./engine";

export interface ChatgptZusammenfassung {
  konversationen: number;
  /** Alle gelesenen user+assistant-Nachrichten mit Text. */
  nachrichten: number;
  /** user-Nachrichten, aus denen Memories entstanden sind (imported+updated+skipped+zuKurz). */
  nutzerNachrichten: number;
  assistantUebersprungen: number;
  /** user-Nachrichten unter der Mindestlänge („ok", „thanks") — nicht speicherbar. */
  zuKurz: number;
  imported: number;
  updated: number;
  skipped: number;
}

interface ChatgptNode {
  message?: {
    id?: string;
    author?: { role?: string };
    create_time?: number | null;
    content?: { content_type?: string; parts?: unknown[] };
  } | null;
}

interface ChatgptKonversation {
  conversation_id?: string;
  title?: string;
  create_time?: number | null;
  mapping?: Record<string, ChatgptNode>;
}

export interface ChatgptNachricht {
  konversationsId: string;
  konversationstitel: string;
  nodeId: string;
  rolle: "user" | "assistant";
  text: string;
  zeitSekunden: number | null;
}

const MIN_LAENGE = 8;

/** Aus dem Mapping-Baum flache, zeitlich geordnete Nachrichten ziehen (nur user/assistant, nur Text). */
function nachrichtenAusKonversation(konv: ChatgptKonversation): ChatgptNachricht[] {
  const konvId = typeof konv.conversation_id === "string" && konv.conversation_id
    ? konv.conversation_id
    : `titel:${(konv.title ?? "").slice(0, 60)}`;
  const titel = typeof konv.title === "string" ? konv.title.trim() : "";
  const nodes = Object.values(konv.mapping ?? {});
  const aus: { id: string; rolle: "user" | "assistant"; text: string; zeitSekunden: number | null; reihenfolge: number }[] = [];
  let reihenfolge = 0;
  for (const node of nodes) {
    const msg = node?.message;
    const rolle = msg?.author?.role;
    if (rolle !== "user" && rolle !== "assistant") continue;
    const parts = msg?.content?.parts;
    if (!Array.isArray(parts)) continue;
    const text = parts.filter((p): p is string => typeof p === "string").join("\n").trim();
    if (!text) continue;
    aus.push({
      id: `${konvId}:${msg?.id ?? reihenfolge}`,
      rolle,
      text,
      zeitSekunden: typeof msg?.create_time === "number" ? msg.create_time : null,
      reihenfolge: reihenfolge++,
    });
  }
  // Zeit aufsteigend — bei fehlendem Zeitstempel hält die Laufvariable die Einfügeordnung stabil.
  aus.sort((a, b) => (a.zeitSekunden ?? 0) - (b.zeitSekunden ?? 0) || a.reihenfolge - b.reihenfolge);
  return aus.map((m) => ({ konversationsId: konvId, konversationstitel: titel, nodeId: m.id, rolle: m.rolle, text: m.text, zeitSekunden: m.zeitSekunden }));
}

/** Titel: erste Zeile, ohne Markdown-Rauschen, kurz genug für die Notizliste. */
function titelAus(text: string): string {
  const erste = text.split("\n").map((z) => z.trim()).find((z) => z.length > 0) ?? text;
  return erste.replace(/^#+\s*/, "").replace(/[*_`>#]/g, "").slice(0, 120).trim();
}

/** Eine Nutzer-Nachricht → deterministische MemoryInput (oder null, wenn zu kurz). */
export function userNachrichtZuMemory(m: { konversationsId: string; nodeId: string; text: string; zeitSekunden: number | null }, titel: string): MemoryInput | null {
  const text = m.text.trim();
  if (text.length < MIN_LAENGE) return null;
  const zeitMs = m.zeitSekunden !== null ? Math.round(m.zeitSekunden * 1000) : null;
  return {
    id: `chatgpt:${m.nodeId}`,
    scope: "local",
    // Der Store-Klassifikator entscheidet den Typ — genau wie beim MCP-save
    // (v1.3-Regel: nicht alles zu „Fakt" degradieren).
    type: undefined,
    title: titelAus(text) || titel || "ChatGPT import",
    content: text,
    // Das Tag geht in die Notiz ein und damit auf dieselbe Fläche wie die
    // Werkzeugtexte: Englisch, eine Sprache (D2-25). Ein bestehender Bestand
    // bekommt beim nächsten Import dieses eine Tag aktualisiert — gemeldet.
    tags: normalizeTags(["chatgpt-import", titel ? `conversation: ${titel}` : ""]),
    confidence: 0.7, // importiert, nicht verifiziert
    validFrom: zeitMs,
    validTo: null,
    createdAt: zeitMs ?? undefined,
    updatedAt: zeitMs ?? undefined,
  };
}

/** Import eines geparsten conversations.json — idempotent, mit ehrlicher Zusammenfassung. */
export function importChatgptExport(store: KeptaStore, daten: unknown, opts: { dryRun?: boolean } = {}): ChatgptZusammenfassung {
  if (!Array.isArray(daten)) throw new Error("conversations.json must be an array of conversations.");
  const z: ChatgptZusammenfassung = { konversationen: 0, nachrichten: 0, nutzerNachrichten: 0, assistantUebersprungen: 0, zuKurz: 0, imported: 0, updated: 0, skipped: 0 };
  for (const konv of daten as ChatgptKonversation[]) {
    z.konversationen += 1;
    const titel = typeof konv.title === "string" ? konv.title.trim() : "";
    for (const m of nachrichtenAusKonversation(konv)) {
      z.nachrichten += 1;
      if (m.rolle === "assistant") { z.assistantUebersprungen += 1; continue; }
      z.nutzerNachrichten += 1;
      const input = userNachrichtZuMemory(m, titel);
      if (!input) { z.zuKurz += 1; continue; }
      // Re-Import-Schutz: unverändert → skipped (sonst verschleiert jeder Lauf die Änderungen).
      const bestehend: MemoryRecord | null = input.id ? store.getMemory(input.id) : null;
      if (bestehend && bestehend.title === input.title && bestehend.content === input.content) { z.skipped += 1; continue; }
      if (opts.dryRun) { z.imported += 1; continue; }
      const { record, created } = store.upsertMemory(input);
      indexMemory(store, record.id);
      if (created) z.imported += 1; else z.updated += 1;
    }
  }
  return z;
}

/** CLI: `kepta import chatgpt <pfad>` — Datei conversations.json oder entpackter Export-Ordner. */
export function importChatgptKommando(store: KeptaStore, argumente: string[]): number {
  const trocken = argumente.includes("--dry-run");
  const positionell = argumente.filter((a) => !a.startsWith("--"));
  // Grammatik: `import chatgpt <pfad>` — das Quell-Wort abziehen, wenn es mitkam.
  if (positionell[0] === "chatgpt") positionell.shift();
  const quelle = positionell[0];
  if (!quelle) {
    sagen("usage: npx -y kepta-mcp import chatgpt <conversations.json | export folder> [--dry-run]");
    sagen("export it first: ChatGPT - Settings - Data controls - Export data, unzip it, then point this command at that folder");
    return 2;
  }
  if (positionell.length > 1) {
    sagen(`unknown import source: ${positionell.join(" ")} — what exists: chatgpt`);
    return 2;
  }
  let datei = quelle;
  if (fs.existsSync(quelle) && fs.statSync(quelle).isDirectory()) datei = path.join(quelle, "conversations.json");
  if (/\.zip$/i.test(datei)) {
    sagen(`zip detected: ${datei}`);
    sagen("unzip it first and point this command at the folder — the importer reads without a zip dependency on purpose");
    return 2;
  }
  // Nur REGISTRIERTE Wurzeln sind erlaubt: das Home-Verzeichnis oder der
  // System-Temp. Der relative Anteil wird path-relativ geprüft (kein startsWith,
  // das „/home/x-anderer" fälschlich durchließe), sondern über path.relative:
  const aufgeloest = path.resolve(datei);
  const wurzeln = [os.homedir(), os.tmpdir()].map((w) => path.resolve(w));
  const erlaubt = wurzeln.some((w) => {
    const rel = path.relative(w, aufgeloest);
    return rel !== "" && !rel.startsWith("..") && !path.isAbsolute(rel);
  });
  if (!erlaubt) {
    // Die Wache selbst bleibt (sie ist die Grenze, nicht der Komfort), aber die
    // Absage sagt, was der Nutzer tun kann — und in derselben Sprache wie der
    // Rest dieses Produkts (D2-25, von Damian entschieden: ein Terminal, Englisch).
    const [home, temp] = wurzeln;
    ort("no import from this place:", aufgeloest);
    sagen("KEPTA reads only your home folder or the system temp:");
    ort("home:", home);
    ort("system temp:", temp);
    sagen("next: copy the export into your Downloads folder, then run the command again");
    return 2;
  }
  let daten: unknown;
  try {
    daten = JSON.parse(fs.readFileSync(aufgeloest, "utf8"));
  } catch (e) {
    sagen(`conversations.json is not readable under ${datei}: ${e instanceof Error ? e.message : String(e)}`);
    return 2;
  }
  const z = importChatgptExport(store, daten, { dryRun: trocken });
  const echt = trocken ? " (dry-run — nothing saved)" : "";
  console.log(`ChatGPT import${echt}:`);
  console.log(`  conversations: ${z.konversationen} · messages read: ${z.nachrichten}`);
  console.log(`  user: ${z.nutzerNachrichten} (${z.zuKurz} too short) · assistant skipped: ${z.assistantUebersprungen}`);
  console.log(`  memories: ${zahl(z.imported)} new · ${zahl(z.updated)} updated · ${zahl(z.skipped)} unchanged`);
  // Null Notizen sind kein Erfolg: ohne diesen Exit-Abgleich glaubt der Nutzer,
  // sein ChatGPT-Leben sei jetzt im Gedächtnis.
  if (z.imported + z.updated + z.skipped === 0) {
    erklaerungOhneNotiz(z).forEach((zeile) => console.error(zeile));
    return 1;
  }
  return 0;
}

/**
 * Sätze des Befehls auf 80 Spalten (R2), Fortsetzung eingerückt. Ein Satz mit
 * einer Export-Format-Erklärung wurde gemessen 194 Zeichen lang.
 */
const BREITE = 80;
function sagen(meldung: string): void {
  for (const z of bricht(meldung)) console.error(z);
}

/**
 * Ein Ort ist eine Adresse, kein Satz: er steht auf seiner eigenen Zeile und
 * wird nie zerschnitten — ein Pfad, der mitten im Wort umbricht, ist nicht mehr
 * kopierbar (R2, dieselbe Ausnahme wie bei setup).
 */
function ort(label: string, pfad: string): void {
  const zusammen = `  ${label} ${pfad}`;
  if ([...zusammen].length <= BREITE) console.error(zusammen);
  else {
    console.error(`  ${label}`);
    console.error(`  ${pfad}`);
  }
}

function bricht(text: string, einzug = 2): string[] {
  const woerter = text.split(/\s+/).filter(Boolean);
  if (!woerter.length) return [""];
  const rueck = Math.max(einzug, 4);
  const setzen = (w: string[], ein: number) => " ".repeat(ein) + w.join(" ");
  const zeilen: string[] = [];
  let aktueller: string[] = [];
  let breite = einzug;
  for (const wort of woerter) {
    const laenge = [...wort].length;
    const naechster = aktueller.length ? breite + 1 + laenge : breite + laenge;
    if (aktueller.length && naechster > BREITE) {
      zeilen.push(setzen(aktueller, zeilen.length === 0 ? einzug : rueck));
      aktueller = [wort];
      breite = rueck + laenge;
      continue;
    }
    aktueller.push(wort);
    breite = naechster;
  }
  if (aktueller.length) zeilen.push(setzen(aktueller, zeilen.length === 0 ? einzug : rueck));
  return zeilen;
}

function zahl(n: number): string {
  return n.toLocaleString("en-US");
}

/** Der wahrscheinlichste Grund für null Notizen — danach, was der Export tatsächlich enthielt. */
function erklaerungOhneNotiz(z: ChatgptZusammenfassung): string[] {
  const grund =
    z.konversationen === 0
      ? "the file holds not a single conversation."
      : z.nachrichten === 0
        ? `no message was recognised in ${zahl(z.konversationen)} conversation(s) — usually a different export format: older exports write "author" as a word instead of "author": { "role": ... }.`
        : z.nutzerNachrichten === 0
          ? "the export holds only assistant replies — what gets stored is your own side of the chat."
          : `all ${zahl(z.nutzerNachrichten)} user messages were shorter than ${MIN_LAENGE} characters.`;
  return [
    ...bricht(`  no note stored — ${grund}`),
    ...bricht("  check without storing: npx -y kepta-mcp import chatgpt <folder> --dry-run"),
  ];
}
