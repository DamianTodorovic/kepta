// Connecting KEPTA to the AI apps that are already on this computer — and
// showing the way for every other AI that speaks MCP.
//
// Auto-connects (one click, with a backup of the old file right next to it,
// every other entry untouched, never a file that is not plain JSON):
// Claude Desktop, Claude Code, Cursor, Windsurf, VS Code, Gemini CLI,
// Cline and Roo Code. Claude Code gets KEPTA through its own command
// (`claude mcp add`), because it rewrites its file all the time.
//
// Guided only (their config formats move too fast to write safely from
// outside): Zed, Codex CLI, Continue and anything else that speaks MCP —
// each shows the exact snippet to paste.
//
// The entry is the MCP server inside this app when KEPTA runs as the desktop
// app (no Node, no npm), and `npx -y kepta-mcp` otherwise.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

export type ClientId = "claude-desktop" | "claude-code" | "cursor" | "windsurf" | "vscode" | "gemini" | "cline" | "roo";

export interface Befehlsergebnis {
  status: number | null;
  stdout: string;
  stderr: string;
}

export interface Umgebung {
  home: string;
  plattform: NodeJS.Platform;
  /** %APPDATA% on Windows */
  appdata?: string;
  /** Runs `claude …` — null when there is no such command. */
  claude?: (argumente: string[]) => Befehlsergebnis | null;
  jetzt?: () => Date;
}

export interface Eintrag {
  command: string;
  args: string[];
  env?: Record<string, string>;
}

export interface ClientStatus {
  /** A ClientId for auto-connect apps; a descriptor ("zed", "codex-cli", …) for guided ones. */
  id: ClientId | string;
  name: string;
  installed: boolean;
  connected: boolean;
  /** The file KEPTA is (or will be) listed in. */
  config: string;
  /** Can KEPTA add itself here? */
  canConnect: boolean;
  /** What to do otherwise. */
  hint?: string;
}

export interface Verbindung {
  ok: boolean;
  message: string;
  backup?: string | null;
}

export const NPX_EINTRAG: Eintrag = { command: "npx", args: ["-y", "kepta-mcp"] };

/** The Claude Code command for an entry — shown when KEPTA cannot run it itself. */
export function claudeCodeArgumente(e: Eintrag): string[] {
  const umgebung = Object.entries(e.env ?? {}).flatMap(([k, v]) => ["-e", `${k}=${v}`]);
  return ["mcp", "add", "--scope", "user", ...umgebung, "kepta", "--", e.command, ...e.args];
}

function alsBefehl(e: Eintrag): string {
  const zitiere = (s: string) => (/^[\w@%+=:,./-]+$/.test(s) ? s : `'${s.replace(/'/g, "'\\''")}'`);
  return ["claude", ...claudeCodeArgumente(e)].map(zitiere).join(" ");
}

interface Datei {
  id: Exclude<ClientId, "claude-code">;
  name: string;
  ordner: string;
  datei: string;
  schluessel: "mcpServers" | "servers";
  vscode: boolean;
}

function dateien(u: Umgebung): Datei[] {
  const appdata = u.appdata ?? path.join(u.home, "AppData", "Roaming");
  const programme = u.plattform === "darwin" ? path.join(u.home, "Library", "Application Support") : u.plattform === "win32" ? appdata : path.join(u.home, ".config");
  const d = (id: Datei["id"], name: string, ordner: string, dateiname: string, vscode = false): Datei => ({
    id,
    name,
    ordner,
    datei: path.join(ordner, dateiname),
    schluessel: vscode ? "servers" : "mcpServers",
    vscode,
  });
  return [
    d("claude-desktop", "Claude Desktop", path.join(programme, "Claude"), "claude_desktop_config.json"),
    d("cursor", "Cursor", path.join(u.home, ".cursor"), "mcp.json"),
    d("windsurf", "Windsurf", path.join(u.home, ".codeium", "windsurf"), "mcp_config.json"),
    d("vscode", "VS Code", path.join(programme, "Code", "User"), "mcp.json", true),
    d("gemini", "Gemini CLI", path.join(u.home, ".gemini"), "settings.json"),
    // VS-Code-Extensions: die Konfiguration sitzt tief im globalStorage der Erweiterung.
    d("cline", "Cline", path.join(programme, "Code", "User", "globalStorage", "saoudrizwan.claude-dev", "settings"), "cline_mcp_settings.json"),
    d("roo", "Roo Code", path.join(programme, "Code", "User", "globalStorage", "rooveterinaryinc.roo-cline", "settings"), "mcp_settings.json"),
  ];
}

/** Is KEPTA in this server list? Recognised by its name or its command. */
export function hatKepta(server: unknown): boolean {
  if (!server || typeof server !== "object" || Array.isArray(server)) return false;
  return Object.entries(server as Record<string, unknown>).some(([name, e]) => /kepta/i.test(name) || /kepta/i.test(JSON.stringify(e ?? "")));
}

type Gelesen = { ok: true; json: Record<string, unknown> | null } | { ok: false };

function lies(datei: string): Gelesen {
  let roh: string;
  try {
    roh = fs.readFileSync(datei, "utf8");
  } catch {
    return { ok: true, json: null };
  }
  if (!roh.trim()) return { ok: true, json: {} };
  try {
    const j = JSON.parse(roh) as unknown;
    return j && typeof j === "object" && !Array.isArray(j) ? { ok: true, json: j as Record<string, unknown> } : { ok: false };
  } catch {
    return { ok: false };
  }
}

function claudeCodeVerbunden(j: Record<string, unknown> | null): boolean {
  if (!j) return false;
  if (hatKepta(j.mcpServers)) return true;
  const projekte = j.projects && typeof j.projects === "object" ? Object.values(j.projects as Record<string, { mcpServers?: unknown }>) : [];
  return projekte.some((p) => hatKepta(p?.mcpServers));
}

/** Which apps exist and whether KEPTA is already listed in them. */
export function finde(u: Umgebung, eintrag: Eintrag = NPX_EINTRAG): ClientStatus[] {
  const aus: ClientStatus[] = dateien(u).map((d) => {
    const installed = fs.existsSync(d.ordner);
    const l = lies(d.datei);
    const connected = l.ok && hatKepta(l.json?.[d.schluessel]);
    return {
      id: d.id,
      name: d.name,
      installed,
      connected,
      config: d.datei,
      canConnect: installed && !connected && l.ok,
      hint: l.ok ? undefined : `${d.datei} is not plain JSON — KEPTA leaves it alone. Add KEPTA there by hand.`,
    };
  });
  const datei = path.join(u.home, ".claude.json");
  const l = lies(datei);
  const connected = l.ok && claudeCodeVerbunden(l.json);
  const befehl = connected ? null : (u.claude?.(["--version"]) ?? null);
  const hatBefehl = befehl?.status === 0;
  aus.splice(1, 0, {
    id: "claude-code",
    name: "Claude Code",
    installed: fs.existsSync(datei) || fs.existsSync(path.join(u.home, ".claude")) || hatBefehl,
    connected,
    config: datei,
    canConnect: !connected && hatBefehl,
    hint: connected || hatBefehl ? undefined : `Run this in a terminal: ${alsBefehl(eintrag)}`,
  });
  aus.push(...gefuehrteKlienten(u, eintrag));
  return aus;
}

/**
 * KI-Apps ohne sicheren Schreib-Weg von außen: ihre Konfigurationsformate
 * bewegen sich zu schnell (Zed), sind kein JSON (Codex: TOML, Continue: YAML)
 * oder sitzen in IDE-internen Speichern. KEPTA schreibt dort nichts — sie
 * bekommen den exakten Schnipsel zum Einfügen. So läuft KEPTA mit jeder KI,
 * die MCP spricht, ohne jemals eine fremde Datei zu riskieren.
 */
function gefuehrteKlienten(u: Umgebung, eintrag: Eintrag): ClientStatus[] {
  const zedDatei = u.plattform === "win32" ? path.join(u.appdata ?? path.join(u.home, "AppData", "Roaming"), "Zed", "settings.json") : path.join(u.home, ".config", "zed", "settings.json");
  const zedInstalliert = fs.existsSync(path.dirname(zedDatei));
  return [
    {
      id: "zed",
      name: "Zed",
      installed: zedInstalliert,
      connected: false,
      config: zedDatei,
      canConnect: false,
      hint: `Paste into "context_servers" in ${zedDatei}: {"kepta": {"source": "custom", "command": "${eintrag.command}", "args": ${JSON.stringify(eintrag.args)}}}`,
    },
    {
      id: "codex-cli",
      name: "Codex CLI",
      installed: fs.existsSync(path.join(u.home, ".codex")),
      connected: false,
      config: path.join(u.home, ".codex", "config.toml"),
      canConnect: false,
      hint: `Paste into ${path.join(u.home, ".codex", "config.toml")}: [mcp_servers.kepta] command = "${eintrag.command}" args = [${eintrag.args.map((a) => `"${a}"`).join(", ")}]`,
    },
    {
      id: "continue",
      name: "Continue",
      installed: fs.existsSync(path.join(u.home, ".continue")),
      connected: false,
      config: path.join(u.home, ".continue", "config.yaml"),
      canConnect: false,
      hint: `Paste into ${path.join(u.home, ".continue", "config.yaml")}: mcpServers:\n  - name: kepta\n    type: stdio\n    command: ${eintrag.command}\n    args: [${eintrag.args.map((a) => `"${a}"`).join(", ")}]`,
    },
    {
      id: "any-mcp",
      name: "Any other MCP client",
      installed: true,
      connected: false,
      config: "",
      canConnect: false,
      hint: `Add a stdio MCP server anywhere it fits: command "${eintrag.command}", args ${JSON.stringify(eintrag.args)}${eintrag.env ? `, env ${JSON.stringify(eintrag.env)}` : ""}. Or use the HTTP API directly (POST /api/search, /api/memories).`,
    },
  ];
}

function stempel(d: Date): string {
  return d.toISOString().replace(/[:.]/g, "-").slice(0, 19);
}

/** Adds KEPTA to one app — with a backup, without touching any other entry. */
export function verbinde(id: string, u: Umgebung, eintrag: Eintrag = NPX_EINTRAG): Verbindung {
  if (id === "claude-code") {
    const r = u.claude?.(claudeCodeArgumente(eintrag)) ?? null;
    if (!r) return { ok: false, message: `Claude Code was not found. Run this in a terminal: ${alsBefehl(eintrag)}` };
    if (r.status !== 0) {
      if (/already exists/i.test(r.stderr + r.stdout)) return { ok: true, message: "KEPTA was already connected to Claude Code." };
      return { ok: false, message: `Claude Code said: ${(r.stderr || r.stdout).trim().slice(0, 300) || `exit ${r.status}`}` };
    }
    return { ok: true, message: "Connected. Start a new Claude Code session to use KEPTA." };
  }
  const d = dateien(u).find((x) => x.id === id);
  if (!d) return { ok: false, message: "Unknown app." };
  if (!fs.existsSync(d.ordner)) return { ok: false, message: `${d.name} does not seem to be installed on this computer.` };
  const l = lies(d.datei);
  if (!l.ok) return { ok: false, message: `${d.datei} is not plain JSON — KEPTA leaves it alone. Add KEPTA there by hand.` };
  const json = l.json ?? {};
  const alt = json[d.schluessel];
  const liste = alt && typeof alt === "object" && !Array.isArray(alt) ? (alt as Record<string, unknown>) : {};
  if (hatKepta(liste)) return { ok: true, message: `KEPTA was already connected to ${d.name}.`, backup: null };
  let backup: string | null = null;
  let modus = 0o600;
  if (l.json !== null) {
    backup = `${d.datei}.kepta-backup-${stempel(u.jetzt?.() ?? new Date())}`;
    fs.copyFileSync(d.datei, backup);
    modus = fs.statSync(d.datei).mode & 0o777;
  }
  const wert = d.vscode ? { type: "stdio", ...eintrag } : { ...eintrag };
  const neu = { ...json, [d.schluessel]: { ...liste, kepta: wert } };
  const zwischen = `${d.datei}.kepta-tmp`;
  fs.writeFileSync(zwischen, JSON.stringify(neu, null, 2) + "\n", { mode: modus });
  fs.renameSync(zwischen, d.datei);
  return { ok: true, message: `Connected. Quit and reopen ${d.name} to load KEPTA.`, backup };
}

/** The real environment: home folder, system and the `claude` command, if there is one. */
export function standardUmgebung(): Umgebung {
  return {
    home: os.homedir(),
    plattform: process.platform,
    appdata: process.env.APPDATA,
    claude: (argumente) => {
      const r = spawnSync("claude", argumente, { encoding: "utf8", timeout: 20_000, shell: process.platform === "win32" });
      if (r.error) return null;
      return { status: r.status, stdout: r.stdout ?? "", stderr: r.stderr ?? "" };
    },
  };
}
