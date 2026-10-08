// Nimmt die Screenshots und die Einzelbilder des Demo-GIFs neu auf —
// reproduzierbar, mit dem erfundenen Demo-Korpus (scripts/demo-korpus.mjs) und
// nie mit echten Daten: eigener Server, leerer Datenordner, eigenes HOME,
// eigener Datenbank-Schlüssel (der Schlüsselbund des Systems bleibt unberührt)
// und eine frische Browser-Sitzung ohne gespeicherten Zustand.
//
// Seit 2.13 arbeiten dabei zwei KI-Apps über den echten MCP-Server mit dem
// Gedächtnis (Claude und Cursor), eine Notiz ist privat, und das Demo-HOME
// enthält die Einstellungen von Claude Desktop, Cursor und VS Code — so zeigen
// Today, Dossier, Activity, Audit log, der Schild und „Connect“ echte Zustände.
// Bilder: 01-index, 03-graph, 04-dendrogram, 04-editor, 05-setup, 06-search,
// 07-today, 08-dossier, 09-activity, 10-audit, 11-privacy, 12-connect.
//
//   npm run screenshots                      # nur die Screenshots
//   KEPTA_DEMO_FRAMES=/tmp/x npm run screenshots   # dazu die Einzelbilder des GIFs
//
// Aus den Einzelbildern wird docs/demo.gif mit ffmpeg (≥ 7) — 1280 px breit,
// eine Palette für den ganzen Film, jedes Bild mit seiner echten Dauer:
//
//   cd /tmp/x && ffmpeg -f concat -safe 0 -i liste.txt -vf "scale=1280:-1:flags=lanczos,split[a][b];[a]palettegen=stats_mode=full:max_colors=256[p];[b][p]paletteuse=dither=sierra2_4a:diff_mode=rectangle" -fps_mode vfr -loop 0 docs/demo.gif
import { app, BrowserWindow, nativeTheme } from "electron";
import { spawn } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { saeDemo } from "./demo-korpus.mjs";

const wurzel = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ziel = path.join(wurzel, "docs", "screenshots");
const bilderOrdner = process.env.KEPTA_DEMO_FRAMES || null;
const BREITE = 1280;
const HOEHE = 800;
/** Doppelt gerendert, dann verkleinert: scharfe Schrift, vertretbare Dateigröße. */
const AUSGABE = 1600;

app.commandLine.appendSwitch("force-device-scale-factor", "2");
app.commandLine.appendSwitch("lang", "en-US");
// Ein verdecktes Fenster setzt Chromium aus — und ohne Compositor keine Unschärfe.
app.commandLine.appendSwitch("disable-backgrounding-occluded-windows");

const warte = (ms) => new Promise((r) => setTimeout(r, ms));

function freierPort() {
  return new Promise((res, rej) => {
    const srv = net.createServer();
    srv.listen(0, "127.0.0.1", () => {
      const { port } = srv.address();
      srv.close(() => res(port));
    });
    srv.on("error", rej);
  });
}

async function starteServer() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "kepta-shots-"));
  const home = path.join(tmp, "home");
  fs.mkdirSync(home);
  fs.mkdirSync(path.join(tmp, "data"));
  // Die KI-Apps, die „Connect your AI apps“ zeigen soll — nur im Demo-HOME:
  // Claude Desktop und Cursor sind verbunden, VS Code ist da, aber noch nicht.
  const eintrag = { command: "/Applications/KEPTA.app/Contents/MacOS/KEPTA", args: ["/Applications/KEPTA.app/Contents/Resources/app.asar/dist/mcp-server.cjs"], env: { ELECTRON_RUN_AS_NODE: "1" } };
  const programme = path.join(home, "Library", "Application Support");
  for (const [ordner, datei] of [[path.join(programme, "Claude"), "claude_desktop_config.json"], [path.join(home, ".cursor"), "mcp.json"]]) {
    fs.mkdirSync(ordner, { recursive: true });
    fs.writeFileSync(path.join(ordner, datei), JSON.stringify({ mcpServers: { kepta: eintrag } }, null, 2));
  }
  fs.mkdirSync(path.join(programme, "Code", "User"), { recursive: true });
  const port = await freierPort();
  const env = {
    ...process.env,
    PORT: String(port),
    HOME: home,
    USERPROFILE: home,
    KEPTA_DATA_DIR: path.join(tmp, "data"),
    KEPTA_DB_KEY: crypto.randomBytes(32).toString("hex"),
    NODE_ENV: "production",
  };
  const kind = spawn("node", [path.join(wurzel, "dist", "server.cjs")], { env, stdio: ["ignore", "ignore", "inherit"] });
  const basis = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 150; i++) {
    try {
      if ((await fetch(`${basis}/api/health`)).ok) return { basis, kind, tmp, env };
    } catch { /* startet noch */ }
    await warte(100);
  }
  kind.kill();
  throw new Error("Der Demo-Server ist nicht hochgekommen — erst `npm run build`?");
}

/**
 * Eine KI-App arbeitet mit dem Gedächtnis — über den MCP-Server aus dist, wie
 * im Alltag, mit demselben Datenordner und Schlüssel wie der Demo-Server. Jeder
 * Aufruf wartet auf seine Antwort, damit Aktivität und Protokoll der Reihe nach laufen.
 */
async function kiSitzung(env, client, aufrufe) {
  const kind = spawn("node", [path.join(wurzel, "dist", "mcp-server.cjs")], { env, stdio: ["pipe", "pipe", "inherit"] });
  const antworten = new Map();
  let rest = "";
  kind.stdout.on("data", (d) => {
    rest += d;
    for (let i = rest.indexOf("\n"); i >= 0; i = rest.indexOf("\n")) {
      const zeile = rest.slice(0, i);
      rest = rest.slice(i + 1);
      try {
        const m = JSON.parse(zeile);
        if (m.id !== undefined) antworten.set(m.id, m);
      } catch { /* keine JSON-Zeile */ }
    }
  });
  const frage = async (id, nachricht) => {
    kind.stdin.write(JSON.stringify(nachricht) + "\n");
    for (let t = 0; t < 300 && !antworten.has(id); t++) await warte(50);
    const a = antworten.get(id);
    if (!a || a.error || a.result?.isError) throw new Error(`${client}: ${JSON.stringify(a ?? "keine Antwort").slice(0, 300)}`);
  };
  try {
    await frage(0, { jsonrpc: "2.0", id: 0, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: client, version: "1.0" } } });
    kind.stdin.write(JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }) + "\n");
    for (const [i, [name, args]] of aufrufe.entries()) {
      await frage(i + 1, { jsonrpc: "2.0", id: i + 1, method: "tools/call", params: { name, arguments: args } });
      await warte(400);
    }
  } finally {
    kind.stdin.end();
    kind.kill();
  }
}

/** Claude sucht, speichert den unterschriebenen Betrag — der dem Angebot widerspricht — und Cursor sucht Anleitungen. */
const CLAUDE = [
  ["memory_search", { query: "Lumen retainer" }],
  ["memory_save", { title: "Lumen retainer — signed", content: "The signed Lumen & Co. retainer is 4,500 EUR per quarter, billed at the start of each quarter.", type: "semantic", tags: ["client", "pricing"] }],
  ["memory_search", { query: "month-end report Nordwind" }],
];
const CURSOR = [
  ["memory_search", { query: "rotate API keys" }],
  ["memory_search", { query: "staging server deploy" }],
];
/** Was der Privatsphäre-Schild vor einer Cloud-KI verbirgt — frei erfunden, die IBAN ist die übliche Beispielnummer. */
const SCHILD_PROBE = "Please send the Lumen invoice to billing@lumen.example, IBAN DE89 3704 0044 0532 0130 00 — questions to +49 170 1234567.";

/** Wartet, bis die Hintergrund-Einbettung durch ist (ohne Ollama: sofort weiter). */
async function warteAufEinbettung(basis) {
  for (let i = 0; i < 120; i++) {
    const h = await (await fetch(`${basis}/api/health`)).json();
    const e = h.embeddings ?? {};
    if (!e.total || e.embedded >= e.total) return e;
    await warte(1000);
  }
  return null;
}

/** Kleine Helfer im Fenster: tippen (React-tauglich), Knopf, Karte, Ansicht, Zeitregler. */
const HILFEN = `
  window.__k = window.__k || {
    feld(p) { return [...document.querySelectorAll('input,textarea')].find((e) => (e.placeholder || '').startsWith(p)); },
    tippe(p, text) {
      const el = this.feld(p);
      if (!el) return false;
      const setzer = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), 'value').set;
      el.focus();
      setzer.call(el, text);
      el.dispatchEvent(new Event('input', { bubbles: true }));
      return true;
    },
    klicke(text) {
      const knoepfe = [...document.querySelectorAll('button')];
      const el = knoepfe.find((b) => b.textContent.trim() === text) ?? knoepfe.find((b) => b.textContent.trim().startsWith(text));
      el?.click();
      return !!el;
    },
    titel(anfang) {
      const el = document.querySelector('button[title^="' + anfang + '"]');
      el?.click();
      return !!el;
    },
    karte(titel) {
      const el = [...document.querySelectorAll('body *')].find((e) => e.children.length === 0 && e.textContent.trim() === titel);
      el?.click();
      return !!el;
    },
    ansicht(n) {
      document.activeElement?.blur?.();
      window.dispatchEvent(new KeyboardEvent('keydown', { key: String(n), metaKey: true, ctrlKey: true, bubbles: true }));
      return true;
    },
    zeit(wert) {
      const el = document.querySelector('input[aria-label="Time of the knowledge shown"]');
      if (!el) return false;
      const setzer = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
      setzer.call(el, String(wert));
      el.dispatchEvent(new Event('input', { bubbles: true }));
      return true;
    },
  };
  true;
`;

async function tu(win, aufruf) {
  const ok = await win.webContents.executeJavaScript(`${HILFEN}; window.__k.${aufruf}`);
  if (ok !== true) throw new Error(`Im Fenster nicht gefunden: ${aufruf}`);
}

/**
 * Der ganze Baum passt nur bei 18 % ins Bild — ein unlesbarer Strich. Fünf
 * Stufen hineinzoomen (≈ 55 %) zeigt Wurzel, Wissensarten und lesbare Notizen.
 */
async function baumLesbar(win) {
  await tu(win, `titel("Fit the whole graph")`);
  await warte(900);
  for (let i = 0; i < 5; i++) { await tu(win, `titel("Zoom in")`); await warte(250); }
  await warte(1200);
}

async function aufnehmen(win, name) {
  const bild = await win.webContents.capturePage();
  if (bild.isEmpty()) throw new Error(`${name}: leeres Bild`);
  const png = bild.resize({ width: AUSGABE, quality: "best" }).toPNG();
  fs.writeFileSync(path.join(ziel, name), png);
  const { width, height } = bild.getSize();
  console.log(`${name}: ${width}×${height} → ${AUSGABE} px breit, ${(png.length / 1024).toFixed(0)} kB`);
}

/** Einzelbilder fürs GIF, mit echter Zeit je Bild — das GIF läuft so im echten Tempo. */
function neuerFilm(ordner) {
  fs.mkdirSync(ordner, { recursive: true });
  const bilder = [];
  let letzte = null;
  return {
    async bild(win) {
      const b = await win.webContents.capturePage();
      const jetzt = Date.now();
      if (letzte !== null) bilder[bilder.length - 1].dauer = (jetzt - letzte) / 1000;
      const datei = `f${String(bilder.length).padStart(4, "0")}.png`;
      fs.writeFileSync(path.join(ordner, datei), b.resize({ width: AUSGABE, quality: "best" }).toPNG());
      bilder.push({ datei, dauer: 0.08 });
      letzte = jetzt;
    },
    async halte(win, sekunden) {
      const ende = Date.now() + sekunden * 1000;
      while (Date.now() < ende) { await this.bild(win); await warte(40); }
    },
    /** Ein harter Schnitt: was bis zum nächsten Bild geschieht, kommt nicht in den Film. */
    schnitt() {
      if (letzte !== null) bilder[bilder.length - 1].dauer = (Date.now() - letzte) / 1000;
      letzte = null;
    },
    schreibe() {
      const zeilen = bilder.flatMap((b) => [`file '${b.datei}'`, `duration ${b.dauer.toFixed(3)}`]);
      zeilen.push(`file '${bilder[bilder.length - 1].datei}'`);
      fs.writeFileSync(path.join(ordner, "liste.txt"), zeilen.join("\n") + "\n");
      const dauer = bilder.reduce((s, b) => s + b.dauer, 0);
      console.log(`Demo: ${bilder.length} Bilder, ${dauer.toFixed(1)} s → ${ordner}`);
    },
  };
}

app.whenReady().then(async () => {
  nativeTheme.themeSource = "dark";
  let server;
  try {
    server = await starteServer();
    console.log(`Demo-Korpus: ${await saeDemo(server.basis)} Notizen`);
    // Eine private Notiz: keine KI-App sieht sie, keine Cloud bekommt sie.
    const privat = await fetch(`${server.basis}/api/memories`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Salary review notes", content: "Raises for the bookkeeping team from October. The figures stay in the HR folder.", type: "semantic", tags: ["team"], scope: "private" }),
    });
    if (!privat.ok) throw new Error(`Private Notiz: HTTP ${privat.status}`);
    const e = await warteAufEinbettung(server.basis);
    console.log(`Einbettung: ${e ? `${e.embedded}/${e.total}` : "nicht fertig geworden"}`);

    const win = new BrowserWindow({
      width: BREITE,
      height: HOEHE,
      show: false,
      paintWhenInitiallyHidden: true,
      backgroundColor: "#060607",
      // Ohne "persist:" lebt die Sitzung nur im Speicher: kein Zustand aus früheren Läufen.
      webPreferences: { partition: `kepta-shots-${Date.now()}`, contextIsolation: true, sandbox: true, backgroundThrottling: false },
    });
    win.setAlwaysOnTop(true, "floating");
    win.showInactive();
    await win.loadURL(server.basis);
    // Den Einrichtungsassistenten zurückstellen, wie mit "Later" — und neu laden.
    // Den Einrichtungsassistenten zurückstellen und den letzten Besuch von Today
    // auf „jetzt“ setzen: was die KI-Apps gleich tun, ist dann „seit deinem letzten Besuch“.
    await win.webContents.executeJavaScript(`localStorage.setItem('ki_gehirn_wizard_dismissed', '1'); localStorage.setItem('kepta_last_today', String(${Date.now()})); location.reload(); true`);
    await warte(4000);
    await kiSitzung(server.env, "claude-ai", CLAUDE);
    await kiSitzung(server.env, "cursor", CURSOR);
    await warte(2500);
    await aufnehmen(win, "01-index.png");

    await tu(win, `tippe("Search", "client data")`);
    await warte(3000);
    await aufnehmen(win, "06-search.png");
    await tu(win, `tippe("Search", "")`);
    await warte(800);

    await tu(win, "ansicht(3)");
    await warte(8000);
    await tu(win, `titel("Fit the whole graph")`);
    await warte(1500);
    await aufnehmen(win, "03-graph.png");

    await tu(win, `titel("Dendrogram")`);
    await warte(3500);
    await baumLesbar(win);
    await aufnehmen(win, "04-dendrogram.png");

    if (bilderOrdner) {
      // Das Demo: der Graph wächst über 18 Monate, dann derselbe Bestand als Baum.
      // Die Umschaltung bleibt ungefilmt — der Baum erscheint erst beim alten Zoom
      // und muss eingepasst werden; im Film wären das leere und winzige Bilder.
      await tu(win, `titel("Force view")`);
      await warte(5000);
      await tu(win, `titel("Fit the whole graph")`);
      await warte(1200);
      const film = neuerFilm(bilderOrdner);
      await tu(win, "zeit(0)");
      await warte(900);
      await film.halte(win, 0.8);
      for (let w = 0; w <= 100; w += 1.5) {
        await tu(win, `zeit(${Math.min(w, 100)})`);
        await warte(35);
        await film.bild(win);
      }
      await tu(win, "zeit(100)");
      await film.halte(win, 2.2);
      film.schnitt();
      await tu(win, `titel("Dendrogram")`);
      await warte(3500);
      await baumLesbar(win);
      await film.halte(win, 3.2);
      film.schreibe();
    }

    await tu(win, "ansicht(1)");
    await warte(1500);
    await tu(win, `karte("Project Atlas — goals")`);
    await warte(1200);
    await tu(win, `klicke("Edit")`);
    await warte(1500);
    // Den Schalter „Private“ unter den Tags mit ins Bild holen. Der Editor liegt im
    // DOM hinter der Liste — darum der letzte Treffer, nicht das Abzeichen einer Karte.
    await win.webContents.executeJavaScript(`(() => {
      const p = [...document.querySelectorAll('body *')].filter((e) => e.children.length === 0 && e.textContent.trim() === 'Private').pop();
      p?.scrollIntoView({ block: 'end' });
      return true;
    })()`);
    await warte(800);
    await aufnehmen(win, "04-editor.png");
    await win.webContents.executeJavaScript("document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); true");
    await warte(800);

    await tu(win, "ansicht(4)");
    await warte(2500);
    await aufnehmen(win, "05-setup.png");

    // Der Privatsphäre-Schild mit einem Satz, wie ihn eine Cloud-KI zu sehen bekäme.
    const schild = await win.webContents.executeJavaScript(`(() => {
      const kopf = [...document.querySelectorAll('body *')].find((e) => e.children.length === 0 && e.textContent.trim() === 'Privacy shield');
      const feld = document.getElementById('shield-probe');
      if (!kopf || !feld) return false;
      kopf.scrollIntoView({ block: 'start' });
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(feld, ${JSON.stringify(SCHILD_PROBE)});
      feld.dispatchEvent(new Event('input', { bubbles: true }));
      return true;
    })()`);
    if (schild !== true) throw new Error("Privatsphäre-Schild nicht gefunden");
    await warte(1500);
    await aufnehmen(win, "11-privacy.png");

    await tu(win, `klicke("MCP")`);
    await warte(2000);
    // Der Reiter erbt die Scroll-Position vom Schild — „Connect your AI apps“ nach oben holen.
    const verbinden = await win.webContents.executeJavaScript(`(() => {
      const kopf = [...document.querySelectorAll('body *')].find((e) => e.children.length === 0 && e.textContent.trim() === 'Connect your AI apps');
      kopf?.scrollIntoView({ block: 'start' });
      return !!kopf;
    })()`);
    if (verbinden !== true) throw new Error("„Connect your AI apps“ nicht gefunden");
    await warte(1200);
    await aufnehmen(win, "12-connect.png");

    await tu(win, "ansicht(5)");
    await warte(3000);
    await aufnehmen(win, "07-today.png");

    await tu(win, "ansicht(6)");
    await warte(1500);
    await tu(win, `tippe("A person", "Lumen & Co.")`);
    await tu(win, `klicke("Create dossier")`);
    await warte(2500);
    await aufnehmen(win, "08-dossier.png");

    await tu(win, "ansicht(7)");
    await warte(2500);
    await aufnehmen(win, "09-activity.png");
    await tu(win, `klicke("Audit log")`);
    await warte(1500);
    await tu(win, `klicke("Check integrity")`);
    await warte(1500);
    await aufnehmen(win, "10-audit.png");
  } catch (e) {
    console.error(e);
    process.exitCode = 1;
  } finally {
    server?.kind.kill();
    if (server) fs.rmSync(server.tmp, { recursive: true, force: true });
    app.quit();
  }
});
