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
//
// Raster, Breite und Farbe sind dieselben wie bei den fünf Befehlen: die Demo
// ist die einzige Fläche, auf der Farbe Bedeutung trägt (Speichern grün,
// Widerspruch gelb, superseded blau, Schluss Gewichtung) — und genau deshalb
// gilt auch hier 2 und 4, 80 Zeichen, und kein `…` ohne Zahl (D2-17, D2-18).
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { KeptaStore } from "./core/store";
import { demoDatenbank, loescheWegwerfOrdner, raumtBeiAbbruch } from "./demo";
import { saveWithIndex } from "./core/mcp";
import { searchMemories } from "./core/engine";
import { contradict, recall, stats, ausgabe, kuerzungsvermerk, zaehlung, FARBEN, TRENNER, type Abschnitt, type Statistik } from "./cli-erlebnis";
import { schluesselbundKeyProvider } from "./core/schluessel";
import { defaultExtensions } from "./core/extensions";

const SCHLAF = (ms: number) => new Promise<void>((ok) => setTimeout(ok, ms));
const TAGE = 86_400_000;

/**
 * Regie, nicht Taktgeber (D2-17): sechs Akte, sechs verschiedene Atemzüge.
 * Der Anfang geht rasch, die Widerspruchskante und die Zeitreise halten, der
 * Schluss atmet aus. Getestet wird die Staffelung (tests/demo.test.ts); die
 * Dauer eines Laufs hängt an der Maschine des Lesers und wird deshalb nirgends
 * behauptet — die gemessenen Zahlen stehen im Bericht, nicht auf dem Schirm.
 */
export const TAKT = [700, 500, 900, 1400, 1600, 1200];

/** Der Modus der Tests (`--fast`) spielt ohne jede Pause. */
export function taktFuer(schnell: boolean): number[] {
  return schnell ? TAKT.map(() => 0) : [...TAKT];
}

/**
 * Ein Text, der nicht auf eine Karte passt, wird an einer Wortgrenze gekürzt —
 * und nie inside einer [[Verknüpfung]]: ein abgeschlossener Klammerpaar-Rest
 * wäre eine Behauptung über die Datei, die die Datei nicht hergibt (D2-18).
 */
export function schnitt(text: string, max = 96): string {
  const voll = text.replace(/\s+/g, " ").trim();
  if (voll.length <= max) return voll;
  let kopf = voll.slice(0, max);
  const bei = kopf.lastIndexOf(" ");
  if (bei > 40) kopf = kopf.slice(0, bei);
  const offen = (kopf.match(/\[\[/g) ?? []).length - (kopf.match(/\]\]/g) ?? []).length;
  if (offen > 0) {
    const letzte = kopf.lastIndexOf("[[");
    if (letzte >= 0) kopf = kopf.slice(0, letzte).trimEnd();
  }
  return kopf.trimEnd() + kuerzungsvermerk(voll.length - kopf.trimEnd().length);
}

export async function starteDemoShow(argumente: string[]): Promise<number> {
  const schnell = argumente.includes("--fast") || process.env.KEPTA_DEMO_FAST === "1";
  const takt = taktFuer(schnell);
  let schlag = 0;
  /** Der nächste Atemzug; der letzte Akt hält seinen bis zum Schluss. */
  const beat = () => SCHLAF(takt[Math.min(schlag++, takt.length - 1)] ?? 0);
  const sag = (text = "") => console.log(text);
  /** Ein Beat-Kopf: die Aktlinie ist der einzige Fettdruck auf der Bühne. */
  const akt = (text: string) => ausgabe([[text, FARBEN.gewicht]]);
  /** Eine Zeile auf der Bühne: Details stehen auf 4, nie auf 3 oder 5. */
  const zeile = (...abschnitte: Abschnitt[]) => ausgabe(abschnitte, { einzug: 4 });

  const ordner = fs.mkdtempSync(path.join(os.tmpdir(), "kepta-demo-"));
  const dbPfad = path.join(ordner, "kepta.db");
  const abmelden = raumtBeiAbbruch(ordner, process);
  demoDatenbank(dbPfad);
  const wegwerfSchluessel = crypto.randomBytes(32).toString("hex");
  const store = new KeptaStore(dbPfad, {
    ...defaultExtensions(), keys: schluesselbundKeyProvider(ordner, process.platform, undefined, { KEPTA_DB_KEY: wegwerfSchluessel }),
  });

  sag();
  akt("KEPTA demo — a throwaway database");
  zeile(["Everything you see is real product code, nothing is mocked.", ""]);
  zeile(["Press Ctrl+C any time — the demo data vanishes with it.", ""]);
  sag();
  zeile(["The story: a small tax firm. Three months of work. One client, Ms. Weber.", FARBEN.grau]);
  await beat();

  // ── Akt 1: eine Tatsache kommt rein — die Klassifikation entscheidet ──
  sag("");
  akt("── 1. A fact walks in ────────────────────────────────────────");
  const erste = saveWithIndex(store, {
    title: "Weber billing rhythm",
    content: "Ms. Weber is billed QUARTERLY — explicit request, never invoice her monthly.",
    tags: ["weber", "billing"],
    validFrom: Date.now() - 90 * TAGE,
    createdAt: Date.now() - 90 * TAGE,
    updatedAt: Date.now() - 90 * TAGE,
  });
  zeile(["✓ saved", FARBEN.gruen], [`"${erste.record.title}"`, ""]);
  zeile([`type ${erste.record.type} ${erste.record.tags.map((t) => "#" + t).join(" ")}`, FARBEN.grau]);
  zeile(["nobody labeled anything — the rules did", FARBEN.grau]);
  await beat();

  // ── Akt 2: die Frage an das Gedächtnis ──
  sag("");
  akt("── 2. Ask the memory ────────────────────────────────────────");
  const frage = await recall(store, "How often is Weber billed?");
  frage.treffer.slice(0, 2).forEach((t, i) => {
    zeile([`${i + 1}. ${t.titel}`, FARBEN.gewicht]);
    ausgabe([[schnitt(t.snippet), ""]], { einzug: 8 });
    ausgabe([[`${t.typ} ${t.datum} ${t.alter}`, FARBEN.grau]], { einzug: 8 });
  });
  await beat();

  // ── Akt 3: die Welt ändert sich — die alte Wahrheit bleibt ──
  sag("");
  akt("── 3. Three months later, Ms. Weber changes her mind ────────");
  const neue = saveWithIndex(store, {
    title: "Weber billing rhythm (updated)",
    content: "Ms. Weber switched to MONTHLY billing as of this month — replaces the quarterly request.",
    tags: ["weber", "billing"],
  });
  zeile(["✓ saved", FARBEN.gruen], [`"${neue.record.title}"`, ""]);
  zeile(["and the OLD version is still on record — nothing was quietly deleted", FARBEN.grau]);
  await beat();

  // ── Akt 4: der Widerspruch wird sichtbar, die Demo entscheidet ──
  sag("");
  akt("── 4. The contradiction, on demand ──────────────────────────");
  const widerspruch = await contradict(store);
  const paare: Array<{ altId: string; neuId: string }> = [];
  const gezeichnet = widerspruch.widersprueche.slice(0, 2);
  ausgabe([
    [
      widerspruch.anzahl > gezeichnet.length
        ? `showing ${gezeichnet.length} of ${zaehlung(widerspruch.anzahl, "candidate")} — read-only, nothing changed`
        : `${zaehlung(widerspruch.anzahl, "candidate")} — read-only, nothing changed`,
      FARBEN.gelb,
    ],
  ]);
  gezeichnet.forEach((w) => {
    const a = store.getMemory(w.a);
    const b = store.getMemory(w.b);
    ausgabe([[`"${a?.title ?? w.a}"`, FARBEN.gewicht]], { einzug: 4 });
    ausgabe([[`↔ "${b?.title ?? w.b}"`, ""]], { einzug: 8 });
    paare.push({ altId: w.a, neuId: w.b });
  });
  zeile(["the demo decides here, not you: keep the newer one, supersede the older", ""]);
  zeile(["the chain keeps the reasoning", FARBEN.grau]);
  if (paare[0]) {
    store.supersedeMemory(paare[0].altId, paare[0].neuId);
    zeile([`→ "${store.getMemory(paare[0].altId)?.title ?? "?"}" now points to its replacement`, FARBEN.blau]);
    zeile(["at home this call is yours: memory_consolidate with dryRun=false", FARBEN.grau]);
  }
  await beat();

  // ── Akt 5: die Kette + die Zeitreise — der Moment ──
  sag("");
  akt("── 5. The chain keeps both. Time travel proves it. ──────────");
  const altJetzt = store.getMemory(erste.record.id);
  const neuJetzt = store.getMemory(neue.record.id);
  zeile(["OLD (superseded)", FARBEN.blau], [`"${altJetzt?.title ?? "?"}"`, ""]);
  ausgabe([[schnitt(altJetzt?.content ?? "", 72), FARBEN.grau]], { einzug: 8 });
  zeile(["NEW (in force)", FARBEN.gruen], [`"${neuJetzt?.title ?? "?"}"`, ""]);
  ausgabe([[schnitt(neuJetzt?.content ?? "", 72), FARBEN.grau]], { einzug: 8 });
  const vorDreissig = Date.now() - 30 * TAGE;
  const damals = await searchMemories(store, { query: "How often is Weber billed?", asOf: vorDreissig, limit: 3 });
  // D2-18: vorher stand das Ergebnis im Drehbuch („QUARTERLY was the truth back
  // then"), nicht in der Datei. Jetzt zitiert die Zeitreise den Treffer selbst.
  const vorhin = damals.hits[0];
  zeile(["the time slider agrees — 30 days ago the file said:", FARBEN.grau]);
  if (vorhin) {
    zeile([`→ ${vorhin.memory.title}`, FARBEN.blau], [`· ${schnitt(vorhin.memory.content, 44)}`, ""]);
  } else {
    zeile(["→ no note was in force 30 days ago for this question", FARBEN.gelb]);
  }
  zeile(["Same file. Two timelines. Nothing deleted.", FARBEN.grau]);
  await beat();

  // ── Akt 6: eine Datei, verschlüsselt, dein Eigentum ──
  sag("");
  akt("── 6. What this actually is ─────────────────────────────────");
  const statistik: Statistik = stats(store);
  zeile(["file", FARBEN.grau], [dbPfad, ""]);
  zeile([`${zaehlung(statistik.notizen.active, "note")} active`, ""]);
  zeile(
    ["state", FARBEN.grau],
    [statistik.verschluesselt ? "encrypted" : "NOT encrypted", statistik.verschluesselt ? FARBEN.gruen : FARBEN.rot],
    statistik.verschluesselt && statistik.schluesselQuelle ? [`${TRENNER}key: ${statistik.schluesselQuelle}`, FARBEN.grau] : ["", ""]
  );
  zeile(["no cloud. no account. every MCP client reads the same file", FARBEN.grau]);
  await beat();

  // ── Finale: der Weg in den eigenen KI-Klienten ──
  sag("");
  akt("── Your turn ────────────────────────────────────────────────");
  store.close();
  const rest = loescheWegwerfOrdner(ordner);
  if (rest) zeile([`left behind: ${rest}`, FARBEN.rot], [`remove it with: rm -rf ${rest}`, FARBEN.grau]);
  abmelden();
  zeile(["KEPTA is headless — it lives inside your AI client via MCP", ""]);
  ausgabe([["next: npx -y kepta-mcp setup", FARBEN.grau]], { einzug: 4 });
  return rest ? 1 : 0;
}
