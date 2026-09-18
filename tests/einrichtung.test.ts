// @vitest-environment node
//
// `npx kepta-mcp setup` und „Connect“ in der Oberfläche: KEPTA in Claude
// Desktop, Claude Code, Cursor, Windsurf und VS Code eintragen — mit einer
// Sicherung, ohne andere Einträge anzufassen, und nie in einer Datei, die kein
// reines JSON ist. Alles in einem Heimatordner aus dem Temp-Verzeichnis.
import { describe, it, expect, beforeEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { finde, verbinde, einrichten, hatKepta, CLAUDE_CODE_BEFEHL, type Umgebung } from "../src/einrichtung";

let home: string;
const mac = (extra: Partial<Umgebung> = {}): Umgebung => ({ home, plattform: "darwin", jetzt: () => new Date("2026-09-14T12:00:00Z"), claude: () => null, ...extra });
const claudeDesktop = () => path.join(home, "Library", "Application Support", "Claude", "claude_desktop_config.json");
const schreib = (datei: string, inhalt: unknown) => {
  fs.mkdirSync(path.dirname(datei), { recursive: true });
  fs.writeFileSync(datei, typeof inhalt === "string" ? inhalt : JSON.stringify(inhalt, null, 2));
};
const lies = (datei: string) => JSON.parse(fs.readFileSync(datei, "utf8"));
const status = (u: Umgebung, id: string) => finde(u).find((c) => c.id === id)!;

beforeEach(() => {
  home = fs.mkdtempSync(path.join(os.tmpdir(), "kepta-home-"));
});

describe("KEPTA mit KI-Apps verbinden", () => {
  it("findet, was installiert ist, und erkennt KEPTA am Namen oder am Befehl", () => {
    schreib(claudeDesktop(), { mcpServers: { other: { command: "x" } } });
    schreib(path.join(home, ".cursor", "mcp.json"), { mcpServers: { memory: { command: "npx", args: ["-y", "kepta-mcp"] } } });
    expect(status(mac(), "claude-desktop")).toMatchObject({ installed: true, connected: false, canConnect: true });
    expect(status(mac(), "cursor")).toMatchObject({ installed: true, connected: true, canConnect: false });
    expect(status(mac(), "windsurf")).toMatchObject({ installed: false, canConnect: false });
    expect(status(mac(), "vscode").installed).toBe(false);
    expect(status(mac(), "claude-code")).toMatchObject({ installed: false, canConnect: false, hint: `Run this in a terminal: ${CLAUDE_CODE_BEFEHL}` });
    expect(hatKepta({ kepta: {} })).toBe(true);
    expect(hatKepta([])).toBe(false);
    expect(hatKepta(null)).toBe(false);
  });

  it("trägt KEPTA ein, lässt alles andere stehen und legt eine Sicherung daneben", () => {
    schreib(claudeDesktop(), { globalShortcut: "Cmd+K", mcpServers: { other: { command: "x" } } });
    const r = verbinde("claude-desktop", mac());
    expect(r).toMatchObject({ ok: true, backup: `${claudeDesktop()}.kepta-backup-2026-09-14T12-00-00` });
    expect(lies(claudeDesktop())).toEqual({ globalShortcut: "Cmd+K", mcpServers: { other: { command: "x" }, kepta: { command: "npx", args: ["-y", "kepta-mcp"] } } });
    expect(lies(r.backup!)).toEqual({ globalShortcut: "Cmd+K", mcpServers: { other: { command: "x" } } });
    expect(verbinde("claude-desktop", mac())).toEqual({ ok: true, message: "KEPTA was already connected to Claude Desktop.", backup: null });
    expect(status(mac(), "claude-desktop").connected).toBe(true);
  });

  it("legt eine fehlende Datei an — für VS Code in dessen eigenem Format", () => {
    const ordner = path.join(home, "Library", "Application Support", "Code", "User");
    fs.mkdirSync(ordner, { recursive: true });
    expect(verbinde("vscode", mac())).toMatchObject({ ok: true, backup: null });
    expect(lies(path.join(ordner, "mcp.json"))).toEqual({ servers: { kepta: { type: "stdio", command: "npx", args: ["-y", "kepta-mcp"] } } });
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

  it("Claude Code über seinen eigenen Befehl — verbunden, schon da oder mit verständlichem Fehler", () => {
    const aufrufe: string[][] = [];
    const claude = (antwort: { status: number; stderr?: string }) => (a: string[]) => {
      aufrufe.push(a);
      return { stdout: "", stderr: "", ...antwort };
    };
    expect(status(mac({ claude: claude({ status: 0 }) }), "claude-code")).toMatchObject({ installed: true, canConnect: true });
    expect(verbinde("claude-code", mac({ claude: claude({ status: 0 }) })).ok).toBe(true);
    expect(aufrufe.at(-1)).toEqual(["mcp", "add", "--scope", "user", "kepta", "--", "npx", "-y", "kepta-mcp"]);
    expect(verbinde("claude-code", mac({ claude: claude({ status: 1, stderr: "MCP server kepta already exists in user config" }) })).ok).toBe(true);
    expect(verbinde("claude-code", mac({ claude: claude({ status: 1, stderr: "boom" }) }))).toEqual({ ok: false, message: "Claude Code said: boom" });
    expect(verbinde("claude-code", mac()).message).toContain(CLAUDE_CODE_BEFEHL);
    schreib(path.join(home, ".claude.json"), { projects: { "/x": { mcpServers: { kepta: {} } } } });
    expect(status(mac(), "claude-code")).toMatchObject({ installed: true, connected: true, canConnect: false });
  });
  it("Gemini CLI über ~/.gemini/settings.json — gleiche mcpServers-Struktur, Auto-Connect", () => {
    schreib(path.join(home, ".gemini", "settings.json"), { theme: "auto", mcpServers: { other: { command: "x" } } });
    expect(status(mac(), "gemini")).toMatchObject({ installed: true, connected: false, canConnect: true });
    expect(verbinde("gemini", mac())).toMatchObject({ ok: true });
    expect(lies(path.join(home, ".gemini", "settings.json"))).toEqual({ theme: "auto", mcpServers: { other: { command: "x" }, kepta: { command: "npx", args: ["-y", "kepta-mcp"] } } });
  });

  it("Cline und Roo Code: die Konfiguration sitzt tief im globalStorage der VS-Code-Erweiterung", () => {
    const clineOrdner = path.join(home, "Library", "Application Support", "Code", "User", "globalStorage", "saoudrizwan.claude-dev", "settings");
    const rooOrdner = path.join(home, "Library", "Application Support", "Code", "User", "globalStorage", "rooveterinaryinc.roo-cline", "settings");
    fs.mkdirSync(clineOrdner, { recursive: true });
    fs.mkdirSync(rooOrdner, { recursive: true });
    expect(status(mac(), "cline").config).toBe(path.join(clineOrdner, "cline_mcp_settings.json"));
    expect(status(mac(), "roo").config).toBe(path.join(rooOrdner, "mcp_settings.json"));
    expect(verbinde("cline", mac())).toMatchObject({ ok: true });
    expect(lies(path.join(clineOrdner, "cline_mcp_settings.json"))).toEqual({ mcpServers: { kepta: { command: "npx", args: ["-y", "kepta-mcp"] } } });
    expect(status({ home, plattform: "win32", appdata: path.join(home, "AD"), claude: () => null }, "cline").config).toBe(
      path.join(home, "AD", "Code", "User", "globalStorage", "saoudrizwan.claude-dev", "settings", "cline_mcp_settings.json")
    );
  });

  it("jede weitere KI bekommt den exakten Schnipsel — Zed, Codex CLI, Continue, generisch", () => {
    const alle = finde(mac());
    const zed = alle.find((c) => c.id === "zed")!;
    expect(zed.canConnect).toBe(false);
    expect(zed.hint).toContain("context_servers");
    expect(zed.hint).toContain("kepta-mcp");
    expect(alle.find((c) => c.id === "codex-cli")!.hint).toContain("[mcp_servers.kepta]");
    expect(alle.find((c) => c.id === "continue")!.hint).toContain("mcpServers:");
    expect(alle.find((c) => c.id === "any-mcp")!.hint).toContain("HTTP API");
  });

  it("setup fragt je App und trägt nur ein, was bejaht wurde — mit --yes ohne Fragen", async () => {
    fs.mkdirSync(path.join(home, ".cursor"), { recursive: true });
    schreib(claudeDesktop(), {});
    let text = "";
    const fragen: string[] = [];
    const code = await einrichten([], mac(), {
      schreibe: (s) => (text += s),
      frage: async (f) => {
        fragen.push(f);
        return f.includes("Cursor") ? "y" : "n";
      },
    });
    expect(code).toBe(0);
    expect(fragen).toEqual(["\nConnect Claude Desktop? [y/N] ", "\nConnect Cursor? [y/N] "]);
    expect(lies(path.join(home, ".cursor", "mcp.json")).mcpServers.kepta).toBeTruthy();
    expect(lies(claudeDesktop()).mcpServers).toBeUndefined();
    expect(text).toContain("✓ Cursor: Connected.");
    text = "";
    expect(await einrichten(["--yes"], mac(), { schreibe: (s) => (text += s) })).toBe(0);
    expect(lies(claudeDesktop()).mcpServers.kepta).toBeTruthy();
    expect(text).toContain("npx -y kepta-mcp ui");
  });

  it("setup ohne Terminal und ohne --yes ändert nichts; ohne jede App zeigt es den Block zum Einfügen", async () => {
    schreib(claudeDesktop(), {});
    let text = "";
    expect(await einrichten([], mac(), { schreibe: (s) => (text += s) })).toBe(0);
    expect(text).toContain("Run it again with --yes to connect Claude Desktop.");
    expect(lies(claudeDesktop())).toEqual({});
    home = fs.mkdtempSync(path.join(os.tmpdir(), "kepta-home-"));
    text = "";
    await einrichten([], mac(), { schreibe: (s) => (text += s) });
    expect(text).toContain('"kepta-mcp"');
  });

  it("ein Fehler beim Eintragen ergibt Exit-Code 1 und sagt, warum", async () => {
    const claude = (a: string[]) => (a[0] === "--version" ? { status: 0, stdout: "2.1", stderr: "" } : { status: 1, stdout: "", stderr: "boom" });
    let text = "";
    expect(await einrichten(["--yes"], mac({ claude }), { schreibe: (s) => (text += s) })).toBe(1);
    expect(text).toContain("✗ Claude Code: Claude Code said: boom");
  });
});
