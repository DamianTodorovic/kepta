// Der leere Fall im echten Fenster — P176 (#98/P120): das Vektor-Bein schweigt
// seit dem Boden-Flicken nicht mehr still, wenn die beste Aehnlichkeit unter dem
// absoluten Boden (0,58) liegt. Diese Fahrt prueft im echten Fenster (echter
// Viewport, echtes nomic-Embedding von Ollama, isolierte Kapsel):
//
//   Phase "leer":    leerer Store, semantische Anfrage -> der Hinweis P47
//                    ("Nothing found for ...") erscheint, frei anfassbar,
//                    ohne Overlay, bei 1440 und 390 px.
//   Phase "gefuellt": drei Notizen (Server, Kochen, Fitness) gegen die Anfrage
//                    "quantum entanglement equations" — BM25 findet nichts, der
//                    beste Cosinus liegt unter 0,58 (im Protokoll mitgeloggt) —
//                    die Flaeche zeigt den besten Kandidaten statt Stille.
//
// Aufruf: node scripts/leerer-fall-im-fenster.mjs
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const WURZEL = process.cwd();
const OBJEKT = path.join(WURZEL, "dist", "server.cjs");
const BRAVE = process.env.KEPTA_BRAVE || "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser";
const PORT = Number(process.env.KEPTA_LEER_PORT || 3844);
const CDP_PORT = Number(process.env.KEPTA_LEER_CDP || 3854);
const ARBEIT = "/tmp/kepta-leerer-fall";
const BREITEN = [[1440, 900], [390, 844]];
const HINWEIS = "Nothing found for";
const ANFRAGE = "quantum entanglement equations";

const schlafe = (ms) => new Promise((r) => setTimeout(r, ms));
async function warteBis(fn, { maxMs = 60000, schritt = 200 } = {}) {
  const bis = Date.now() + maxMs;
  for (;;) {
    try { const v = await fn(); if (v) return v; } catch { /* noch nicht */ }
    if (Date.now() > bis) return null;
    await schlafe(schritt);
  }
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
    const gesund = await warteBis(async () => { const r = await fetch(`http://127.0.0.1:${PORT}/api/health`); return r.ok ? await r.json() : null; }, { maxMs: 60000 });
    if (!gesund) throw new Error("Der Kapsel-Diener kam nicht hoch — " + path.join(ARBEIT, "diener.log"));
    console.log(`  Diener: Version ${gesund.version}, Bestand ${gesund.count}`);

    brave = spawn(BRAVE, ["--headless=new", `--remote-debugging-port=${CDP_PORT}`, `--user-data-dir=${path.join(ARBEIT, "profil")}`,
      "--no-first-run", "--disable-gpu", "--hide-scrollbars", `--window-size=${BREITEN[0][0]},${BREITEN[0][1]}`, "about:blank"],
      { stdio: ["ignore", "pipe", "pipe"] });
    const ziel = await warteBis(async () => {
      const l = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`)).json();
      return l.find((z) => z.type === "page" && z.webSocketDebuggerUrl) || null;
    }, { maxMs: 90000 });
    if (!ziel) throw new Error("Kein CDP-Ziel — kein echtes Fenster, keine Messung.");
    const cdp = await Cdp.verbindung(ziel.webSocketDebuggerUrl);
    await cdp.send("Page.enable");
    await cdp.send("Runtime.enable");
    await cdp.send("Log.enable");

    const seite = async (breit, hoch) => {
      await cdp.send("Emulation.setDeviceMetricsOverride", { width: breit, height: hoch, deviceScaleFactor: 1, mobile: false });
      await cdp.send("Page.navigate", { url: `http://127.0.0.1:${PORT}/` });
      await warteBis(async () => (await ausfuhren(cdp, `document.querySelectorAll('button').length`)) > 0 ? true : null, { maxMs: 90000 });
      await ausfuhren(cdp, `(()=>{localStorage.clear();sessionStorage.clear();return true})()`);
      await cdp.send("Page.navigate", { url: `http://127.0.0.1:${PORT}/` });
      await warteBis(async () => (await ausfuhren(cdp, `document.querySelectorAll('button').length`)) > 0 ? true : null, { maxMs: 90000 });
      const schritt = await warteBis(async () => ausfuhren(cdp, `/Step 1 of 4/i.test(document.body.innerText||'') ? true : null`), { maxMs: 20000 });
      if (schritt) {
        const spaeter = await ausfuhren(cdp, `(()=>{const b=[...document.querySelectorAll('button')].find(x=>/^\\s*Later\\s*$/i.test((x.textContent||'').trim()));if(!b)return null;b.click();return true})()`);
        if (!spaeter) throw new Error("der Assistent liess sich nicht mit Later schliessen");
        await warteBis(async () => ausfuhren(cdp, `/Step 1 of 4/i.test(document.body.innerText||'') ? null : true`), { maxMs: 15000 });
      }
    };

    const frageStellen = async (text) => {
      await ausfuhren(cdp, `(()=>{const f=document.querySelector('input[placeholder*="Search"]');if(!f)throw new Error('kein Suchfeld');return true})()`);
      await ausfuhren(cdp, `(()=>{const f=document.querySelector('input[placeholder*="Search"]');const s=Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set;s.call(f,${JSON.stringify(text)});f.dispatchEvent(new Event('input',{bubbles:true}));return true})()`);
    };

    const zustand = () => ausfuhren(cdp, `(()=>{
      const t = document.body.innerText || '';
      const hinweis = t.includes(${JSON.stringify(HINWEIS)});
      // Der Mittelpunkt des Hinweis-Blocks muss den Hinweis treffen — ein Overlay
      // dahinter faellt hier durch, nicht erst im Bild.
      let frei = false;
      if (hinweis) {
        const knoten = [...document.querySelectorAll('p,h3,div')].filter(e => e.children.length === 0 && (e.textContent||'').includes(${JSON.stringify(HINWEIS)}));
        if (knoten.length) {
          knoten[knoten.length - 1].scrollIntoView({ block: 'center' });
          const r = knoten[knoten.length - 1].getBoundingClientRect();
          const e = document.elementFromPoint(r.x + r.width/2, r.y + r.height/2);
          frei = !!e && (e === knoten[knoten.length-1] || knoten[knoten.length-1].contains(e));
        }
      }
      const ueberlaufQuer = document.documentElement.scrollWidth - document.documentElement.clientWidth;
      return { hinweis, frei, ueberlaufQuer, auszug: t.slice(0, 700) };
    })()`);

    // ---- Phase "leer": leerer Store, der P47-Hinweis im echten Fenster ----
    for (const [breit, hoch] of BREITEN) {
      await seite(breit, hoch);
      await frageStellen(ANFRAGE);
      const da = await warteBis(async () => {
        const z = await zustand();
        return z.hinweis ? z : null;
      }, { maxMs: 20000 });
      if (!da) throw new Error(`(${breit}px) der P47-Hinweis erschien im leeren Store nicht`);
      if (!da.frei) throw new Error(`(${breit}px) der Mittelpunkt des Hinweises trifft den Hinweis nicht — etwas liegt darueber`);
      console.log(`  Phase leer ${breit}x${hoch}: Hinweis DA, frei anfassbar: ${da.frei ? "JA" : "NEIN"}, Ueberlauf quer: ${da.ueberlaufQuer}px`);
      console.log("    " + (da.auszug.split("\n").find((z) => z.includes(HINWEIS)) || "").trim());
      const b = await cdp.send("Page.captureScreenshot", { format: "png" });
      fs.writeFileSync(path.join(ARBEIT, `leer-${breit}.png`), Buffer.from(b.data, "base64"));
    }

    // ---- Store fuellen: drei Notizen, ganz andere Themen als die Anfrage ----
    for (const n of [
      { title: "Serverzugang und Passwort", content: "Der Produktionsserver laeuft auf Hetzner, Port 22 ist gesperrt, Zugang nur mit dem Schlüsselbund." },
      { title: "Carbonara Zutaten", content: "Guanciale, Pecorino, Eigelb, Spaghetti. Kein Sahne, niemals Zwiebeln." },
      { title: "Fitness Trainingsplan", content: "Montag Ruecken, Mittwoch Brust, Freitag Beine. Dehnen danach nicht vergessen." },
    ]) {
      const r = await fetch(`http://127.0.0.1:${PORT}/api/memories`, {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(n),
      });
      if (!r.ok) throw new Error("Notiz wurde nicht angenommen: " + r.status);
    }
    const gefuellt = await warteBis(async () => {
      const g = await (await fetch(`http://127.0.0.1:${PORT}/api/health`)).json();
      // embedded, nicht total: total zaehlt die Zeilen, embedded die fertigen
      // Vektoren — der erste Lauf wartete auf total und fragte in einen
      // noch nicht gefuellten Index (Scheiben im Bild: "0 of 6 pieces ready").
      return g.embeddings?.embedded >= 6 ? g : null;
    }, { maxMs: 120000 });
    if (!gefuellt) throw new Error("die drei Notizen wurden nicht embedded (Ollama erreichbar?)");
    console.log(`  Store gefuellt und embedded: ${gefuellt.embeddings.embedded} von ${gefuellt.embeddings.total} Vektoren fertig (${gefuellt.embeddings.models ? Object.keys(gefuellt.embeddings.models).join(", ") : "?"})`);
    await schlafe(1500);

    // Die API-Spur: die Anfrage fuer sich, um den besten Cosinus zu dokumentieren —
    // er muss UNTER dem Boden 0,58 liegen, sonst ist der Fall nicht der P120-Defekt-Fall.
    const spur = await (await fetch(`http://127.0.0.1:${PORT}/api/search`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ query: ANFRAGE, topK: 10, tracks: { bm25: false, vector: true, entity: false } }),
    })).json();
    const spurBeste = (spur.results || []).map((h) => h.score ?? 0);
    console.log(`  API-Spur: ${spur.results?.length ?? 0} Treffer, beste Punktzahl ${(Math.max(0, ...spurBeste)).toFixed(4)} (Boden 0,58), tracks des besten Treffers: ${JSON.stringify(spur.results?.[0]?.tracks ?? spur.results?.[0]?.spuren ?? "?")}`);

    // ---- Phase "gefuellt": der beste Kandidat bleibt, die Stille ist weg ----
    // Der Beweis ist die Treffer-Kennung "X of 3 notes" mit X < 3 (die Suche hat
    // gefiltert) UND kein Hinweis — die Kachel-Ansicht zeigt sonst immer alle drei
    // Notizen, das waere kein Treffer-Beweis.
    for (const [breit, hoch] of BREITEN) {
      await seite(breit, hoch);
      await frageStellen(ANFRAGE);
      const da = await warteBis(async () => {
        const z = await zustand();
        if (z.hinweis) return null;
        const kennung = await ausfuhren(cdp, `(((document.body.innerText||'').match(/(\\d+) of 3 notes/)||[])[1])`);
        const zahl = Number(kennung);
        if (!Number.isFinite(zahl) || zahl <= 0 || zahl >= 3) return null;
        return { ...z, trefferZahl: zahl };
      }, { maxMs: 20000 });
      if (!da) throw new Error(`(${breit}px) nach dem Flicken erschien trotzdem der P47-Hinweis oder keine Treffer-Kennung — das Bein schweigt noch`);
      if (da.ueberlaufQuer > 0) throw new Error(`(${breit}px) seitlicher Ueberlauf ${da.ueberlaufQuer}px`);
      console.log(`  Phase gefuellt ${breit}x${hoch}: Treffer-Kennung ${da.trefferZahl} of 3, kein Hinweis, Ueberlauf quer: ${da.ueberlaufQuer}px`);
      const b = await cdp.send("Page.captureScreenshot", { format: "png" });
      fs.writeFileSync(path.join(ARBEIT, `treffer-${breit}.png`), Buffer.from(b.data, "base64"));
    }
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
