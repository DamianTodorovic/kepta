// eslint-disable-disable-file: Probe-Werkzeug, kein Produktionscode
/* eslint-disable @typescript-eslint/no-unused-expressions, @typescript-eslint/no-unused-vars, no-empty */
// P196 dritter Griff: Regal zu, Force-Sicht, zwei Knoten ziehen, Release-Pinned.
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
const griff = async (c, von, zu) => {
  for (const [typ, x, y] of [["mousePressed", von.x, von.y], ["mouseMoved", von.x + (zu.x - von.x) * 0.5, von.y + (zu.y - von.y) * 0.5], ["mouseMoved", zu.x, zu.y], ["mouseReleased", zu.x, zu.y]]) {
    await c.send("Input.dispatchMouseEvent", { type: typ, x, y, button: "left", clickCount: typ === "mousePressed" ? 1 : 0 });
    await schlafe(90);
  }
};

const l = await (await fetch(`http://127.0.0.1:${CDP}/json/list`)).json();
const ziel = l.find(z => z.type === "page" && z.webSocketDebuggerUrl);
const cdp = await Cdp.verbindung(ziel.webSocketDebuggerUrl);
await cdp.send("Page.enable"); await cdp.send("Runtime.enable");

// Regal schließen
await ausf(cdp, `(()=>{ const b=[...document.querySelectorAll('button')].find(x=>(x.textContent||'').trim()==='Close'); if(b) b.click(); return !!b; })()`);
await schlafe(800); void schlafe;
// Force-Sicht sicher aktivieren
await ausf(cdp, `(()=>{ const b=[...document.querySelectorAll('button')].find(x=>(x.textContent||'').trim()==='Meaning'); if(b) b.click(); return !!b; })()`);
await schlafe(3500);
await bild(cdp, "force-sicht.png");

const box = await ausf(cdp, `(()=>{ const c = document.querySelector('canvas'); const r = c.getBoundingClientRect(); return { x: r.x, y: r.y, b: r.width, h: r.height }; })()`);
// Zwei Knoten in der Bildmitte greifen und wegziehen
await griff(cdp, { x: box.x + box.b * 0.5, y: box.y + box.h * 0.5 }, { x: box.x + box.b * 0.5 + 160, y: box.y + box.h * 0.5 + 110 });
await schlafe(600);
await griff(cdp, { x: box.x + box.b * 0.44, y: box.y + box.h * 0.55 }, { x: box.x + box.b * 0.44 - 150, y: box.y + box.h * 0.55 + 120 });
await schlafe(800);
const zustand = await ausf(cdp, `(()=>{ const b=[...document.querySelectorAll('button')].map(x=>(x.textContent||'').trim()).filter(t=>/release/i.test(t)); return { releaseKnöpfe: b, angeheftet: window.document.querySelectorAll('[data-testid*="pin" i]').length }; })()`);
console.log("NACH ZWEI ZÜGEN:", JSON.stringify(zustand));
await bild(cdp, "nach-zwei-zuegen.png");
// Release-Pinned drücken
const release = await ausf(cdp, `(()=>{ const b=[...document.querySelectorAll('button')].find(x=>/release/i.test((x.textContent||''))); if(b){ b.click(); return b.textContent.trim(); } return null; })()`);
console.log("RELEASE gedrückt:", release);
await schlafe(1200);
await bild(cdp, "nach-release.png");
log("Ende von Griff 3.");
