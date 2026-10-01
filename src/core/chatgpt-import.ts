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
// Aufruf: npx kepta import chatgpt <conversations.json | entpackter-Export-Ordner>
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
    tags: normalizeTags(["chatgpt-import", titel ? `gespräch: ${titel}` : ""]),
    confidence: 0.7, // importiert, nicht verifiziert
    validFrom: zeitMs,
    validTo: null,
    createdAt: zeitMs ?? undefined,
    updatedAt: zeitMs ?? undefined,
  };
}

/** Import eines geparsten conversations.json — idempotent, mit ehrlicher Zusammenfassung. */
export function importChatgptExport(store: KeptaStore, daten: unknown, opts: { dryRun?: boolean } = {}): ChatgptZusammenfassung {
  if (!Array.isArray(daten)) throw new Error("conversations.json muss ein Array von Gesprächen sein.");
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
    console.error("Aufruf: npx kepta import chatgpt <conversations.json | export-ordner> [--dry-run]");
    console.error("ChatGPT → Einstellungen → Datenkontrolle → Daten exportieren → ZIP entpacken → diesen Ordner angeben.");
    return 2;
  }
  if (positionell.length > 1) {
    console.error(`Unbekannte Import-Quelle: ${positionell.join(" ")} — aktuell unterstützt: chatgpt.`);
    return 2;
  }
  let datei = quelle;
  if (fs.existsSync(quelle) && fs.statSync(quelle).isDirectory()) datei = path.join(quelle, "conversations.json");
  if (/\.zip$/i.test(datei)) {
    console.error(`ZIP erkannt: ${datei}`);
    console.error("Bitte erst entpacken und den Ordner angeben (der Importer liest bewusst ohne ZIP-Abhängigkeit).");
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
    throw new Error(`Only import from a path under your home or temp - got: ${aufgeloest}`);
  }
  let daten: unknown;
  try {
    daten = JSON.parse(fs.readFileSync(aufgeloest, "utf8"));
  } catch (e) {
    console.error(`conversations.json nicht lesbar unter ${datei}: ${e instanceof Error ? e.message : String(e)}`);
    return 2;
  }
  const z = importChatgptExport(store, daten, { dryRun: trocken });
  const echt = trocken ? " (dry-run — nichts gespeichert)" : "";
  console.log(`ChatGPT-Import${echt}:`);
  console.log(`  Gespräche: ${z.konversationen} · Nachrichten gelesen: ${z.nachrichten}`);
  console.log(`  user: ${z.nutzerNachrichten} (davon ${z.zuKurz} zu kurz) · assistant übersprungen: ${z.assistantUebersprungen}`);
  console.log(`  Memories: ${z.imported} neu · ${z.updated} aktualisiert · ${z.skipped} unverändert`);
  return 0;
}
