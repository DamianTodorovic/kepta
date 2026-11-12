// P199: die Sichtprüfung am echten Fenster — gekapselt (eigenes HOME, eigene
// Daten), gemessen mit CDP statt Bauchgefühl. Prüft die Emil-Heilungen dort,
// wo Damian sie sieht: die Ansichts-Blende beim Ansichtswechsel, die Haus-Kurve
// auf den Flächen, den Press-Rücken der Griffe, die Klappen-Herkunft.
// Gestell wie stillstands-repro.mjs: Electron-Kapsel mit Fernschau-Port.
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const WURZEL = process.cwd();
const CDP_PORT = Number(process.env.P199_CDP || 3971);
const ARBEIT = "/tmp/kepta-p199";
// Das INSTALLIERTE Binary — es trägt sein eigenes, für Electron gebautes
// Modul; der Repo-Baum bleibt beim Node-Bau, den die Suite braucht.
const APP = process.env.P199_APP || "/Applications/K3PTA.app/Contents/MacOS/K3PTA";
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

const funde = [];
const pruefe = (name, gut, beweis = "") => {
  funde.push({ name, gut, beweis });
  console.log(`${gut ? "  ✓" : "  ✗"} ${name}${beweis ? ` — ${beweis}` : ""}`);
};

const app = spawn(APP, [`--remote-debugging-port=${CDP_PORT}`], {
  cwd: WURZEL,
  env: { ...process.env, HOME: path.join(ARBEIT, "h"), KEPTA_DATA_DIR: path.join(ARBEIT, "d"), KEPTA_ENCRYPTION: "off", KEPTA_DB_KEY: "0".repeat(64) },
  stdio: ["ignore", "pipe", "pipe"],
});
app.stdout.on("data", () => {});
app.stderr.on("data", (d) => { const z = String(d).trim(); if (z && !z.includes("Secure MAC usage")) console.error("[app]", z.slice(0, 200)); });

try {
  // 1) Fernschau-Stelle finden
  const stelle = await warteBis(async () => {
    const liste = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`)).json();
    return liste.find((t) => t.type === "page" && !t.url.startsWith("devtools"));
  }, { maxMs: 45000 });
  if (!stelle) throw new Error("keine Fenster-Stelle in der Fernsicht");
  const cdp = await Cdp.verbindung(stelle.webSocketDebuggerUrl);
  await cdp.send("Runtime.enable");
  await cdp.send("Page.enable");

  const werte = async (ausdruck) => {
    const r = await cdp.send("Runtime.evaluate", { expression: ausdruck, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.text + " " + JSON.stringify(r.exceptionDetails.exception?.description || "").slice(0, 200));
    return r.result?.value;
  };

  // 2) Oberfläche warten
  await warteBis(() => werte(`!!document.querySelector('.sidebar-nav-btn') && !!document.body`), { maxMs: 60000 });

  // 3) Assistent beiseiteräumen, falls er frisch aufsteht
  await werte(`(() => {
    const knoepfe = [...document.querySelectorAll('button')];
    const skip = knoepfe.find(b => /later|skip|später|spater|maybe/i.test(b.textContent || ''));
    if (skip) { skip.click(); return 'assistent übergangen'; }
    return 'kein Assistent';
  })()`).catch(() => {});
  await schlafe(400);

  // 4) Die Messungen
  const kurve = await werte(`getComputedStyle(document.querySelector('.btn-primary')).transitionTimingFunction`);
  pruefe("Haus-Kurve auf .btn-primary", /cubic-bezier\(0\.2, 0\.8, 0\.2, 1\)/.test(String(kurve)), String(kurve).slice(0, 60));

  const knob = await werte(`getComputedStyle(document.querySelector('.switch .knob') || document.body).transitionTimingFunction`);
  pruefe("Haus-Kurve auf dem Schalter-Knopf", /cubic-bezier\(0\.2, 0\.8, 0\.2, 1\)/.test(String(knob)), String(knob).slice(0, 60));

  // Press-Rücken aus dem Stylesheet (die Flächen existieren nicht auf jedem
  // Schirm). Der Minifier splittet Gruppenselektoren — SAMMELN statt nur die
  // letzte Regel zu nehmen:
  const ruecken = await werte(`(() => {
    const fund = { gefahr: [], gefahrAktiv: [], leise: [], leiseAktiv: [] };
    for (const blatt of document.styleSheets) {
      let regeln; try { regeln = blatt.cssRules; } catch { continue; }
      for (const r of regeln) {
        if (!r.selectorText) continue;
        // Auch verschachtelte Ebenen (@layer/@media) abklappern:
        const stappel = [r];
        while (stappel.length) {
          const k = stappel.pop();
          if (k.selectorText) {
            if (k.selectorText === '.btn-danger-ghost') fund.gefahr.push(k.cssText.slice(0, 600));
            if (k.selectorText === '.btn-danger-ghost:active') fund.gefahrAktiv.push(k.style.transform);
            if (k.selectorText === 'button.row-quiet') fund.leise.push(k.cssText.slice(0, 220));
            if (k.selectorText === 'button.row-quiet:active') fund.leiseAktiv.push(k.style.transform);
          }
          if (k.cssRules && k.cssRules.length) stappel.push(...k.cssRules);
        }
      }
    }
    return fund;
  })()`);
  pruefe("Press-Rücken .btn-danger-ghost (transform in der Übergangsliste + :active)",
    ruecken.gefahr.some((t) => /transform/.test(String(t))) && ruecken.gefahrAktiv.some((t) => /scale/.test(String(t))),
    `transition: ${ruecken.gefahr.join(" / ").slice(0, 90)} | aktiv: ${ruecken.gefahrAktiv.join(" / ")}`);
  pruefe("Press-Rücken button.row-quiet",
    ruecken.leise.some((t) => /transform/.test(String(t))) && ruecken.leiseAktiv.some((t) => /scale/.test(String(t))),
    `transition: ${ruecken.leise.join(" / ").slice(0, 90)} | aktiv: ${ruecken.leiseAktiv.join(" / ")}`);


  // Die Ansichts-Blende: Einstellungen rufen (echter Tastendruck ⌘4), dann die
  // frisch eingeblendete Umhüllung tasten — ihre Deckkraft muss unter 1 rutschen
  // und bei 1 landen.
  const stellteBlende = await werte(`(() => {
    const w = [...document.querySelectorAll('.ansicht-blende')];
    return w.length; // es gibt 8 Umhüllungen
  })()`);
  pruefe("8 Ansichts-Umhüllungen tragen die Blende", stellteBlende === 8, `${stellteBlende} gefunden`);

  // Einstellungen per ECHTEM Mausklick rufen (Tastatur-Ereignisse erreichen
  // das Fenster nicht zuverlässig aus der Kapsel):
  const settingsKasten = await werte(`(() => {
    const b = [...document.querySelectorAll('.sidebar-nav-btn')].find(el => /settings/i.test(el.textContent || ''));
    if (!b) return null;
    const k = b.getBoundingClientRect();
    return { x: k.x + k.width / 2, y: k.y + k.height / 2 };
  })()`);
  if (!settingsKasten) { pruefe("Einstellungen-Knopf gefunden", false, "kein sidebar-nav-btn mit 'Settings'"); }
  else {
    await cdp.send("Input.dispatchMouseEvent", { type: "mousePressed", x: settingsKasten.x, y: settingsKasten.y, button: "left", clickCount: 1 });
    await cdp.send("Input.dispatchMouseEvent", { type: "mouseReleased", x: settingsKasten.x, y: settingsKasten.y, button: "left", clickCount: 1 });
  }
  const opazitaetSpur = await werte(`(async () => {
    const w = [...document.querySelectorAll('.ansicht-blende')].find(el => getComputedStyle(el).display !== 'none' && el.querySelector('.hud-panel'));
    if (!w) return { fund: false };
    const spur = [];
    const t0 = performance.now();
    while (performance.now() - t0 < 320) {
      spur.push(Number(getComputedStyle(w).opacity));
      await new Promise(r => requestAnimationFrame(() => r()));
    }
    return { fund: true, spur, min: Math.min(...spur), ende: spur[spur.length - 1] };
  })()`);
  if (opazitaetSpur.fund === false) {
    pruefe("Ansichts-Blende tastbar", false, "Einstellungen-Umhüllung nicht gefunden");
  } else {
    pruefe("Ansichts-Blende: Deckkraft rutscht und landet bei 1", opazitaetSpur.min < 0.999 && opazitaetSpur.ende === 1,
      `min=${opazitaetSpur.min.toFixed(3)} ende=${opazitaetSpur.ende}`);
  }

  await schlafe(300);
  const bild = await cdp.send("Page.captureScreenshot", { format: "png" });
  fs.mkdirSync("/tmp/kepta-p199-bilder", { recursive: true });
  fs.writeFileSync("/tmp/kepta-p199-bilder/p199-einstellungen.png", Buffer.from(bild.data, "base64"));
  console.log("Bild: /tmp/kepta-p199-bilder/p199-einstellungen.png");
} catch (f) {
  console.error("FEHLER:", f.message);
  process.exitCode = 1;
} finally {
  app.kill("SIGTERM");
  await schlafe(800);
  app.kill("SIGKILL");
}

const kaputt = funde.filter((f) => !f.gut);
console.log(`\nP199-Sichtprüfung: ${funde.length - kaputt.length}/${funde.length} Messungen bestanden`);
process.exit(kaputt.length ? 1 : 0);
