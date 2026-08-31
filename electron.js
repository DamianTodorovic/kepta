import { app, BrowserWindow, shell, session } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer } from 'net';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
let mainWindow;
let serverPort = 3000;
let serverFailed = false;

function getFreePort() {
  return new Promise((resolve, reject) => {
    const srv = createServer();
    srv.listen(0, () => {
      const port = srv.address().port;
      srv.close(() => resolve(port));
    });
    srv.on('error', reject);
  });
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
  const allowedOrigins = new Set();
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

  // Kein neues Fenster via window.open für fremde Origins
  mainWindow.once('ready-to-show', () => mainWindow.show());

  let retries = 5;
  const loadApp = () => {
    mainWindow.loadURL(`http://localhost:${serverPort}`).catch((err) => {
      if (serverFailed) return;
      console.log('Failed to load URL, retrying...', err);
      if (retries > 0) {
        retries--;
        setTimeout(loadApp, 1000);
      } else {
        mainWindow.loadURL(`data:text/html,<html><body style="font-family:Inter,sans-serif;padding:2rem;background:#fcfcf9;color:#0f0f0f"><h1>Verbindungsfehler</h1><p>Die App konnte nicht geladen werden. Bitte starte sie neu.</p></body></html>`);
      }
    });
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
    console.log("Could not find free port, using default");
  }

  // Set environment variables for the server
  process.env.PORT = serverPort.toString();
  process.env.NODE_ENV = 'production';

  // Hardened: Content-Security-Policy via Electron session
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': ["default-src 'self' http://localhost:* http://127.0.0.1:* data:; script-src 'self' 'unsafe-inline' http://localhost:* http://127.0.0.1:*; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com data:; img-src 'self' data: http://localhost:* http://127.0.0.1:* https:; connect-src 'self' http://localhost:* http://127.0.0.1:* https://api.openai.com https://api.anthropic.com https://generativelanguage.googleapis.com https://api.mistral.ai https://api.groq.com https://api.deepseek.com https://api.x.ai https://api.openrouter.ai;"],
      },
    });
  });

  createWindow();

  try {
    const { createRequire } = await import('module');
    const require = createRequire(import.meta.url);
    const serverPath = path.join(__dirname, 'dist', 'server.cjs');
    
    console.log("Loading server from:", serverPath);
    require(serverPath);
    console.log("Server started in main process via require");
  } catch (err) {
    serverFailed = true;
    console.error("Failed to start server", err);
    if (mainWindow) {
      mainWindow.loadURL(`data:text/html,<html><body style="font-family:Inter,sans-serif;padding:2rem;background:#fcfcf9;color:#0f0f0f"><h1>Server Error</h1><p>Der Hintergrund-Server konnte nicht gestartet werden.</p><pre style="background:#f6f5f4;padding:1rem;border-radius:10px;overflow:auto">${String(err.stack || err.message).slice(0,4000)}</pre></body></html>`);
    }
  }

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
