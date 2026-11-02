// Die CSP am AUSGELIEFERTEN Objekt gemessen — nicht am gebauten Blatt.
//
// Der Fenster-Pruefer (egress-im-fenster.mjs) faehrt headless Chromium: dort setzt
// Electron die Richtschnur gar nicht, weil `session.defaultSession.webRequest` in
// der Huelle lebt. Also: die ausgelieferte App in einer eignen Kapsel starten
// (eignes HOME, eigner Datenordner, eigner Profilordner, eigner CDP-Port), und dann
// im Fenster selbst fragen, was die Antwort auf die eigne Adresse zurueckgibt und ob
// ein fernes Bild wirklich abgewiesen wird.
//
// Zwei Beweise, nicht einer:
//   1. der Kopf der Antwort (img-src ohne blankes https:, connect-src ohne Wolke),
//   2. eine echte securitypolicyviolation: ein Bild auf https://spur.example wird
//      angesetzt, und die Richtschnur muss es melden, bevor es den Rechner verlaesst.
//
// Ausgang: 0 = beide Beweise, 1 = einer faellt, 2 = Maschine spaerrt.

const PORT = Number(process.env.KEPTA_CSP_PORT || 3755);

async function ziel() {
  const l = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
  return l.find((z) => z.type === "page" && z.url.startsWith("http://127.0.0.1:")) || null;
}

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
      setTimeout(() => { if (this.wartend.has(id)) { this.wartend.delete(id); rej(new Error(`${methode}: keine Antwort`)); } }, 20000);
    });
  }
}

async function evaliere(cdp, ausdruck) {
  const r = await cdp.send("Runtime.evaluate", { expression: ausdruck, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw new Error(`Im Fenster geworfen: ${(r.exceptionDetails.exception?.description || r.exceptionDetails.text || "").slice(0, 300)}`);
  return r.result.value;
}

async function main() {
  const z = await ziel();
  if (!z) { console.log("  Kein Seiten-Ziel auf Port " + PORT); process.exitCode = 2; return; }
  const cdp = await Cdp.verbindung(z.webSocketDebuggerUrl);
  await cdp.send("Runtime.enable");

  const kopf = await evaliere(cdp, `(async()=>{const r=await fetch('/',{cache:'no-store'});return r.headers.get('content-security-policy')||''})()`);
  const bild = (kopf.match(/img-src([^;]*)/) || [])[1] || "";
  const verbind = (kopf.match(/connect-src([^;]*)/) || [])[1] || "";
  const wolke = (verbind.match(/https?:\/\/(?!localhost|127\.0\.0\.1)[a-z0-9.-]+/gi) || []);
  console.log("  CSP im ausgelieferten Objekt:");
  console.log("    img-src    :" + bild.trim());
  console.log("    connect-src:" + verbind.trim());

  const bruch = await evaliere(cdp, `(async()=>{
    window.__abgewiesen=[];
    document.addEventListener('securitypolicyviolation',(e)=>{window.__abgewiesen.push({blockiert:e.blockedURI, richt:e.effectiveDirective||e.violatedDirective});},false);
    const i=document.createElement('img'); i.src='https://spur.example/p.gif?i=Beweis';
    document.body.appendChild(i);
    await new Promise(r=>setTimeout(r,1500));
    return {abgewiesen: window.__abgewiesen, imgImBaum: !!document.querySelector('img[src^="https://spur.example"]'), geladen: i.naturalWidth>0};})()`);

  const pruefungen = [
    ["img-src nennt kein blankes https:", !/(^|\s)https:(\s|$)/.test(bild), bild.trim()],
    ["connect-src nennt keine Wolke", wolke.length === 0, wolke.join(", ") || "keine"],
    ["das ferne Bild wurde angesetzt", !!bruch.imgImBaum, `img im Baum: ${bruch.imgImBaum}`],
    ["die Richtschnur meldet den Abbruch", bruch.abgewiesen.length > 0, JSON.stringify(bruch.abgewiesen)],
    ["und der Rechner hat es nicht geladen", bruch.geladen === false, `naturalWidth > 0: ${bruch.geladen}`],
  ];
  let fehl = 0;
  for (const [name, ok, grund] of pruefungen) {
    if (!ok) fehl++;
    console.log(`  ${ok ? "ok  " : "FEHLT"}  ${name} — ${grund}`);
  }
  console.log(fehl ? `  ${fehl} Punkt(e) gefallen.` : "  Die Richtschnur haelt am ausgelieferten Objekt.");
  // Das Rohr haelt die Laufschleife offen: ohne Schluss laeuft die Sonde nach dem
  // Urteil weiter (gemessen 00:5x — der Lauf meldete fiinfmal ok und endete nicht).
  try { cdp.ws.close(); } catch { /* schon zu */ }
  process.exitCode = fehl ? 1 : 0;
}

void main();
