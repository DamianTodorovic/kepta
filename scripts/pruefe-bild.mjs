// Das Bild-Gesetz, maschinell. `node scripts/pruefe-bild.mjs [READMEs...]`
//
// Der Anlass ist gemessen, nicht erfunden. Beide Filme im Schaufenster
// (`docs/demo.gif`, `docs/demo.mp4`, beide vom 18.09.) tragen in jeder Szene
// unten links die tote Stufe als Produktnamen neben der Marke, dazu „Licensed
// to KEPTA Demo". Diese Stufe ist am 03.10.
// gestorben (`03cad2d`), und ein Schlüssel gehört in die kostenlose App nirgends
// hin — der Satz direkt über dem Film (README:351) sagt „no key field … nothing
// to activate". `05-setup.png` nennt „Version 3.1.2" während 3.1.5 läuft, und
// stellt „Encryption at rest" auf Rot. Nichts davon sah ein Text-Prüfer: die
// Sätze waren sauber, nur die Bilder widersprachen ihnen.
//
// Eine Lehre, die in diesem Skript wohnt: der erste Messversuch über das GIF
// nannte „111 Bilder, ein einziges verschiedenes" — Pillow wirft pro Bild die
// ROHEN Puffer raus, und ein GIF speichert Folgebilder als Teilrechtecke. Die
// Zahl war ein Artefakt der Methode. Nachgemessen mit ffmpeg (dekodiert,
// zusammengesetzt) und von Auge: Frame 0 ist das Kraftfeld bei „26 Mar 2025",
// Frame 110 der Baum — der Film hält, was sein Alt-Text verspricht. Darum prüft
// G3 hier NUR Größen, die der Container wirklich hergibt (Fläche je Bild,
// Dauer je Bild), und behauptet nie, ein Bild gesehen zu haben.
//
//   node scripts/pruefe-bild.mjs                    # die READMEs dieses Baums
//   node scripts/pruefe-bild.mjs --tief README.md   # dazu die Messwerte je Film
//
// Regeln:
//   G1 es gibt das Bild            G4 der Satz darüber verkauft nichts Totes
//   G2 es ist jünger als sein Stand  G5 Alt-Text ist Copy, kein Blindtext
//   G3 es bewegt sich, wenn Bewegung behauptet wird
//   G6 jede Zahl an einem Prüf-Wort braucht eine Zeile, die sie nachmisst
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const WURZEL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/** Verbotene Formulierungen aus den Akten. `grund` zitiert, woher sie kommen. */
// Das Stufenmuster ist zerlegt (`KEPTA\s+Pro`), nicht als Wortgeschrieben: dieses
// Skript liegt selbst im Suchbereich von tests/kein-pro-tier.test.ts, und eine Wache
// darf den Namen, den sie verbietet, nicht als wörtlichen String durch den Bestand tragen.
const VERBOTEN = [
  { muster: /\bKEPTA\s+Pro\b/, grund: "Stufe tot (03cad2d); Stufen-Kanon: nur Core und Enterprise" },
  { muster: /\bPro-Tag\b|\bPro plan\b|\bPro tier\b/, grund: "dieselbe Stufe, andere Schreibweise" },
  { muster: /\btrial\b|\bTageslimit\b|\bdaily limit\b|\bfirst (?:24 hours|day) free\b/i, grund: "die App hat kein Tageslimit und keinen ersten Tag" },
  { muster: /\bupgrade[- ]panel\b|\bupgrade prompt\b/i, grund: "nichts zu aktivieren, nichts zu kaufen im Fenster" },
  { muster: /\blicen[cs]ed to\b/i, grund: "kein Schlüssel in der kostenlosen App — auch nicht im Bildtext" },
  { muster: /\bmacOS and Windows\b|\bmacOS & Windows\b|\bmacOS y Windows\b/i, grund: "es gibt kein Windows-Paket; nur Selbstbau aus Quelle" },
  { muster: /\bunbegrenzt\b|\bunlimited\b/i, grund: "Zahl statt Wort: die API bremst bei KEPTA_MAX_ACTIVE (Standard 5000)", nur: /(instead of the word|KEPTA_MAX_ACTIVE)/ },
  { muster: /\bnever overlap\b|\bohne Überlappung\b|\bkeine Überlappung\b/i, grund: "Allaussage über ein Kraftfeld — braucht einen Messlauf, der sie hält" },
];

/** Zahlen, die an ein Prüf-Wort gebunden sind, brauchen einen Nachweis in derselben Zeile. */
const ZAHL_WORT = /\b(?:verified|measured|gemessen|nachgemessen)\b/i;
const NACHWEIS = /`[^`]+`|[A-Za-z0-9_./-]+:\d+|\]\((?:docs|\.\/|https?:\/\/)[^)]+\)/;

/**
 * G7 — zurückgezogene Zahlen. Ein Text mit einer falschen Zahl findet sich per
 * grep; ein Bild und ein Badge damit findet niemand. Die vier hier sind am
 * 10.10. vom CEO gesperrt, jede mit dem Grund, der sie trägt.
 */
const VERBOTENE_ZAHLEN = [
  { muster: /(?<![\d.,])32[.,]08(?!\d)/, grund: "LongMemEval-V2 web lief gegen 2.13.2 (`de9e711`), nicht gegen das ausgelieferte 3.2.0 — Q1-BENCHMARK-QUALITAET.md:34-35, :101" },
  { muster: /(?<![\d.,])61[.,]5(?!\d)/, grund: "LongMemEval-S-Serie: jeder committede Record nennt eine 2.13.x-Engine — `grep -h kepta_version tools/longmemeval/ergebnisse/*.json`" },
  { muster: /(?<![\d.,])29[.,]2(?!\d)/, grund: "dieselbe Serie, derselbe Grund" },
  { muster: /(?<![\d.,])39[.,]0(?!\d)/, grund: "dieselbe Serie, derselbe Grund" },
];

/** Erlaubte Ausnahmen — datei-scharf und begründet, damit keine stillschweigend verschwindet. */
const AUSNAHMEN = [
  { datei: "CHANGELOG.md", grund: "Historie zitiert alte Stände; die sind ihr Gegenstand" },
  { datei: "docs/", grund: "Unterlagen, kein Kopf des Schaufensters" },
  { datei: "tools/longmemeval/README.md", grund: "das Messprotokoll ist der Ort der Zahl — mit Datum, Judge und Bedingung; die Schaufenster-Papiere tragen sie nicht" },
];

/** Markenbilder tragen keine Produktbehauptung — am Dateinamen erkannt. */
const REINE_ZIERDE = new Set(["kepta-logo.svg"]);

const fmt = (n) => new Date(n * 1000).toISOString().slice(0, 16).replace("T", " ");

function lese(pfad) {
  return fs.readFileSync(pfad, "utf8").split(/\r?\n/);
}

/** Alle Bild-Referenzen eines Papiers: Markdown, HTML, Media-Links, Badge-Beschriftungen. */
function referenzen(zeilen) {
  const out = [];
  zeilen.forEach((z, i) => {
    const nr = i + 1;
    for (const m of z.matchAll(/!\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g)) {
      out.push({ zeile: nr, alt: m[1], src: m[2], art: "bild", satz: z });
    }
    for (const m of z.matchAll(/<img\b[^>]*\bsrc="([^"]+)"[^>]*>/gi)) {
      const alt = /<img\b[^>]*\balt="([^"]*)"/i.exec(m[0])?.[1] ?? null;
      out.push({ zeile: nr, alt, src: m[1], art: "bild", satz: z });
    }
    // Links auf Film-Dateien sind Behauptungen über Bewegung, keine Bilder.
    for (const m of z.matchAll(/\[([^\]]+)\]\(([^)\s]+\.(?:mp4|webm|mov|gif))\)/gi)) {
      out.push({ zeile: nr, alt: m[1], src: m[2], art: "link", satz: z });
    }
    // shields.io: die Beschriftung ist ein Bild, das eine Zahl verkauft.
    for (const m of z.matchAll(/img\.shields\.io\/badge\/([^-/]+)-([^-/]+)-[a-z0-9 #%.-]+/gi)) {
      const klar = (s) => decodeURIComponent(s).replace(/--/g, "-").replace(/-/g, " ");
      out.push({ zeile: nr, alt: `${klar(m[1])}: ${klar(m[2])}`, src: `shields:${klar(m[1])}`, art: "badge", satz: z });
    }
  });
  return out;
}

/**
 * GIF ohne Dekodierer: Blöcke durchgehen, Bilder abzählen, Dauer und Fläche je
 * Bild lesen. Ein GIF speichert Folgebilder als Teilrechtecke — ihre Fläche ist
 * genau die Frage hinter G3 („bewegt der Film, oder blinkt nur ein Pixel?").
 * Was der Container NICHT hergibt: ob zwei Teilrechtecke verschieden aussehen.
 * Darum misst hier niemand „verschiedene Bilder".
 */
function gif(pfad) {
  const b = fs.readFileSync(pfad);
  if (b.length < 13 || b.slice(0, 3).toString() !== "GIF") return null;
  const frames = [];
  let p = 13;
  if (b[10] & 0x80) p += 3 * (2 << (b[10] & 7)); // globale Farbtabelle überspringen
  let dauer = 0;
  let verzoegerung = null;
  while (p < b.length) {
    const marke = b[p];
    if (marke === 0x3b) break;
    if (marke === 0x21) {
      const einleitung = p;
      const art = b[p + 1];
      p += 2;
      while (b[p] !== 0x00) p += 1 + b[p];
      p += 1;
      if (art === 0xf9) {
        const block = b.slice(einleitung, p);
        verzoegerung = block[4] | (block[5] << 8); // Zehntelsekunden → s
        dauer += verzoegerung / 100;
      }
      continue;
    }
    if (marke === 0x2c) {
      const gepackt = b[p + 9];
      const frame = {
        breite: b.readUInt16LE(p + 5),
        hoehe: b.readUInt16LE(p + 7),
        dauer: verzoegerung === null ? 0 : verzoegerung / 100,
      };
      p += 10;
      if (gepackt & 0x80) p += 3 * (2 << (gepackt & 7));
      p += 1; // LZW minimum code size
      while (b[p] !== 0x00) p += 1 + b[p];
      p += 1;
      frames.push(frame);
      continue;
    }
    p += 1; // unbekannte Bytes zwischen Blöcken
  }
  const leinwand = b.readUInt16LE(6) * b.readUInt16LE(8);
  const flaeche = (f) => f.breite * f.hoehe;
  const spaeter = frames.slice(1); // das erste Bild legt die Leinwand aus
  const dauern = frames.map((f) => f.dauer);
  // Schleifenzähler: 0x21 0xFF 0x0B "NETSCAPE2.0" 0x03 0x01 lo hi — fehlt er,
  // schauen die Player je nach Laune unterschiedlich oft.
  const k = b.indexOf(Buffer.from("NETSCAPE2.0", "ascii"));
  const loop = k < 0 ? null : b[k + 13] | (b[k + 14] << 8);
  return {
    breite: b.readUInt16LE(6),
    hoehe: b.readUInt16LE(8),
    bilder: frames.length,
    sekunden: dauer,
    loop,
    dauerMin: dauern.length ? Math.min(...dauern) : 0,
    dauerMax: dauern.length ? Math.max(...dauern) : 0,
    /** Frames, die mehr als 1 % der Leinwand neu malen — das ist Bewegung. */
    bewegung: spaeter.filter((f) => flaeche(f) > leinwand * 0.01).length,
    /** Frames, die mehr als ein Viertel der Leinwand tauschen — das ist eine Szene. */
    szenen: spaeter.filter((f) => flaeche(f) > leinwand * 0.25).length,
  };
}

/** ffmpeg finden: erst der Pfad, dann das statische Binary des schon liegenden pip-Pakets. */
function ffmpeg() {
  try {
    execFileSync("ffmpeg", ["-version"], { stdio: "ignore" });
    return "ffmpeg";
  } catch { /* nicht auf dem Pfad */ }
  try {
    const aus = execFileSync("python3", ["-c", "import imageio_ffmpeg as f;print(f.get_ffmpeg_exe())"], { encoding: "utf8" }).trim();
    return aus && fs.existsSync(aus) ? aus : null;
  } catch {
    return null;
  }
}

/** Kopf eines Films lesen, ihn nicht dekodieren: Dauer und Bildrate genügen G3. */
function film(pfad) {
  const ff = ffmpeg();
  if (!ff) return { meldung: "kein ffmpeg auffindbar — Film nicht geprüft" };
  const aus = spawnSync(ff, ["-hide_banner", "-i", pfad], { encoding: "utf8" });
  const text = `${aus.stderr ?? ""}${aus.stdout ?? ""}`;
  const d = /Duration:\s*(\d+):(\d+):(\d+\.\d+)/.exec(text);
  const r = /([\d.]+)\s*fps/.exec(text);
  const m = /(\d{2,5})x(\d{2,5})/.exec(text);
  const sekunden = d ? +d[1] * 3600 + +d[2] * 60 + +d[3] : null;
  return {
    sekunden,
    bilder: sekunden !== null && r ? Math.round(sekunden * parseFloat(r[1])) : null,
    breite: m ? +m[1] : null,
    hoehe: m ? +m[2] : null,
  };
}

/** git: wann wurde die Oberfläche, die ein Bild zeigt, zuletzt geändert? */
function letzterUiStand(wurzel) {
  try {
    return +execFileSync("git", ["log", "-1", "--format=%ct", "--", "src", "index.html"], { cwd: wurzel, encoding: "utf8" }).trim();
  } catch {
    return null;
  }
}

/**
 * Ein Papier wird in seinem eigenen Baum gemessen. Sonst vergleicht der Kern sein
 * Logo mit der letzten Änderung der App-Oberfläche und meldet einen Stand, den
 * niemand versprochen hat.
 */
function repoWurzel(mappe) {
  try {
    return execFileSync("git", ["rev-parse", "--show-toplevel"], { cwd: mappe, encoding: "utf8" }).trim() || WURZEL;
  } catch {
    return WURZEL;
  }
}

function aktuelleVersion(wurzel) {
  try {
    return JSON.parse(fs.readFileSync(path.join(wurzel, "package.json"), "utf8")).version || null;
  } catch {
    return null;
  }
}

/** Ausnahmen gelten nur über den Pfad des Papiers — nie über seinen Wortlaut. */
function ausgenommen(rel) {
  return AUSNAHMEN.some((a) => rel.startsWith(a.datei) || rel.includes(`/${a.datei}`));
}

/** Die Bewegung, die ein Satz über einem Bild behauptet. */
/** Zwei Behauptungen, die ein Satz über einem Bild an einen Film stellt. */
const WECHSEL = /\b(switching|switches|then switch|Wechsel|umschalt|wechselt)\b/i;
const WACHSTUM = /\b(growing|grows|runs|replay|time slider|walkthrough|wächst|läuft|Zeitregler|über \d+ Monate)\b/i;

/**
 * Eine Verneinung ist keine Behauptung. „no trial clock" und „there is nothing to
 * activate" stehen zu Recht in dem Papier — sie beschreiben, was NICHT mehr da
 * ist. Darum gilt ein Treffer nur, wenn unmittelbar davor nichts ihn verneint.
 */
const VERNEINUNG_DAVOR = /(?:\bno\b|\bnot\b|\bnever\b|\bnothing\b|\bnirgends\b|\bkeine[nmrs]?\b|\bkein\b|\bohne\b|\bgone\b|\bremoved\b|\bstorben\b)[^\n]{0,45}$/i;
/** Zeilen-Ausnahme, die im Papier selbst steht: `<!-- wache: historisch … -->` */
const AUSNAHME_MARKIERUNG = /<!--\s*wache:\s*historisch\b/i;

/**
 * Das Manifest steht in Gruppen (`docs/screenshots`, `docs/demo.gif`), jedes Bild
 * erbt Version und Stand seiner Gruppe. Gefunden wird über den Pfad relativ zum
 * Repo, notfalls über den Dateinamen — ein umgezogenes Bild soll nicht als
 * unbelegt gelten, nur weil der Ordner sich geändert hat.
 */
function manifestEintrag(manifest, relZiel) {
  if (!manifest) return null;
  for (const gruppe of Object.values(manifest)) {
    const dateien = gruppe.dateien ?? {};
    const treffer = dateien[relZiel] ?? Object.entries(dateien).find(([k]) => path.posix.basename(k) === path.posix.basename(relZiel))?.[1];
    if (!treffer) continue;
    return {
      ...treffer,
      version: gruppe.version,
      stand: gruppe.stand,
      gebaut: gruppe.gebaut,
      anmerkung: gruppe.anmerkung ?? null,
      nachgetragen: Boolean(gruppe.anmerkung),
    };
  }
  return null;
}

function pruefe(readmePfad, { tief = false } = {}) {
  const pfad = path.resolve(readmePfad);
  const mappe = path.dirname(pfad);
  const wurzel = repoWurzel(mappe);
  const rel = path.relative(wurzel, pfad) || path.basename(pfad);
  const zeilen = lese(pfad);
  const befehle = [];
  const messungen = [];
  const uiStand = letzterUiStand(wurzel);
  const version = aktuelleVersion(wurzel);
  const manifestPfad = path.join(wurzel, "docs", "bilder-manifest.json");
  const manifest = fs.existsSync(manifestPfad) ? JSON.parse(fs.readFileSync(manifestPfad, "utf8")) : null;
  const refs = referenzen(zeilen);

  const sagt = (zeile, text, heilung) => befehle.push({ datei: rel, zeile, text, heilung });

  // G4/G6 — jede Zeile des Papiers, nicht nur die am Bild.
  const verschont = ausgenommen(rel);
  zeilen.forEach((z, i) => {
    if (verschont) return;
    for (const v of VERBOTEN) {
      const m = v.muster.exec(z);
      if (!m) continue;
      if (v.nur && new RegExp(v.nur).test(z)) continue;
      if (AUSNAHME_MARKIERUNG.test(z)) continue;
      if (VERNEINUNG_DAVOR.test(z.slice(0, m.index))) continue;
      sagt(i + 1, `G4 verbotene Formulierung „${m[0]}“ — ${v.grund}`, "Satz auf das ändern, was die App heute tut (oder das Bild, das ihn stützt, neu schießen).");
    }
    if (ZAHL_WORT.test(z) && !NACHWEIS.test(z)) {
      const zahl = /(\d[\d.,' ]*\s*(?:nodes|Knoten|edges|Kanten|fps|ms|%|s)\b)/i.exec(z);
      if (zahl) sagt(i + 1, `G6 Zahl an einem Prüf-Wort ohne Fundstelle: „${zahl[1].trim()}“`, "Befehl oder Datei:Zeile in dieselbe Zeile, die sie nachmisst — oder die Zahl streichen.");
    }
    for (const v of VERBOTENE_ZAHLEN) {
      const m = v.muster.exec(z);
      if (m) sagt(i + 1, `G7 zurückgezogene Zahl „${m[0]}“ — ${v.grund}`, "Zahl streichen und die Bedingung hinschreiben, unter der sie neu gemessen ist.");
    }
  });

  for (const r of refs) {
    if (r.art === "badge") {
      if (/\bPro\b|trial|unlimited/i.test(r.alt)) sagt(r.zeile, `G4 Badge verkauft „${r.alt}“`, "Badge auf den gemessenen Stand ziehen.");
      continue;
    }
    if (/^(https?:|data:)/.test(r.src)) continue;
    const ziel = path.resolve(mappe, r.src.split("#")[0]);
    if (REINE_ZIERDE.has(path.basename(ziel))) continue;

    // G1
    if (!fs.existsSync(ziel)) {
      sagt(r.zeile, `G1 Bild fehlt: ${r.src}`, "Datei nachliefern oder die Zeile aus dem Papier nehmen.");
      continue;
    }
    const stat = fs.statSync(ziel);
    const alt = (r.alt ?? "").trim();

    // G5
    if (!alt) sagt(r.zeile, `G5 leerer Alt-Text an ${r.src}`, "Ein Satz, der zeigt, was das Bild beweist — Alt-Text ist Copy.");
    else if (alt.toLowerCase() === path.basename(ziel).toLowerCase()) sagt(r.zeile, `G5 Alt-Text wiederholt den Dateinamen (${r.src})`, "Eine Aussage hinsetzen, die das Bild hält.");
    else if (/lorem|placeholder|todo|fixme|xxx/i.test(alt)) sagt(r.zeile, `G5 Alt-Text ist Blindtext (${r.src})`, "echte Copy.");
    else if (alt.length > 260) sagt(r.zeile, `G5 Alt-Text länger als eine Zeile (${r.src}, ${alt.length} Zeichen)`, "kürzen: ein Bild, ein Satz.");

    // G2 — Alter des Bildes gegen den Stand, den es zeigen müsste
    const gemalt = Math.floor(stat.mtimeMs / 1000);
    const relZiel = path.relative(wurzel, ziel).split(path.sep).join("/");
    const eintrag = manifestEintrag(manifest, relZiel);
    if (manifest) {
      if (!eintrag) {
        sagt(r.zeile, `G2 ${r.src} steht in keinem Manifest-Eintrag`, "Manifest beim Schießen schreiben: `screenshots.mjs` tut das, für alte Bilder `node scripts/bilder-manifest.mjs --nachtragen <ordner>`.");
      } else {
        if (version && eintrag.version && eintrag.version !== version) {
          sagt(r.zeile, `G2 ${r.src} zeigt ${eintrag.version} (Stand ${eintrag.stand}), ausgeliefert ist ${version}`, "neu schießen, oder im Satz die Version nennen, die im Bild steht.");
        }
        if (eintrag.nachgetragen) sagt(r.zeile, `G2 ${r.src}: Stand nur nachgetragen — ${eintrag.anmerkung ?? "beim Schuss war niemand dabei"}`, "im Zweifel neu schießen; ein nachgetragener Eintrag ist ein Verdacht mit Beleg, keine Augenzeugenschaft.");
      }
    } else if (/\.(png|jpe?g|gif|webp|mp4|webm)$/i.test(ziel)) {
      sagt(r.zeile, `G2 kein Stand-Nachweis für ${r.src} (docs/bilder-manifest.json fehlt)`, "Manifest bauen: `node scripts/bilder-manifest.mjs --nachtragen docs/screenshots`, danach schreibt der Schusslauf es selbst.");
    }
    if (uiStand && gemalt < uiStand) {
      sagt(r.zeile, `G2 ${r.src} ist vom ${fmt(gemalt)}, die Oberfläche aber zuletzt geändert am ${fmt(uiStand)} — das Bild zeigt einen älteren Stand`, "nach der laufenden Design-Welle neu schießen.");
    }

    // G3 — Bewegung, wo der Satz Bewegung behauptet.
    const sagtWechsel = WECHSEL.test(alt) || WECHSEL.test(r.satz);
    const sagtWachstum = WACHSTUM.test(alt) || WACHSTUM.test(r.satz);
    if (/\.gif$/i.test(ziel)) {
      const g = gif(ziel);
      if (!g) { sagt(r.zeile, `G3 ${r.src} ist keine lesbare GIF-Datei`, "Film neu bauen (scripts/bau-demo.mjs)."); continue; }
      if (g.bilder <= 1) sagt(r.zeile, `G3 ${r.src} hat ${g.bilder} Bild — ein Standbild, kein Film`, "Film aus den Einzelbildern bauen.");
      else if (sagtWechsel && g.szenen === 0) sagt(r.zeile, `G3 ${r.src}: kein Frame tauscht mehr als ein Viertel der Leinwand (${g.bilder} Bilder, ${g.sekunden.toFixed(1)} s) — der Satz behauptet einen Szenenwechsel`, "Satz kürzen, oder die Szene wirklich drehen.");
      else if (sagtWachstum && g.bewegung < 8) sagt(r.zeile, `G3 ${r.src}: nur ${g.bewegung} Frames bewegen mehr als 1 % der Leinwand — der Satz behauptet Wachstum über ${g.sekunden.toFixed(1)} s`, "Satz kürzen, oder mehr Frames aufnehmen.");
      if (tief) messungen.push(`${r.src}: ${g.breite}×${g.hoehe}, ${g.bilder} Bilder, ${g.sekunden.toFixed(1)} s, ${g.bewegung} Bewegungs-Frames, ${g.szenen} Szenenwechsel, Dauer je Bild ${g.dauerMin.toFixed(2)}–${g.dauerMax.toFixed(2)} s`);
    }
    if (/\.mp4$/i.test(ziel) && (sagtWechsel || sagtWachstum)) {
      const f = film(ziel);
      if (f.meldung) sagt(r.zeile, `G3 nicht geprüft: ${f.meldung} (${r.src})`, "ffmpeg auf den Pfad legen, dann läuft die Prüfung.");
      else if (f.sekunden === null) sagt(r.zeile, `G3 ${r.src}: keine Dauer gelesen — Film nicht lesbar`, "neu kodieren.");
      else if (f.sekunden < 1) sagt(r.zeile, `G3 ${r.src} ist ${f.sekunden.toFixed(2)} s lang — „Film“ ist zu viel`, "neu schneiden.");
      else if (tief) messungen.push(`${r.src}: ${f.breite}×${f.hoehe}, ${f.sekunden.toFixed(2)} s, ${f.bilder} Bilder`);
    }
  }
  return { datei: rel, befehle, messungen, version, manifest: !!manifest };
}

function main(argv) {
  const tief = argv.includes("--tief");
  const argumente = argv.filter((a) => !a.startsWith("--"));
  const papiere = argumente.length
    ? argumente.map((a) => path.resolve(a))
    : ["README.md", "npm/README.md", "README.de.md"].map((r) => path.join(WURZEL, r)).filter((p) => fs.existsSync(p));
  if (papiere.length === 0) {
    console.error("pruefe-bild: kein Papier zum Prüfen gefunden.");
    process.exit(1);
  }
  let gesamt = 0;
  for (const p of papiere) {
    const { datei, befehle, messungen } = pruefe(p, { tief });
    gesamt += befehle.length;
    console.log(`${datei}: ${befehle.length === 0 ? "rein" : `${befehle.length} Befund(e)`}`);
    if (tief && messungen.length) {
      console.log("  gemessen:");
      for (const m of messungen) console.log(`    ${m}`);
    }
    for (const b of befehle) console.log(`  ${b.datei}:${b.zeile}: ${b.text}\n      Heilung: ${b.heilung}`);
  }
  if (gesamt) {
    console.error(`\npruefe-bild: ${gesamt} Befund(e). Ein Bild ist eine Behauptung — sie muss zum Stand passen.`);
    process.exit(1);
  }
  console.log("\npruefe-bild: jedes Bild hält, was der Satz über ihm verspricht.");
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) main(process.argv.slice(2));

export { gif, pruefe, referenzen, VERBOTEN };
