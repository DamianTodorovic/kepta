// Erholungstest: Reload des Renderers → wie viel RSS fällt zurück?
// Beweist (oder widerlegt), dass die ~1,1 GB aus dem angesammelten Listen-DOM
// stammen und kein persistenter Leak sind.
const ziel = (await (await fetch("http://127.0.0.1:9223/json")).json()).find((t) => t.type === "page");
const ws = new WebSocket(ziel.webSocketDebuggerUrl);
let id = 0;
const offen = new Map();
ws.onmessage = (e) => {
  const m = JSON.parse(e.data);
  if (m.id && offen.has(m.id)) { offen.get(m.id)(m); offen.delete(m.id); }
};
await new Promise((ok) => { ws.onopen = ok; });
function send(method, params = {}) {
  return new Promise((ok, verwarf) => {
    const i = ++id;
    offen.set(i, (m) => (m.error ? verwarf(new Error(m.error.message)) : ok(m.result)));
    ws.send(JSON.stringify({ id: i, method, params }));
    setTimeout(() => offen.has(i) && (offen.delete(i), verwarf(new Error("timeout " + method))), 30000);
  });
}
await send("Page.enable");
await send("Page.reload", { ignoreCache: true });
await new Promise((r) => setTimeout(r, 8000));
const r = await send("Runtime.evaluate", { expression: `({karten: document.querySelectorAll('.row-entry').length, knoten: document.getElementsByTagName('*').length, heap: performance.memory?.usedJSHeapSize ?? 0})`, returnByValue: true });
console.log("Nach Reload:", JSON.stringify(r.result?.value));
ws.close();
process.exit(0);
