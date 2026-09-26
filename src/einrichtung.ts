// KEPTA mit den KI-Apps verbinden, die schon auf dem Rechner sind.
//
// `npx kepta-mcp setup` und der Knopf „Connect“ in der Oberfläche teilen
// diesen Code. Er findet Claude Desktop, Claude Code, Cursor, Windsurf,
// VS Code, Gemini CLI, Cline und Roo Code, sieht nach, ob KEPTA dort schon
// eingetragen ist, und trägt es ein — mit einer Sicherung der alten Datei
// daneben. Andere Einträge bleiben, wie sie sind; eine Datei, die kein reines
// JSON ist, wird nie überschrieben. Claude Code bekommt KEPTA über seinen
// eigenen Befehl (`claude mcp add`), weil es seine Datei ständig selbst neu
// schreibt. Für jede weitere KI, die MCP spricht (Zed, Codex CLI, Continue,
// …), liefert er den exakten Schnipsel zum Einfügen — schreiben wir dort
// nicht selbst, weil sich ihre Formate zu schnell bewegen.
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
  /** %APPDATA% unter Windows */
  appdata?: string;
  /** Führt `claude …` aus — null, wenn es den Befehl nicht gibt. */
  claude?: (argumente: string[]) => Befehlsergebnis | null;
  jetzt?: () => Date;
}

export interface ClientStatus {
  /** Eine ClientId für Auto-Connect-Apps; eine Kennung ("zed", "codex-cli", …) für geführte. */
  id: ClientId | string;
  name: string;
  installed: boolean;
  connected: boolean;
  /** Die Datei, in der KEPTA eingetragen ist oder wird. */
  config: string;
  /** Kann KEPTA sich hier selbst eintragen? */
  canConnect: boolean;
  /** Was sonst zu tun ist. */
  hint?: string;
}

export interface Verbindung {
  ok: boolean;
  message: string;
  backup?: string | null;
}

export const EINTRAG = { command: "npx", args: ["-y", "kepta-mcp"] };
export const CLAUDE_CODE_BEFEHL = "claude mcp add --scope user kepta -- npx -y kepta-mcp";

interface Datei {
  id: Exclude<ClientId, "claude-code">;
  name: string;
  ordner: string;
  datei: string;
  schluessel: "mcpServers" | "servers";
  eintrag: Record<string, unknown>;
}

function dateien(u: Umgebung): Datei[] {
  const appdata = u.appdata ?? path.join(u.home, "AppData", "Roaming");
  const programme = u.plattform === "darwin" ? path.join(u.home, "Library", "Application Support") : u.plattform === "win32" ? appdata : path.join(u.home, ".config");
  const datei = (id: Datei["id"], name: string, ordner: string, dateiname: string, schluessel: Datei["schluessel"] = "mcpServers", eintrag: Record<string, unknown> = EINTRAG): Datei => ({
    id,
    name,
    ordner,
    datei: path.join(ordner, dateiname),
    schluessel,
    eintrag,
  });
  return [
    datei("claude-desktop", "Claude Desktop", path.join(programme, "Claude"), "claude_desktop_config.json"),
    datei("cursor", "Cursor", path.join(u.home, ".cursor"), "mcp.json"),
    datei("windsurf", "Windsurf", path.join(u.home, ".codeium", "windsurf"), "mcp_config.json"),
    datei("vscode", "VS Code", path.join(programme, "Code", "User"), "mcp.json", "servers", { type: "stdio", ...EINTRAG }),
    datei("gemini", "Gemini CLI", path.join(u.home, ".gemini"), "settings.json"),
    // VS-Code-Erweiterungen: die Konfiguration sitzt tief im globalStorage der Erweiterung.
    datei("cline", "Cline", path.join(programme, "Code", "User", "globalStorage", "saoudrizwan.claude-dev", "settings"), "cline_mcp_settings.json"),
    datei("roo", "Roo Code", path.join(programme, "Code", "User", "globalStorage", "rooveterinaryinc.roo-cline", "settings"), "mcp_settings.json"),
  ];
}

/** Steht KEPTA in dieser Server-Liste? Am Namen oder am Befehl erkannt. */
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

/** Welche Apps es gibt und ob KEPTA dort schon eingetragen ist. */
export function finde(u: Umgebung): ClientStatus[] {
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
    hint: connected || hatBefehl ? undefined : `Run this in a terminal: ${CLAUDE_CODE_BEFEHL}`,
  });
  aus.push(...gefuehrteKlienten(u));
  return aus;
}

/**
 * KI-Apps ohne sicheren Schreib-Weg von außen: ihre Konfigurationsformate
 * bewegen sich zu schnell (Zed), sind kein JSON (Codex: TOML, Continue: YAML)
 * oder sitzen in IDE-internen Speichern. KEPTA schreibt dort nichts — sie
 * bekommen den exakten Schnipsel zum Einfügen. So läuft KEPTA mit jeder KI,
 * die MCP spricht, ohne jemals eine fremde Datei zu riskieren.
 */
function gefuehrteKlienten(u: Umgebung): ClientStatus[] {
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
      hint: `Paste into "context_servers" in ${zedDatei}: {"kepta": {"source": "custom", "command": "${EINTRAG.command}", "args": ${JSON.stringify(EINTRAG.args)}}}`,
    },
    {
      id: "codex-cli",
      name: "Codex CLI",
      installed: fs.existsSync(path.join(u.home, ".codex")),
      connected: false,
      config: path.join(u.home, ".codex", "config.toml"),
      canConnect: false,
      hint: `Paste into ${path.join(u.home, ".codex", "config.toml")}: [mcp_servers.kepta] command = "${EINTRAG.command}" args = [${EINTRAG.args.map((a) => `"${a}"`).join(", ")}]`,
    },
    {
      id: "continue",
      name: "Continue",
      installed: fs.existsSync(path.join(u.home, ".continue")),
      connected: false,
      config: path.join(u.home, ".continue", "config.yaml"),
      canConnect: false,
      hint: `Paste into ${path.join(u.home, ".continue", "config.yaml")}: mcpServers:\n  - name: kepta\n    type: stdio\n    command: ${EINTRAG.command}\n    args: [${EINTRAG.args.map((a) => `"${a}"`).join(", ")}]`,
    },
    {
      id: "any-mcp",
      name: "Any other MCP client",
      installed: true,
      connected: false,
      config: "",
      canConnect: false,
      hint: `Add a stdio MCP server anywhere it fits: command "${EINTRAG.command}", args ${JSON.stringify(EINTRAG.args)}. Or use the HTTP API directly (POST /api/search, /api/memories).`,
    },
  ];
}

function stempel(d: Date): string {
  return d.toISOString().replace(/[:.]/g, "-").slice(0, 19);
}

/** Trägt KEPTA in einer App ein — mit Sicherung, ohne andere Einträge anzufassen. */
export function verbinde(id: string, u: Umgebung): Verbindung {
  if (id === "claude-code") {
    const r = u.claude?.(["mcp", "add", "--scope", "user", "kepta", "--", "npx", "-y", "kepta-mcp"]) ?? null;
    if (!r) return { ok: false, message: `Claude Code was not found. Run this in a terminal: ${CLAUDE_CODE_BEFEHL}` };
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
  const neu = { ...json, [d.schluessel]: { ...liste, kepta: d.eintrag } };
  const zwischen = `${d.datei}.kepta-tmp`;
  fs.writeFileSync(zwischen, JSON.stringify(neu, null, 2) + "\n", { mode: modus });
  fs.renameSync(zwischen, d.datei);
  return { ok: true, message: `Connected. Quit and reopen ${d.name} to load KEPTA.`, backup };
}

/** Die echte Umgebung: Heimatordner, System und der Befehl `claude`, falls es ihn gibt. */
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

/** `npx kepta-mcp setup [--yes]`: zeigen, fragen, eintragen. Gibt den Exit-Code zurück. */
export async function einrichten(
  argumente: string[],
  u: Umgebung,
  io: { schreibe: (s: string) => void; frage?: (f: string) => Promise<string> }
): Promise<number> {
  const alle = argumente.includes("--yes") || argumente.includes("-y");
  const liste = finde(u);
  io.schreibe("KEPTA — connect your AI apps\n\n");
  for (const c of liste) {
    const zeichen = c.connected ? "✓" : c.installed ? "○" : "·";
    const wort = c.connected ? "connected" : c.installed ? "not connected yet" : "not installed";
    io.schreibe(`  ${zeichen} ${c.name.padEnd(15)} ${wort}\n`);
  }
  const offen = liste.filter((c) => c.canConnect);
  const vonHand = liste.filter((c) => c.installed && !c.connected && !c.canConnect);
  let fehler = 0;
  let verbunden = 0;
  for (const c of offen) {
    let ja = alle;
    if (!ja && io.frage) ja = /^y(es)?$/i.test((await io.frage(`\nConnect ${c.name}? [y/N] `)).trim());
    if (!ja) continue;
    const r = verbinde(c.id, u);
    io.schreibe(`  ${r.ok ? "✓" : "✗"} ${c.name}: ${r.message}\n${r.backup ? `    Backup of the old file: ${r.backup}\n` : ""}`);
    if (r.ok) verbunden++;
    else fehler++;
  }
  if (offen.length && !alle && !io.frage) io.schreibe(`\nRun it again with --yes to connect ${offen.map((c) => c.name).join(", ")}.\n`);
  for (const c of vonHand) io.schreibe(`\n${c.name}: ${c.hint}\n`);
  if (!offen.length && !vonHand.length && !liste.some((c) => c.connected)) {
    io.schreibe("\nNo AI app found. Add this to any MCP client:\n" + JSON.stringify({ mcpServers: { kepta: EINTRAG } }, null, 2) + "\n");
  }
  if (verbunden || liste.some((c) => c.connected)) {
    io.schreibe("\nNow ask your AI: “Remember that I prefer short answers.” — the free desktop app shows what it remembered: https://github.com/DamianTodorovic/kepta-pro-releases/releases/latest\n");
  }
  return fehler ? 1 : 0;
}
