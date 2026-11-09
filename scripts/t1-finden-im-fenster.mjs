// T1 (P8-KONKURRENZ-TESTS-1110.md): Finden in 1 500 Notizen — unsere Seite.
//
// Fixture (P8 §3 T1): 1 500 Notizen (der deterministische fps-Korpus), vier
// Begriffshaufen à 20 Notizen (Bergbahn, Leuchtturm, Schaufenster, Honigdachs)
// und 3 Stücke mit einem seltenen Wort (Kieselquarzlampe). Aufgabe: dieses Wort
// finden und den Treffer öffnen. Mass: Sekunden bis zum ersten richtigen
// Treffer, Zahl der Klicks, und was das Bild zeigt (Treffer-Nachbarschaft oder
// ganze Welt). Vier Läufe, Viewport 1 440 x 900 (P8 §4.1).
//
// Isolation: eigener Server-Port (3861), eigener CDP-Port (3871), eigenes
// HOME/Daten-Verzeichnis unter /tmp. Die Obsidian-Seite dieser Aufgabe ist auf
// diesem Rechner NICHT messbar (Befund im Papier P177) und steht dort mit Grund.
//
// Aufruf: node scripts/t1-finden-im-fenster.mjs
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const WURZEL = process.cwd();
const OBJEKT = path.join(WURZEL, "dist", "server.cjs");
const BRAVE = process.env.KEPTA_BRAVE || "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser";
const PORT = Number(process.env.KEPTA_T1_PORT || 3861);
const CDP_PORT = Number(process.env.KEPTA_T1_CDP || 3871);
const ARBEIT = "/tmp/kepta-t1-finden";
const BREIT = 1440, HOCH = 900;
const LAEUFE = 4;
const RARES = "Kieselquarzlampe";
const HAUFEN = ["Bergbahn", "Leuchtturm", "Schaufenster", "Honigdachs"];

const schlafe = (ms) => new Promise((r) => setTimeout(r, ms));
async function warteBis(fn, { maxMs = 60000, schritt = 200 } = {}) {
  const bis = Date.now() + maxMs;
  for (;;) {
    try { const v = await fn(); if (v) return v; } catch { /* noch nicht */ }
    if (Date.now() > bis) return null;
    await schlafe(schritt);
  }
}

// ---------------- der Bestand (aus scripts/fps-laeufer.mjs, unverändert) ----------------
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const FELDER = [
  { name: "Atlas", themen: ["Kickoff", "Budget", "Risiken", "Meilensteine"], konzepte: ["storage", "suche", "mandant", "schluessel", "audit", "latenz", "index", "sperrkonto"] },
  { name: "Kueche", themen: ["Wochenplan", "Einkauf", "Reste", "Gast"], konzepte: ["wuerzung", "temperatur", "messer", "ofen", "sauerteig", "ablage", "vorrat"] },
  { name: "Garten", themen: ["Beete", "Schnitt", "Giessen", "Boden"], konzepte: ["kompost", "regen", "schatten", "saat", "rankhilfe", "mulch"] },
  { name: "Forschung", themen: ["Paper", "Versuch", "Replikation", "Datensatz"], konzepte: ["embedding", "benchmark", "metrik", "stichprobe", "fehlerbalken", "revision"] },
];
const TYPEN = ["semantic", "episodic", "procedural", "reference"];

function baueKorpus(gesamt) {
  const rnd = mulberry32(0xf5a1 + gesamt);
  const start = Date.UTC(2024, 9, 9);
  const tagMs = 86400000;
  const dateien = [];
  for (let i = 0; i < gesamt; i++) {
    const feld = FELDER[i % FELDER.length];
    const thema = feld.themen[Math.floor(rnd() * feld.themen.length)];
    const zeilen = [`Heute zu ${thema} im Feld ${feld.name}.`];
    const anzahl = 3 + (rnd() < 0.17 ? 1 : 0);
    const wahl = new Set();
    let versuch = 0;
    while (wahl.size < anzahl && versuch++ < 40) wahl.add(feld.konzepte[Math.floor(rnd() * feld.konzepte.length)]);
    const kram = [...wahl];
    for (const konzept of kram) zeilen.push(`Der [[${konzept}]] haelt das mit [[${kram[0]}]].`);
    const erstellt = start + Math.floor(rnd() * 700) * tagMs;
    const tags = [feld.name.toLowerCase(), thema.toLowerCase()];
    const typ = TYPEN[Math.floor(rnd() * TYPEN.length)];
    const titel = `${feld.name} ${thema} ${String(i + 1).padStart(5, "0")}`;
    dateien.push({
      name: `${feld.name}/${String(i + 1).padStart(5, "0")}.md`,
      content: [
        "---",
        `kepta_id: fps-${String(i + 1).padStart(5, "0")}`,
        `title: ${JSON.stringify(titel)}`,
        `tags: [${tags.map((t) => JSON.stringify(t)).join(", ")}]`,
        `type: ${typ}`,
        `created: ${Math.floor(erstellt / 1000)}`,
        `updated: ${Math.floor(erstellt / 1000)}`,
        "---",
        "",
        zeilen.join(" "),
      ].join("\n"),
    });
  }
  return dateien;
}

// T1-Auflage: vier Haufen à 20 und drei Selten-Wort-Stücke, alles deterministisch.
function legeT1Auf(dateien) {
  HAUFEN.forEach((begriff, h) => {
    for (let k = 0; k < 20; k++) {
      const idx = 200 + h * 200 + k;
      if (idx >= dateien.length) break;
      const d = dateien[idx];
      d.content += `\nDer ${begriff} steht hier im Protokoll der Notiz ${idx}. Der ${begriff} wird in der Folgenotiz fortgesetzt.\n`;
    }
  });
  for (const idx of [500, 1000, 1400]) {
    const d = dateien[idx];
    const zeile = `Seltenes Wort dieser Notiz: ${RARES}. Die ${RARES} wird nur hier, in Notiz ${idx}, gewartet.`;
    d.content += `\n${zeile}\n`;
  }
  return dateien;
}

class Cdp {
  constructor(ws) { this.ws = ws; this.nr = 0; this.offen = new Map(); this.evente = []; }
  static async verbindung(url) {
    const ws = await new Promise((los, fehler) => {
      const w = new WebSocket(url);
      w.onopen = () => los(w);
      w.onerror = (e) => fehler(e.error || new Error("websocket fehlgeschlagen"));
    });
    const c = new Cdp(ws);
    ws.onmessage = (e) => {
      const n = JSON.parse(e.data);
      if (n.id && c.offen.has(n.id)) {
        const { los, fehler } = c.offen.get(n.id);
        c.offen.delete(n.id);
        if (n.error) fehler(new Error(n.error.message)); else los(n.result);
      } else if (n.method) {
        c.evente.push({ methode: n.method, params: n.params });
      }
    };
    return c;
  }
  send(e, params = {}) {
    const id = ++this.nr;
    return new Promise((los, fehler) => {
      this.offen.set(id, { los, fehler });
      this.ws.send(JSON.stringify({ id, method: e, params }));
    });
  }
}
const ausfuhren = async (cdp, ausdruck) =>
  (await cdp.send("Runtime.evaluate", { expression: ausdruck, returnByValue: true })).result?.value;

async function main() {
  if (!fs.existsSync(OBJEKT)) { console.log("Kein Gebaeude unter " + OBJEKT + " — erst bauen."); process.exitCode = 2; return; }
  if (!fs.existsSync(BRAVE)) { console.log("Kein Brave — der Pruefer braucht einen echten Viewport."); process.exitCode = 2; return; }
  for (const p of [PORT, CDP_PORT]) {
    try { await fetch(`http://127.0.0.1:${p}/`); console.log(`Port ${p} hoert schon — fremder Laeufer, Abbruch.`); process.exitCode = 2; return; } catch { /* frei */ }
  }
  fs.rmSync(ARBEIT, { recursive: true, force: true });
  fs.mkdirSync(ARBEIT, { recursive: true });

  const diener = spawn("node", [OBJEKT], {
    cwd: WURZEL,
    env: { ...process.env, HOME: path.join(ARBEIT, "h"), KEPTA_DATA_DIR: path.join(ARBEIT, "d"), KEPTA_ENCRYPTION: "off", PORT: String(PORT) },
    stdio: ["ignore", "pipe", "pipe"],
  });
  const protokoll = fs.createWriteStream(path.join(ARBEIT, "diener.log"));
  diener.stdout.pipe(protokoll); diener.stderr.pipe(protokoll, { end: true });

  let brave = null;
  try {
    const bereit = await warteBis(async () => { const r = await fetch(`http://127.0.0.1:${PORT}/api/health`); return r.ok ? await r.json() : null; }, { maxMs: 60000 });
    if (!bereit) throw new Error("Der Kapsel-Diener kam nicht hoch — " + path.join(ARBEIT, "diener.log"));
    const t0import = Date.now();
    const dateien = legeT1Auf(baueKorpus(1500));
    const importAntwort = await (await fetch(`http://127.0.0.1:${PORT}/api/import/markdown`, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ files: dateien }),
    })).json();
    console.log(`  Import: ${dateien.length} Notizen in ${((Date.now() - t0import) / 1000).toFixed(1)} s — ${JSON.stringify(importAntwort).slice(0, 120)}`);
    const bestand = await warteBis(async () => {
      const g = await (await fetch(`http://127.0.0.1:${PORT}/api/health`)).json();
      return g.count >= 1500 ? g : null;
    }, { maxMs: 60000 });
    if (!bestand) throw new Error("der Bestand erreichte 1500 nicht — " + path.join(ARBEIT, "diener.log"));
    console.log(`  Bestand: ${bestand.count} Notizen, embedded ${bestand.embeddings?.embedded}/${bestand.embeddings?.total} (die semantische Warteschlange läuft im Hintergrund — T1 ist eine Wort-Aufgabe, BM25 braucht sie nicht)`);

    brave = spawn(BRAVE, ["--headless=new", `--remote-debugging-port=${CDP_PORT}`, `--user-data-dir=${path.join(ARBEIT, "profil")}`,
      "--no-first-run", "--disable-gpu", "--hide-scrollbars", `--window-size=${BREIT},${HOCH}`, "about:blank"],
      { stdio: ["ignore", "pipe", "pipe"] });
    const ziel = await warteBis(async () => {
      const l = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`)).json();
      return l.find((z) => z.type === "page" && z.webSocketDebuggerUrl) || null;
    }, { maxMs: 90000 });
    if (!ziel) throw new Error("Kein CDP-Ziel — kein echtes Fenster, keine Messung.");
    const cdp = await Cdp.verbindung(ziel.webSocketDebuggerUrl);
    await cdp.send("Page.enable");
    await cdp.send("Runtime.enable");

    await cdp.send("Emulation.setDeviceMetricsOverride", { width: BREIT, height: HOCH, deviceScaleFactor: 1, mobile: false });
    await cdp.send("Page.navigate", { url: `http://127.0.0.1:${PORT}/` });
    await warteBis(async () => (await ausfuhren(cdp, `document.querySelectorAll('button').length`)) > 0 ? true : null, { maxMs: 90000 });
    await ausfuhren(cdp, `(()=>{localStorage.clear();sessionStorage.clear();return true})()`);
    await cdp.send("Page.navigate", { url: `http://127.0.0.1:${PORT}/` });
    await warteBis(async () => (await ausfuhren(cdp, `document.querySelectorAll('button').length`)) > 0 ? true : null, { maxMs: 90000 });
    const schritt = await warteBis(async () => ausfuhren(cdp, `/Step 1 of 4/i.test(document.body.innerText||'') ? true : null`), { maxMs: 20000 });
    if (schritt) {
      await ausfuhren(cdp, `(()=>{const b=[...document.querySelectorAll('button')].find(x=>/^\\s*Later\\s*$/i.test((x.textContent||'').trim()));if(b)b.click();return true})()`);
      await warteBis(async () => ausfuhren(cdp, `/Step 1 of 4/i.test(document.body.innerText||'') ? null : true`), { maxMs: 15000 });
    }

    const ergebnisse = [];
    for (let lauf = 1; lauf <= LAEUFE; lauf++) {
      // Feld leer machen: die alte Anfrage raus, dem Debounce Zeit lassen.
      await ausfuhren(cdp, `(()=>{const f=document.querySelector('input[placeholder*="Search"]');if(!f)throw new Error('kein Suchfeld');const s=Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set;s.call(f,'');f.dispatchEvent(new Event('input',{bubbles:true}));return true})()`);
      await schlafe(700);
      const vorher = await ausfuhren(cdp, `(document.body.innerText||'').length`);
      const feld = await ausfuhren(cdp, `(()=>{const f=document.querySelector('input[placeholder*="Search"]');if(!f)return null;const r=f.getBoundingClientRect();return {x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)}})()`);
      if (!feld) throw new Error("kein Suchfeld im Fenster");

      // T0: das echte Setzen der Anfrage (Input-Ereignis, wie ein Nutzer).
      const start = Date.now();
      await ausfuhren(cdp, `(()=>{const f=document.querySelector('input[placeholder*="Search"]');const s=Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set;s.call(f,${JSON.stringify(RARES)});f.dispatchEvent(new Event('input',{bubbles:true}));return true})()`);

      // Erster richtiger Treffer: die Treffer-Kennung zeigt eine gefilterte
      // Menge (X of N, X < N) und der Körper nennt das seltene Wort.
      const masse = await warteBis(async () => {
        const z = await ausfuhren(cdp, `(()=>{
          const t = document.body.innerText || '';
          const hitsRoh = (t.match(/([\\d,]+)\\s+hits?/)||[])[1];
          const vonRoh = (t.match(/([\\d,]+)\\s*notes/)||[])[1];
          const hits = hitsRoh ? Number(hitsRoh.replace(/,/g,'')) : null;
          const von = vonRoh ? Number(vonRoh.replace(/,/g,'')) : null;
          const da = t.includes(${JSON.stringify(RARES)});
          if (!da || !Number.isFinite(hits) || hits <= 0) return null;
          return { treffer: hits, von };
        })()`);
        return z || null;
      }, { maxMs: 20000, schritt: 30 });
      if (!masse) {
        const dia = await ausfuhren(cdp, `(()=>{
          const t = document.body.innerText || '';
          const pos = t.indexOf(${JSON.stringify(RARES)});
          return {
            wortIrgendwo: pos >= 0,
            umgebung: pos >= 0 ? t.slice(Math.max(0, pos-150), pos+200).replace(/\\n+/g,' | ') : null,
            zaehlerKandidaten: [...new Set([...t.matchAll(/of [\\d,]+|\\d+ results?|\\d+ hits?|[\\d,]+\\s*notes/g)].map(m=>m[0]))].slice(0,6),
            nichtsDa: /Nothing found|No matches/i.test(t),
            elemente: [...document.querySelectorAll('div,article,section')].filter(e => (e.textContent||'').includes(${JSON.stringify(RARES)})).length,
            auszug: t.replace(/\\n+/g,' | ').slice(0, 400),
          };
        })()`);
        throw new Error(`Lauf ${lauf}: kein richtiger Treffer sichtbar — Diagnose: ${JSON.stringify(dia)}`);
      }
      const bisTrefferMs = Date.now() - start;

      // Ein Klick auf den ersten Treffer (echter Mausgriff auf die Karte
      // unter dem Suchfeld-Block) — die Karte steht im Such-Fluss.
      const karte = await ausfuhren(cdp, `(()=>{
        const knoten = [...document.querySelectorAll('div,article,section')].filter(e => (e.textContent||'').includes(${JSON.stringify(RARES)}) && e.querySelectorAll('div,article,section').length <= 3);
        if (!knoten.length) return null;
        const k = knoten[knoten.length - 1];
        const r = k.getBoundingClientRect();
        return { x: Math.round(r.x + Math.min(r.width/2, 200)), y: Math.round(r.y + Math.min(r.height/2, 60)) };
      })()`);
      let klickMs = null;
      if (karte) {
        await cdp.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: karte.x, y: karte.y, button: "left", clickCount: 0 });
        await cdp.send("Input.dispatchMouseEvent", { type: "mousePressed", x: karte.x, y: karte.y, button: "left", clickCount: 1, buttons: 1 });
        klickMs = Date.now() - start;
        await cdp.send("Input.dispatchMouseEvent", { type: "mouseReleased", x: karte.x, y: karte.y, button: "left", clickCount: 1, buttons: 0 });
        await schlafe(600);
      }
      const nachher = await ausfuhren(cdp, `(document.body.innerText||'').length`);
      const b = await cdp.send("Page.captureScreenshot", { format: "png" });
      fs.writeFileSync(path.join(ARBEIT, `t1-lauf-${lauf}-1440.png`), Buffer.from(b.data, "base64"));
      ergebnisse.push({ lauf, bisTrefferMs, klickMs, treffer: masse.treffer, von: masse.von, klickGelandet: !!karte, LaengeVorher: vorher, LaengeNachher: nachher });
      console.log(`  Lauf ${lauf}: erster richtiger Treffer nach ${bisTrefferMs} ms (${masse.treffer} von ${masse.von} Notizen), Klick bei ${klickMs} ms, gelandet: ${karte ? "JA" : "NEIN"}, Textlänge ${vorher}→${nachher}`);
    }

    const zeiten = ergebnisse.map((e) => e.bisTrefferMs).sort((a, b) => a - b);
    const median = zeiten[Math.floor(zeiten.length / 2)];
    console.log(`\n  T1 unsre Seite (1 500 Notizen, 1 440 x 900, ${LAEUFE} Läufe): Median ${median} ms bis zum ersten richtigen Treffer, Klicks 1, Treffer-Kennung ${ergebnisse[0].treffer} von ${ergebnisse[0].von}`);
    fs.writeFileSync(path.join(ARBEIT, "t1-masse.json"), JSON.stringify({ port: PORT, breite: `${BREIT}x${HOCH}`, laeufe: ergebnisse, medianMs: median }, null, 2));
    console.log("  Protokoll-Ereignisse: " + cdp.evente.filter((e) => e.methode === "Log.entryAdded" || e.methode === "Runtime.exceptionThrown").length);
  } catch (e) {
    console.log("FEHLER: " + e.message);
    process.exitCode = 1;
  } finally {
    if (brave) brave.kill("SIGTERM");
    diener.kill("SIGTERM");
  }
}
main();
