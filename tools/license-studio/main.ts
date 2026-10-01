// KEPTA License Studio — Lizenzschlüssel für KEPTA Enterprise ausstellen.
//
// Nur für Damian, nur auf seinem Mac. Der private Signaturschlüssel bleibt im
// Hauptprozess: er kommt über /usr/bin/security aus dem Schlüsselbund —
// derselbe Weg wie scripts/generate-license.mjs, deshalb ohne Rückfrage — und
// erreicht das Fenster nie. Das Fenster bekommt nur fertige Schlüssel.
//
// Gesperrte Nummern schreibt das Studio in src/core/sperrliste.ts des
// Enterprise-Repos (~/kepta-enterprise) — mit dem nächsten KEPTA-Update gelten
// diese Schlüssel nicht mehr.
//
// Bauen und nach /Applications legen: npm run license-studio -- --installieren
import { app, BrowserWindow, clipboard, ipcMain, shell } from "electron";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { type Eintrag, type Edition, EDITIONEN, gesperrteNummern, hinweise, ladeListe, leseSperrliste, nachricht, passtZurApp, pruefe, sperre, sperrlisteQuelle, trageEin } from "./kern";

const DIENST = "app.kepta.license-signing";
// Tests reichen eine eigene Datei herein — sonst schriebe ein Probelauf ins Repo.
const SPERRLISTE = process.env.KEPTA_STUDIO_SPERRLISTE || path.join(os.homedir(), "kepta-enterprise", "src", "core", "sperrliste.ts");

function privaterSchluessel(): string | null {
  // Reihenfolge: macOS-Schlüsselbund → Umgebungsvariable → Schlüssel-Datei
  // (signing-key.txt) neben der Portable-exe. Die Datei macht Windows ohne
  // Eingabeaufforderung nutzbar: Doppelklick-Starter liest sie und setzt die
  // Variable. Der Schlüssel gehört in keine Datei im Repo und auf keine
  // fremde Maschine — die Datei ist nur für Damians eigene Rechner gedacht.
  try {
    const s = execFileSync("/usr/bin/security", ["find-generic-password", "-s", DIENST, "-a", "kepta", "-w"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    if (s) return s;
  } catch {
    // kein macOS-Schlüsselbund (oder kein Eintrag) — unten die Fallbacks
  }
  const umgebung = process.env.KEPTA_LICENSE_PRIVATE_KEY?.trim();
  if (umgebung) return umgebung;
  const basis = process.env.PORTABLE_EXECUTABLE_DIR || process.cwd();
  for (const name of ["signing-key.txt", "signing-key.txt.txt"]) {
    try {
      const inhalt = fs.readFileSync(path.join(basis, name), "utf8").trim();
      if (inhalt) return inhalt;
    } catch {
      // Datei nicht da — nächster Kandidat
    }
  }
  return null;
}

const listeDatei = () => path.join(app.getPath("userData"), "licenses.json");
const text = (x: unknown, max: number) => (typeof x === "string" ? x.slice(0, max) : "");
const stufe = (x: unknown): Edition => (EDITIONEN.includes(x as Edition) ? (x as Edition) : "pro");
const zahl = (x: unknown, max: number) => (typeof x === "number" && Number.isInteger(x) && x >= 0 && x <= max ? x : undefined);

/** Die Nummern in der Sperrliste des Repos — null, wenn es sie hier nicht gibt. */
function sperrlisteImRepo(): number[] | null {
  try {
    return leseSperrliste(fs.readFileSync(SPERRLISTE, "utf8"));
  } catch {
    return null;
  }
}

ipcMain.handle("status", () => {
  const privat = privaterSchluessel();
  let liste: Eintrag[] = [];
  let listenFehler: string | null = null;
  try {
    liste = ladeListe(listeDatei());
  } catch (e) {
    listenFehler = (e as Error).message;
  }
  return {
    schluessel: privat !== null,
    passt: privat !== null && passtZurApp(privat),
    anzahl: liste.length,
    gesperrt: gesperrteNummern(liste),
    sperrlisteGefunden: sperrlisteImRepo() !== null,
    listeDatei: listeDatei(),
    listenFehler,
  };
});

ipcMain.handle("ausstellen", (_e, a: { name?: unknown; notiz?: unknown; edition?: unknown; seats?: unknown }) => {
  try {
    const privat = privaterSchluessel();
    if (!privat) return { ok: false, fehler: "Kein Signaturschlüssel im Schlüsselbund. Einmalig im Terminal: node scripts/license-keypair.mjs" };
    const { eintrag, neu } = trageEin(listeDatei(), text(a?.name, 400), text(a?.notiz, 500), privat, undefined, new Date(), stufe(a?.edition), zahl(a?.seats, 9999));
    return { ok: true, eintrag, neu };
  } catch (e) {
    return { ok: false, fehler: (e as Error).message };
  }
});

ipcMain.handle("pruefen", (_e, a: { name?: unknown; key?: unknown }) => {
  let liste: Eintrag[] = [];
  try {
    liste = ladeListe(listeDatei());
  } catch {
    // Ohne lesbare Liste prüft es sich trotzdem — nur ohne „gehört zu …“.
  }
  const gesperrt = new Set([...gesperrteNummern(liste), ...(sperrlisteImRepo() ?? [])]);
  return pruefe(text(a?.name, 400), text(a?.key, 400), liste, undefined, gesperrt);
});

ipcMain.handle("liste", () => {
  try {
    return { ok: true, liste: ladeListe(listeDatei()) };
  } catch (e) {
    return { ok: false, fehler: (e as Error).message, liste: [] };
  }
});

ipcMain.handle("sperren", (_e, a: { nummer?: unknown; gesperrt?: unknown }) => {
  try {
    const nummer = typeof a?.nummer === "number" ? a.nummer : NaN;
    const liste = sperre(listeDatei(), nummer, a?.gesperrt === true);
    const nummern = gesperrteNummern(liste);
    // Die Liste des Studios ist die Wahrheit; das Repo bekommt genau ihre gesperrten Nummern.
    const geschrieben = fs.existsSync(path.dirname(SPERRLISTE));
    if (geschrieben) fs.writeFileSync(SPERRLISTE, sperrlisteQuelle(nummern));
    return { ok: true, geschrieben, gesperrt: nummern };
  } catch (e) {
    return { ok: false, fehler: (e as Error).message };
  }
});

ipcMain.handle("nachricht", (_e, a: { name?: unknown; nummer?: unknown; key?: unknown; sprache?: unknown; edition?: unknown; seats?: unknown }) =>
  nachricht(text(a?.name, 400), typeof a?.nummer === "number" ? a.nummer : 0, text(a?.key, 400), a?.sprache === "en" ? "en" : "de", stufe(a?.edition), zahl(a?.seats, 9999)));

ipcMain.handle("hinweise", (_e, name: unknown) => hinweise(text(name, 400)));

ipcMain.handle("kopieren", (_e, t: unknown) => {
  clipboard.writeText(text(t, 20000));
  return true;
});

ipcMain.handle("zeigeListe", async () => {
  const datei = listeDatei();
  if (fs.existsSync(datei)) shell.showItemInFolder(datei);
  else await shell.openPath(path.dirname(datei));
  return true;
});

function oeffneFenster(): void {
  const win = new BrowserWindow({
    width: 1040,
    height: 740,
    minWidth: 820,
    minHeight: 600,
    title: "KEPTA License Studio",
    backgroundColor: "#070708",
    titleBarStyle: "hiddenInset",
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      spellcheck: false,
    },
  });
  win.once("ready-to-show", () => win.show());
  // Das Fenster zeigt nur die eigene Seite: kein Wegnavigieren, keine neuen Fenster.
  win.webContents.on("will-navigate", (e) => e.preventDefault());
  win.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  void win.loadFile(path.join(__dirname, "index.html"));
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => {
    const w = BrowserWindow.getAllWindows()[0];
    if (!w) return;
    if (w.isMinimized()) w.restore();
    w.focus();
  });
  void app.whenReady().then(oeffneFenster);
  app.on("window-all-closed", () => app.quit());
}
