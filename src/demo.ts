// `npx kepta demo` — die 60-Sekunden-Führung.
//
// Legt eine WEGWERF-Demodatenbank im temporären Verzeichnis an (niemals die
// echte Datei unter ~/.kepta) und füllt sie mit einem fiktiven Kanzlei-Korpus
// samt [[Verknüpfungen]]. KEPTA Core hat keine eigene Oberfläche mehr — der
// Lauf zeigt die Kennzahlen und den Weg zur kostenlosen Desktop-App, die
// dieselbe Datei öffnet. Jeder Aufruf ist frisch: der Ordner wird neu
// gebaut, alter Demo-Inhalt bleibt nie liegen.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { KeptaStore } from "./core/store";
import { indexMemory } from "./core/engine";
import { baueGraph } from "./ui/graph";

interface DemoNotiz {
  type: "semantic" | "episodic" | "procedural" | "reference";
  title: string;
  content: string;
  tags: string[];
  validFrom?: number;
  validTo?: number;
}

/** Der fiktive Korpus: die Steuerkanzlei „Steiner & Kollegen" — dicht
 *  verlinkt, mit einem lebenden Widerspruch (Hoffmann-Frist) und einem
 *  abgelaufenen Eintrag, damit Graph, Suche, Widerspruch und Zeitregler in
 *  der Oberfläche sofort etwas zu zeigen haben. */
export function demoKorpus(jetzt = Date.now()): DemoNotiz[] {
  const tag = 86_400_000;
  const vor = (tage: number) => jetzt - tage * tag;
  return [
    // Die Kanzlei selbst — die Hub-Notizen, an denen der Graph hängt.
    { type: "semantic", title: "Steiner & Kollegen", content: "A three-partner tax firm. How work is split: [[Team structure]]. Where the systems live: [[IT setup]]. The rule that holds it together: [[§203 confidentiality]].", tags: ["firm"], validFrom: vor(270) },
    { type: "semantic", title: "Team structure", content: "Anna runs payroll, Ben owns the client files, Clara is the intern on scanning duty. Escalations go to Ms. Steiner. Payroll details: [[Payroll routine]].", tags: ["firm", "team"], validFrom: vor(270) },
    { type: "semantic", title: "§203 confidentiality", content: "Everything in this firm is a tax secret under §203 StGB. Nothing leaves the machines, nothing goes to a cloud. Concrete rules: [[Data rules]].", tags: ["firm", "compliance"], validFrom: vor(260) },
    { type: "procedural", title: "Data rules", content: "1. client data stays on office machines 2. backups are encrypted, see [[Backup routine]] 3. no client documents in private chats or mail drafts 4. paper goes to the scanner, then to the safe, see [[Scanner workflow]].", tags: ["compliance", "howto"], validFrom: vor(255) },

    // Infrastruktur
    { type: "semantic", title: "IT setup", content: "One encrypted file server, the [[Mandant portal]] for uploads, the [[Hetzner server]] for the practice software and the office scanner ([[Scanner workflow]]).", tags: ["infra"], validFrom: vor(240) },
    { type: "semantic", title: "Hetzner server", content: "The practice software runs on a [[Hetzner server|Hetzner]] CX42 in Nuremberg. Nightly backups feed [[Backup routine]]. Low latency for the [[Mandant portal]].", tags: ["infra"], validFrom: vor(240) },
    { type: "reference", title: "Backup routine", content: "1. restic snapshot to the [[Hetzner server|Hetzner]] storage box 2. monthly restore drill — written up after the March disk failure, when the backup had never been restored once 3. keep 30 daily and 12 monthly snapshots.", tags: ["infra", "howto"], validFrom: vor(230) },
    { type: "semantic", title: "Mandant portal", content: "Clients upload documents through the portal; the scan in [[New client onboarding]] picks them up from there.", tags: ["infra", "clients"], validFrom: vor(200) },
    { type: "procedural", title: "Scanner workflow", content: "1. scan at 300 dpi 2. check the OCR output — the machine still misreads Umlaute, see [[Scanner quirks]] 3. file under the client, then into [[DATEV]].", tags: ["infra", "howto"], validFrom: vor(180) },
    { type: "semantic", title: "Scanner quirks", content: "The OCR misreads Umlaute on dot-matrix print (ß shows up as ss, ü as u). Old fax documents need a manual pass before [[DATEV]].", tags: ["infra"], validFrom: vor(150) },

    // Abläufe und Vorlagen
    { type: "procedural", title: "New client onboarding", content: "1. send the [[Client form]] 2. verify the power of attorney against the [[Power of attorney template]] 3. open the file with a [[§203 confidentiality]] marker 4. connect the [[Mandant portal]] account 5. set reminders in the [[Deadline calendar]].", tags: ["howto", "clients"], validFrom: vor(220) },
    { type: "reference", title: "Client form", content: "Current template: /templates/client-form_v4.pdf — version 4 since February. Feeds [[New client onboarding]].", tags: ["template", "clients"], validFrom: vor(220) },
    { type: "reference", title: "Power of attorney template", content: "The standard Vollmacht (§53 AO). Check the scope before filing anything — see [[New client onboarding]], step 2.", tags: ["template", "clients"], validFrom: vor(210) },
    { type: "procedural", title: "Billing basics", content: "Invoices go out on the 5th, payment term 14 days. Clients with an explicit deviation are listed in their own note — e.g. [[Invoice rhythm]] for Ms. Weber.", tags: ["billing", "howto"], validFrom: vor(120) },
    { type: "procedural", title: "Payroll routine", content: "Anna runs payroll on the 20th for all clients with the payroll add-on; corrections go through [[DATEV]], see [[DATEV export how-to]].", tags: ["howto", "payroll"], validFrom: vor(190) },
    { type: "procedural", title: "Audit preparation", content: "For a Betriebsprüfung: 1. pull the [[Retention periods]] list 2. re-scan any paper, see [[Scanner workflow]] 3. reconcile the [[DATEV export how-to|DATEV exports]] 4. block one week of calendar via [[Deadline calendar]].", tags: ["howto", "audit"], validFrom: vor(60) },

    // Fristen und Steuern
    { type: "semantic", title: "Deadline calendar", content: "All statutory deadlines live in the shared calendar; KEPTA keeps the reasoning — why a deadline applies to which client. Sources: [[Filing deadlines]] and [[VAT pre-announcements]].", tags: ["deadlines"], validFrom: vor(190) },
    { type: "reference", title: "Filing deadlines", content: "Annual returns: July 31 (with extension September 1). Financial statements: 6 months after the fiscal year. Full list in the [[Deadline calendar]].", tags: ["deadlines"], validFrom: vor(180) },
    { type: "procedural", title: "VAT pre-announcements", content: "Umsatzsteuervoranmeldung monthly via [[DATEV]] by the 10th of the following month. Dauerfristverlängerung for most clients — check the flag in the [[Deadline calendar]].", tags: ["deadlines", "howto"], validFrom: vor(170) },
    { type: "semantic", title: "Tax law change 2026", content: "The 2026 changes moved two filing dates — both are updated in [[Filing deadlines]]. Affected clients get a note in the [[Deadline calendar]].", tags: ["tax", "deadlines"], validFrom: vor(90) },
    { type: "reference", title: "Retention periods", content: "§147 AO: books and records stay 10 years, correspondence 6 years. Applies to every archive produced by [[Scanner workflow]] and [[Backup routine]].", tags: ["compliance"], validFrom: vor(160) },

    // DATEV
    { type: "semantic", title: "DATEV", content: "The bookkeeping backbone. Exports follow [[DATEV export how-to]]; the import quirks live in [[Scanner quirks]].", tags: ["tools"], validFrom: vor(200) },
    { type: "procedural", title: "DATEV export how-to", content: "1. select the client mandant 2. export with the standard KNE schema 3. verify line count against the source 4. archive the export per [[Retention periods]].", tags: ["tools", "howto"], validFrom: vor(170) },

    // Mandanten — Weber, Bauer, Hoffmann
    { type: "semantic", title: "Ms. Weber", content: "Client since 2011, retail. Billed QUARTERLY by explicit request — the standing rule is in [[Invoice rhythm]]. Documents arrive through the [[Mandant portal]].", tags: ["clients", "weber"], validFrom: vor(150) },
    { type: "semantic", title: "Invoice rhythm", content: "Ms. Weber is billed QUARTERLY (explicit request) — never invoice her monthly. Everyone else follows [[Billing basics]].", tags: ["billing", "clients"], validFrom: vor(150) },
    { type: "reference", title: "Power of attorney Weber", content: "Vollmacht on file, scope: tax returns and appeals. Scanned through [[Scanner workflow]], filed with the [[Client form]] batch.", tags: ["clients", "weber"], validFrom: vor(150) },
    { type: "episodic", title: "Weber complaint call", content: "Ms. Weber called about the June invoice — it had arrived monthly instead of quarterly, against her standing rule in [[Invoice rhythm]]. Apologized, corrected, and checked the other [[Billing basics]] clients.", tags: ["meeting", "clients", "billing"], validFrom: vor(21) },
    { type: "semantic", title: "Dr. Bauer", content: "New mandate, physician's practice. Insisted on encrypted storage because of [[§203 confidentiality]]. Migration from the old tool is planned — tracked with [[New client onboarding]].", tags: ["clients", "bauer"], validFrom: vor(30) },
    { type: "episodic", title: "Kickoff with Dr. Bauer", content: "Walked Dr. Bauer through [[New client onboarding]] and the [[Deadline calendar]]. He asked where the data physically sits — answered with [[Hetzner server]] and [[Data rules]]. Migration starts next month.", tags: ["meeting", "clients"], validFrom: vor(14) },
    { type: "semantic", title: "Hoffmann Logistik", content: "Client since March, freight forwarding. First full year with us — the annual return is tracked in [[Hoffmann filing deadline]], the extension on record in [[Hoffmann filing extension]].", tags: ["clients", "hoffmann"], validFrom: vor(120) },
    { type: "semantic", title: "Hoffmann filing deadline", content: "The 2025 annual return for [[Hoffmann Logistik]] was expected July 31 — the standard list is in [[Filing deadlines]].", tags: ["clients", "deadlines"], validFrom: vor(45) },
    { type: "semantic", title: "Hoffmann filing extension", content: "The tax office granted an extension: the 2025 return for [[Hoffmann Logistik]] is due September 1, not the July 31 from [[Hoffmann filing deadline]].", tags: ["clients", "deadlines"], validFrom: vor(10) },

    // Ein abgelaufener Versuch — für den Zeitregler und die „Expired"-Markierung
    { type: "semantic", title: "Co-working desk trial", content: "Two desks at the co-working space down the street, a one-month trial for Clara's scanning sprints. Ended — the travel time ate the win. Back to the setup in [[IT setup]].", tags: ["firm", "office"], validFrom: vor(120), validTo: vor(20) },
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
        validTo: e.validTo,
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

/** `npx kepta demo`: Wegwerf-DB bauen, Kennzahlen zeigen, Weg zur App zeigen. */
export async function starteDemo(): Promise<number> {
  const ordner = fs.mkdtempSync(path.join(os.tmpdir(), "kepta-demo-"));
  const dbPfad = path.join(ordner, "kepta.db");
  const kennzahlen = demoDatenbank(dbPfad);
  console.log(`KEPTA demo — a throwaway database, throw it away freely.`);
  console.log(`  ${kennzahlen.anzahl} notes · ${kennzahlen.knoten} graph nodes · ${kennzahlen.kanten} links`);
  console.log(`  database: ${dbPfad}`);
  console.log("KEPTA Core has no browser UI of its own — the interface is the free desktop app.");
  console.log("KEPTA Pro is free: one free Pro day with every download, then daily limits, never locks.");
  console.log("  https://github.com/DamianTodorovic/kepta-pro-releases/releases/latest");
  try { fs.rmSync(ordner, { recursive: true, force: true }); } catch { /* Temp darf bleiben */ }
  return 0;
}
