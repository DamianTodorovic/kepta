// `npx kepta demo` — die 60-Sekunden-Führung.
//
// Legt eine WEGWERF-Demodatenbank im temporären Verzeichnis an (niemals die
// echte Datei unter ~/.kepta), füllt sie mit einem fiktiven Kanzlei-Korpus
// samt [[Verknüpfungen]] — damit gleich der Graph zeigt, was los ist — und
// öffnet die Oberfläche. Jeder Aufruf ist frisch: der Ordner wird neu
// gebaut, alter Demo-Inhalt bleibt nie liegen.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { KeptaStore } from "./core/store";
import { indexMemory } from "./core/engine";
import { baueGraph } from "./ui/graph";
import { starteOberflaeche, oeffneImBrowser } from "./ui/server";

interface DemoNotiz {
  type: "semantic" | "episodic" | "procedural" | "reference";
  title: string;
  content: string;
  tags: string[];
  validFrom?: number;
}

/** Der fiktive Korpus: eine kleine Steuerkanzlei, erfunden, mit Querverweisen. */
export function demoKorpus(jetzt = Date.now()): DemoNotiz[] {
  const tag = 86_400_000;
  const vor = (tage: number) => jetzt - tage * tag;
  return [
    { type: "semantic", title: "Hetzner", content: "Production runs on the [[Hetzner]] CX42 in [[Nuremberg]]. Backups nightly at 03:00, see [[Backup routine]].", tags: ["infra"], validFrom: vor(90) },
    { type: "reference", title: "Backup routine", content: "1. restic snapshot to [[Hetzner]] storage box 2. monthly restore drill 3. keep 30 daily, 12 monthly snapshots. Written up after the [[Incident March]].", tags: ["infra", "howto"], validFrom: vor(80) },
    { type: "semantic", title: "Incident March", content: "The March disk failure taught us: the backup had never been restored once. That is why the [[Backup routine]] exists — and why it is tested.", tags: ["incident"], validFrom: vor(75) },
    { type: "semantic", title: "Nuremberg", content: "The CX42 sits in the Nuremberg data center (fsn1). Low latency for the [[Mandant portal]].", tags: ["infra"], validFrom: vor(90) },
    { type: "procedural", title: "New client onboarding", content: "1. scan the [[Client form]] 2. verify the power of attorney 3. open the file with a §203 marker 4. set reminders in the [[Deadline calendar]].", tags: ["howto", "clients"], validFrom: vor(60) },
    { type: "reference", title: "Client form", content: "Current template: /templates/client-form_v4.pdf — version 4 since February. Feeds the [[New client onboarding]] flow.", tags: ["template", "clients"], validFrom: vor(60) },
    { type: "semantic", title: "Deadline calendar", content: "All statutory deadlines live in the shared calendar; KEPTA keeps the reasoning: why a deadline applies to which [[Mandant portal]] user.", tags: ["deadlines"], validFrom: vor(45) },
    { type: "semantic", title: "Mandant portal", content: "Clients upload documents through the portal; the scan ([[New client onboarding]], step 1) reads them. Hosted beside [[Nuremberg]] for latency.", tags: ["clients", "infra"], validFrom: vor(40) },
    { type: "episodic", title: "Kickoff with Dr. Bauer", content: "Dr. Bauer insisted on encrypted storage (§203). We walked through the [[New client onboarding]] flow and the [[Deadline calendar]]; migration from the old tool is planned.", tags: ["meeting", "clients"], validFrom: vor(14) },
    { type: "semantic", title: "Invoice rhythm", content: "Weber is billed QUARTERLY (explicit request) — never invoice monthly. Everything else follows the standard rhythm from [[New client onboarding]].", tags: ["billing", "clients"], validFrom: vor(7) },
  ];
}

/** Legt die Demodatenbank an (überschreibt den Pfad) und liefert die Kennzahlen. */
export function demoDatenbank(dbPfad: string, jetzt = Date.now()): { anzahl: number; knoten: number; kanten: number } {
  fs.mkdirSync(path.dirname(dbPfad), { recursive: true });
  const store = new KeptaStore(dbPfad);
  try {
    for (const e of demoKorpus(jetzt)) {
      const r = store.createMemory({
        type: e.type,
        title: e.title,
        content: e.content,
        tags: e.tags,
        confidence: 1,
        validFrom: e.validFrom,
        createdAt: e.validFrom,
        updatedAt: e.validFrom,
      });
      indexMemory(store, r.id);
    }
    const g = baueGraph(store);
    return { anzahl: demoKorpus(jetzt).length, knoten: g.nodes.length, kanten: g.edges.length };
  } finally {
    store.close();
  }
}

/** `npx kepta demo`: Wegwerf-DB bauen, Oberfläche öffnen, bis Ctrl+C laufen. */
export async function starteDemo(argumente: string[]): Promise<number> {
  const ordner = fs.mkdtempSync(path.join(os.tmpdir(), "kepta-demo-"));
  const dbPfad = path.join(ordner, "kepta.db");
  const kennzahlen = demoDatenbank(dbPfad);
  const store = new KeptaStore(dbPfad);
  const ui = await starteOberflaeche(store, { port: 0 });
  console.log(`KEPTA demo — a throwaway database, throw it away freely.`);
  console.log(`  ${kennzahlen.anzahl} notes · ${kennzahlen.knoten} graph nodes · ${kennzahlen.kanten} links`);
  console.log(`  database: ${dbPfad}`);
  console.log(`KEPTA Core is running at ${ui.url}`);
  console.log("Look at the Graph view, then try the search. Press Ctrl+C to stop — the demo data is gone with it.");
  oeffneImBrowser(ui.url);
  await new Promise<void>((ok) => {
    const ende = () => {
      void ui.close().finally(() => {
        store.close();
        ok();
      });
    };
    process.on("SIGINT", ende);
    process.on("SIGTERM", ende);
  });
  try { fs.rmSync(ordner, { recursive: true, force: true }); } catch { /* Temp darf bleiben */ }
  return 0;
}
