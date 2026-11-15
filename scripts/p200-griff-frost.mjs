// P200: der Griff-Frost-Beweis am INSTALLIERTEN Binary — gekapselt (eigenes
// HOME, eigene Daten), 40 verkettete Notizen, echter Mausgriff auf die
// Leinwand: Knoten fassen, wegziehen, HALTEN — während des Haltens darf sich
// KEIN Pixel rühren (vorher schob die Kollision jeden Bild die Nachbarn weg).
// Gestell wie p199-sichtpruefung.mjs.
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const WURZEL = process.cwd();
const CDP_PORT = Number(process.env.P200_CDP || 3973);
const ARBEIT = "/tmp/kepta-p200";
const APP = process.env.P200_APP || "/Applications/K3PTA.app/Contents/MacOS/K3PTA";
fs.rmSync(ARBEIT, { recursive: true, force: true });
fs.mkdirSync(path.join(ARBEIT, "d"), { recursive: true });

const schlafe = (ms) => new Promise((r) => setTimeout(r, ms));
async function warteBis(fn, { maxMs = 60000, schritt = 400 } = {}) {
  const bis = Date.now() + maxMs;
  for (;;) {
    try { const v = await fn(); if (v) return v; } catch { /* noch nicht */ }
    if (Date.now() > bis) return null;
    await schlafe(schritt);
  }
}

class Cdp {
  constructor(ws) { this.ws = ws; this.nr = 0; this.offen = new Map(); }
  static async verbindung(url) {
    const ws = await new Promise((los, fehler) => {
      const w = new WebSocket(url);
      w.onopen = () => los(w);
      w.onerror = (e) => fehler(e.error || new Error("ws fehlgeschlagen"));
    });
    const c = new Cdp(ws);
    ws.onmessage = (e) => {
      const n = JSON.parse(e.data);
      if (n.id && c.offen.has(n.id)) {
        const { los, fehler } = c.offen.get(n.id);
        c.offen.delete(n.id);
        if (n.error) fehler(new Error(n.error.message)); else los(n.result);
      }
    };
    ws.onclose = () => { c.zu = true; };
    return c;
  }
  send(e, params = {}, timeoutMs = 10000) {
    if (this.zu) return Promise.reject(new Error("VERBINDUNG ZU"));
    const id = ++this.nr;
    const p = new Promise((los, fehler) => {
      this.offen.set(id, { los, fehler });
      setTimeout(() => { if (this.offen.has(id)) { this.offen.delete(id); fehler(new Error("ZEIT UM")); } }, timeoutMs);
    });
    this.ws.send(JSON.stringify({ id, method: e, params }));
    return p;
  }
}

const app = spawn(APP, [`--remote-debugging-port=${CDP_PORT}`], {
  cwd: WURZEL,
  env: { ...process.env, HOME: path.join(ARBEIT, "h"), KEPTA_DATA_DIR: path.join(ARBEIT, "d"), KEPTA_ENCRYPTION: "off", KEPTA_DB_KEY: "0".repeat(64) },
  stdio: ["ignore", "pipe", "pipe"],
});
app.stderr.on("data", () => {});

const funde = [];
const pruefe = (name, gut, beweis = "") => {
  funde.push({ name, gut });
  console.log(`${gut ? "  ✓" : "  ✗"} ${name}${beweis ? ` — ${beweis}` : ""}`);
};

try {
  const stelle = await warteBis(async () => {
    const liste = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`)).json();
    return liste.find((t) => t.type === "page" && !t.url.startsWith("devtools"));
  }, { maxMs: 45000 });
  if (!stelle) throw new Error("keine Fenster-Stelle");
  const cdp = await Cdp.verbindung(stelle.webSocketDebuggerUrl);
  await cdp.send("Runtime.enable");
  await cdp.send("Page.enable");
  const werte = async (ausdruck) => {
    const r = await cdp.send("Runtime.evaluate", { expression: ausdruck, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.text);
    return r.result?.value;
  };

  // 1) Server-Port aus dem Kapsel-Datenordner, 40 verkettete Notizen säen
  const port = await warteBis(async () => {
    const e = JSON.parse(fs.readFileSync(path.join(ARBEIT, "d", "endpoint.json"), "utf8"));
    return e.port;
  }, { maxMs: 60000 });
  const tags = ["md", "json", "txt", "maschine"];
  const dateien = [];
  for (let i = 0; i < 40; i++) {
    const tag = tags[i % tags.length];
    dateien.push({
      name: `G/${tag}-${String(i + 1).padStart(3, "0")}.md`,
      content: ["---", `kepta_id: frost-${i + 1}`, `title: "Frost-Notiz ${i + 1}"`, `tags: ["${tag}", "frost"]`, "---", "",
        `Inhalt ${i + 1} über [[Konzept Frost]] und Fristen.`].join("\n"),
    });
  }
  await fetch(`http://127.0.0.1:${port}/api/import/markdown`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ files: dateien }) });
  const bestand = await (await fetch(`http://127.0.0.1:${port}/api/memories?limit=1`)).json();
  const saat = Array.isArray(bestand) ? bestand.length : (bestand.memories?.length ?? bestand.total ?? 0);
  console.log(`40 Notizen gesät (Probe liest ${saat}).`);
  await cdp.send("Page.reload");
  await warteBis(() => werte(`!!document.querySelector('.sidebar-nav-btn')`), { maxMs: 60000 });

  // 2) Assistent beiseite, dann per echtem Klick in den Graphen
  await werte(`(() => { const b = [...document.querySelectorAll('button')].find(x => /later|skip/i.test(x.textContent || '')); if (b) b.click(); })()`).catch(() => {});
  await schlafe(400);
  const graphKasten = await werte(`(() => {
    const b = [...document.querySelectorAll('.sidebar-nav-btn')].find(el => /graph/i.test(el.textContent || ''));
    if (!b) return null;
    const k = b.getBoundingClientRect();
    return { x: k.x + k.width / 2, y: k.y + k.height / 2 };
  })()`);
  await cdp.send("Input.dispatchMouseEvent", { type: "mousePressed", x: graphKasten.x, y: graphKasten.y, button: "left", clickCount: 1 });
  await cdp.send("Input.dispatchMouseEvent", { type: "mouseReleased", x: graphKasten.x, y: graphKasten.y, button: "left", clickCount: 1 });
  const leinwand = await warteBis(async () => {
    const k = await werte(`(() => { const c = document.querySelector('canvas[role="application"]'); if (!c) return null; const r = c.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; })()`);
    return k && k.w > 300 ? k : null;
  }, { maxMs: 30000 });
  await schlafe(8000); // das Feld einsitzen lassen (Alpha braucht ~5,5 s bis kalt)

  // 3) Einen Knoten DETERMINISTISCH finden: das Knoten-Innere ist der einzige
  //    solid helle Fleck auf der dunklen Leinwand (Schrift streut, Kanten sind
  //    dünn). Dann zeigt der Cursor den Treffer (hovered → grab).
  const greifPunkt = await warteBis(async () => {
    const kandidaten = await werte(`(() => {
      const c = document.querySelector('canvas[role="application"]');
      const r = c.getBoundingClientRect();
      const verhaeltnis = c.width / r.width;
      const mitteBX = Math.floor((r.width / 2) * verhaeltnis);
      const mitteBY = Math.floor((r.height / 2) * verhaeltnis);
      const s = 130 * verhaeltnis;
      const img = c.getContext('2d').getImageData(mitteBX - s, mitteBY - s, s * 2, s * 2).data;
      const w = s * 2, funde = [];
      for (let y = 8; y < w - 8; y += 4) {
        for (let x = 8; x < w - 8; x += 4) {
          let hell = 0, alle = 0;
          for (let dy = -8; dy <= 8; dy += 4) {
            for (let dx = -8; dx <= 8; dx += 4) {
              const i = ((y + dy) * w + (x + dx)) * 4;
              alle++; if (img[i] + img[i + 1] + img[i + 2] > 240) hell++;
            }
          }
          if (hell === alle) funde.push({ x: x - s, y: y - s });
        }
      }
      if (!funde.length) return [];
      funde.sort((a, b) => (a.x * a.x + a.y * a.y) - (b.x * b.x + b.y * b.y));
      return funde.slice(0, 6).map(k => ({ x: r.x + r.width / 2 + k.x / verhaeltnis, y: r.y + r.height / 2 + k.y / verhaeltnis }));
    })()`);
    for (const k of kandidaten) {
      await cdp.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: k.x, y: k.y });
      await schlafe(220);
      const zeiger = await werte(`getComputedStyle(document.querySelector('canvas[role=\\"application\\"]')).cursor`);
      if (zeiger === "grab" || zeiger === "pointer") return k;
    }
    return null;
  }, { maxMs: 20000 });
  if (!greifPunkt) throw new Error("kein Knoten unter dem Zeiger gefunden");
  const mitte = greifPunkt;
  // Nur die Leinwand messen — im Kopf steht seit P199 der Agenten-Puls
  // (data-laeuft), der wäre ein fremder Animator im Pixelvergleich.
  const bild = async () => {
    const s = await cdp.send("Page.captureScreenshot", {
      format: "png",
      clip: { x: leinwand.x, y: leinwand.y, width: leinwand.w, height: leinwand.h, scale: 1 },
    });
    return Buffer.from(s.data, "base64");
  };
  const s0 = await bild("vorher");
  await cdp.send("Input.dispatchMouseEvent", { type: "mousePressed", x: mitte.x, y: mitte.y, button: "left", clickCount: 1 });
  for (let i = 1; i <= 9; i++) {
    await cdp.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: mitte.x + i * 10, y: mitte.y - i * 4, button: "left" });
    await schlafe(30);
  }
  await schlafe(250);
  const s1 = await bild("halt-1");
  await schlafe(700);
  const s2 = await bild("halt-2");
  await cdp.send("Input.dispatchMouseEvent", { type: "mouseReleased", x: mitte.x + 90, y: mitte.y - 36, button: "left", clickCount: 1 });
  await schlafe(400);
  const s3 = await bild("nachher");

  pruefe("HALTEN friert das Bild (zwei Halt-Bilder pixelgleich)", s1.equals(s2), `${s1.length} bytes`);
  pruefe("Die Geste hat das Bild verändert (gezogen, nicht danebengegriffen)", !s0.equals(s3));
} catch (f) {
  console.error("FEHLER:", f.message);
  process.exitCode = 1;
} finally {
  app.kill("SIGTERM");
  await schlafe(800);
  app.kill("SIGKILL");
}

const kaputt = funde.filter((f) => !f.gut);
console.log(`\nP200-Griff-Frost: ${funde.length - kaputt.length}/${funde.length} Messungen bestanden`);
process.exit(kaputt.length ? 1 : 0);
