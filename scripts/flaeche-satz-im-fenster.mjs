// Der Satz im echten Fenster — passt die Laenge, wo sie stehen muss?
//
// 3.2.126 hat zwei Flaechen-Woerter durch Zahlen ersetzt. Eine langere Zeile in einer
// Zustands-Reihe ist eine Aenderung am Layout, also wird sie im Fenster gemessen und nicht
// am Quelltext gelesen (Hausregel): vier Breiten,Uberlappung, Beschnitt, seitlicher
// Ueberlauf. Der Ast "Ollama antwortet nicht" traegt den langen Satz; er wird erzwungen,
// indem die Seite ihren eignen Einbett-Ruf nicht mehr durchlaesst.
//
// Aufruf: node scripts/flaeche-satz-im-fenster.mjs
// Kapsel: eigner Haefen, eigner HOME, eignes Profil — das echte Heim bleibt unberuehrt.
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const WURZEL = process.cwd();
const OBJEKT = path.join(WURZEL, "dist", "server.cjs");
const BRADE = process.env.KEPTA_BRAVE || "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser";
const PORT = Number(process.env.KEPTA_SATZ_PORT || 3772);
const CDP_PORT = Number(process.env.KEPTA_SATZ_CDP || 3782);
const BASIS = `http://127.0.0.1:${PORT}`;
const ARBEIT = "/tmp/kepta-satz-126";
const BREITEN = [[1440, 900], [1024, 768], [820, 1180], [390, 844]];
const SATZ_PANEL = "does not bridge languages";
const SATZ_CHIP = "Meaning, not only the exact words";

const schlafe = (ms) => new Promise((r) => setTimeout(r, ms));
async function warteBis(hin, { maxMs = 60000, schritt = 350 } = {}) {
  const bis = Date.now() + maxMs;
  for (;;) {
    try { const v = await hin(); if (v) return v; } catch { /* noch nicht */ }
    if (Date.now() > bis) return null;
    await schlafe(schritt);
  }
}

class Cdp {
  constructor(ws) { this.ws = ws; this.nr = 0; this.wartend = new Map(); }
  static async verbindung(url) {
    const ws = await new Promise((res, rej) => {
      const w = new WebSocket(url);
      w.onopen = () => res(w);
      w.onerror = (e) => rej(e.error || new Error("websocket fehlgeschlagen"));
    });
    const c = new Cdp(ws);
    ws.onmessage = (e) => {
      const n = JSON.parse(e.data);
      if (n.id && c.wartend.has(n.id)) {
        const { los, fehler } = c.wartend.get(n.id);
        c.wartend.delete(n.id);
        if (n.error) fehler(new Error(n.error.message)); else los(n.result);
      }
    };
    return c;
  }
  send(methode, params = {}) {
    const id = ++this.nr;
    return new Promise((los, fehler) => {
      this.wartend.set(id, { los, fehler });
      this.ws.send(JSON.stringify({ id, method: methode, params }));
    });
  }
  close() { try { this.ws.close(); } catch { /* schon zu */ } }
}

async function evaliere(cdp, ausdruck) {
  const r = await cdp.send("Runtime.evaluate", { expression: ausdruck, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw new Error("Sonde: " + (r.exceptionDetails.exception?.description || r.exceptionDetails.text));
  return r.result.value;
}

/**
 * Was an einer Breite gezaehlt wird: seitlicher Ueberlauf der Seite, Beschnitt und
 * Ueberlappung des langen Satz-Kastens gegen die naechste Reihe, und ob beide neuen
 * Saetze ueberhaupt zu lesen sind.
 */
const MESSUNG = `(() => {
  const k = (el) => { const r = el.getBoundingClientRect(); return {x: Math.round(r.x), y: Math.round(r.y), b: Math.round(r.bottom), h: Math.round(r.height)}; };
  const sicht = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
  const text = (el) => (el.textContent || '').replace(/\\s+/g, ' ').trim();
  const alle = [...document.querySelectorAll('div,span,p')];
  const kasten = alle.find((el) => text(el).includes(${JSON.stringify(SATZ_PANEL)}) && el.children.length === 0);
  const chip = alle.find((el) => text(el).includes(${JSON.stringify(SATZ_CHIP)}) && el.children.length === 0);
  const out = {
    breite: window.innerWidth,
    hoehe: window.innerHeight,
    dokUeberlauf: document.documentElement.scrollWidth > window.innerWidth + 1,
    dokScrollWidth: document.documentElement.scrollWidth,
    beschnitteneElemente: [...document.querySelectorAll('body *')].filter((el) => {
      if (!sicht(el)) return false;
      const r = el.getBoundingClientRect();
      return r.width > 1 && r.height > 1 && (r.right > window.innerWidth + 1 || r.left < -1);
    }).length,
    satz: kasten ? { mass: k(kasten), zeilen: (() => { const cs = getComputedStyle(kasten); const lh = parseFloat(cs.lineHeight); const schaetzung = parseFloat(cs.fontSize) * 1.5; return Math.round(kasten.getBoundingClientRect().height / (Number.isFinite(lh) ? lh : schaetzung)); })(), kappe: kasten.scrollHeight > kasten.clientHeight + 1 } : null,
    zweig: kasten ? text(kasten).slice(0, 46) : (text(alle.find((el) => /Ollama answers/.test(text(el))) || document.body).slice(0, 46)),
    chip: chip ? { mass: k(chip), kappe: chip.scrollHeight > chip.clientHeight + 1 } : null,
  };
  if (kasten) {
    // Die Reihe unter der unsrigen: ihre obere Kante darf nicht ueber dem Fuss unseres
    // Satz-Kastens liegen, sonst steht ein Text im andern.
    const reihe = kasten.closest('div.flex.items-start') || kasten.parentElement;
    const naechste = reihe ? reihe.nextElementSibling : null;
    out.ueberlappung = naechste ? k(naechste).y < k(kasten).b - 1 : false;
    out.naechsteReihe = naechste ? text(naechste).slice(0, 60) : null;
  }
  return JSON.stringify(out);
})()`;

async function main() {
  if (!fs.existsSync(OBJEKT)) { console.log("Kein Gebaeude unter " + OBJEKT + " — erst bauen."); process.exitCode = 2; return; }
  if (!fs.existsSync(BRADE)) { console.log("Kein Brave — der Pruefer braucht einen echten Viewport."); process.exitCode = 2; return; }
  for (const p of [PORT, CDP_PORT]) {
    try { await fetch(`http://127.0.0.1:${p}/`); console.log(`Port ${p} hoert schon — fremder Laeufer, Abbruch.`); process.exitCode = 2; return; } catch { /* frei */ }
  }
  fs.rmSync(ARBEIT, { recursive: true, force: true });
  fs.mkdirSync(ARBEIT, { recursive: true });

  const diener = spawn("node", [OBJEKT], {
    cwd: WURZEL,
    // Der Ast mit dem langen Satz braucht einen schweigenden Einbett-Dienst. Statt Ollama
    // anzufassen (das ist Damians Dienst auf diesem Rechner), zeigt die Kapsel auf tote
    // Haefen — und zwar auf BEIDE: die Sonde der Flaeche laeuft ueber die eigne Tuer
    // (`POST /api/embed`, server/router/chat.ts:290 liest OLLAMA_HOST), der Einbett-Laeufer
    // des Kerns liest KEPTA_OLLAMA_URL (src/core/embeddings.ts:8). Zwei Knoepfe, ein Dienst;
    // wer nur einen dreht, sieht eine Tafel, die einen andern Dienst meldet als der Lauf.
    env: {
      ...process.env,
      HOME: path.join(ARBEIT, "h"),
      KEPTA_DATA_DIR: path.join(ARBEIT, "d"),
      KEPTA_ENCRYPTION: "off",
      PORT: String(PORT),
      OLLAMA_HOST: "http://127.0.0.1:1",
      KEPTA_OLLAMA_URL: "http://127.0.0.1:1",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  const prot = fs.createWriteStream(path.join(ARBEIT, "diener.log"));
  diener.stdout.pipe(prot); diener.stderr.pipe(prot, { end: true });

  let brave;
  try {
    const gesund = await warteBis(async () => { const r = await fetch(`${BASIS}/api/health`); return r.ok ? await r.json() : null; }, { maxMs: 60000 });
    if (!gesund) throw new Error("Der Kapsel-Diener kam nicht hoch — " + path.join(ARBEIT, "diener.log"));
    console.log(`  Diener: Version ${gesund.version}, Bestand ${gesund.count} (eigne Kapsel, Verschluesselung aus)`);

    brave = spawn(BRADE, ["--headless=new", `--remote-debugging-port=${CDP_PORT}`, `--user-data-dir=${path.join(ARBEIT, "profil")}`,
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
    // Der Ast mit dem langen Satz braucht einen schweigenden Einbett-Dienst. Statt Ollama
    // anzufassen (das ist Damians Dienst auf diesem Rechner), zeigt die Kapsel auf einen
    // toten Hafen — KEPTA_OLLAMA_URL, src/core/embeddings.ts:8. Nur dieser Laeufer sieht
    // keinen Dienst, und die Flaeche nimmt genau den Zweig, den ein Nutzer ohne Ollama sieht.

    for (const [breit, hoch] of BREITEN) {
      await cdp.send("Emulation.setDeviceMetricsOverride", { width: breit, height: hoch, deviceScaleFactor: 1, mobile: false });
      await cdp.send("Page.navigate", { url: `${BASIS}/` });
      await warteBis(async () => (await evaliere(cdp, `document.querySelectorAll('button').length`)) > 0 ? true : null, { maxMs: 90000 });
      const spaeter = await warteBis(async () => evaliere(cdp, `(()=>{const b=[...document.querySelectorAll('button')].find(x=>/later|skip|spaeter/i.test(x.textContent||''));if(!b)return null;b.click();return (b.textContent||'').trim()})()`), { maxMs: 4000 });
      await schlafe(700);
      const schirmZu = !(await evaliere(cdp, `(()=>/Step 1 of 4|Set up K3PTA/.test(document.body.innerText||''))()`));
      console.log(`     Assistent: ${spaeter ? `weg ueber "${spaeter}"` : (schirmZu ? "stand nicht im Weg" : "STEHT DA — Messung verworfen")}`);
      if (!schirmZu) throw new Error("der Assistent haelt die Flaeche fest — Messung waere kein Beweis");
      await evaliere(cdp, `(()=>{const k=[...document.querySelectorAll('button,a[role="button"]')].find(b=>/^\\s*(Settings|Einstellungen)\\s*$/i.test((b.textContent||'').trim()));if(k){k.click();return true}return false})()`);
      const gefunden = await warteBis(async () => evaliere(cdp, `(()=>/No answer from Ollama/.test(document.body.innerText||''))()`), { maxMs: 20000 });
      if (!gefunden) throw new Error("der Zweig ohne Ollama erscheint nicht — die Kapsel sieht einen Dienst, Messung waere am falschen Text gefahren");
      const mess = JSON.parse(await evaliere(cdp, MESSUNG));
      const png = path.join(ARBEIT, `satz-${breit}x${hoch}.png`);
      // Das Bild soll die angeklagte Stelle zeigen, nicht den Seitenanfang: die Reihe
      // in die Mitte rollen und nur ihren Ausschnitt fassen (sonst beweist das Bild
      // alles ausser dem Satz, um den es geht).
      await evaliere(cdp, `(()=>{const t=${JSON.stringify(SATZ_PANEL)};const el=[...document.querySelectorAll('div,span,p')].find(e=>e.children.length===0&&(e.textContent||'').replace(/\\s+/g,' ').trim().includes(t));if(el)el.scrollIntoView({block:'center'});return !!el})()`);
      await schlafe(250);
      const rahmen = await evaliere(cdp, `(()=>{const t=${JSON.stringify(SATZ_PANEL)};const el=[...document.querySelectorAll('div,span,p')].find(e=>e.children.length===0&&(e.textContent||'').replace(/\\s+/g,' ').trim().includes(t));if(!el)return null;const r=el.getBoundingClientRect();const z=el.closest('div.flex.items-start')||el;const b=z.getBoundingClientRect();return {x:b.x,y:b.y,w:b.width,h:b.height}})()`);
      const bild = await cdp.send("Page.captureScreenshot", {
        format: "png",
        ...(rahmen ? { clip: { x: Math.max(0, rahmen.x), y: Math.max(0, rahmen.y), width: rahmen.w, height: Math.min(rahmen.h, hoch - 8), scale: 1 } } : {}),
      });
      fs.writeFileSync(png, Buffer.from(bild.data, "base64"));
      const fehler = [];
      if (!mess.satz) fehler.push("Satz des Panels nicht im Baum");
      else {
        if (mess.satz.kappe) fehler.push("Satzkasten ist beschnitten (scrollHeight > clientHeight)");
        if (mess.ueberlappung) fehler.push(`Satz ueberlappt die naechste Reihe (${mess.naechsteReihe})`);
      }
      if (!mess.chip) fehler.push("Chip-Text der Vektor-Spur nicht im Baum");
      else if (mess.chip.kappe) fehler.push("Chip-Text ist beschnitten");
      if (mess.dokUeberlauf) fehler.push(`seitlicher Ueberlauf: scrollWidth ${mess.dokScrollWidth} bei ${mess.breite}`);
      if (mess.beschnitteneElemente > 0) fehler.push(`${mess.beschnitteneElemente} Elemente ueber die Breite hinaus beschnitten`);
      console.log(`  ${String(breit).padStart(4)}x${hoch}: Zeilen ${mess.satz ? mess.satz.zeilen : "-"}  Hoehe ${mess.satz ? mess.satz.mass.h : "-"} px  Ueberlauf ${mess.dokUeberlauf ? "JA" : "nein"}  Beschnitt ${mess.beschnitteneElemente}  ${fehler.length ? "FEHLER: " + fehler.join(" | ") : "ok"}`);
      console.log(`     Zweig: ${mess.zweig}`);
      console.log(`     Bild: ${png}`);
    }
    cdp.close();
  } catch (e) {
    console.log("  BEFUND: " + (e && e.message ? e.message : e));
    process.exitCode = 1;
  } finally {
    if (brave) brave.kill("SIGTERM");
    diener.kill("SIGTERM");
    await schlafe(400);
    console.log(`  Kapsel: ${ARBEIT} (Diener-Protokoll und Bilder liegen dort)`);
  }
}

void main();
