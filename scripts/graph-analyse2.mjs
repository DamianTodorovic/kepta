// eslint-disable-disable-file: Probe-Werkzeug, kein Produktionscode
/* eslint-disable @typescript-eslint/no-unused-expressions, @typescript-eslint/no-unused-vars, no-empty */
// P196 zweiter Griff: Regal öffnen, Force-Sicht, Farb-Greifer, Ziehen + Release.
import fs from "node:fs";
import path from "node:path";
const CDP = 3985, ARBEIT = "/tmp/kepta-graph";
const log = (z) => console.log(`[${new Date().toLocaleTimeString("de-DE")}] ${z}`);
const schlafe = (ms) => new Promise((r) => setTimeout(r, ms));
class Cdp {
  constructor(ws) { this.ws = ws; this.nr = 0; this.offen = new Map(); }
  static async verbindung(url) {
    const ws = await new Promise((los, fehler) => { const w = new WebSocket(url); w.onopen = () => los(w); w.onerror = (e) => fehler(e.error || new Error("ws")); });
    const c = new Cdp(ws);
    ws.onmessage = (e) => { const n = JSON.parse(e.data); if (n.id && c.offen.has(n.id)) { const { los, fehler } = c.offen.get(n.id); c.offen.delete(n.id); n.error ? fehler(new Error(n.error.message)) : los(n.result); } };
    return c;
  }
  send(m, p = {}, t = 10000) { const id = ++this.nr; return new Promise((los, fehler) => { const w = setTimeout(() => fehler(new Error("ZEIT " + m)), t); this.offen.set(id, { los: (r) => { clearTimeout(w); los(r); }, fehler: (x) => { clearTimeout(w); fehler(x); } }); this.ws.send(JSON.stringify({ id, method: m, params: p })); }); }
}
const ausf = async (c, a, t = 10000) => { const r = await c.send("Runtime.evaluate", { expression: a, returnByValue: true, awaitPromise: true }, t); if (r.exceptionDetails) throw new Error(String(r.exceptionDetails?.exception?.description || "").slice(0, 250)); return r.result?.value; };
const bild = async (c, name) => { const b = await c.send("Page.captureScreenshot", { format: "png" }); fs.writeFileSync(path.join(ARBEIT, name), Buffer.from(b.data, "base64")); log("Bild: " + name); };

const l = await (await fetch(`http://127.0.0.1:${CDP}/json/list`)).json();
const ziel = l.find(z => z.type === "page" && z.webSocketDebuggerUrl);
const cdp = await Cdp.verbindung(ziel.webSocketDebuggerUrl);
await cdp.send("Page.enable"); await cdp.send("Runtime.enable");

// 1) More (13) öffnen — das Regal
await ausf(cdp, `(()=>{ const b=[...document.querySelectorAll('button')].find(x=>/^More \\(/.test((x.textContent||'').trim())); if(b) b.click(); return !!b; })()`);
await schlafe(1200);
const regal = await ausf(cdp, `(()=>({ farbEingaben: [...document.querySelectorAll('input[type="color"]')].map(i => ({ wert: i.value, label: i.getAttribute('aria-label') })), regler: [...document.querySelectorAll('input[type="range"]')].map(i => i.getAttribute('aria-label')).slice(0,10) }))()`);
void regal;
console.log("REGAL:", JSON.stringify(regal, null, 1));
await bild(cdp, "graph-regal.png");

// 2) Die Force-Sicht (Meaning) für Ziehen + Release
await ausf(cdp, `(()=>{ const b=[...document.querySelectorAll('button')].find(x=>(x.textContent||'').trim()==='Meaning'); if(b) b.click(); return !!b; })()`);
await schlafe(4000);
await bild(cdp, "graph-force.png");

// 3) Einen Knoten greifen und wegziehen (echte Zeiger-Ereignisse aufs Canvas)
const canvasBox = await ausf(cdp, `(()=>{ const c = document.querySelector('canvas'); if (!c) return null; const r = c.getBoundingClientRect(); return { x: r.x, y: r.y, b: r.width, h: r.height }; })()`);
console.log("CANVAS:", JSON.stringify(canvasBox));
if (canvasBox) {
  const greif = { x: canvasBox.x + canvasBox.b * 0.55, y: canvasBox.y + canvasBox.h * 0.45 };
  for (const [typ, x, y] of [["mousePressed", greif.x, greif.y], ["mouseMoved", greif.x + 140, greif.y + 90], ["mouseMoved", greif.x + 220, greif.y + 140], ["mouseReleased", greif.x + 220, greif.y + 140]]) {
    await cdp.send("Input.dispatchMouseEvent", { type: typ, x, y, button: "left", clickCount: typ === "mousePressed" ? 1 : 0 });
    await schlafe(120);
  }
  log("Knoten gezogen.");
  await schlafe(800);
  await bild(cdp, "graph-nach-zug.png");
}
log("Ende von Griff 2.");
