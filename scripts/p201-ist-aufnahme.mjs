// P201: die Ist-Aufnahme für den Re-Design-Plan — das INSTALLIERTE Binary,
// gekapselt, 40 verkettete Notizen, alle Hauptansichten fotografiert (1440×900).
// Gestell wie p200-griff-frost.mjs.
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const WURZEL = process.cwd();
const CDP_PORT = Number(process.env.P201_CDP || 3975);
const ARBEIT = "/tmp/kepta-p201";
const APP = process.env.P201_APP || "/Applications/K3PTA.app/Contents/MacOS/K3PTA";
const ZIEL = process.env.P201_ZIEL || "/tmp/kepta-p201-bilder";
fs.rmSync(ARBEIT, { recursive: true, force: true });
fs.mkdirSync(path.join(ARBEIT, "d"), { recursive: true });
fs.mkdirSync(ZIEL, { recursive: true });

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

try {
  const stelle = await warteBis(async () => {
    const liste = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`)).json();
    return liste.find((t) => t.type === "page" && !t.url.startsWith("devtools"));
  }, { maxMs: 45000 });
  const cdp = await Cdp.verbindung(stelle.webSocketDebuggerUrl);
  await cdp.send("Runtime.enable");
  await cdp.send("Page.enable");
  const werte = async (ausdruck) => {
    const r = await cdp.send("Runtime.evaluate", { expression: ausdruck, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.text);
    return r.result?.value;
  };
  await cdp.send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });

  // Säen, neu laden
  const port = await warteBis(async () => {
    const e = JSON.parse(fs.readFileSync(path.join(ARBEIT, "d", "endpoint.json"), "utf8"));
    return e.port;
  }, { maxMs: 60000 });
  const tags = ["md", "json", "txt", "maschine"];
  const konzepte = ["Konzept Alpha", "Konzept Beta", "Konzept Gamma"];
  const dateien = [];
  for (let i = 0; i < 40; i++) {
    const tag = tags[i % tags.length];
    dateien.push({
      name: `G/${tag}-${String(i + 1).padStart(3, "0")}.md`,
      content: ["---", `kepta_id: ist-${i + 1}`, `title: "Q3 Compliance review — client file ${i + 1}"`, `tags: ["${tag}", "compliance", "q3"]`, `created: 1759000000`, `updated: 1760000000`, "---", "",
        `Review notes for the ${tag} workflow. Referenced [[${konzepte[i % 3]}]] and the retention policy. The keeper letter from 14 August needs a follow-up before the audit window opens.`].join("\n"),
    });
  }
  await fetch(`http://127.0.0.1:${port}/api/import/markdown`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ files: dateien }) });
  await cdp.send("Page.reload");
  await warteBis(() => werte(`!!document.querySelector('.sidebar-nav-btn')`), { maxMs: 60000 });
  await werte(`(() => { const b = [...document.querySelectorAll('button')].find(x => /later|skip/i.test(x.textContent || '')); if (b) b.click(); })()`).catch(() => {});
  await schlafe(600);

  const klick = async (text) => {
    const k = await werte(`(() => {
      const b = [...document.querySelectorAll('.sidebar-nav-btn')].find(el => new RegExp('^\\s*' + ${JSON.stringify(text)}, 'i').test(el.textContent || ''));
      if (!b) return null;
      const r = b.getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    })()`);
    if (!k) throw new Error(`Seitenleisten-Knopf "${text}" nicht gefunden`);
    await cdp.send("Input.dispatchMouseEvent", { type: "mousePressed", x: k.x, y: k.y, button: "left", clickCount: 1 });
    await cdp.send("Input.dispatchMouseEvent", { type: "mouseReleased", x: k.x, y: k.y, button: "left", clickCount: 1 });
  };
  const foto = async (name, warte = 600) => {
    await schlafe(warte);
    const s = await cdp.send("Page.captureScreenshot", { format: "png" });
    fs.writeFileSync(path.join(ZIEL, `ist-${name}.png`), Buffer.from(s.data, "base64"));
    console.log(`Foto: ist-${name}.png`);
  };

  await foto("knowledge", 1200);

  // Eine Karte öffnen (Vorschau-Schublade)
  const karte = await werte(`(() => {
    const r = document.querySelector('.row-entry');
    if (!r) return null;
    const k = r.getBoundingClientRect();
    return { x: Math.min(k.x + k.width / 2, 1200), y: k.y + 30 };
  })()`);
  if (karte) {
    await cdp.send("Input.dispatchMouseEvent", { type: "mousePressed", x: karte.x, y: karte.y, button: "left", clickCount: 1 });
    await cdp.send("Input.dispatchMouseEvent", { type: "mouseReleased", x: karte.x, y: karte.y, button: "left", clickCount: 1 });
    await foto("vorschau", 900);
    await cdp.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
    await cdp.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
    await schlafe(400);
  }

  await klick("Today"); await foto("today");
  await klick("Chat"); await foto("chat");
  await klick("Graph"); await foto("graph", 9000);
  await klick("Activity"); await foto("activity");
  await klick("Settings"); await foto("settings");
  console.log("Ist-Aufnahme fertig:", ZIEL);
} catch (f) {
  console.error("FEHLER:", f.message);
  process.exitCode = 1;
} finally {
  app.kill("SIGTERM");
  await schlafe(800);
  app.kill("SIGKILL");
}
