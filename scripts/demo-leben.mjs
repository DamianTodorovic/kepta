// Ein Füller, der nach dem Leben einer Person klingt — bei erhaltener Messstruktur.
//
//   node scripts/demo-leben.mjs 400 /tmp/leben-400.json
//
// Warum nicht einfach `demo-korpus.mjs` umschreiben: die 73 Notizen dort klingen
// schon nach Leben (Harbor Advisory, Namen, Beträge, Fristen). Die Schablonen-Titel
// „Buecher Notiz 0317" kommen aus dem A7-Mess-Füller
// `audit-2026-10-09/a7-code/korpus.mjs:61`. Der ist als Messung richtig — für ein
// öffentliches Bild aber unbrauchbar, weil ein Fremder in zwei Sekunden sieht, dass
// das ein Script ist.
//
// Die Regel dieses Skripts: **der Zufallsstrom wird nicht angefasst.** Jede `rnd()`
// -Stelle bleibt an ihrem Platz, nur die *Wörter* werden andere. Damit sind
// Typenfolge, Tag-Multiset, Linkziele, Zeitpunkte und Konfidenzen bitgleich zum
// A7-Füller, und Vorher/Nachher-Messungen vergleiche ich nicht mehr — sie sind
// identisch. Bewiesen mit `korpus-zaehler.mjs` (Struktur-Fingerabdeck über
// Typ + Tags + Linkziele, ohne Wörter).
//
// Der Bestand ist erfunden: eine Person, ein Haushalt, drei Aufträge. Kein echter
// Name, keine echte Firma, kein echter Mandant, keine echte Adresse.
import fs from "node:fs";
import path from "node:path";

const SEED = 0xa7c0 + 150007;
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const FELDER = [
  { name: "Atlas", themen: ["Kickoff", "Budget", "Risiken", "Meilensteine", "Partner"], konzepte: ["storage", "suche", "mandant", "schluessel", "audit", "latenz"] },
  { name: "Kueche", themen: ["Wochenplan", "Einkauf", "Reste", "Gast"], konzepte: ["wuerzung", "temperatur", "messer", "ofen", "sauerteig"] },
  { name: "Garten", themen: ["Beete", "Schnitt", "Giessen", "Boden"], konzepte: ["kompost", "regen", "schatten", "saat"] },
  { name: "Forschung", themen: ["Paper", "Versuch", "Replikation", "Datensatz"], konzepte: ["embedding", "benchmark", "metrik", "stichprobe", "fehlerbalken"] },
  { name: "Buecher", themen: ["Notiz", "Zitat", "Kapitel"], konzepte: ["erzaehler", "motiv", "struktur"] },
  { name: "Reisen", themen: ["Zug", "Unterkunft", "Stadt", "Wetter"], konzepte: ["fahrplan", "gepraepaeus", "regenjacke"] },
  { name: "Werkstatt", themen: ["Projekt", "Werkzeug", "Fehler"], konzepte: ["holzschraube", "lack", "saege", "zwinge"] },
  { name: "Kanal", themen: ["Kunde", "Angebot", "Einwand"], konzepte: ["preis", "termin", "vertrauen", "zusage"] },
];
const TYPEN = ["semantic", "episodic", "procedural", "reference"];

// Zipf-artige Konzeptwahl: wenige Begriffe tragen sehr viele Notizen.
function konzeptwahl(pool, rnd, anzahl) {
  const out = new Set();
  let versuch = 0;
  while (out.size < anzahl && versuch < 40) {
    versuch++;
    const i = Math.min(pool.length - 1, Math.floor(Math.pow(rnd(), 2.2) * pool.length));
    out.add(pool[i]);
  }
  return [...out];
}

// Die Personen des Haushalts und der drei Aufträge — alle erfunden.
const ANDERE = ["Tobias Reuter", "Amira Halabi", "Elif Demir", "Herr Vogt", "Jonas Weiler"];
const AUFTRAege = ["Atelier Nordhafen", "Buchhandlung Rippke", "Verein Sandbank"];

const MONATE = ["Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"];
function datum(ms) {
  const d = new Date(ms);
  return `${d.getUTCDate()}. ${MONATE[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}
/** Ein Betrag ohne neuen Zufallsgriff: aus dem Index, also reproduzierbar. */
const betrag = (i) => (12 + (i % 23)) * 5;
const wer = (i) => ANDERE[i % ANDERE.length];
const auftrag = (i) => AUFTRAege[i % AUFTRAege.length];

// Ein Satz je Feld und Thema. Die Löcher füllen Werte, die der Strom schon
// geliefert hat (Datum, Konzept, Betrag) — nie ein weiterer rnd()-Aufruf.
const SAETZE = {
  Atlas: {
    Kickoff: (s) => `Kickoff mit ${auftrag(s.i)}: wer die ${s.k[0]} betreut, steht seit ${datum(s.d)} fest`,
    Budget: (s) => `${betrag(s.i)} EUR für die ${s.k[0]} — ${wer(s.i)} hat nachgereicht, nicht ich`,
    Risiken: (s) => `Risiko notiert: wenn die ${s.k[0]} fällt, hängt die ${s.k[s.k.length - 1]} mit drin`,
    Meilensteine: (s) => `Meilenstein ${datum(s.d)}: ${s.k[0]} abgenommen von ${wer(s.i)}`,
    Partner: (s) => `${wer(s.i)} liefert die ${s.k[0]} zu, Rechnung über ${betrag(s.i)} EUR`,
  },
  Kueche: {
    Wochenplan: (s) => `Wochenplan mit ${wer(s.i)}: ${s.k[0]} freitags, Markt nur bis Donnerstag`,
    Einkauf: (s) => `Einkauf: ${betrag(s.i)} EUR, Quittung im Umschlag, ${s.k[0]} fehlt noch`,
    Reste: (s) => `Reste vom Sonntag werden ${s.k[0]} — ${wer(s.i)} mag das nicht`,
    Gast: (s) => `${wer(s.i)} kommt am ${datum(s.d)} zu essen, zwei Portionen mehr`,
  },
  Garten: {
    Beete: (s) => `Beet neu eingeteilt: ${s.k[0]} an die Nordseite, ${wer(s.i)} gräbt mit`,
    Schnitt: (s) => `Schnitt am ${datum(s.d)} — ${s.k[0]} raus, alles andere stehen lassen`,
    Giessen: (s) => `${betrag(s.i)} Liter in der Tonne, ${s.k[0]} reicht für drei Tage`,
    Boden: (s) => `Bodenprobe geschickt, Antwort auf ${s.k[0]} steht aus`,
  },
  Forschung: {
    Paper: (s) => `Paper zu ${s.k[0]} gelesen — die ${s.k[s.k.length - 1]} überzeugt mich nicht`,
    Versuch: (s) => `Versuch ${datum(s.d)}: ${s.k[0]} bei 22 Grad, Protokoll im Heft`,
    Replikation: (s) => `Replikation der ${s.k[0]} läuft, ${wer(s.i)} prüft gegen`,
    Datensatz: (s) => `Datensatz gesichert: ${betrag(s.i)} Zeilen, ${s.k[0]} ohne Ausreißer`,
  },
  Buecher: {
    Notiz: (s) => `Notiz beim Lesen: die ${s.k[0]} ab Kapitel 7 trägt alles`,
    Zitat: (s) => `Zitat notiert, ${datum(s.d)}: „Ohne die ${s.k[0]} wäre das Buch dünn."`,
    Kapitel: (s) => `Kapitel umgestellt — ${s.k[0]} kommt vor die ${s.k[s.k.length - 1]}`,
  },
  Reisen: {
    Zug: (s) => `Zug ${datum(s.d)}, ${betrag(s.i)} EUR, Sitzplatz am Fenster reserviert`,
    Unterkunft: (s) => `Unterkunft bestätigt: zwei Nächte, ${s.k[0]} im Haus, an ${wer(s.i)} gedacht`,
    Stadt: (s) => `Stadtplan: ${s.k[0]} am Samstag, Regenjacke trotzdem im Rucksack`,
    Wetter: (s) => `Wetterlage am ${datum(s.d)}: ${s.k[0]} bis Mittag, dann klar`,
  },
  Werkstatt: {
    Projekt: (s) => `Projektbank gebaut: ${s.k[0]} schleifen, Lack erst nach dem Wochenende`,
    Werkzeug: (s) => `${s.k[0]} neu (${betrag(s.i)} EUR), die alte hat Riefen hinterlassen`,
    Fehler: (s) => `Fehler notiert: ${s.k[0]} zu fest angezogen, ${wer(s.i)} hat's gesehen`,
  },
  Kanal: {
    Kunde: (s) => `${auftrag(s.i)} fragt nach ${s.k[0]} — Antwort bis ${datum(s.d)}`,
    Angebot: (s) => `Angebot an ${auftrag(s.i)}: ${betrag(s.i)} EUR, Zusage erbeten bis Monatsende, ${s.k[0]} inklusive`,
    Einwand: (s) => `Einwand von ${auftrag(s.i)}: zu teuer wegen ${s.k[0]} — Gegenrechnung liegt bei ${betrag(s.i)} EUR`,
  },
};

const ANHAENGE = {
  semantic: (s) => ` — nach der Rückfrage zur ${s.k[0]} im ${s.feld}`,
  episodic: (s) => ` — ${wer(0)} war dabei, ${s.feld.toLowerCase()} betrifft uns beide`,
  procedural: (s) => ` — Schritt für Schritt: erst ${s.k[0]}, dann ${s.k[s.k.length - 1]}`,
  reference: (s) => ` — Beleg liegt unter ${s.k[0]}, ${s.feld.toLowerCase()}`,
};

/**
 * Die Notizen, in derselben Reihenfolge und aus demselben Zufallsstrom wie der
 * A7-Füller — nur der Titel ist ein Satz statt einer Schablone.
 */
export function notizen(gesamt) {
  const rnd = mulberry32(SEED);
  const liste = [];
  const start = Date.UTC(2024, 9, 9);
  const tagMs = 86400000;
  for (let i = 0; i < gesamt; i++) {
    const feld = FELDER[i % FELDER.length];
    const thema = feld.themen[Math.floor(rnd() * feld.themen.length)];
    const linkAnzahl = 1 + Math.floor(rnd() * 3);
    const konzepte = konzeptwahl(feld.konzepte, rnd, linkAnzahl);
    const fremd = FELDER[(i + 3) % FELDER.length];
    if (rnd() < 0.18) konzepte.push(fremd.konzepte[Math.floor(rnd() * fremd.konzepte.length)]);
    const tags = [feld.name.toLowerCase(), thema.toLowerCase()];
    if (rnd() < 0.45) tags.push(konzepte[0]);
    const erstellt = start + Math.floor(rnd() * 700) * tagMs;
    const zeilen = [];
    zeilen.push(`Heute zu ${thema} im Feld ${feld.name}: ${konzepte[0]} ist der Angelpunkt.`);
    if (rnd() < 0.6) zeilen.push(`Der [[${konzepte[0]}]] haelt die Sache zusammen, ohne [[${konzepte[konzepte.length - 1]}]] ginge das nicht.`);
    if (rnd() < 0.35) zeilen.push(`Frage offen bleibt, wann der ${thema.toLowerCase()} erneut gestellt wird.`);
    const typ = TYPEN[Math.floor(rnd() * TYPEN.length)];
    // Nur hier anders als A7: der Titel ist ein Satz, kein Schablonenkürzel.
    const titel = (SAETZE[feld.name][thema] ?? SAETZE[feld.name][feld.themen[0]])({ k: konzepte, i, d: erstellt });
    const lang = rnd() < 0.22;
    const anhang = lang ? (ANHAENGE[typ] ?? ANHAENGE.semantic)({ k: konzepte, feld: feld.name }) : "";
    const confidence = (0.45 + rnd() * 0.55).toFixed(2);
    liste.push({
      type: typ,
      title: titel + anhang,
      tags,
      content: zeilen.join(" "),
      created: Math.floor(erstellt / 1000),
      confidence,
      feld: feld.name,
      thema,
      nr: i + 1,
    });
  }
  return liste;
}

/** Derselbe Bestand als Markdown-Dateien, in der Form, die A7 importiert hat. */
export function dateien(gesamt) {
  return notizen(gesamt).map((e) => {
    const front = [
      "---",
      `kepta_id: a7-${String(e.nr).padStart(5, "0")}`,
      `title: ${JSON.stringify(e.title)}`,
      `tags: [${e.tags.map((t) => JSON.stringify(t)).join(", ")}]`,
      `type: ${e.type}`,
      `created: ${e.created}`,
      `updated: ${e.created}`,
      `confidence: ${e.confidence}`,
      "---",
    ].join("\n");
    return { name: `${e.feld}/${String(e.nr).padStart(5, "0")}-${e.thema.replace(/\s+/g, "-")}.md`, content: `${front}\n\n${e.content}\n` };
  });
}

const n = parseInt(process.argv[2] || "400", 10);
const out = process.argv[3];
// Dieselbe Form wie A7 (Markdown mit Frontmatter), damit der Vergleich nicht an
// zwei verschiedenen Parse-Methoden scheitern kann.
const liste = dateien(n);
if (out) {
  fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true });
  fs.writeFileSync(out, JSON.stringify(liste));
}
const alle = liste.flatMap((d) => [...d.content.matchAll(/\[\[([^\]]+)\]\]/g)].map((m) => m[1].trim().toLowerCase()));
const titel = liste.map((d) => JSON.parse(/^title: (.*)$/m.exec(d.content)[1]));
console.log(`dateien=${liste.length} links=${alle.length} eindeutige-linkziele=${new Set(alle).size} titelMitVierstelzahl=${titel.filter((s) => /\b\d{4}\b/.test(s)).length}`);
for (const t of titel.slice(0, 4)) console.log(`  · ${t}`);
