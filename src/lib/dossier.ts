// A dossier: everything K3PTA knows about one person, project or topic — on
// one page. Key points, a timeline, guides, files, open to-dos, contradictions
// and related topics, gathered from the notes that really belong to it: the
// hybrid search (weak hits dropped), the tag and the knowledge entity of the
// same name. Local and instant; the Markdown version copies into any document.
import type { KeptaStore } from "../core/store";
import type { MemoryRecord } from "../core/types";
import { searchMemories } from "../core/engine";
import { findeWidersprueche, type Widerspruch } from "./widersprueche";
import { offeneAufgaben } from "./briefing";
import { DOSSIER_TITEL } from "./dossierTitel";


export interface DossierEintrag {
  id: string;
  title: string;
  sentence: string;
  at: number;
}

export interface Dossier {
  topic: string;
  total: number;
  kinds: Record<string, number>;
  facts: DossierEintrag[];
  timeline: DossierEintrag[];
  howtos: DossierEintrag[];
  documents: DossierEintrag[];
  todos: { id: string; title: string; text: string }[];
  contradictions: Widerspruch[];
  related: { tag: string; count: number }[];
  first: number | null;
  last: number | null;
}

/** A period that ends no sentence: „Lumen & Co.“, „Dr. Weiss“, „z. B.“, „J. Smith“. */
const ABKUERZUNG = /(?:\b(?:co|inc|ltd|corp|dr|mr|mrs|ms|prof|st|nr|vs|etc|bzw|ca|usw|evtl|ggf|inkl|zzgl|str)|\b[a-z])\.$/i;

/** Sentences — without cutting „Lumen & Co.“ or „z. B.“ in half. */
function saetzeVon(text: string): string[] {
  const aus: string[] = [];
  for (const zeile of text.split(/\n+/)) {
    let satz = "";
    for (const teil of zeile.split(/(?<=[.!?])\s+/)) {
      satz = satz ? `${satz} ${teil}` : teil;
      if (!ABKUERZUNG.test(satz)) {
        aus.push(satz);
        satz = "";
      }
    }
    if (satz) aus.push(satz);
  }
  // „[[Lumen & Co.]].“ ends on two periods once the link is gone — one is enough.
  return aus.map((s) => s.replace(/\s+/g, " ").replace(/(?<!\.)\.\.(?!\.)/g, ".").trim());
}

/** The sentence that says the most about the topic — or simply the first real one. */
export function kernsatz(text: string, wort?: string): string {
  const saetze = saetzeVon(
    text
      .replace(/^---\n[\s\S]*?\n---\n/, "")
      .replace(/\[\[([^\]|]+)(?:\|([^\]]*))?\]\]/g, (_, ziel: string, alias?: string) => alias || ziel)
      .replace(/[#*_`>|]+/g, " ")
      .replace(/—\s*Source:[^\n]*$/m, "")
  ).filter((s) => s.length >= 20);
  const w = wort?.trim().toLowerCase();
  const satz = (w && saetze.find((s) => s.toLowerCase().includes(w))) || saetze[0] || text.replace(/\s+/g, " ").trim();
  return satz.length > 220 ? `${satz.slice(0, 219).replace(/\s+\S*$/, "")}…` : satz;
}

function notizenZurEntitaet(store: KeptaStore, name: string): MemoryRecord[] {
  const ids = store.db
    .prepare("SELECT me.memory_id AS id FROM memory_entities me JOIN entities e ON e.id = me.entity_id WHERE lower(e.name) = lower(?) LIMIT 200")
    .all(name) as { id: string }[];
  return store.getMemoriesByIds(ids.map((z) => z.id));
}

const dossierCache = new WeakMap<KeptaStore, { gen: number; eintraege: Map<string, Dossier> }>();

export async function dossier(store: KeptaStore, thema: string, opts: { limit?: number } = {}): Promise<Dossier> {
  const topic = thema.replace(/\s+/g, " ").trim().slice(0, 120);
  if (!topic) throw new Error("Tell K3PTA who or what the dossier is about.");
  const limit = opts.limit ?? 40;
  const gen = typeof store.datenGeneration === "function" ? store.datenGeneration() : 0;
  const schluessel = `${topic.toLowerCase()}::${limit}`;
  const cacheEintrag = dossierCache.get(store);
  if (cacheEintrag && cacheEintrag.gen === gen) {
    const hit = cacheEintrag.eintraege.get(schluessel);
    if (hit) return hit;
  }
  const treffer = await searchMemories(store, { query: topic, limit });
  const bester = treffer.hits[0]?.score ?? 0;
  const gesammelt = new Map<string, MemoryRecord>();
  for (const h of treffer.hits) if (h.score >= bester * 0.25) gesammelt.set(h.memory.id, h.memory);
  for (const m of store.listMemories({ tag: topic.toLowerCase(), limit: 200 })) gesammelt.set(m.id, m);
  for (const m of notizenZurEntitaet(store, topic)) gesammelt.set(m.id, m);
  const notizen = [...gesammelt.values()].filter((m) => !m.deletedAt && !m.supersededBy);

  const eintrag = (m: MemoryRecord, at = m.updatedAt): DossierEintrag => ({ id: m.id, title: m.title, sentence: kernsatz(m.content, topic), at });
  const nachArt = (typ: string) => notizen.filter((m) => m.type === typ);
  const kinds: Record<string, number> = {};
  for (const m of notizen) kinds[m.type] = (kinds[m.type] ?? 0) + 1;

  const tags = new Map<string, number>();
  for (const m of notizen) for (const t of m.tags) if (t !== topic.toLowerCase()) tags.set(t, (tags.get(t) ?? 0) + 1);

  const todos: Dossier["todos"] = [];
  for (const m of notizen) for (const text of offeneAufgaben(m.content)) if (todos.length < 20) todos.push({ id: m.id, title: m.title, text });

  const zeiten = notizen.map((m) => m.createdAt);
  const ergebnis: Dossier = {
    topic,
    total: notizen.length,
    kinds,
    facts: nachArt("semantic").sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 20).map((m) => eintrag(m)),
    timeline: nachArt("episodic")
      .map((m) => eintrag(m, m.validFrom ?? m.createdAt))
      .sort((a, b) => b.at - a.at)
      .slice(0, 30),
    howtos: nachArt("procedural").sort((a, b) => a.title.localeCompare(b.title)).slice(0, 20).map((m) => eintrag(m)),
    documents: nachArt("reference").sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 20).map((m) => eintrag(m)),
    todos,
    contradictions: findeWidersprueche(
      notizen.map((m) => ({ id: m.id, title: m.title, content: m.content, type: m.type, updatedAt: m.updatedAt })),
      { limit: 10 }
    ),
    related: [...tags].map(([tag, count]) => ({ tag, count })).sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag)).slice(0, 8),
    first: zeiten.length ? Math.min(...zeiten) : null,
    last: zeiten.length ? Math.max(...zeiten) : null,
  };
  const bucket = cacheEintrag && cacheEintrag.gen === gen ? cacheEintrag : { gen, eintraege: new Map<string, Dossier>() };
  if (bucket.eintraege.size >= 32) {
    const aeltester = bucket.eintraege.keys().next().value;
    if (aeltester !== undefined) bucket.eintraege.delete(aeltester);
  }
  bucket.eintraege.set(schluessel, ergebnis);
  dossierCache.set(store, bucket);
  return ergebnis;
}

const tag = (ms: number) => new Date(ms).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

/** The dossier as Markdown — for a document, an email or a new note. */
export function dossierAlsMarkdown(d: Dossier, datum: (ms: number) => string = tag): string {
  const zeilen: string[] = [`# Dossier: ${d.topic}`, ""];
  const zeitraum = d.first !== null && d.last !== null ? ` · ${datum(d.first)} – ${datum(d.last)}` : "";
  zeilen.push(`_${d.total} ${d.total === 1 ? "note" : "notes"}${zeitraum}_`, "");
  const abschnitt = (titel: string, eintraege: DossierEintrag[], mitDatum = false) => {
    if (!eintraege.length) return;
    zeilen.push(`## ${titel}`, "");
    for (const e of eintraege) zeilen.push(`- ${mitDatum ? `${datum(e.at)} — ` : ""}**${e.title}** — ${e.sentence}`);
    zeilen.push("");
  };
  abschnitt(DOSSIER_TITEL.punkte, d.facts);
  abschnitt(DOSSIER_TITEL.zeit, d.timeline, true);
  abschnitt(DOSSIER_TITEL.anleitungen, d.howtos);
  abschnitt(DOSSIER_TITEL.papiere, d.documents);
  if (d.todos.length) {
    zeilen.push("## Open to-dos", "");
    for (const t of d.todos) zeilen.push(`- [ ] ${t.text} _(${t.title})_`);
    zeilen.push("");
  }
  if (d.contradictions.length) {
    zeilen.push("## Contradictions to check", "");
    for (const w of d.contradictions) zeilen.push(`- ${w.about}: „${w.newer.value}“ in **${w.newer.title}**, „${w.older.value}“ in **${w.older.title}**`);
    zeilen.push("");
  }
  if (d.related.length) zeilen.push(`Related: ${d.related.map((r) => `#${r.tag}`).join(" ")}`, "");
  return zeilen.join("\n");
}

const vorschlagCache = new WeakMap<KeptaStore, { stand: string; wert: { tags: { name: string; count: number }[]; topics: { name: string; count: number }[] } }>();

/** What a dossier could be about: the biggest tags and knowledge entities. */
export function vorschlaege(store: KeptaStore): { tags: { name: string; count: number }[]; topics: { name: string; count: number }[] } {
  const gen = typeof store.datenGeneration === "function" ? store.datenGeneration() : 0;
  const stand = `gen:${gen}`;
  const gepuffert = vorschlagCache.get(store);
  if (gepuffert && gepuffert.stand === stand) return gepuffert.wert;

  const zaehler = new Map<string, number>();
  for (const r of store.db.prepare("SELECT tags FROM memories WHERE deleted_at IS NULL").iterate() as Iterable<{ tags: string }>) {
    try {
      for (const t of JSON.parse(r.tags) as string[]) zaehler.set(t, (zaehler.get(t) ?? 0) + 1);
    } catch {
      // broken tag list — skip it
    }
  }
  const tags = [...zaehler].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name)).slice(0, 10);
  const topics = store.db
    .prepare(
      "SELECT e.name AS name, COUNT(*) AS count FROM memory_entities me JOIN entities e ON e.id = me.entity_id JOIN memories m ON m.id = me.memory_id WHERE m.deleted_at IS NULL GROUP BY e.id HAVING count >= 2 ORDER BY count DESC, e.name LIMIT 10"
    )
    .all() as { name: string; count: number }[];
  const wert = { tags, topics };
  vorschlagCache.set(store, { stand, wert });
  return wert;
}
