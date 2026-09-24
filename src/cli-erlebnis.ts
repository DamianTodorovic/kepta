// Das CLI-Erlebnis: die fünf Befehle, die KEPTA im Terminal lebendig machen.
//
//   kepta remember "…"        — merken (Typ + Tags werden automatisch gesetzt)
//   kepta recall "frage"      — suchen und lesbar antworten, mit Quellen
//   kepta timeline "thema"    — was weiß KEPTA wann über dieses Thema
//   kepta contradict          — Widersprüche und Duplikate melden (dry-run)
//   kepta stats               — die Gedächtnis-Statistik
//
// Bewusst rein lokal und ohne Farbcodes-Tricks beyond ANSI basics: die
// Ausgabe ist Terminal-Text, markdown() ist hier die falsche Ebene —
// stattdessen klare Blöcke mit Quellenangaben (Titel + Alter + Tags).
import type { KeptaStore } from "./core/store";
import { saveWithIndex } from "./core/mcp";
import { searchMemories } from "./core/engine";
import { consolidateMemories } from "./core/engine";
import { klassifiziere } from "./core/klassifikation";
import { baueGraph } from "./ui/graph";

const GEWICHT = "\x1b[1m";
const GRAU = "\x1b[2m";
const ROT = "\x1b[31m";
const GRUEN = "\x1b[32m";
const GELB = "\x1b[33m";
const BLAU = "\x1b[36m";
const ENDE = "\x1b[0m";
function farbe(code: string, text: string): string {
  return process.stdout.isTTY ? code + text + ENDE : text;
}

const TAG = 86_400_000;
function alter(ms: number): string {
  const tage = (Date.now() - ms) / TAG;
  if (tage < 1) return "today";
  if (tage < 30) return `${Math.round(tage)}d ago`;
  if (tage < 365) return `${Math.round(tage / 30)}mo ago`;
  return `${(tage / 365).toFixed(1)}y ago`;
}

/** remember: Text rein, KEPTA entscheidet Typ (die Store-Regeln, nicht „alles Fakt") und Tags. */
export function remember(store: KeptaStore, text: string, tags: string[]): { titel: string; typ: string; id: string } {
  const sauber = text.trim();
  if (!sauber) throw new Error("Nothing to remember — give me a sentence.");
  const erste = sauber.split("\n").map((z) => z.trim()).find((z) => z.length > 0) ?? sauber;
  const titel = erste.replace(/^#+\s*/, "").replace(/[*_`>#]/g, "").slice(0, 120).trim() || sauber.slice(0, 120);
  const typ = klassifiziere({ title: titel, content: sauber, tags }).typ;
  const { record } = saveWithIndex(store, { title: titel, content: sauber, tags: ["remember", ...tags], type: typ });
  return { titel: record.title, typ: record.type, id: record.id };
}

export interface RecallTreffer {
  titel: string;
  snippet: string;
  typ: string;
  alter: string;
  tags: string[];
}

/** recall: die Top-Treffer als lesbare Karten; antwortet NICHT mit erfundenem Text — nur KEPTA-Suche. */
export async function recall(store: KeptaStore, frage: string, limit = 5): Promise<{ treffer: RecallTreffer[]; total: number }> {
  const e = await searchMemories(store, { query: frage.trim(), limit });
  return {
    total: e.total,
    treffer: e.hits.map((h) => ({
      titel: h.memory.title,
      snippet: h.memory.content.replace(/\s+/g, " ").trim().slice(0, 180),
      typ: h.memory.type,
      alter: alter(h.memory.updatedAt),
      tags: h.memory.tags.slice(0, 3),
    })),
  };
}

/** timeline: alle Notizen, die zum Thema passen, zeitlich sortiert — das Gedächtnis als Ablauf. */
export function timeline(store: KeptaStore, thema: string): { datum: string; titel: string; typ: string }[] {
  const nadeln = thema.toLowerCase().split(/\W+/).filter((w) => w.length > 2);
  const alle = store.listMemories({ limit: 5000 });
  return alle
    .filter((n) => {
      const heuboden = (n.title + " " + n.content + " " + n.tags.join(" ")).toLowerCase();
      return nadeln.some((nadel) => heuboden.includes(nadel));
    })
    .sort((a, b) => (a.validFrom ?? a.createdAt) - (b.validFrom ?? b.createdAt))
    .slice(0, 30)
    .map((n) => ({
      datum: new Date(n.validFrom ?? n.createdAt).toISOString().slice(0, 10),
      titel: n.title,
      typ: n.type,
    }));
}

/** contradict: Widersprüche und Duplikate als dry-run melden — nichts wird geändert. */
export async function contradict(store: KeptaStore): Promise<{ widersprueche: { a: string; b: string; grund: string }[]; anzahl: number }> {
  const res = await consolidateMemories(store, { dryRun: true });
  return {
    widersprueche: res.candidates.map((c) => ({ a: c.keepId, b: c.duplicateId, grund: c.reason })),
    anzahl: res.candidates.length,
  };
}

/** stats: die Gedächtnis-Statistik in einem Block. */
export interface Statistik {
  notizen: { active: number; trashed: number };
  typen: Record<string, number>;
  topTags: { tag: string; count: number }[];
  graphKnoten: number;
  graphKanten: number;
  verschluesselt: boolean;
}

export function stats(store: KeptaStore): Statistik {
  // Die Statistik zählt nur aktive (nicht gelöschte) Notizen — dieselbe Regel
  // wie store.countMemories, hier über die Liste, weil Typen und Tags je Notiz
  // gebraucht werden. (Früher aus ui/server importiert; die Core-UI ist weg.)
  const alle = store.listMemories({ limit: 10_000 });
  const typen: Record<string, number> = {};
  const tags = new Map<string, number>();
  for (const m of alle) {
    typen[m.type] = (typen[m.type] ?? 0) + 1;
    for (const t of m.tags) tags.set(t, (tags.get(t) ?? 0) + 1);
  }
  const g = baueGraph(store);
  return {
    notizen: store.countMemories(),
    typen,
    topTags: [...tags.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, 30)
      .map(([tag, count]) => ({ tag, count })),
    graphKnoten: g.nodes.length,
    graphKanten: g.edges.filter((e) => e.real).length,
    verschluesselt: store.verschluesselung.aktiv,
  };
}

/** CLI-Dispatcher für die fünf Erlebnis-Befehle — liefert den Exit-Code. */
export async function erlebnisKommando(store: KeptaStore, befehl: string, rest: string[]): Promise<number> {
  const fett = (s: string) => farbe(GEWICHT, s);
  try {
    switch (befehl) {
      case "remember": {
        const tags = rest.filter((a) => a.startsWith("#")).map((a) => a.slice(1));
        const text = rest.filter((a) => !a.startsWith("#")).join(" ");
        const r = remember(store, text, tags);
        console.log(farbe(GRUEN, "✓ remembered") + ` — ${fett(r.titel)}`);
        console.log(farbe(GRAU, `  type: ${r.typ} · id: ${r.id}`));
        return 0;
      }
      case "recall": {
        const frage = rest.join(" ").trim();
        if (!frage) throw new Error("Ask something: kepta recall <question>");
        const { treffer, total } = await recall(store, frage);
        if (treffer.length === 0) {
          console.log(farbe(GELB, "No matches.") + farbe(GRAU, " With Ollama running, the search also finds notes that say it differently."));
          return 0;
        }
        console.log(fett(`${total} ${total === 1 ? "match" : "matches"} — ranked by relevance`));
        treffer.forEach((t, i) => {
          console.log(`\n${fett(`${i + 1}. ${t.titel}`)} ${farbe(GRAU, `· ${t.typ} · ${t.alter}`)}`);
          console.log(`  ${t.snippet.replace(/\n/g, " ").slice(0, 200)}`);
          if (t.tags.length) console.log(farbe(BLAU, `  ${t.tags.map((x) => "#" + x).join(" ")}`));
        });
        return 0;
      }
      case "timeline": {
        const thema = rest.join(" ").trim();
        if (!thema) throw new Error("Give me a topic: kepta timeline <topic>");
        const eintraege = timeline(store, thema);
        if (eintraege.length === 0) {
          console.log(farbe(GELB, `Nothing about “${thema}” yet.`));
          return 0;
        }
        console.log(fett(`${eintraege.length} entries about “${thema}”, oldest first`));
        eintraege.forEach((e) => console.log(`  ${farbe(BLAU, e.datum)}  ${e.titel} ${farbe(GRAU, `· ${e.typ}`)}`));
        return 0;
      }
      case "contradict": {
        const { widersprueche, anzahl } = await contradict(store);
        if (anzahl === 0) {
          console.log(farbe(GRUEN, "✓ No contradictions or duplicates found."));
          return 0;
        }
        console.log(farbe(GELB, `${anzahl} candidates (dry-run — nothing changed):`));
        widersprueche.slice(0, 20).forEach((w) => console.log(`  ${w.a} ${farbe(GRAU, "↔")} ${w.b} ${farbe(GRAU, `· ${w.grund}`)}`));
        console.log(farbe(GRAU, "\n  Resolve in the UI (npx kepta-mcp ui) — one click each."));
        return 0;
      }
      case "stats": {
        const s = stats(store);
        console.log(fett("KEPTA memory"));
        console.log(`  notes: ${s.notizen.active} active · ${s.notizen.trashed} in trash ${s.verschluesselt ? farbe(GRUEN, "· encrypted") : farbe(ROT, "· NOT encrypted")}`);
        const typen = Object.entries(s.typen).map(([k, v]) => `${k}: ${v}`).join(" · ");
        console.log(`  types: ${typen || "—"}`);
        console.log(`  graph: ${s.graphKnoten} nodes · ${s.graphKanten} [[links]]`);
        const tags = s.topTags.slice(0, 6).map((t) => `#${t.tag} (${t.count})`).join("  ");
        console.log(`  top tags: ${tags || "—"}`);
        return 0;
      }
      default:
        console.error(`Unknown command: ${befehl}`);
        console.error("Commands: remember · recall · timeline · contradict · stats · demo · import · ui · setup");
        return 2;
    }
  } catch (e) {
    console.error(farbe(ROT, e instanceof Error ? e.message : String(e)));
    return 1;
  }
}
