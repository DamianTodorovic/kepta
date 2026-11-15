// Renderer-Diagnose: klickt die echten Sidebar-Nav-Buttons (per Text) und
// scrollt den größten scrollbaren Container hart durch. Misst JS-Heap + DOM.
//
// Diagnose-Befund 21.9.2026 (KEPTA.app mit --remote-debugging-port=9223):
// Idle ~154 MB · nach 3 Scroll-Stürmen ps-RSS 1,1 GB, JS-Heap nach GC nur
// 92 MB · nach Reload DOM frisch (3k Knoten), ps-RSS bleibt hoch — ABER
// `vmmap --summary <pid>` zeigt: Physical footprint 144 MB (Peak 1,2 GB).
// ⇒ KEIN Leak. `ps rss` ist hier die falsche Metrik: macOS gibt freigegebene
// Seiten langsamer zurück, als ps sie anzeigt; maßgeblich ist vmmap/footprint.
// Der 1,2-GB-Peak beim harten Durchscrollen ist der reale Optimierungsansatz
// (Listen-Virtualisierung statt rendern-aller-Karten), kein Defekt.
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
    setTimeout(() => offen.has(i) && (offen.delete(i), verwarf(new Error("timeout " + method))), 45000);
  });
}
async function evaluiere(ausdruck) {
  const r = await send("Runtime.evaluate", { expression: ausdruck, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.text + " " + JSON.stringify(r.exceptionDetails.exception?.description ?? ""));
  return r.result?.value;
}
const navTexte = ["Knowledge", "Today", "Chat", "Graph", "Dossier", "Activity", "Settings"];
async function klickNav(text) {
  return evaluiere(`(() => {
    const b = [...document.querySelectorAll('button')].find(x => x.textContent?.trim() === '${text}');
    if (!b) return false; b.click(); return true;
  })()`);
}
async function heap() {
  return evaluiere(`(() => ({ used: performance.memory?.usedJSHeapSize ?? 0, total: performance.memory?.totalJSHeapSize ?? 0, knoten: document.getElementsByTagName('*').length, karten: document.querySelectorAll('.row-entry').length }))()`);
}
console.log("Start:", JSON.stringify(await heap()));
for (let runde = 0; runde < 3; runde++) {
  for (const t of navTexte) {
    if (await klickNav(t)) await new Promise((r) => setTimeout(r, 800));
  }
  // Knowledge-Ansicht: der größte scrollbare Container wird hart durchgescrollt
  await klickNav("Knowledge");
  await new Promise((r) => setTimeout(r, 1000));
  const höhe = await evaluiere(`(async () => {
    const scrollbar = [...document.querySelectorAll('*')].filter(e => e.scrollHeight > e.clientHeight + 200 && e.clientHeight > 300).sort((a, b) => b.scrollHeight - a.scrollHeight)[0];
    if (!scrollbar) return 0;
    for (let i = 0; i < 40; i++) { scrollbar.scrollBy(0, 2000); await new Promise((r) => setTimeout(r, 60)); }
    return scrollbar.scrollHeight;
  })()`);
  console.log(`Runde ${runde + 1}: Liste ${höhe}px durchgescrollt`, JSON.stringify(await heap()));
}
await send("HeapProfiler.collectGarbage");
await send("HeapProfiler.collectGarbage");
await new Promise((r) => setTimeout(r, 2000));
console.log("Nach GC:", JSON.stringify(await heap()));
ws.close();
process.exit(0);
