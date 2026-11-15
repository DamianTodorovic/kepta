import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const HTML_PATH = path.join(__dirname, 'k3pta-master-mockup.html');
const OUT_DIR = path.join(__dirname, 'renders');
const CHROME_BIN =
  '/Users/damiantodorovic/.cache/puppeteer/chrome-headless-shell/mac_arm-152.0.7977.75/chrome-headless-shell-mac-arm64/chrome-headless-shell';

const SHOTS = [
  // Desktop Light (1440x900)
  { name: 'knowledge-preview', width: 1440, height: 900, query: 'clean=1&screen=knowledge-preview' },
  { name: 'knowledge-editor', width: 1440, height: 900, query: 'clean=1&screen=knowledge-editor' },
  { name: 'chat', width: 1440, height: 900, query: 'clean=1&screen=chat' },
  { name: 'graph-force', width: 1440, height: 900, query: 'clean=1&screen=graph-force' },
  { name: 'graph-tree', width: 1440, height: 900, query: 'clean=1&screen=graph-tree' },
  { name: 'graph-meaning', width: 1440, height: 900, query: 'clean=1&screen=graph-meaning' },
  { name: 'today', width: 1440, height: 900, query: 'clean=1&screen=today' },
  { name: 'dossier', width: 1440, height: 900, query: 'clean=1&screen=dossier' },
  { name: 'activity', width: 1440, height: 900, query: 'clean=1&screen=activity' },
  { name: 'team', width: 1440, height: 900, query: 'clean=1&screen=team' },
  { name: 'settings-ai', width: 1440, height: 900, query: 'clean=1&screen=settings-ai' },
  { name: 'settings-mcp', width: 1440, height: 900, query: 'clean=1&screen=settings-mcp' },
  { name: 'settings-sync', width: 1440, height: 900, query: 'clean=1&screen=settings-sync' },
  { name: 'overlay-palette', width: 1440, height: 900, query: 'clean=1&screen=overlay-palette' },
  { name: 'overlay-scan', width: 1440, height: 900, query: 'clean=1&screen=overlay-scan' },
  { name: 'overlay-duplicates', width: 1440, height: 900, query: 'clean=1&screen=overlay-duplicates' },
  { name: 'overlay-setup', width: 1440, height: 900, query: 'clean=1&screen=overlay-setup' },

  // Desktop Dark (1440x900)
  { name: 'knowledge-preview-dark', width: 1440, height: 900, query: 'clean=1&theme=dark&screen=knowledge-preview' },
  { name: 'chat-dark', width: 1440, height: 900, query: 'clean=1&theme=dark&screen=chat' },
  { name: 'graph-force-dark', width: 1440, height: 900, query: 'clean=1&theme=dark&screen=graph-force' },
  { name: 'settings-ai-dark', width: 1440, height: 900, query: 'clean=1&theme=dark&screen=settings-ai' },
  { name: 'overlay-palette-dark', width: 1440, height: 900, query: 'clean=1&theme=dark&screen=overlay-palette' },

  // Mobile (390x844)
  { name: 'mobile-knowledge-list', width: 390, height: 844, query: 'clean=1&viewport=mobile&screen=knowledge-preview' },
  { name: 'mobile-chat', width: 390, height: 844, query: 'clean=1&viewport=mobile&screen=chat' },
  { name: 'mobile-settings', width: 390, height: 844, query: 'clean=1&viewport=mobile&screen=settings-ai' },
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

class CdpClient {
  constructor(wsUrl) {
    this.ws = new WebSocket(wsUrl);
    this.nextId = 1;
    this.pending = new Map();
    this.events = new Map();
    this.openPromise = new Promise((res, rej) => {
      this.ws.addEventListener('open', res, { once: true });
      this.ws.addEventListener('error', rej, { once: true });
    });
    this.ws.addEventListener('message', (ev) => {
      const msg = JSON.parse(String(ev.data));
      if (msg.id) {
        const p = this.pending.get(msg.id);
        if (p) {
          this.pending.delete(msg.id);
          if (msg.error) p.rej(new Error(`${p.method}: ${msg.error.message}`));
          else p.res(msg.result);
        }
      } else if (msg.method) {
        const listeners = this.events.get(msg.method);
        if (listeners) for (const fn of listeners) fn(msg.params);
      }
    });
  }
  async connect() {
    await this.openPromise;
  }
  on(method, fn) {
    if (!this.events.has(method)) this.events.set(method, new Set());
    this.events.get(method).add(fn);
  }
  call(method, params = {}) {
    const id = this.nextId++;
    return new Promise((res, rej) => {
      this.pending.set(id, { res, rej, method });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }
  close() {
    this.ws.close();
  }
}

async function main() {
  if (!fs.existsSync(CHROME_BIN)) throw new Error(`Chrome binary missing: ${CHROME_BIN}`);
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const htmlBytes = fs.readFileSync(HTML_PATH);
  const srv = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(htmlBytes);
  });
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  const httpPort = srv.address().port;

  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'k3pta-mockup-cdp-'));
  const chrome = spawn(
    CHROME_BIN,
    [
      '--headless',
      '--disable-gpu',
      '--no-sandbox',
      '--remote-debugging-port=0',
      `--user-data-dir=${userDataDir}`,
      '--window-size=1440,900',
      'about:blank',
    ],
    { stdio: ['ignore', 'pipe', 'pipe'] }
  );

  let cdpPort = null;
  let stderrLog = '';
  chrome.stderr.on('data', (d) => {
    const txt = d.toString();
    stderrLog += txt;
    const m = txt.match(/ws:\/\/127\.0\.0\.1:(\d+)\//);
    if (m) cdpPort = Number(m[1]);
  });

  const activePortFile = path.join(userDataDir, 'DevToolsActivePort');
  for (let i = 0; i < 60 && !cdpPort; i++) {
    if (fs.existsSync(activePortFile)) {
      const firstLine = fs.readFileSync(activePortFile, 'utf8').split(/\r?\n/)[0]?.trim();
      if (/^\d+$/.test(firstLine)) cdpPort = Number(firstLine);
    }
    if (!cdpPort) await sleep(100);
  }
  if (!cdpPort) throw new Error(`Failed to detect CDP port. Stderr:\n${stderrLog}`);

  const targets = await (await fetch(`http://127.0.0.1:${cdpPort}/json/list`)).json();
  const pageTarget = targets.find((t) => t.type === 'page') ?? targets[0];
  if (!pageTarget?.webSocketDebuggerUrl) throw new Error('No page WebSocket target found');

  const cdp = new CdpClient(pageTarget.webSocketDebuggerUrl);
  await cdp.connect();
  await cdp.call('Page.enable');
  await cdp.call('Runtime.enable');
  await cdp.call('Log.enable');

  const runtimeErrors = [];
  cdp.on('Runtime.exceptionThrown', (p) => {
    runtimeErrors.push(p.exceptionDetails?.text || 'Runtime exception');
  });
  cdp.on('Log.entryAdded', (p) => {
    if (p.entry?.level === 'error') runtimeErrors.push(p.entry.text);
  });

  let loadResolver = null;
  cdp.on('Page.loadEventFired', () => {
    if (loadResolver) {
      loadResolver();
      loadResolver = null;
    }
  });

  let failures = 0;
  try {
    for (const shot of SHOTS) {
      const beforeErrCount = runtimeErrors.length;
      await cdp.call('Emulation.setDeviceMetricsOverride', {
        width: shot.width,
        height: shot.height,
        deviceScaleFactor: 2,
        mobile: shot.width < 500,
      });

      const waitLoad = new Promise((r) => (loadResolver = r));
      await cdp.call('Page.navigate', {
        url: `http://127.0.0.1:${httpPort}/k3pta-master-mockup.html?${shot.query}`,
      });
      await Promise.race([waitLoad, sleep(3000)]);
      await sleep(shot.name.startsWith('graph') ? 260 : 180);

      const auditRes = await cdp.call('Runtime.evaluate', {
        returnByValue: true,
        expression: `(() => {
          const doc = document.documentElement;
          const scrollOverflow = doc.scrollWidth > doc.clientWidth;
          const shell = document.getElementById('app-shell');
          const shellRect = shell ? shell.getBoundingClientRect() : null;

          // Check listen-fuss height & wrapping
          const fuss = document.querySelector('.listen-fuss');
          let fussWrap = false;
          if (fuss && fuss.offsetParent !== null) {
            const r = fuss.getBoundingClientRect();
            if (r.height > 40) fussWrap = true;
            for (const c of fuss.children) {
              const cr = c.getBoundingClientRect();
              if (cr.right > r.right + 1) fussWrap = true;
            }
          }

          // Check graph footer button clipping
          let graphClip = false;
          document.querySelectorAll('.graph-panel-fuss button').forEach((b) => {
            if (b.offsetParent !== null && b.scrollWidth > b.clientWidth + 1) graphClip = true;
          });

          // Check settings nav alignment on desktop
          let settingsMisaligned = false;
          if (window.innerWidth >= 768) {
            const sl = document.querySelector('#view-settings.active .einstellungen-liste');
            const sp = document.querySelector('#view-settings.active .settings-panel-fenster');
            if (sl && sp) {
              const sr = sl.getBoundingClientRect();
              const pr = sp.getBoundingClientRect();
              if (pr.left < sr.right - 1 || sr.height < 400) settingsMisaligned = true;
            }
          }

          // Check window status bar clipping / child overflow
          let statusClip = false;
          const ws = document.getElementById('window-status');
          if (ws && ws.offsetParent !== null) {
            const wr = ws.getBoundingClientRect();
            for (const c of ws.children) {
              if (c.offsetParent === null) continue;
              const cr = c.getBoundingClientRect();
              if (cr.right > wr.right + 1 || c.scrollWidth > c.clientWidth + 1) statusClip = true;
            }
          }

          // Check sidebar search button text wrapping onto >1 line
          let sideSearchWrap = false;
          const ssb = document.getElementById('btn-side-palette');
          if (ssb && ssb.offsetParent !== null) {
            const txtSpan = ssb.querySelector('span:first-of-type');
            if (txtSpan && txtSpan.getBoundingClientRect().height > 20) sideSearchWrap = true;
          }

          // Check filter pills container horizontal overflow
          let filterClip = false;
          const kf = document.getElementById('kind-filters');
          if (kf && kf.offsetParent !== null && kf.scrollWidth > kf.clientWidth + 1) filterClip = true;

          // Check German UI leak strings in visible text
          const bodyText = document.body.innerText || '';
          const leakMatch = bodyText.match(/\\b(Arbeitet|Einrichten|Noch nie|Gelesen|Stände|Getroffene Begriffe|Kernaussage)\\b/);

          return {
            scrollWidth: doc.scrollWidth,
            clientWidth: doc.clientWidth,
            scrollOverflow,
            shellHeight: shellRect ? Math.round(shellRect.height) : 0,
            fussWrap,
            graphClip,
            settingsMisaligned,
            statusClip,
            sideSearchWrap,
            filterClip,
            leak: leakMatch ? leakMatch[0] : null
          };
        })()`,
      });

      const metrics = auditRes.result?.value;
      const newErrors = runtimeErrors.slice(beforeErrCount);
      const { data } = await cdp.call('Page.captureScreenshot', { format: 'png' });
      const outPath = path.join(OUT_DIR, `${shot.name}.png`);
      fs.writeFileSync(outPath, Buffer.from(data, 'base64'));

      const issues = [];
      if (!metrics || metrics.shellHeight === 0) issues.push('shellHeight=0');
      if (metrics?.scrollOverflow) issues.push(`overflow(${metrics.scrollWidth}>${metrics.clientWidth})`);
      if (metrics?.fussWrap) issues.push('listen-fuss-wrap/clip');
      if (metrics?.graphClip) issues.push('graph-button-clip');
      if (metrics?.settingsMisaligned) issues.push('settings-misaligned');
      if (metrics?.statusClip) issues.push('window-status-clip');
      if (metrics?.sideSearchWrap) issues.push('side-search-wrap');
      if (metrics?.filterClip) issues.push('kind-filters-clip');
      if (metrics?.leak) issues.push(`german-leak:${metrics.leak}`);
      if (newErrors.length > 0) issues.push(`console-err:${newErrors.join('; ')}`);

      if (issues.length > 0) {
        failures++;
        console.error(`FAIL ${shot.name} (${shot.width}x${shot.height}): ${issues.join(', ')}`);
      } else {
        console.log(`PASS ${shot.name} (${shot.width}x${shot.height}) -> ${path.basename(outPath)}`);
      }
    }
  } finally {
    cdp.close();
    const exited = new Promise((r) => chrome.once('exit', r));
    chrome.kill('SIGTERM');
    await Promise.race([exited, sleep(1000)]);
    srv.close();
    try {
      fs.rmSync(userDataDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
    } catch { /* temp dir cleanup best-effort after Chrome exit */ }
  }

  if (failures > 0) {
    console.error(`\nRender audit finished with ${failures} failure(s).`);
    process.exit(1);
  }
  console.log(`\nAll ${SHOTS.length} views rendered & verified with 0 errors, 0 overflow, 0 clipping.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
