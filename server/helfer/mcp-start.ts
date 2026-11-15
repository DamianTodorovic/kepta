// Wie ein Agent den MCP-Server dieser Installation startet. In der fertigen App
// steckt er schon drin, mit dem passenden Datenbank-Modul: das K3PTA-Programm
// startet ihn selbst als Node (ELECTRON_RUN_AS_NODE). Kein Node.js, kein npm —
// und keine Falle, wenn npm noch eine Fassung ausliefert, die die verschlüsselte
// Datei nicht öffnen kann. Außerhalb der App (Entwicklung) gibt es diesen Weg nicht.
import path from "path";

export function mcpStartInDerApp(electron: string | undefined, programm: string, ordner: string) {
  if (!electron) return null;
  return { command: programm, args: [path.join(ordner, "mcp-server.cjs")], env: { ELECTRON_RUN_AS_NODE: "1" } };
}
