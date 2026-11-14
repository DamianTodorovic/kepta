// P202 Pixel-Abnahme: der Korpus des Mockups (k3pta-app-fenster.html), exakt —
// 40 Notizen, Tag-Zahlen wie im Mockup (compliance 40, q3 40, json 10,
// maschine 10, md 10, txt 10), dieselben Titel, dieselben kurzen Zeiten.
// Nur mit IDENTISCHEN Daten ist die Pixel-Differenz zwischen Mockup und App
// eine Messung der Form, nicht der Inhalte.

const BESISSE = process.env.KEPTA_APP_URL || "http://localhost:3006";

const basis = (() => {
  const jetzt = new Date();
  return new Date(jetzt.getFullYear(), jetzt.getMonth(), jetzt.getDate(), 14, 22, 0);
})();
const heute = (h, m) => { const d = new Date(basis); d.setHours(h, m, 0, 0); return d.getTime(); };
const zurueck = (tage) => { const d = new Date(basis); d.setDate(d.getDate() - tage); return d.getTime(); };

/** Die sechs sichtbaren Zeilen des Mockups (Bild „Knowledge — K3PTA"). */
const sichtbar = [
  { title: "Q3 Compliance review — client file 1", text: "Review notes for the md workflow. Referenced Konzept Alpha and the retention policy. The keeper letter from 14 August needs a follow-up before the audit window opens on 4 December. Die Fristenliste liegt im selben Ordner; der Embedder-Schalter bleibt auf bge-m3 (lokal, 1024 dim), nomic nur als Fallback.", at: heute(14, 22), herkunft: "md file", type: "semantic", tags: ["compliance", "q3", "md"] },
  { title: "Q3 Compliance review — client file 2", text: "Review notes for the json workflow. Referenced Konzept Beta.", at: heute(11, 5), herkunft: "Claude Code", type: "semantic", tags: ["compliance", "q3", "json"] },
  { title: "Embedding-Modell umgestellt", text: "Von nomic auf bge-m3 — die jüngere Fassung gewinnt.", at: zurueck(10), herkunft: "MCP", type: "episodic", tags: ["compliance", "q3", "maschine"] },
  { title: "Follow up on the keeper letter", text: "The audit window opens on 4 December.", at: zurueck(15), herkunft: "MCP", type: "procedural", tags: ["compliance", "q3", "txt"] },
  { title: "Retention policy — stand 3", text: "Aufbewahrungsfristen je Aktentyp, abgestimmt mit der Kanzlei.", at: zurueck(22), herkunft: "md file", type: "semantic", tags: ["compliance", "q3", "md"] },
  { title: "Konzept Beta — json workflow", text: "Parser-Notizen und Feldzuordnung für den json-Import.", at: zurueck(29), herkunft: "json", type: "reference", tags: ["compliance", "q3", "json"] },
];

/** Die 34 Füller in den vier Mockup-Mustern — die Zähler bleiben exakt:
 *  alle 40 tragen (compliance, q3); je 10 tragen zusätzlich json / maschine / md / txt. */
const fueller = [];
const muster = [
  { tags: ["compliance", "q3", "json"], titel: (i) => `JSON-Import ${String(i).padStart(2, "0")}`, text: "Parser-Notizen und Feldzuordnung für den json-Import.", art: "reference", herkunft: "json" },
  { tags: ["compliance", "q3", "maschine"], titel: (i) => `Maschinenpark ${String(i).padStart(2, "0")}`, text: "Bestandsliste der Maschinen mit Wartungsfristen.", art: "reference", herkunft: "json" },
  { tags: ["compliance", "q3", "md"], titel: (i) => `Mandatsakte ${String(i).padStart(2, "0")}`, text: "Akteneintrag der Mandatsakte — Aufbewahrung und Fristen.", art: "semantic", herkunft: "md file" },
  { tags: ["compliance", "q3", "txt"], titel: (i) => `Textbausteine ${String(i).padStart(2, "0")}`, text: "Wiederverwendbare Sätze für Briefe an Mandanten.", art: "reference", herkunft: "txt" },
];
const anzahl = [8, 9, 8, 9];
let nr = 0;
for (let gruppe = 0; gruppe < 4; gruppe++) {
  for (let i = 1; i <= anzahl[gruppe]; i++) {
    const m = muster[gruppe];
    fueller.push({
      title: m.titel(i), text: m.text, at: zurueck(31 + nr), herkunft: m.herkunft, type: m.art, tags: m.tags,
    });
    nr++;
  }
}

const alle = [...sichtbar, ...fueller];
const zaehlung = {};
for (const n of alle) for (const t of n.tags) zaehlung[t] = (zaehlung[t] || 0) + 1;
console.log("Tag-Zählung:", JSON.stringify(zaehlung), "| Notizen:", alle.length);

// Zwei Wege: der Import trägt die Zeiten (createdAt/updatedAt), das Update den
// Typ (die Mockup-Punkte brauchen die vier Kinds).
const laufId = Date.now().toString(36);
const payload = {
  memories: alle.map((n, i) => ({
    id: `mockup-${laufId}-${String(i).padStart(3, "0")}`,
    title: n.title,
    content: n.text + (n.herkunft ? `\n\n— Source: ${n.herkunft}` : ""),
    tags: n.tags,
    createdAt: n.at,
    updatedAt: n.at,
  })),
};
const imp = await fetch(`${BESISSE}/api/memories/import`, {
  method: "POST", headers: { "content-type": "application/json" },
  body: JSON.stringify(payload),
}).catch(() => null);
if (!imp?.ok) { console.error("Import:", imp ? `${imp.status} ${(await imp.text()).slice(0, 200)}` : "flog"); process.exit(1); }
console.log("importiert:", (await imp.json()).imported);
