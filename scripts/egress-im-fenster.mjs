// Der Blick ins echte Fenster fuer die Bild-Politik von 3.2.124.
//
// Warum ein eigner Pruefer und nicht ein Zyklus im Einstellungen-Pruefer: die
// Bild-Absage entsteht nur in einer **Modell-Antwort**. Die bekommt man nicht aus
// einem Fixup im Quelltext, sondern nur, wenn ein Anbieter antwortet — also steht
// in diesem Lauf ein OpenAI-kompatibler Diener auf einem eignen Port, und das
// ausgelieferte Fenster redet mit ihm.
//
// Was gemessen wird, an jedem Viewport neu:
//   1. kein img mit ferner Quelle im Baum (das war der Abzug),
//   2. die Absage steht mit Grund und nennt die Gegenstelle beim Namen,
//   3. der Ausweg ist ein Link (target _blank, rel noreferrer), kein Abzug,
//   4. ein eingebettetes data:-Bild malt weiter,
//   5. kein img mit leerer Quelle (der alte Weg lud die Seite selbst noch einmal),
//   6. seitlicher Uberlauf und abgeschnittene Zeilen an vier Breiten.
//
// Ports sind ein eigner Block (3722 Diener, 3733 CDP, 3744 Anbieter-Attrappe), das
// Profil und die Wissensbasis sind eigne Kapseln unter /tmp, verschluesselte Daten
// bleiben aus. Nichts beroehrt Damians echtes Heim.
//
// Ausgang: 0 = alle sechs Punkte an allen Breiten gehalten, 1 = ein Punkt faellt,
//          2 = Maschine oder Objekt spaerrt (Port besetzt, kein Brave, kein Objekt).

import { spawn } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const WURZEL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OBJEKT = "/Applications/K3PTA.app/Contents/Resources/app.asar";
const BRADE = "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser";
const PORT = Number(process.env.KEPTA_EGRESS_PORT || 3722);
const CDP_PORT = 3733;
const STUB_PORT = 3744;
const ARG = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
};
const BASIS_FREMDE = String(ARG("basis", ""));
const BASIS = BASIS_FREMDE || `http://127.0.0.1:${PORT}`;
const ARBEIT = "/tmp/kepta-egress-124";
const ANBIETER = String(ARG("anbieter", "openai"));
const BREITEN = [
  [1440, 900],
  [1024, 768],
  [820, 1180],
  [390, 844],
];

// Die Antwort, die der Anbieter-Attrappe entlockt wird: erst ein fernes Bild, dann
// ein eingebettetes. Bewusst in einem Stueck — markdown-Trenner zwischen zwei
// Absaetzen sind Teil des Tests.
const ANTWORT = [
  "Hier das ferne Bild:\n\n![Spur](https://spur.example/p.gif?i=GEHEIM)\n\n",
  "Und hier ein eingebettetes:\n\n![daten](data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAEAAAAAsCAIAAABaPSmoAAAAYklEQVR4nNXOQREAIAzAsFJdKEEvwhCxB9coyLpnUyZxEidxEidxEidxEidxEidxEidxEidxEidxEidxEidxEidxEidxEidxEidxEidxEidxEidxEidxEidxEidxEufvwNQDqvYBssqNdOoAAAAASUVORK5CYII=)",
];

const schlafe = (ms) => new Promise((r) => setTimeout(r, ms));
async function warteBis(hin, { maxMs = 60000, schritt = 350 } = {}) {
  const anfang = Date.now();
  for (;;) {
    try { const z = await hin(); if (z) return z; } catch { /* noch nicht */ }
    if (Date.now() - anfang > maxMs) return null;
    await schlafe(schritt);
  }
}

/** Der kleinste CDP-Client, den dieses Haus braucht. */
class Cdp {
  constructor(ws) { this.ws = ws; this.nr = 0; this.wartend = new Map(); }
  static async verbindung(url) {
    const ws = await new Promise((res, rej) => {
      const w = new WebSocket(url);
      w.onopen = () => res(w);
      w.onerror = () => rej(new Error("CDP-Rohr abgelehnt"));
    });
    const c = new Cdp(ws);
    ws.onmessage = (e) => {
      const m = JSON.parse(String(e.data));
      if (m.id !== undefined && c.wartend.has(m.id)) { c.wartend.get(m.id)(m); c.wartend.delete(m.id); }
    };
    return c;
  }
  send(methode, params = {}) {
    return new Promise((res, rej) => {
      const id = ++this.nr;
      this.wartend.set(id, (m) => (m.error ? rej(new Error(`${methode}: ${m.error.message}`)) : res(m.result)));
      this.ws.send(JSON.stringify({ id, method: methode, params }));
      setTimeout(() => { if (this.wartend.has(id)) { this.wartend.delete(id); rej(new Error(`${methode}: keine Antwort`)); } }, 30000);
    });
  }
}

async function evaliere(cdp, ausdruck) {
  const r = await cdp.send("Runtime.evaluate", { expression: ausdruck, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw new Error(`Im Fenster geworfen: ${(r.exceptionDetails.exception?.description || r.exceptionDetails.text || "").slice(0, 300)}`);
  return r.result.value;
}

/** Die Anbieter-Attrappe: OpenAI-Reden, zwei Stueck weit, dann [DONE]. */
function attrappeStart() {
  const angerufe = [];
  const server = http.createServer((req, res) => {
    let koerper = "";
    req.on("data", (c) => { koerper += c; });
    req.on("end", () => {
      angerufe.push({ url: req.url, body: koerper.slice(0, 400) });
      if (/chat\/completions/.test(req.url || "")) {
        res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache" });
        for (const s of ANTWORT) {
          res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: s } }] })}\n\n`);
        }
        res.write("data: [DONE]\n\n");
        res.end();
        return;
      }
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ data: [{ id: "stub-modell" }] }));
    });
  });
  server.listen(STUB_PORT, "127.0.0.1");
  return { server, angerufe };
}

async function main() {
  if (!fs.existsSync(OBJEKT)) { console.log("Kein Objekt unter " + OBJEKT); process.exit(2); }
  if (!fs.existsSync(BRADE)) { console.log("Kein Brave — der Pruefer braucht einen echten Viewport."); process.exit(2); }
  const zuPruefen = BASIS_FREMDE ? [CDP_PORT, STUB_PORT] : [PORT, CDP_PORT, STUB_PORT];
  for (const p of zuPruefen) {
    try { await fetch(`http://127.0.0.1:${p}/`); console.log(`Port ${p} hoert schon — fremder Laeufer, Abbruch.`); process.exit(2); } catch { /* frei */ }
  }
  fs.rmSync(ARBEIT, { recursive: true, force: true });
  fs.mkdirSync(path.join(ARBEIT, "bilder"), { recursive: true });

  const { server: attrappe, angerufe } = attrappeStart();
  let diener = null;
  if (BASIS_FREMDE) console.log(`  Fremde Flaeche: ${BASIS_FREMDE} (kein eigner Diener gebaut)`);
  else diener = spawn("node", [path.join(WURZEL, "dist", "server.cjs")], {
    cwd: WURZEL,
    env: { ...process.env, HOME: `${ARBEIT}/h`, KEPTA_DATA_DIR: `${ARBEIT}/d`, KEPTA_ENCRYPTION: "off", PORT: String(PORT) },
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (diener) {
    const prot = fs.createWriteStream(path.join(ARBEIT, "diener.log"));
    diener.stdout.pipe(prot); diener.stderr.pipe(prot, { end: true });
  }

  let brave;
  try {
    const gesund = await warteBis(async () => { const r = await fetch(`${BASIS}/api/health`); return r.ok ? await r.json() : null; }, { maxMs: 60000 });
    if (!gesund) throw new Error("Der Kapsel-Diener kam nicht hoch — " + path.join(ARBEIT, "diener.log"));
    console.log(`  Diener: Version ${gesund.version}, Bestand ${gesund.count} (eigne Kapsel, Verschluesselung aus)`);

    brave = spawn(BRADE, ["--headless=new", `--remote-debugging-port=${CDP_PORT}`, `--user-data-dir=${ARBEIT}/profil`,
      "--no-first-run", "--disable-gpu", "--hide-scrollbars", `--window-size=${BREITEN[0][0]},${BREITEN[0][1]}`, "about:blank"],
      { stdio: ["ignore", "pipe", "pipe"] });
    const bLog = fs.createWriteStream(path.join(ARBEIT, "brave.log"));
    brave.stdout.pipe(bLog); brave.stderr.pipe(bLog, { end: true });

    const ziel = await warteBis(async () => {
      const l = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`)).json();
      return l.find((z) => z.type === "page" && z.webSocketDebuggerUrl) || null;
    }, { maxMs: 90000 });
    if (!ziel) throw new Error("Kein CDP-Ziel — " + path.join(ARBEIT, "brave.log"));
    const cdp = await Cdp.verbindung(ziel.webSocketDebuggerUrl);
    await cdp.send("Page.enable");
    await cdp.send("Runtime.enable");

    // 1) Die Verbindung auf die Attrappe setzen — **uber die Flaeche**, nicht uber
    //    einen Schreib in den Browserspeicher. Gemessen 00:4x: der direkte
    //    localStorage-Schreib setzte baseUrl und Modellliste (vier Anrufe bei der
    //    Attrappe), aber der Chat-Kopf blieb auf "No AI connected" — die Verbindung
    //    ist ein Zustand der Flaeche, kein Wert im Speicher. Also der Nutzerweg:
    //    Settings -> Anbieter "Custom endpoint" -> Adresse -> Verbindung.
    await cdp.send("Page.navigate", { url: `${BASIS}/` });
    await warteBis(async () => (await evaliere(cdp, `document.querySelectorAll('button').length`)) > 0 ? true : null, { maxMs: 90000 });

    // 2) Der Assistent steht bei leerem Bestand ueber der Flaeche — weg damit, und
    //    danach nachlesen, ob der Schirm wirklich zu ist.
    const spaeter = await warteBis(async () => evaliere(cdp, `(()=>{const b=[...document.querySelectorAll('button')].find(x=>/later|skip|spaeter/i.test(x.textContent||''));if(!b)return null;b.click();return (b.textContent||'').trim()})()`), { maxMs: 4000 });
    await schlafe(700);
    const schirmZu = !(await evaliere(cdp, `(()=>/Step 1 of 4|Set up K3PTA/.test(document.body.innerText||''))()`));
    console.log(`  Assistent: ${spaeter ? `Weg ueber "${spaeter}"` : "kein Knopf"}; Schirm danach ${schirmZu ? "zu" : "STEHT NOCH DA"}`);
    if (!schirmZu) throw new Error("der Assistent hält die Fläche fest — Messung waere kein Beweis");

    const setzeFeld = async (waehlen, wert, art) => evaliere(cdp, `(()=>{const e=document.querySelector(${JSON.stringify(waehlen)});if(!e)return null;
      const prototyp = ${JSON.stringify(art)} === 'select' ? window.HTMLSelectElement.prototype : window.HTMLInputElement.prototype;
      const s = Object.getOwnPropertyDescriptor(prototyp,'value').set;
      s.call(e, ${JSON.stringify(wert)});
      e.dispatchEvent(new Event('${art === "select" ? "change" : "input"}',{bubbles:true}));
      e.dispatchEvent(new Event('blur',{bubbles:true}));
      return e.value})()`);

    await evaliere(cdp, `(()=>{const k=[...document.querySelectorAll('button,a[role="button"]')].find(b=>/^\\s*(Settings|Einstellungen)\\s*$/i.test((b.textContent||'').trim()));if(k){k.click();return true}return false})()`);
    await warteBis(async () => (await evaliere(cdp, `!!document.querySelector('select')`)) ? true : null, { maxMs: 20000 });
    // Anbieter mit Schluessel: ein Schluessel-Anbieter ist im Chat verbunden, sobald
    // Adresse, Schluessel und Modell stehen (src/lib/ai.ts:642-648). Ein
    // Schluessel-freier Anbieter wie "custom" wird dagegen nur ueber die Sonde zweier
    // fester Haefen erreichbar (Chat.tsx:147-150 zaehlt nur ollama und lmstudio) —
    // dieser Lauf ist nicht der Beweis dafuer, also der kurze Weg: openai mit
    // kuenstlichem Schluessel, Adresse auf die Attrappe.
    const anbieter = await setzeFeld("select", ANBIETER, "select");
    await schlafe(900);
    const adresse = await evaliere(cdp, `(()=>{const e=[...document.querySelectorAll('input')].find(i=>/api\\.example\\.com|base|url/i.test(i.getAttribute('placeholder')||''));return e?true:false})()`);
    if (!adresse) throw new Error("die Einstellungen nennen kein Adressfeld — der Nutzerweg ist nicht der gemessene");
    const gesetzt = await setzeFeld(`input[placeholder^="https://api.example.com"]`, `http://127.0.0.1:${STUB_PORT}/v1`, "input");
    // Ein Schluessel-Anbieter braucht einen, ein Kein-Key-Anbieter (custom) bekommt
    // keinen — sonst bewiese der Lauf nicht den Fall aus Aufgabe #43.
    const schluessel = ANBIETER === "custom" ? null
      : await setzeFeld(`input[type="password"]`, "sk-stub-fuer-die-attrappe", "input");
    await schlafe(1400);
    // Modell: die Liste kommt von der Attrappe ("stub-modell"); gesetzt wird, was die
    // Flaeche dafuer bereithaelt — ein select oder ein Feld.
    const modell = await evaliere(cdp, `(()=>{
      const s=[...document.querySelectorAll('select')].find(x=>[...x.options].some(o=>/stub-modell/.test(o.value||o.textContent)));
      if(s){const set=Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype,'value').set;
        set.call(s,[...s.options].find(o=>/stub-modell/.test(o.value||o.textContent)).value);
        s.dispatchEvent(new Event('change',{bubbles:true})); return 'select'}
      const f=[...document.querySelectorAll('input')].find(i=>/model/i.test(i.getAttribute('placeholder')||'')||/model/i.test(i.getAttribute('aria-label')||''));
      if(f){const set=Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set;
        set.call(f,'stub-modell'); f.dispatchEvent(new Event('input',{bubbles:true})); return 'feld'}
      return null})()`);
    await schlafe(900);
    const gespart = await evaliere(cdp, `(()=>{const b=[...document.querySelectorAll('button')].find(x=>/^(save|connect|speichern|verbinden)/i.test((x.textContent||'').trim()));if(b){b.click();return (b.textContent||'').trim()}return null})()`);
    console.log(`  Anbieter: ${anbieter}; Adresse: ${gesetzt}; Schluessel: ${schluessel ? "gesetzt" : "kein Feld"}; Modell ueber: ${modell ?? "nichts"}; Knopf: ${gespart ?? "keiner"}`);
    await schlafe(1800);
    // Zwei Lagen, getrennt gemessen: (a) die Flaeche haelt die Verbindung, (b) der
    // Chat merkt sich, was die Einstellungen setzen. Ein Neuladen trennt sie —
    // ohne es waere ein stale Zustand dasselbe Bild wie eine ausgebliebene Heilung.
    await cdp.send("Page.navigate", { url: `${BASIS}/` });
    await warteBis(async () => (await evaliere(cdp, `document.querySelectorAll('button').length`)) > 0 ? true : null, { maxMs: 60000 });
    await warteBis(async () => evaliere(cdp, `(()=>{const b=[...document.querySelectorAll('button')].find(x=>/later|skip|spaeter/i.test(x.textContent||''));if(!b)return null;b.click();return true})()`), { maxMs: 4000 });
    await schlafe(900);
    const verbind = await evaliere(cdp, `(()=>{const m=(document.body.innerText||'').match(/Custom[^\\n]{0,40}|No AI connected|connected[^\\n]{0,30}/i);return m?m[0]:null})()`);
    console.log(`  Verbindung nach dem Setzen: ${verbind ?? "nichts gelesen"}`);

    let fehl = 0;
    for (const [breite, hoehe] of BREITEN) {
      await cdp.send("Emulation.setDeviceMetricsOverride", { width: breite, height: hoehe, deviceScaleFactor: 2, mobile: false });

      // 3) Chat oeffnen, Frage stellen, Antwort abwarten.
      await evaliere(cdp, `(()=>{const k=[...document.querySelectorAll('button,a[role="button"]')].find(b=>/^\\s*(Chat)\\s*$/i.test((b.textContent||'').trim()));if(k)k.click();return !!k})()`);
      await schlafe(600);
      // Nicht der Wert ins Feld schreiben — der Zustand daneben blieb leer und der
      // Send-Knopf zu (gemessen 00:4x: "|Send:zu" bei vollem textarea). Also echtes
      // Tippen ueber CDP: Feld anfassen, Text einstreuen, dann Knopf oder Enter.
      const feld = await evaliere(cdp, `(()=>{const alle=[...document.querySelectorAll('textarea,input[type="text"],input:not([type]),[contenteditable="true"]')].map((t,i)=>({i, art:t.tagName.toLowerCase(), platz:(t.getAttribute('placeholder')||''), lab:(t.getAttribute('aria-label')||''), rect:t.getBoundingClientRect().toJSON()}));
        const treffer=alle.filter(x=>x.rect.width>200 && x.rect.height>8).map(x=>x.i)[0];
        return {wahl: treffer===undefined?null:treffer, alle}})()`);
      if (feld.wahl === null) {
        console.log(`  Kein Chat-Feld — diese Felder stehen im Baum: ${JSON.stringify(feld.alle)}`);
        throw new Error("kein Textfeld im Chat — die Flaeche ist nicht die bestellte");
      }
      console.log(`  Anbieter im Lauf: ${ANBIETER}`);
      const sitzung = await evaliere(cdp, `(()=>{const roh=localStorage.getItem('aiVerbindung');let g=null;try{g=JSON.parse(roh||'null')}catch{}
        return {roh, providerId:g&&g.providerId, baseUrl:g&&g.baseUrl, model:g&&g.model, schluessel:(g&&g.apiKey||'').slice(0,6)}})()`);
      console.log(`  Sitzungs-Zeile: ${JSON.stringify(sitzung)}`);
      console.log(`  Rufe bei der Attrappe bisher: ${JSON.stringify(angerufe.map((a) => a.url))}`);
      console.log(`  ${breite}x${hoehe} Felder: ${feld.alle.map((x) => `${x.i}:${x.platz || x.lab || "ohne Name"} ${(x.rect.width | 0)}x${x.rect.height | 0}`).join(" | ")}`);
      // Der Klick nach Koordinaten traf bei 1024 und 820 nicht das Feld, sondern den
      // Hinweis ueber ihm ("K3PTA can save answers like this automatically", im 390-Bild
      // sichtbar). Also: Hinweis schliessen, dann das Feld selbst in den Fokus nehmen —
      // insertText geht an das fokussierte Element, Koordinaten sind nicht noetig.
      await evaliere(cdp, `(()=>{const zu=[...document.querySelectorAll('button')].find(b=>/^\\s*(×|x|close|schließen|aus)\\s*$/i.test((b.getAttribute('aria-label')||b.textContent||'').trim()));if(zu)zu.click();return !!zu})()`);
      await evaliere(cdp, `(()=>{const t=[...document.querySelectorAll('textarea,input[type="text"],input:not([type]),[contenteditable="true"]')].find(x=>x.getBoundingClientRect().width>200);if(t){t.scrollIntoView({block:'nearest'});t.focus();}return !!t})()`);
      await schlafe(250);
      await cdp.send("Input.insertText", { text: "Zeig mir beide Bilder" });
      await schlafe(400);
      // In der zweiten Breite und weiter lag der Text nicht im Feld: die Antwort des
      // Vorlaufs steht noch auf dem Schirm, und der Klick ging daneben. Einmal nach-
      // fassen ist billiger als ein Urteil ueber einen Knopf, der nie befragt war.
      for (let versuch = 0; versuch < 3; versuch++) {
        const voll = await evaliere(cdp, `(()=>{const t=[...document.querySelectorAll('textarea,input[type="text"],input:not([type]),[contenteditable="true"]')].find(x=>x.getBoundingClientRect().width>200);return !!t && /Zeig mir/.test(t.value||'')})()`);
        if (voll) break;
        const ortZwei = await evaliere(cdp, `(()=>{const t=[...document.querySelectorAll('textarea,input[type="text"],input:not([type]),[contenteditable="true"]')].find(x=>x.getBoundingClientRect().width>200);if(!t)return null;const r=t.getBoundingClientRect();return {x:Math.round(r.x+r.width/2),y:Math.round(r.y+12)}})()`);
        if (!ortZwei) break;
        await evaliere(cdp, `(()=>{const t=[...document.querySelectorAll('textarea,input[type="text"],input:not([type]),[contenteditable="true"]')].find(x=>x.getBoundingClientRect().width>200);if(t){t.scrollIntoView({block:'nearest'});t.focus();}return !!t})()`);
        await schlafe(250);
        await cdp.send("Input.insertText", { text: "Zeig mir beide Bilder" });
        await schlafe(400);
      }
      // Kopf und Knopf JETZT lesen — nach dem Senden ist das Feld leer und der Knopf
      // mit Recht zu. (Der erste Versuch mass sie spaeter und meldete "zu".)
      let kopf = await evaliere(cdp, `(()=>{const txt=(document.body.innerText||'').match(/Chat[\\s\\S]{0,120}/);
        const send=[...document.querySelectorAll('button')].find(b=>/^(send)$/i.test(((b.textContent||'')+' '+(b.getAttribute('aria-label')||'')).trim()));
        const feld=[...document.querySelectorAll('textarea,input[type="text"],input:not([type]),[contenteditable="true"]')].find(x=>x.getBoundingClientRect().width>200);
        return {zeile:(txt?txt[0]:'').replace(/\\s+/g,' ').slice(0,110), send: send?(send.disabled?'zu':'offen'):'keiner',
                wert: feld?(feld.value||feld.textContent||'').slice(0,22):'kein Feld'}})()`);
      console.log(`  Chat-Kopf nach der Frage, vor dem Senden: ${kopf.zeile} | Send: ${kopf.send} | Feld: "${kopf.wert}"`);
      const knopfstoff = await evaliere(cdp, `(()=>{const k=[...document.querySelectorAll('button')].find(b=>/^(send)$/i.test(((b.textContent||'')+' '+(b.getAttribute('aria-label')||'')).trim()));return k?{vorhanden:true, zu:!!k.disabled}:{vorhanden:false}})()`);
      if (knopfstoff.vorhanden && knopfstoff.zu) {
        // Enter als zweiter Weg — die Flaeche druckt "Enter send" in ihre Zeile.
        await cdp.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Enter", code: "Enter", keyCode: 13, windowsVirtualKeyCode: 13, text: "\\r" });
        await schlafe(600);
      } else if (knopfstoff.vorhanden) {
        await evaliere(cdp, `(()=>{const k=[...document.querySelectorAll('button')].find(b=>/^(send)$/i.test(((b.textContent||'')+' '+(b.getAttribute('aria-label')||'')).trim()));k.click();return true})()`);
      }
      let antwort = await warteBis(async () => evaliere(cdp, `(()=>/ferne Bild/.test(document.body.innerText||''))()`), { maxMs: 20000 });
      if (!antwort) {
        const nach = await evaliere(cdp, `(()=>{const t=document.querySelector('textarea,[contenteditable="true"]');
          const k=[...document.querySelectorAll('button')].find(b=>/^(send)$/i.test(((b.textContent||'')+' '+(b.getAttribute('aria-label')||'')).trim()));
          return {wert:(t&&t.value||'').slice(0,32), knopf: k?(k.disabled?'zu':'offen'):'keiner'}})()`);
        console.log(`  Nach dem Tippen: ${JSON.stringify(nach)}`);
        const sicht = await evaliere(cdp, `(()=>(document.body.innerText||'').replace(/\\s+/g,' ').slice(-700))()`);
        console.log(`  ${breite}x${hoehe}: die Antwort kam nicht — Anbieter-Anrufe: ${JSON.stringify(angerufe.map((a) => a.url))}`);
        console.log(`  Was das Fenster zeigt: ${sicht}`);
        throw new Error("keine Modell-Antwort im Fenster");
      }
      await schlafe(700);

      const m = await evaliere(cdp, `(()=>{
        const alle=[...document.querySelectorAll('img')];
        const src=(e)=>e.getAttribute('src')||'';
        const zeile=document.querySelector('[data-testid="bild-abgewiesen"]');
        const weg=zeile?zeile.querySelector('a'):null;
        return {
          ferne: alle.filter(e=>/^https?:\\/\\//.test(src(e))).map(src),
          geleert: alle.filter(e=>src(e)==='').length,
          eingebettet: alle.filter(e=>src(e).startsWith('data:image')).length,
          alle: alle.length,
          zeile: zeile?(zeile.textContent||'').trim():null,
          wegHref: weg?weg.getAttribute('href'):null,
          wegZiel: weg?weg.getAttribute('target'):null,
          wegRel: weg?weg.getAttribute('rel'):null,
          stuecke: alle.map(e=>({src:(src(e)||'').slice(0,26), alt:e.getAttribute('alt')||'', nW:e.naturalWidth, nH:e.naturalHeight, r:(()=>{const q=e.getBoundingClientRect();return (q.width|0)+'x'+(q.height|0)})(), sichtbar: getComputedStyle(e).display})),
          ueberlauf: document.documentElement.scrollWidth - document.documentElement.clientWidth,
          breiter: [...document.querySelectorAll('*')].filter(e=>e.getBoundingClientRect().right > window.innerWidth + 1).length,
        };})()`);

      const urteile = [
        // Aufgabe #43: der Kopf muss die Verbindung nennen, die da ist, und der Knopf
        // offen sein. Beides war am ausgelieferten 3.2.124 nicht so, waehrend
        // dieselbe Adresse durch die eigne Tuer antwortete.
        ["der Chat-Kopf nennt die Verbindung", !kopf.zeile.includes("No AI connected"), kopf.zeile.slice(0, 90)],
        ["der Send-Knopf ist offen", kopf.send === "offen", `Send: ${kopf.send} (nach der Frage gemessen)`],
        ["kein fernes Bild geladen", m.ferne.length === 0, `gelanden: ${m.ferne.join(", ") || "keins"}`],
        ["Absage steht mit Grund", !!m.zeile && m.zeile.includes("Remote image not loaded"), m.zeile ? m.zeile.slice(0, 78) : "keine Zeile"],
        ["Gegenstelle genannt", !!m.zeile && m.zeile.includes("spur.example"), m.zeile ? (m.zeile.includes("spur.example") ? "spur.example" : "kein Host in: " + m.zeile.slice(0, 60)) : "keine Zeile"],
        ["Ausweg ist ein Link, kein Abzug", !!m.wegHref && m.wegZiel === "_blank" && String(m.wegRel).includes("noreferrer"), `${m.wegHref || "kein Link"} ${m.wegZiel || ""} ${m.wegRel || ""}`],
        ["eingebettetes Bild malt weiter", m.eingebettet >= 1, `${m.eingebettet} von ${m.alle} Bildern`],
        ["kein Bild ohne Quelle", m.geleert === 0, `${m.geleert} leere src`],
        ["kein seitlicher Uberlauf", m.ueberlauf <= 0 && m.breiter === 0, `Uberlauf ${m.ueberlauf} px, ${m.breiter} Elemente ueber der Kante`],
      ];
      const png = path.join(ARBEIT, "bilder", `chat-bilder-${breite}x${hoehe}.png`);
      const schuss = await cdp.send("Page.captureScreenshot", { format: "png" });
      fs.writeFileSync(png, Buffer.from(schuss.data, "base64"));
      for (const [name, ok, grund] of urteile) {
        if (!ok) fehl++;
        console.log(`  ${ok ? "ok  " : "FEHLT"}  ${breite}x${hoehe}  ${name} — ${grund}`);
      }
      console.log(`  Bilder im Baum: ${JSON.stringify(m.stuecke)}`);
      console.log(`  Bild: ${png}`);
    }

    console.log(fehl ? `  ${fehl} Punkt(e) gefallen.` : "  Alle Punkte an allen Breiten gehalten.");
    process.exitCode = fehl ? 1 : 0;
  } catch (e) {
    console.log("  ABBRUCH: " + (e && e.message ? e.message : String(e)));
    // Ein process.exit hier liess den finally nie laufen — der Diener und das
    // Profil blieben am Port stehen (gemessen 00:3x: "Port 3722 hoert schon").
    // Also: Code merken, zurueckgeben, raumachen, und Node beendet von selbst.
    process.exitCode = 2;
  } finally {
    if (diener) { try { diener.kill("SIGTERM"); } catch { /* schon weg */ } }
    if (brave) { try { brave.kill("SIGTERM"); } catch { /* schon weg */ } }
    attrappe.close();
  }
}

void main();
