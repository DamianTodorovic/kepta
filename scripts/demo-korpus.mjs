// Der Demo-Korpus für Screenshots und das Demo-GIF: frei erfunden, englisch,
// ohne eine einzige echte Person, Adresse oder Firma. Eine kleine Beratungs-
// kanzlei ("Harbor Advisory") mit acht Mandanten — dicht verlinkt ([[…]]),
// damit der Graph etwas zu zeigen hat, über 18 Monate verteilt (validFrom),
// damit der Zeitregler den Graphen wachsen lässt, und mit drei abgelösten
// Einträgen, damit die Zeitachse auch Geschichte zeigt. Die Pauschale von Lumen
// steht hier noch mit dem Betrag aus dem Angebot — scripts/screenshots.mjs lässt
// Claude danach den unterschriebenen Betrag speichern, und Today zeigt den
// Widerspruch. Gespeichert wird im Namen von Claude, wie im Alltag.
//
// Nie gegen die eigene Wissensbasis laufen lassen: scripts/screenshots.mjs
// startet dafür einen eigenen Server mit leerem Datenordner und eigenem HOME.
const TAG = 24 * 60 * 60 * 1000;
const MONAT = 30 * TAG;

// [art, titel, tags, inhalt, monate zurück, schlüssel?]
// Reihenfolge mit Absicht: die zuletzt angelegten stehen oben in der Liste.
const N = [
  ["semantic", "Hourly rate 2025", ["pricing"], "165 EUR per hour for advisory, 85 EUR for bookkeeping. Travel time at half rate.", 17, "rate2025"],
  ["semantic", "Hourly rate 2026", ["pricing"], "From 1 January 2026: 180 EUR per hour for advisory, 95 EUR for bookkeeping. Travel time at half rate. Replaces [[Hourly rate 2025]].", 5, "rate2026"],
  ["semantic", "Office address (until March)", ["office"], "Old address: Market Square 3, first floor.", 18, "addrOld"],
  ["semantic", "Office address", ["office"], "Harbor Advisory, Quay Street 14, second floor — new since the move in March. See [[Office move checklist]].", 2, "addrNew"],
  ["semantic", "Backup schedule (weekly)", ["infra", "backup"], "Weekly backups on Sunday nights, kept for 14 days.", 14, "backupOld"],
  ["semantic", "Backup schedule", ["infra", "backup"], "Nightly backups at 02:00, kept for 30 days; a restore is tested every first Monday — see [[Restore from backup]]. Owner: [[Jonas Brandt]].", 6, "backupNew"],

  ["semantic", "Mara Lind — account lead", ["people"], "Leads [[Lumen & Co.]] and [[Veltmann Architects]]. Prefers short written updates over calls. Owner of [[Project Atlas]].", 16],
  ["semantic", "Jonas Brandt — bookkeeping", ["people"], "Runs monthly bookkeeping for [[Falk & Sons]] and [[Nordwind Logistics]]. Owns the [[Staging server]] and the [[Backup schedule]].", 16],
  ["semantic", "Elena Weiss — tax advisor", ["people", "tax"], "Handles [[VAT]] questions and the [[Q4 Close]]. Advises [[Kestrel Software]] on EU sales.", 15],
  ["semantic", "Tobias Roth — CFO at Nordwind", ["people", "client"], "Decides on budget at [[Nordwind Logistics]]. Wants the month-end report by the 5th.", 15],
  ["semantic", "Nina Keller — practice manager", ["people", "client"], "Our contact at [[Castell Dental]]. Very careful with patient data — always point to the [[Privacy checklist]].", 14],
  ["semantic", "Paul Hartmann — owner of Brightwater", ["people", "client"], "Runs [[Brightwater Bakery]]. Calls rather than writes; best reached before 9 am.", 13],
  ["semantic", "Sofia Marin — partner at Veltmann", ["people", "client"], "Partner at [[Veltmann Architects]]. Organises the [[Office move checklist]] on their side.", 12],
  ["semantic", "David Chen — founder of Orion Health", ["people", "client"], "Founder of [[Orion Health]]. Asked for a one-page summary every month.", 10],

  ["semantic", "Lumen retainer (from the proposal)", ["client", "pricing"], "The Lumen & Co. retainer is 4,000 EUR per quarter, as offered in the proposal.", 4],
  ["semantic", "Lumen & Co. — client profile", ["client"], "Lighting design studio, 40 people, client since 2024. Contact: [[Mara Lind]]. Quarterly invoices at the [[Hourly rate 2026]]. Current work: [[Project Atlas]] and the [[Client Portal]].", 16],
  ["semantic", "Nordwind Logistics — client profile", ["client"], "Freight forwarder with three depots. Contact: [[Tobias Roth]]. Monthly bookkeeping by [[Jonas Brandt]], [[VAT]] returns every quarter. Uses the [[Client Portal]].", 15],
  ["semantic", "Castell Dental — client profile", ["client", "health"], "Dental practice, two locations. Patient data never leaves the practice — see [[Privacy checklist]]. Contact: [[Nina Keller]]. Payroll through the [[Payroll run]].", 14],
  ["semantic", "Brightwater Bakery — client profile", ["client", "retail"], "Family bakery, six shops, seasonal staff in December — plan with the [[Payroll run]]. Contact: [[Paul Hartmann]]. Year-end close is part of the [[Q4 Close]].", 13],
  ["semantic", "Veltmann Architects — client profile", ["client"], "Architecture office, 12 people, billed per project. Contact: [[Sofia Marin]], account lead [[Mara Lind]].", 12],
  ["semantic", "Orion Health — client profile", ["client", "health"], "Physiotherapy group. Everything stays local. Contact: [[David Chen]]. Onboarded with [[Client onboarding]].", 10],
  ["semantic", "Kestrel Software — client profile", ["client", "software"], "SaaS startup, 20 people, customers across the EU — [[VAT]] advice from [[Elena Weiss]]. Quarterly board pack.", 8],
  ["semantic", "Falk & Sons — client profile", ["client", "trades"], "Carpentry workshop, third generation. Paper receipts, scanned monthly by [[Jonas Brandt]].", 6],

  ["semantic", "Client Portal — scope", ["portal"], "Clients upload receipts, see open invoices and download reports. Used by [[Nordwind Logistics]] and [[Lumen & Co.]]; tested on the [[Staging server]].", 11],
  ["semantic", "Staging server", ["infra"], "Test system for the [[Client Portal]]. Deploys from main. Backups follow the [[Backup schedule]]. Admin: [[Jonas Brandt]].", 11],
  ["semantic", "Data retention policy", ["legal", "archive"], "Invoices and receipts: 10 years. Client correspondence: 6 years. Portal logs: 12 months. Backups age out with the [[Backup schedule]].", 12],
  ["semantic", "Privacy checklist", ["privacy", "process"], "Before sharing anything: remove names, check the [[Data retention policy]], use the [[Client Portal]] instead of email, never paste client data into a cloud chat.", 10],
  ["semantic", "Decision: receipts go through the portal", ["decision", "portal"], "From April, clients upload receipts in the [[Client Portal]]. Email attachments get lost and are hard to archive under the [[Data retention policy]]. Agreed by [[Mara Lind]] and [[Jonas Brandt]].", 9],
  ["semantic", "Decision: local AI for client data", ["decision", "privacy"], "Client data is processed by a local model only; cloud AI only for general questions without names. See [[Privacy checklist]]. Proposed by [[Elena Weiss]].", 7],
  ["semantic", "Decision: monthly one-page summary", ["decision", "client"], "Every client gets a one-page summary each month — started with [[Orion Health]] at [[David Chen]]'s request.", 6],
  ["semantic", "VAT — EU sales", ["tax", "vat"], "B2B services to EU customers: reverse charge, the customer's VAT ID on every invoice. Relevant for [[Kestrel Software]]; owner [[Elena Weiss]].", 9],
  ["semantic", "Q4 Close — plan", ["finance", "q4"], "All year-end closings between 1 December and 20 January. Order: [[Brightwater Bakery]], [[Nordwind Logistics]], [[Lumen & Co.]]. Coordinated by [[Elena Weiss]].", 4],
  ["semantic", "Portal adoption", ["portal", "metrics"], "Six of eight clients upload receipts in the [[Client Portal]]; [[Falk & Sons]] and [[Brightwater Bakery]] still send paper.", 1],
  ["semantic", "Project Atlas — goals", ["atlas", "client"], "Relaunch of the [[Client Portal]] for [[Lumen & Co.]]: faster search, cleaner invoices and accessible forms. Owner: [[Mara Lind]]. Deadline: the [[Q4 Close]].", 11],

  ["procedural", "Client onboarding", ["process"], "1. Sign the engagement letter.\n2. Create the client in the [[Client Portal]].\n3. Send the [[Privacy checklist]].\n4. First call within a week.", 13],
  ["procedural", "Payroll run", ["process", "payroll"], "1. Collect hours by the 20th.\n2. Check new and leaving staff.\n3. Run payroll and send payslips.\n4. Archive under the [[Data retention policy]].", 12],
  ["procedural", "Month-end close", ["process", "finance"], "1. Reconcile the bank accounts.\n2. Post open receipts from the [[Client Portal]].\n3. Send the report by the 5th — [[Tobias Roth]] asks every month.", 11],
  ["procedural", "Quarterly VAT return", ["process", "vat"], "1. Export sales by country.\n2. Check the reverse-charge invoices.\n3. File the return.\n4. Store the confirmation under the [[Data retention policy]].", 9],
  ["procedural", "How to rotate API keys", ["security", "process"], "1. Create the new key next to the old one.\n2. Roll it out to the [[Staging server]] first.\n3. Watch for errors for a day.\n4. Revoke the old key.", 7],
  ["procedural", "Restore from backup", ["process", "backup"], "1. Pick the snapshot from the [[Backup schedule]].\n2. Restore into a fresh database, never over the live one.\n3. Compare row counts.\n4. Switch over and note the time.", 6],
  ["procedural", "Office move checklist", ["process", "office"], "1. Give notice to the old landlord.\n2. Order internet for the [[Office address]].\n3. Update letterheads and the [[Client Portal]].\n4. Tell every client.", 5],
  ["procedural", "Year-end close", ["process", "q4"], "1. Inventory count with the client.\n2. Accruals and deferrals.\n3. Draft statements.\n4. Review with [[Elena Weiss]] — part of the [[Q4 Close]].", 4],
  ["procedural", "New team member — first week", ["team", "process"], "Day 1: laptop and accounts, read the [[Privacy checklist]]. Day 2: shadow [[Jonas Brandt]]. Week 1: first client file with [[Mara Lind]].", 4],
  ["procedural", "Client offboarding", ["process"], "1. Send the final invoice.\n2. Export their files from the [[Client Portal]].\n3. Archive under the [[Data retention policy]].\n4. Revoke portal access.", 3],

  ["reference", "Meeting notes template", ["template", "process"], "Date · People · Decisions · Open questions · Next steps (who, by when).", 16],
  ["reference", "Keyboard shortcuts", ["team", "tools"], "⌘K command palette · ⌘1–7 switch views · ⌘N new note · ? all shortcuts.", 16],
  ["reference", "Glossary", ["team"], "Reverse charge: the customer pays the VAT. Accruals: costs in the right period. Close: the month-end or year-end routine.", 15],
  ["reference", "Team working agreement", ["team", "process"], "Core hours 10–15. Decisions go into KEPTA the same day. Reviews within one working day.", 14],
  ["reference", "Engagement letter — Orion Health", ["document", "contract"], "Scope: bookkeeping, payroll and a monthly summary for [[Orion Health]].", 10],
  ["reference", "Portal user guide", ["document", "portal"], "How clients upload receipts and download reports in the [[Client Portal]].", 8],
  ["reference", "Cash-flow model — Nordwind", ["document", "finance"], "A 13-week cash-flow model for [[Nordwind Logistics]], requested by [[Tobias Roth]].", 7],
  ["reference", "Reading list: local-first software", ["research"], "Essays on local-first software and why client data should stay on your own machine — background for the [[Decision: local AI for client data]].", 7],
  ["reference", "Privacy notice for clients", ["document", "privacy"], "A one-page notice on how we handle client data, based on the [[Privacy checklist]].", 6],
  ["reference", "Engagement letter — Lumen & Co.", ["document", "contract"], "Advisory and bookkeeping for [[Lumen & Co.]], billed quarterly at the [[Hourly rate 2026]].", 5],
  ["reference", "Board pack Q2 — Kestrel Software", ["document", "report"], "Quarterly board pack for [[Kestrel Software]]: revenue, burn, runway and [[VAT]] notes.", 5],
  ["reference", "Invoice template 2026", ["template", "pricing"], "Invoice template with the [[Hourly rate 2026]] and the reverse-charge note for [[VAT]].", 5],
  ["reference", "Lease — Quay Street", ["document", "office"], "Five-year lease for the new [[Office address]], signed in January.", 3],
  ["reference", "Seasonal staff plan — Brightwater", ["document", "payroll"], "December staffing plan for [[Brightwater Bakery]], input for the [[Payroll run]].", 3],

  ["episodic", "Kickoff: Project Atlas", ["meeting", "atlas"], "Kickoff with [[Lumen & Co.]] for [[Project Atlas]]. Weekly demos on Thursdays; [[Mara Lind]] presents the first draft next week.", 11],
  ["episodic", "Onboarding call with Orion Health", ["meeting", "client"], "[[David Chen]] signed. Followed the [[Client onboarding]] steps; portal access next week.", 10],
  ["episodic", "Design review — portal navigation", ["meeting", "portal"], "Three drafts for the [[Client Portal]]. The client chose the one with a persistent search bar. Owner: [[Mara Lind]].", 9],
  ["episodic", "Call with Tobias Roth about cash flow", ["meeting", "client"], "[[Tobias Roth]] wants a 13-week cash-flow view for [[Nordwind Logistics]]. Draft by the end of the month.", 8],
  ["episodic", "Retro — first quarter", ["team", "retro"], "Went well: portal uploads replaced email. Went badly: two late payroll files. Action: a checklist in the [[Payroll run]].", 8],
  ["episodic", "Workshop: privacy at Castell Dental", ["meeting", "privacy"], "Walked [[Nina Keller]] through the [[Privacy checklist]]. Decided: no patient names in any ticket.", 7],
  ["episodic", "Incident: portal login outage", ["incident", "portal"], "Portal login failed for 40 minutes after a certificate expired on the [[Staging server]]. Fix: a renewal reminder 30 days ahead.", 6],
  ["episodic", "Kestrel board meeting", ["meeting", "client"], "Presented the quarterly pack to [[Kestrel Software]]. Open question on [[VAT]] for US customers — [[Elena Weiss]] follows up.", 5],
  ["episodic", "Training: e-invoicing", ["training", "tax"], "Team training by [[Elena Weiss]] on electronic invoices. Slides in the shared folder.", 4],
  ["episodic", "Year-end meeting with Brightwater", ["meeting", "q4"], "[[Paul Hartmann]] expects a busier December than last year. Extra seasonal staff — adjust the [[Payroll run]].", 3],
  ["episodic", "Veltmann billing review", ["meeting", "client"], "Reviewed hours per project with [[Sofia Marin]]. Two projects over budget; new rates from the [[Hourly rate 2026]].", 3],
  ["episodic", "Office move — keys handed over", ["office", "event"], "Keys for Quay Street received; internet live on day one. See [[Office move checklist]].", 2],
  ["episodic", "Call with Nina Keller — new location", ["meeting", "client"], "[[Castell Dental]] opens a second location in autumn. Payroll grows by six people — update the [[Payroll run]].", 2],
  ["episodic", "Falk & Sons — receipts scanned", ["client", "event"], "March receipts scanned and filed for [[Falk & Sons]] by [[Jonas Brandt]].", 1],
  ["episodic", "Portal launch", ["portal", "milestone"], "The [[Client Portal]] went live for all clients. [[Project Atlas]] delivered on time.", 1],
];

export const DEMO = N.map(([type, title, tags, content, monate, key]) => ({ type, title, tags, content, monate, key }));

// Abgelöst: [alt, neu, wie viele Monate zurück das Ende liegt]
const ABLOESUNGEN = [["rate2025", "rate2026", 5], ["addrOld", "addrNew", 2], ["backupOld", "backupNew", 6]];

async function mcp(basis, id, name, args) {
  const res = await fetch(`${basis}/mcp`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    // Im Namen von Claude — sonst stünde „An MCP client“ in Aktivität und Prüfprotokoll.
    body: JSON.stringify({ jsonrpc: "2.0", id, method: "tools/call", params: { name, arguments: args }, _meta: { clientInfo: { name: "claude-ai" } } }),
  });
  const antwort = await res.json();
  if (!res.ok || antwort?.result?.isError) throw new Error(`${name}: ${JSON.stringify(antwort).slice(0, 300)}`);
  return antwort.result.structuredContent;
}

/**
 * Legt den Korpus über MCP an (memory_save) — der Weg, auf dem Agenten
 * speichern. Nur dort werden [[Wiki-Links]] zu Entitäten und Kanten.
 */
export async function saeDemo(basis) {
  const jetzt = Date.now();
  const ids = {};
  let rpc = 1;
  for (const n of DEMO) {
    const sc = await mcp(basis, rpc++, "memory_save", { title: n.title, content: n.content, tags: n.tags, type: n.type, validFrom: jetzt - n.monate * MONAT });
    const id = sc?.memory?.id;
    if (!id) throw new Error(`${n.title}: keine id`);
    if (n.key) ids[n.key] = id;
    // Gleich nach dem Nachfolger ablösen, nicht am Ende: die Änderung macht
    // die alte Notiz zur jüngsten, und oben in der Liste soll keine abgelöste stehen.
    const abl = ABLOESUNGEN.find(([, neu]) => neu === n.key);
    if (abl) {
      const res = await fetch(`${basis}/api/memories`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: ids[abl[0]], validTo: jetzt - abl[2] * MONAT, supersededBy: id }),
      });
      if (!res.ok) throw new Error(`Ablösung ${abl[0]}: HTTP ${res.status}`);
    }
  }
  return DEMO.length;
}
