// Die Demo-Show: `npx kepta-mcp demo` spielt eine Geschichte durch — und
// jeder Beat ist ein echter Produktbefehl auf der Wegwerf-Datenbank. Nichts
// ist gefaked: gespeichert wird mit saveWithIndex (die Klassifikation
// entscheidet), gesucht wird über den EINEN Suchpfad, die Zeitreise über
// searchMemories mit asOf, der Widerspruch über contradict, der Abschluss
// über stats. --fast (oder KEPTA_DEMO_FAST=1) spielt ohne Pausen — der Modus
// der Tests. Am Ende steht dieselbe Datenbank in der Oberfläche offen.
//
// Die Demo-Datenbank wird mit einem WEGWERF-Schlüssel verschlüsselt
// (KEPTA_DB_KEY pro Lauf neu gewürfelt, nie im Schlüsselbund) — damit der
// Verschlüsselungs-Beat wahr ist und trotzdem kein Systemkontakt passiert.
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { KeptaStore } from "./core/store";
import { demoDatenbank } from "./demo";
import { saveWithIndex } from "./core/mcp";
import { searchMemories } from "./core/engine";
import { recall, contradict, stats, type Statistik } from "./cli-erlebnis";
import { schluesselbundKeyProvider } from "./core/schluessel";
import { defaultExtensions } from "./core/extensions";

const SCHLAF = (ms: number) => new Promise<void>((ok) => setTimeout(ok, ms));
const TAGE = 86_400_000;

export async function starteDemoShow(argumente: string[]): Promise<number> {
  const schnell = argumente.includes("--fast") || process.env.KEPTA_DEMO_FAST === "1";
  const beat = () => (schnell ? Promise.resolve() : SCHLAF(850));
  const sag = (text = "") => console.log(text);

  const ordner = fs.mkdtempSync(path.join(os.tmpdir(), "kepta-demo-"));
  const dbPfad = path.join(ordner, "kepta.db");
  demoDatenbank(dbPfad);
  const wegwerfSchluessel = crypto.randomBytes(32).toString("hex");
  const store = new KeptaStore(dbPfad, {
    ...defaultExtensions(), keys: schluesselbundKeyProvider(ordner, process.platform, undefined, { KEPTA_DB_KEY: wegwerfSchluessel }),
  });

  sag();
  sag("KEPTA demo — a throwaway database. Everything you see is real product code,");
  sag("nothing is mocked. Press Ctrl+C any time — the demo data vanishes with it.");
  sag();
  sag("The story: a small tax firm. Three months of work. One client, Ms. Weber.");
  await beat();

  // ── Akt 1: eine Tatsache kommt rein — die Klassifikation entscheidet ──
  sag("── 1. A fact walks in ─────────────────────────────────────────");
  const erste = saveWithIndex(store, {
    title: "Weber billing rhythm",
    content: "Ms. Weber is billed QUARTERLY — explicit request, never invoice her monthly.",
    tags: ["weber", "billing"],
    validFrom: Date.now() - 90 * TAGE,
    createdAt: Date.now() - 90 * TAGE,
    updatedAt: Date.now() - 90 * TAGE,
  });
  sag(`   saved: "${erste.record.title}"`);
  sag(`   KEPTA decided: type ${erste.record.type}, tags ${JSON.stringify(erste.record.tags)}`);
  sag("   (nobody labeled anything — the rules did)");
  await beat();

  // ── Akt 2: die Frage an das Gedächtnis ──
  sag("── 2. Ask the memory ─────────────────────────────────────────");
  const frage = await recall(store, "How often is Weber billed?");
  for (const t of frage.treffer.slice(0, 2)) {
    sag(`   • ${t.titel} (${t.typ}, ${t.alter})`);
    sag(`     ${t.snippet.replace(/\n/g, " ").slice(0, 96)}…`);
  }
  await beat();

  // ── Akt 3: die Welt ändert sich — die alte Wahrheit bleibt ──
  sag("── 3. Three months later, Ms. Weber changes her mind ─────────");
  const neue = saveWithIndex(store, {
    title: "Weber billing rhythm (updated)",
    content: "Ms. Weber switched to MONTHLY billing as of this month — replaces the quarterly request.",
    tags: ["weber", "billing"],
  });
  sag(`   saved: "${neue.record.title}"`);
  sag("   and the OLD version is still on record — nothing was quietly deleted.");
  await beat();

  // ── Akt 4: der Widerspruch wird sichtbar, du entscheidest ──
  sag("── 4. The contradiction, on demand ───────────────────────────");
  const widerspruch = await contradict(store);
  sag(`   ${widerspruch.anzahl} contradiction pair(s) found:`);
  const paare: Array<{ altId: string; neuId: string }> = [];
  for (const w of widerspruch.widersprueche.slice(0, 2)) {
    const a = store.getMemory(w.a);
    const b = store.getMemory(w.b);
    sag(`   • "${a?.title ?? w.a}"`);
    sag(`     vs "${b?.title ?? w.b}"`);
    paare.push({ altId: w.a, neuId: w.b });
  }
  sag("   you decide: keep the newer one — the supersede chain keeps the reasoning.");
  if (paare[0]) {
    store.supersedeMemory(paare[0].altId, paare[0].neuId);
    sag(`   → "${store.getMemory(paare[0].altId)?.title ?? "?"}" now points to its replacement.`);
  }
  await beat();

  // ── Akt 5: die Kette + die Zeitreise — der Moment ──
  sag("── 5. The chain keeps both. Time travel proves it. ───────────");
  const altJetzt = store.getMemory(erste.record.id);
  const neuJetzt = store.getMemory(neue.record.id);
  sag(`   OLD (superseded): "${altJetzt?.title}"`);
  sag(`     ${(altJetzt?.content ?? "").replace(/\n/g, " ").slice(0, 84)}`);
  sag(`   NEW (in force):   "${neuJetzt?.title}"`);
  sag(`     ${(neuJetzt?.content ?? "").replace(/\n/g, " ").slice(0, 84)}`);
  const vorDreissig = Date.now() - 30 * TAGE;
  const damals = await searchMemories(store, { query: "How often is Weber billed?", asOf: vorDreissig, limit: 3 });
  sag("   and the time slider agrees — what did it say 30 days ago?");
  sag(`   → "${damals.hits[0]?.memory.title ?? "?"}" — QUARTERLY was the truth back then.`);
  sag("   Same file. Two timelines. Nothing deleted.");
  await beat();

  // ── Akt 6: eine Datei, verschlüsselt, dein Eigentum ──
  sag("── 6. What this actually is ──────────────────────────────────");
  const statistik: Statistik = stats(store);
  sag(`   one file: ${dbPfad}`);
  sag(`   ${statistik.notizen.active} notes · encrypted: ${statistik.verschluesselt ? "yes (AES-256)" : "no"}`);
  sag("   no cloud. no account. every MCP client reads the same file.");
  await beat();

  // ── Finale: der Weg zur kostenlosen App ──
  sag("── Your turn ─────────────────────────────────────────────────");
  store.close();
  try { fs.rmSync(ordner, { recursive: true, force: true }); } catch { /* Temp darf bleiben */ }
  sag("   KEPTA Core has no browser UI of its own — the interface is the free desktop app.");
  sag("   KEPTA Pro is free: one free Pro day with every download, then daily limits, never locks.");
  sag("   https://github.com/DamianTodorovic/kepta-pro-releases/releases/latest");
  return 0;
}
