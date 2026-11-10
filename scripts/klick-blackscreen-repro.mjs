// P193: der exakte Klick-Repro aus Damians Video. Kapsel 2 000 Notizen, Settings
// → System-Tab → ECHTER Klick auf den Words-Schalter → dann wird gelesen:
// currentView-Spur, die hidden/flex-Klassen aller Ansichts-Container, die
// Ausnahmen, der DOM-Text. Der Unterschied zu allen bisherigen Läufen: der
// echte onChange-Klick statt localStorage-Direkttrigger.
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const WURZEL = process.cwd();
const OBJEKT = path.join(WURZEL, "dist", "server.cjs");
const BRAVE = process.env.KEPTA_BRAVE || "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser";
const PORT = Number(process.env.KEPTA_KLICK_PORT || 3964);
const CDP_PORT = Number(process.env.KEPTA_KLICK_CDP || 3974);
const ARBEIT = "/tmp/kepta-klick-repro";
const ANZAHL = 2000;

const schlafe = (ms) => new Promise((r) => setTimeout(r, ms));
async function warteBis(fn, { maxMs = 120000, schritt = 400 } = {}) {
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
      } else if (n.method) c.evente.push({ methode: n.method, params: n.params });
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
  (await cdp.send("Runtime.evaluate", { expression: ausdruck, returnByValue: true, awaitPromise: true })).result?.value;

function baueKorpus(gesamt) {
  const dateien = [];
  for (let i = 0; i < gesamt; i++) {
    const titel = `Notiz ${String(i + 1).padStart(5, "0")}`;
    dateien.push({
      name: `S/${String(i + 1).padStart(5, "0")}.md`,
      content: ["---", `kepta_id: kl-${String(i + 1).padStart(5, "0")}`, `title: ${JSON.stringify(titel)}`,
        `tags: ["klick"]`, `created: 1759000000`, `updated: 1759000000`, "---", "",
        `Inhalt der Notiz ${i + 1} über Suche, Bestand und Klick. [[suche]]`].join("\n"),
    });
  }
  return dateien;
}

async function main() {
  fs.rmSync(ARBEIT, { recursive: true, force: true });
  fs.mkdirSync(ARBEIT, { recursive: true });
  const diener = spawn("node", [OBJEKT], {
    cwd: WURZEL,
    env: { ...process.env, HOME: path.join(ARBEIT, "h"), KEPTA_DATA_DIR: path.join(ARBEIT, "d"), KEPTA_ENCRYPTION: "off", PORT: String(PORT) },
    stdio: ["ignore", "pipe", "pipe"],
  });
  diener.on("exit", (code, signal) => console.log(`!!! SERVER GESTORBEN code=${code} signal=${signal}`));
  let brave = null;
  try {
    await warteBis(async () => { const r = await fetch(`http://127.0.0.1:${PORT}/api/health`); return r.ok; }, { maxMs: 60000 });
    console.log("  Diener bereit — importiere", ANZAHL, "Notizen ...");
    const dateien = baueKorpus(ANZAHL);
    for (let i = 0; i < dateien.length; i += 5000) {
      await fetch(`http://127.0.0.1:${PORT}/api/import/markdown`, {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ files: dateien.slice(i, i + 5000) }),
      });
      console.log("  Häppchen", i / 5000 + 1, "erledigt");
    }

    brave = spawn(BRAVE, ["--headless=new", `--remote-debugging-port=${CDP_PORT}`, `--user-data-dir=${path.join(ARBEIT, "profil")}`,
      "--no-first-run", "--disable-gpu", "--hide-scrollbars", "--window-size=1440,900", "about:blank"], { stdio: ["ignore", "pipe", "pipe"] });
    const ziel = await warteBis(async () => {
      const l = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`)).json();
      return l.find((z) => z.type === "page" && z.webSocketDebuggerUrl) || null;
    }, { maxMs: 90000 });
    const cdp = await Cdp.verbindung(ziel.webSocketDebuggerUrl);
    await cdp.send("Page.enable");
    await cdp.send("Runtime.enable");
    await cdp.send("Log.enable");

    await cdp.send("Page.navigate", { url: `http://127.0.0.1:${PORT}/` });
    await warteBis(async () => (await ausfuhren(cdp, `document.querySelectorAll('button').length`)) > 0 ? true : null, { maxMs: 120000 });
    await ausfuhren(cdp, `(()=>{localStorage.clear();sessionStorage.clear();return true})()`);
    await cdp.send("Page.navigate", { url: `http://127.0.0.1:${PORT}/` });
    await warteBis(async () => (await ausfuhren(cdp, `document.querySelectorAll('button').length`)) > 0 ? true : null, { maxMs: 120000 });
    const schritt = await warteBis(async () => ausfuhren(cdp, `/Step 1 of 4/i.test(document.body.innerText||'') ? true : null`), { maxMs: 20000 });
    if (schritt) {
      await ausfuhren(cdp, `(()=>{const b=[...document.querySelectorAll('button')].find(x=>/^\\s*Later\\s*$/i.test((x.textContent||'').trim()));if(b)b.click();return true})()`);
      await schlafe(400);
    }

    // Settings öffnen — mit Warten auf den System-Tab-Inhalt (nicht raten).
    await ausfuhren(cdp, `(()=>{const b=[...document.querySelectorAll('button')].find(x=>/^\\s*Settings\\s*$/i.test((x.textContent||'').trim()));if(b)b.click();return true})()`);
    const tabOffen = await warteBis(async () => ausfuhren(cdp, `(()=>{
      const b = [...document.querySelectorAll('button')].find(x => /^\\s*System\\s*$/i.test((x.textContent||'').trim()));
      if (!b) return null; b.click();
      return document.querySelector('[data-testid="such-modell"]') ? 'offen' : 'geklickt';
    })()`), { maxMs: 30000, schritt: 500 });
    console.log("  System-Tab:", tabOffen);
    await warteBis(async () => ausfuhren(cdp, `(()=>!!document.querySelector('[data-testid="such-modell"]'))()`), { maxMs: 15000 });

    const zustandVorher = await ausfuhren(cdp, `(()=>{
      const container = [...document.querySelectorAll('main > div, main > [class*=flex]')];
      return {
        check: !!document.querySelector('input[aria-label="Search track: words"]'),
        tabs: [...document.querySelectorAll('button')].filter(b=>b.className.includes('settings')).length,
        body: (document.body.innerText||'').slice(0, 100),
      };
    })()`);
    console.log("  VORHER:", JSON.stringify(zustandVorher));

    // Der ECHTE Klick — genau wie Damian: auf den Words-Schalter.
    const klick = await ausfuhren(cdp, `(()=>{
      const input = document.querySelector('input[aria-label="Search track: words"]');
      if (!input) return 'KEIN INPUT';
      input.click();
      return 'geklickt, checked=' + input.checked;
    })()`);
    console.log("  KLICK:", klick);
    await schlafe(1500);

    // NACH dem Klick: der Zustand der Fläche.
    const zustand = await ausfuhren(cdp, `(()=>{
      const suchModell = !!document.querySelector('[data-testid="such-modell"]');
      const inputs = [...document.querySelectorAll('input[aria-label^="Search track"]')].map(i => (i.getAttribute('aria-label')||'').replace('Search track: ','') + '=' + i.checked).join(',');
      const mainInhalt = (document.querySelector('main')||{innerText:''}).innerText.length;
      const buttons = document.querySelectorAll('button').length;
      return { suchModell, inputs, mainInhalt, buttons, body: (document.body.innerText||'').slice(0, 120) };
    })()`);
    console.log("  NACH DEM KLICK:", JSON.stringify(zustand, null, 1));
    const ausnahmen = cdp.evente.filter((e) => e.methode === "Runtime.exceptionThrown");
    console.log("  Ausnahmen:", ausnahmen.length);
    for (const m of ausnahmen.slice(-3)) {
      const p = m.params?.exceptionDetails || {};
      console.log("    *", String(p.exception?.description || p.text || "").split("\n").slice(0, 3).join(" | ").slice(0, 300));
    }
    const b = await cdp.send("Page.captureScreenshot", { format: "png" });
    fs.writeFileSync(path.join(ARBEIT, "nach-klick.png"), Buffer.from(b.data, "base64"));
    console.log("  Bild: " + path.join(ARBEIT, "nach-klick.png"));
  } catch (e) {
    console.log("FEHLER: " + e.message);
    process.exitCode = 1;
  } finally {
    if (brave) brave.kill("SIGTERM");
    diener.kill("SIGTERM");
  }
}
main();
