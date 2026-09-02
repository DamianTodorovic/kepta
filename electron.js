import { app, BrowserWindow, shell, session } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer } from 'net';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
let mainWindow;
let serverPort = 3000;
let serverFailed = false;
let serverError = null;

function getFreePort() {
  return new Promise((resolve, reject) => {
    const srv = createServer();
    srv.listen(0, () => {
      // address() ist eine Methode. Als Eigenschaft gelesen liefert sie undefined,
      // und der Aufrufer arbeitet ab da mit einem Port, den es nicht gibt.
      const addr = srv.address();
      const port = addr && typeof addr === 'object' ? addr.port : null;
      srv.close(() => {
        if (port) resolve(port);
        else reject(new Error('Kein freier Port ermittelbar'));
      });
    });
    srv.on('error', reject);
  });
}

// Health-Poll auf /api/health statt rohem TCP: der Server braucht nach dem require
// einen Moment für listen; die API antwortet erst, wenn er wirklich bedienbar ist.
async function waitForServer(retries = 30) {
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${serverPort}/api/health`);
      if (res.ok) return true;
    } catch { /* noch nicht bereit — weiter pollen */ }
    await new Promise((r) => setTimeout(r, 1000));
  }
  return false;
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 840,
    title: "KEPTA",
    icon: app.isPackaged ? undefined : path.join(__dirname, 'build/icon.png'),
    backgroundColor: '#fcfcf9',
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 14, y: 14 },
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      enableRemoteModule: false,
      allowRunningInsecureContent: false,
      experimentalFeatures: false,
      webSecurity: true,
      // kein preload nötig — kein Node im Renderer
    },
    show: false,
  });

  // Hardened: nur http://localhost:* erlauben
  const isAllowedUrl = (url) => {
    try {
      const u = new URL(url);
      if (u.protocol === 'data:') return url.startsWith('data:text/html');
      if (u.protocol === 'file:') return false;
      if (u.hostname === 'localhost' || u.hostname === '127.0.0.1') return true;
      return false;
    } catch { return false; }
  };

  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (!isAllowedUrl(url)) {
      event.preventDefault();
      shell.openExternal(url).catch(()=>{});
    }
  });

  // Externe Links im Standard-Browser öffnen
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (isAllowedUrl(url)) return { action: 'allow' };
    shell.openExternal(url).catch(()=>{});
    return { action: 'deny' };
  });

  // Permissions blocken (camera, mic, etc.)
  session.defaultSession.setPermissionRequestHandler((_wc, _permission, callback) => callback(false));
  session.defaultSession.setPermissionCheckHandler(() => false);

  mainWindow.once('ready-to-show', () => mainWindow.show());

  // Geduldig warten: Server-Start (Store-Migration, Port-Bind) darf dauern —
  // 30 s statt 5 s, danach Fehlerseite statt weißem Fenster.
  const loadApp = async () => {
    const ok = serverFailed ? false : await waitForServer(30);
    if (ok) {
      mainWindow.loadURL(`http://127.0.0.1:${serverPort}`).catch(() => { /* Error-Page unten */ });
      return;
    }
    const details = serverError
      ? `<pre style="background:#f6f5f4;padding:1rem;border-radius:10px;overflow:auto">${String(serverError.stack || serverError.message).slice(0,4000)}</pre>`
      : '<p>Der Hintergrund-Server ist nicht rechtzeitig bereit.</p>';
    mainWindow.loadURL(`data:text/html,<html><body style="font-family:Inter,sans-serif;padding:2rem;background:#fcfcf9;color:#0f0f0f"><h1>Verbindungsfehler</h1><p>Die App konnte nicht geladen werden. Bitte starte sie neu.</p>${details}</body></html>`);
  };

  loadApp();

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(async () => {
  try {
    serverPort = await getFreePort();
  } catch (e) {
    // Fallback muss den Standard wirklich wiederherstellen: ein leerer Port hier
    // liess frueher process.env.PORT werfen — ausserhalb des try, ohne Fenster.
    console.log('Kein freier Port ermittelbar, nutze Standard 3000:', e?.message);
    serverPort = 3000;
  }
  if (!Number.isInteger(serverPort) || serverPort <= 0) serverPort = 3000;

  // Set environment variables for the server
  process.env.PORT = String(serverPort);
  // Produktion erst ab gepackter App — im Dev-Modus darf der Server die Vite-Middleware nutzen
  if (app.isPackaged) process.env.NODE_ENV = 'production';

  // Hardened: Content-Security-Policy via Electron session.
  // Gepackt: dist/index.html enthält keine Inline-Scripts → script-src 'self'.
  // Dev: Vite injiziert React-Refresh als Inline-Script → dort 'unsafe-inline' nötig.
  const scriptSrc = app.isPackaged
    ? "'self' http://localhost:* http://127.0.0.1:*"
    : "'self' 'unsafe-inline' http://localhost:* http://127.0.0.1:*";
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [`default-src 'self' http://localhost:* http://127.0.0.1:* data:; script-src ${scriptSrc}; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com data:; img-src 'self' data: http://localhost:* http://127.0.0.1:* https:; connect-src 'self' http://localhost:* http://127.0.0.1:* https://api.openai.com https://api.anthropic.com https://generativelanguage.googleapis.com https://api.mistral.ai https://api.groq.com https://api.deepseek.com https://api.x.ai https://api.openrouter.ai;`],
      },
    });
  });

  // Server VOR dem Fenster starten: require bündelt/initialisiert synchron,
  // listen läuft asynchron — das Fenster pollt oben auf /api/health.
  try {
    const { createRequire } = await import('module');
    const require = createRequire(import.meta.url);
    const serverPath = path.join(__dirname, 'dist', 'server.cjs');

    console.log("Loading server from:", serverPath);
    require(serverPath);
    console.log("Server started in main process via require");
  } catch (err) {
    serverFailed = true;
    serverError = err;
    console.error("Failed to start server", err);
  }

  createWindow();

  app.on('activate', () => {
    if (mainWindow === null) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  // Server is running in the main process, it will exit automatically
});

app.on('web-contents-created', (_event, contents) => {
  contents.on('will-attach-webview', (event) => event.preventDefault());
  contents.setWindowOpenHandler(({ url }) => {
    try {
      const u = new URL(url);
      if (u.hostname === 'localhost' || u.hostname === '127.0.0.1') return { action: 'allow' };
    } catch {}
    shell.openExternal(url).catch(()=>{});
    return { action: 'deny' };
  });
});
