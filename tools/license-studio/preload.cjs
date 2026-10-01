// Die einzige Brücke zwischen Fenster und Hauptprozess. Das Fenster kann damit
// ausstellen, prüfen, sperren und kopieren — an den privaten Schlüssel kommt es nicht.
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("studio", {
  status: () => ipcRenderer.invoke("status"),
  ausstellen: (name, notiz, edition, seats) => ipcRenderer.invoke("ausstellen", { name, notiz, edition, seats }),
  pruefen: (name, key) => ipcRenderer.invoke("pruefen", { name, key }),
  liste: () => ipcRenderer.invoke("liste"),
  sperren: (nummer, gesperrt) => ipcRenderer.invoke("sperren", { nummer, gesperrt }),
  nachricht: (name, nummer, key, sprache, edition, seats) => ipcRenderer.invoke("nachricht", { name, nummer, key, sprache, edition, seats }),
  hinweise: (name) => ipcRenderer.invoke("hinweise", name),
  kopieren: (text) => ipcRenderer.invoke("kopieren", text),
  zeigeListe: () => ipcRenderer.invoke("zeigeListe"),
});
