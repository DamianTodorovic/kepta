// @vitest-environment node
//
// KEPTA mit einem Klick in Claude Desktop, Claude Code, Cursor, Windsurf und
// VS Code eintragen — mit Sicherung, ohne andere Einträge anzufassen, nie in
// einer Datei, die kein reines JSON ist. In der Desktop-App ist der Eintrag der
// MCP-Server in der App selbst. Alles in einem Heimatordner aus dem Temp-Ordner.
import { describe, it, expect, beforeEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { finde, verbinde, hatKepta, claudeCodeArgumente, NPX_EINTRAG, type Umgebung, type Eintrag } from "../../src/lib/einrichtung";

let home: string;
const mac = (extra: Partial<Umgebung> = {}): Umgebung => ({ home, plattform: "darwin", jetzt: () => new Date("2026-09-14T12:00:00Z"), claude: () => null, ...extra });
const claudeDesktop = () => path.join(home, "Library", "Application Support", "Claude", "claude_desktop_config.json");
const schreib = (datei: string, inhalt: unknown) => {
  fs.mkdirSync(path.dirname(datei), { recursive: true });
  fs.writeFileSync(datei, typeof inhalt === "string" ? inhalt : JSON.stringify(inhalt, null, 2));
};
const lies = (datei: string) => JSON.parse(fs.readFileSync(datei, "utf8"));
const status = (u: Umgebung, id: string) => finde(u).find((c) => c.id === id)!;
const APP: Eintrag = { command: "/Applications/KEPTA.app/Contents/MacOS/KEPTA", args: ["/Applications/KEPTA.app/Contents/Resources/app.asar/dist/mcp-server.cjs"], env: { ELECTRON_RUN_AS_NODE: "1" } };

beforeEach(() => {
  home = fs.mkdtempSync(path.join(os.tmpdir(), "kepta-home-"));
});

describe("KEPTA mit KI-Apps verbinden", () => {
  it("findet, was installiert ist, und erkennt KEPTA am Namen oder am Befehl", () => {
    schreib(claudeDesktop(), { mcpServers: { other: { command: "x" } } });
    schreib(path.join(home, ".cursor", "mcp.json"), { mcpServers: { memory: APP } });
    expect(status(mac(), "claude-desktop")).toMatchObject({ installed: true, connected: false, canConnect: true });
    expect(status(mac(), "cursor")).toMatchObject({ installed: true, connected: true, canConnect: false });
    expect(status(mac(), "windsurf")).toMatchObject({ installed: false, canConnect: false });
    expect(status(mac(), "vscode").installed).toBe(false);
    expect(status(mac(), "claude-code")).toMatchObject({ installed: false, canConnect: false, hint: "Run this in a terminal: claude mcp add --scope user kepta -- npx -y kepta-mcp" });
    expect(hatKepta({ kepta: {} })).toBe(true);
    expect(hatKepta([])).toBe(false);
    expect(hatKepta(null)).toBe(false);
  });

  it("trägt den MCP-Server der App ein, lässt alles andere stehen und legt eine Sicherung daneben", () => {
    schreib(claudeDesktop(), { globalShortcut: "Cmd+K", mcpServers: { other: { command: "x" } } });
    const r = verbinde("claude-desktop", mac(), APP);
    expect(r).toEqual({ ok: true, message: "Connected. Quit and reopen Claude Desktop to load KEPTA.", backup: `${claudeDesktop()}.kepta-backup-2026-09-14T12-00-00` });
    expect(lies(claudeDesktop())).toEqual({ globalShortcut: "Cmd+K", mcpServers: { other: { command: "x" }, kepta: APP } });
    expect(lies(r.backup!)).toEqual({ globalShortcut: "Cmd+K", mcpServers: { other: { command: "x" } } });
    expect(verbinde("claude-desktop", mac(), APP)).toEqual({ ok: true, message: "KEPTA was already connected to Claude Desktop.", backup: null });
  });

  it("legt eine fehlende Datei an — für VS Code in dessen eigenem Format, ohne Eintrag mit npx", () => {
    const ordner = path.join(home, "Library", "Application Support", "Code", "User");
    fs.mkdirSync(ordner, { recursive: true });
    expect(verbinde("vscode", mac(), APP)).toMatchObject({ ok: true, backup: null });
    expect(lies(path.join(ordner, "mcp.json"))).toEqual({ servers: { kepta: { type: "stdio", ...APP } } });
    fs.mkdirSync(path.join(home, ".cursor"), { recursive: true });
    verbinde("cursor", mac());
    expect(lies(path.join(home, ".cursor", "mcp.json"))).toEqual({ mcpServers: { kepta: NPX_EINTRAG } });
  });

  it("fasst eine Datei mit Kommentaren nie an und verbindet nichts, was nicht installiert ist", () => {
    const d = path.join(home, ".cursor", "mcp.json");
    schreib(d, '{ // mein Kommentar\n "mcpServers": {} }');
    expect(status(mac(), "cursor")).toMatchObject({ canConnect: false, hint: expect.stringContaining("not plain JSON") });
    expect(verbinde("cursor", mac()).ok).toBe(false);
    expect(fs.readFileSync(d, "utf8")).toContain("mein Kommentar");
    expect(verbinde("windsurf", mac())).toMatchObject({ ok: false, message: expect.stringContaining("not seem to be installed") });
    expect(verbinde("gibt-es-nicht", mac())).toEqual({ ok: false, message: "Unknown app." });
  });

  it("Windows und Linux: die Dateien liegen dort, wo die Apps sie suchen", () => {
    expect(status({ home, plattform: "win32", appdata: path.join(home, "AD"), claude: () => null }, "claude-desktop").config).toBe(path.join(home, "AD", "Claude", "claude_desktop_config.json"));
    expect(status({ home, plattform: "linux", claude: () => null }, "vscode").config).toBe(path.join(home, ".config", "Code", "User", "mcp.json"));
  });

  it("Claude Code über seinen eigenen Befehl — mit der Umgebung des App-Servers", () => {
    expect(claudeCodeArgumente(APP)).toEqual(["mcp", "add", "--scope", "user", "-e", "ELECTRON_RUN_AS_NODE=1", "kepta", "--", APP.command, ...APP.args]);
    const aufrufe: string[][] = [];
    const claude = (antwort: { status: number; stderr?: string }) => (a: string[]) => {
      aufrufe.push(a);
      return { stdout: "", stderr: "", ...antwort };
    };
    expect(status(mac({ claude: claude({ status: 0 }) }), "claude-code")).toMatchObject({ installed: true, canConnect: true });
    expect(verbinde("claude-code", mac({ claude: claude({ status: 0 }) }), APP).ok).toBe(true);
    expect(aufrufe.at(-1)).toEqual(claudeCodeArgumente(APP));
    expect(verbinde("claude-code", mac({ claude: claude({ status: 1, stderr: "MCP server kepta already exists in user config" }) })).ok).toBe(true);
    expect(verbinde("claude-code", mac({ claude: claude({ status: 1, stderr: "boom" }) }))).toEqual({ ok: false, message: "Claude Code said: boom" });
    expect(verbinde("claude-code", mac(), APP).message).toBe(
      "Claude Code was not found. Run this in a terminal: claude mcp add --scope user -e ELECTRON_RUN_AS_NODE=1 kepta -- /Applications/KEPTA.app/Contents/MacOS/KEPTA /Applications/KEPTA.app/Contents/Resources/app.asar/dist/mcp-server.cjs"
    );
    schreib(path.join(home, ".claude.json"), { projects: { "/x": { mcpServers: { kepta: {} } } } });
    expect(status(mac(), "claude-code")).toMatchObject({ installed: true, connected: true, canConnect: false });
  });

  it("Gemini CLI über ~/.gemini/settings.json — gleiche mcpServers-Struktur, Auto-Connect", () => {
    schreib(path.join(home, ".gemini", "settings.json"), { theme: "auto", mcpServers: { other: { command: "x" } } });
    expect(status(mac(), "gemini")).toMatchObject({ installed: true, connected: false, canConnect: true });
    expect(verbinde("gemini", mac(), APP)).toMatchObject({ ok: true });
    expect(lies(path.join(home, ".gemini", "settings.json"))).toEqual({ theme: "auto", mcpServers: { other: { command: "x" }, kepta: APP } });
  });

  it("Cline und Roo Code: die Konfiguration sitzt tief im globalStorage der VS-Code-Erweiterung", () => {
    const clineOrdner = path.join(home, "Library", "Application Support", "Code", "User", "globalStorage", "saoudrizwan.claude-dev", "settings");
    const rooOrdner = path.join(home, "Library", "Application Support", "Code", "User", "globalStorage", "rooveterinaryinc.roo-cline", "settings");
    fs.mkdirSync(clineOrdner, { recursive: true });
    fs.mkdirSync(rooOrdner, { recursive: true });
    expect(status(mac(), "cline").config).toBe(path.join(clineOrdner, "cline_mcp_settings.json"));
    expect(status(mac(), "roo").config).toBe(path.join(rooOrdner, "mcp_settings.json"));
    expect(verbinde("cline", mac(), APP)).toMatchObject({ ok: true });
    expect(lies(path.join(clineOrdner, "cline_mcp_settings.json"))).toEqual({ mcpServers: { kepta: APP } });
    // Windows-Pfad: %APPDATA% statt Application Support
    expect(status({ home, plattform: "win32", appdata: path.join(home, "AD"), claude: () => null }, "cline").config).toBe(
      path.join(home, "AD", "Code", "User", "globalStorage", "saoudrizwan.claude-dev", "settings", "cline_mcp_settings.json")
    );
  });

  it("jede weitere KI bekommt den exakten Schnipsel — Zed, Codex CLI, Continue, generisch", () => {
    const alle = finde(mac(), APP);
    const zed = alle.find((c) => c.id === "zed")!;
    expect(zed.canConnect).toBe(false);
    expect(zed.hint).toContain("context_servers");
    expect(zed.hint).toContain(APP.command);
    const codex = alle.find((c) => c.id === "codex-cli")!;
    expect(codex.hint).toContain("[mcp_servers.kepta]");
    const continueKlient = alle.find((c) => c.id === "continue")!;
    expect(continueKlient.hint).toContain("mcpServers:");
    const generisch = alle.find((c) => c.id === "any-mcp")!;
    expect(generisch.hint).toContain("HTTP API");
    // Kein Schnipsel verlangt einen Account oder eine Cloud: der App-Eintrag genügt.
    for (const k of [zed, codex, continueKlient, generisch]) expect(k.hint).toContain(APP.command);
  });
});
