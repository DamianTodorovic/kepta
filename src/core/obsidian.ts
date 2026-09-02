// Obsidian-Interoperability: Markdown + YAML-Frontmatter als Austauschformat.
// Import: Vault-Dateien → Memories (+ Wiki-Links → Entitäten/Relationen)
// Export: Memories → .md-Dateien mit Frontmatter
import type { KeptaStore } from "./store";
import { normalizeTags } from "./store";
import type { MemoryInput, MemoryRecord, MemoryType } from "./types";
import { indexMemory } from "./engine";

export interface MarkdownFile {
  name: string;
  content: string;
}

export interface ImportSummary {
  imported: number;
  updated: number;
  skipped: number;
  errors: string[];
}

const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/;

function parseYamlScalar(raw: string): unknown {
  const v = raw.trim();
  if (v.startsWith("[") && v.endsWith("]")) {
    const inner = v.slice(1, -1).trim();
    if (!inner) return [];
    return inner.split(",").map((s) => s.trim().replace(/^["']|["']$/g, "")).filter(Boolean);
  }
  if (/^".*"$/.test(v) || /^'.*'$/.test(v)) return v.slice(1, -1);
  if (/^-?\d+$/.test(v)) return parseInt(v, 10);
  if (/^-?\d+\.\d+$/.test(v)) return parseFloat(v);
  return v;
}

/** Minimaler YAML-Frontmatter-Parser für KEPTA-relevante Felder. */
export function parseFrontmatter(raw: string): { meta: Record<string, unknown>; body: string; hasFrontmatter: boolean } {
  const m = raw.match(FRONTMATTER_RE);
  if (!m) return { meta: {}, body: raw, hasFrontmatter: false };
  const meta: Record<string, unknown> = {};
  const lines = m[1]!.split(/\r?\n/);
  let currentListKey: string | null = null;
  for (const line of lines) {
    const listItem = line.match(/^\s{2,}-\s+(.*)$/);
    if (listItem && currentListKey) {
      const arr = Array.isArray(meta[currentListKey]) ? (meta[currentListKey] as unknown[]) : [];
      arr.push(parseYamlScalar(listItem[1]!));
      meta[currentListKey] = arr;
      continue;
    }
    const kv = line.match(/^([A-Za-z_][\w-]*):\s*(.*)$/);
    if (!kv) continue;
    const key = kv[1]!;
    const value = kv[2] ?? "";
    currentListKey = null;
    if (value === "") {
      // möglicher Block-Liste-Anfang
      currentListKey = key;
      meta[key] = meta[key] ?? [];
    } else {
      meta[key] = parseYamlScalar(value);
    }
  }
  return { meta, body: m[2] ?? "", hasFrontmatter: true };
}

function toEpoch(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim()) {
    const t = Date.parse(v);
    return Number.isNaN(t) ? null : t;
  }
  return null;
}

function iso(v: number | null): string | undefined {
  return v ? new Date(v).toISOString() : undefined;
}

function sanitizeFilename(title: string): string {
  return (
    title
      .replace(/[\\/:*?"<>|\x00-\x1F]/g, "")
      .trim()
      .slice(0, 100) || "Ohne Titel"
  );
}

function yamlStr(s: string): string {
  return /[:"'\[\]{}]/.test(s) ? `"${s.replace(/"/g, '\\"')}"` : s;
}

/** Exportiert eine Memory als Markdown mit Frontmatter. */
export function memoryToMarkdown(record: MemoryRecord): { filename: string; markdown: string } {
  const lines: string[] = ["---"];
  lines.push(`title: ${yamlStr(record.title)}`);
  if (record.tags.length > 0) lines.push(`tags: [${record.tags.join(", ")}]`);
  lines.push(`type: ${record.type}`);
  lines.push(`scope: ${record.scope}`);
  if (record.confidence !== 1) lines.push(`confidence: ${record.confidence}`);
  const created = iso(record.createdAt);
  const updated = iso(record.updatedAt);
  if (created) lines.push(`created: ${created}`);
  if (updated) lines.push(`updated: ${updated}`);
  const vf = iso(record.validFrom);
  const vt = iso(record.validTo);
  if (vf) lines.push(`valid_from: ${vf}`);
  if (vt) lines.push(`valid_to: ${vt}`);
  if (record.supersededBy) lines.push(`superseded_by: ${record.supersededBy}`);
  lines.push(`kepta_id: ${record.id}`);
  lines.push("---", "");
  return {
    filename: `${sanitizeFilename(record.title)}.md`,
    markdown: lines.join("\n") + record.content,
  };
}

/** Importiert eine Markdown-Datei (Obsidian-Notiz) als Memory. */
export function importMarkdownFile(store: KeptaStore, file: MarkdownFile, opts: { scope?: string } = {}): { status: "imported" | "updated" | "skipped"; record: MemoryRecord } {
  const { meta, body } = parseFrontmatter(file.content);
  const baseName = file.name.replace(/\.md$/i, "").trim();
  const title = typeof meta.title === "string" && meta.title.trim() ? meta.title.trim() : baseName || "Ohne Titel";
  const content = body.trim() || title;
  const tags = Array.isArray(meta.tags) ? (meta.tags as string[]).filter((t): t is string => typeof t === "string") : [];

  const keptaId = typeof meta.kepta_id === "string" ? meta.kepta_id : undefined;
  const input: MemoryInput = {
    id: keptaId,
    scope: opts.scope ?? (typeof meta.scope === "string" ? meta.scope : "local"),
    type: (["semantic", "episodic", "procedural"] as const).includes(meta.type as MemoryType) ? (meta.type as MemoryType) : "semantic",
    title,
    content,
    tags,
    confidence: typeof meta.confidence === "number" ? meta.confidence : undefined,
    validFrom: toEpoch(meta.valid_from) ?? undefined,
    validTo: toEpoch(meta.valid_to) ?? undefined,
    createdAt: toEpoch(meta.created) ?? undefined,
    updatedAt: toEpoch(meta.updated) ?? undefined,
  };

  const existing = input.id ? store.getMemory(input.id) : null;
  // Ohne ID: Dedup über exakten Titel (Obsidian-Resync aktualisiert statt doppelt)
  const byTitle = existing ? null : store.findByTitle(input.title);
  if (byTitle) input.id = byTitle.id;
  const current = existing ?? byTitle;
  // Resync-Schutz: eine unveränderte Notiz nicht anfassen — sonst überschreibt jeder
  // Import das Frontmatter-Datum (updated_at = jetzt) und der Vault-Resync verschleiert,
  // was sich wirklich geändert hat.
  if (
    current &&
    current.title === input.title &&
    current.content === input.content &&
    JSON.stringify(current.tags) === JSON.stringify(normalizeTags(input.tags))
  ) {
    return { status: "skipped", record: current };
  }
  const { record, created } = store.upsertMemory(input);
  indexMemory(store, record.id);

  // Wiki-Links → Entitäten; Notiz-Titel referenziert die Link-Ziele
  const links = [...content.matchAll(/\[\[([^\[\]]{2,80})\]\]/g)].map((m) => m[1]!.split("|")[0]!.trim().toLowerCase()).filter(Boolean);
  const uniqueLinks = [...new Set(links)];
  if (uniqueLinks.length > 0) {
    store.linkEntities(record.id, uniqueLinks);
    store.linkEntities(record.id, [record.title]);
    const noteEntity = record.title.trim().toLowerCase();
    for (const link of uniqueLinks) {
      if (link !== noteEntity) store.addRelation(noteEntity, link, "references", record.id);
    }
  }
  return { status: created ? "imported" : "updated", record };
}

/** Importiert einen Batch von Vault-Dateien (idempotent über kepta_id/title-Dedup). */
export function importObsidianVault(store: KeptaStore, files: MarkdownFile[], opts: { scope?: string } = {}): ImportSummary {
  const summary: ImportSummary = { imported: 0, updated: 0, skipped: 0, errors: [] };
  for (const file of files) {
    if (!file.content?.trim()) {
      summary.skipped++;
      continue;
    }
    try {
      const res = importMarkdownFile(store, file, opts);
      summary[res.status]++;
    } catch (e) {
      summary.errors.push(`${file.name}: ${e instanceof Error ? e.message : String(e)}`);
      summary.skipped++;
    }
  }
  return summary;
}
