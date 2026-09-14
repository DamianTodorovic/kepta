// @vitest-environment node
//
// Die Oberfläche zeigt, welche Agenten KEPTA nutzen und was sie tun — und
// verbindet neue mit einem Klick. Die Einstellungen der Apps liegen hier in
// einem Heimatordner aus dem Temp-Verzeichnis, nie in den echten.
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import http from "node:http";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { KeptaStore } from "../../src/core/store";
import { protokolliere } from "../../src/aktivitaet";
import { starteOberflaeche, type Oberflaeche } from "../../src/ui/server";

let store: KeptaStore;
let ui: Oberflaeche;
let home: string;

beforeEach(async () => {
  store = new KeptaStore(path.join(fs.mkdtempSync(path.join(os.tmpdir(), "kepta-agenten-")), "t.db"));
  home = fs.mkdtempSync(path.join(os.tmpdir(), "kepta-home-"));
  ui = await starteOberflaeche(store, { port: 0, umgebung: { home, plattform: "darwin", claude: () => null } });
});
afterEach(async () => {
  await ui.close();
  store.close();
});

function anfrage(methode: string, pfad: string, opt: { body?: unknown; ohneToken?: boolean } = {}): Promise<{ status: number; json: any }> {
  return new Promise((ok, fail) => {
    const body = opt.body !== undefined ? JSON.stringify(opt.body) : undefined;
    const headers: Record<string, string> = {
      host: `127.0.0.1:${ui.port}`,
      ...(body !== undefined ? { "content-type": "application/json" } : {}),
      ...(methode !== "GET" && !opt.ohneToken ? { "x-kepta-token": ui.token } : {}),
    };
    const r = http.request({ host: "127.0.0.1", port: ui.port, method: methode, path: pfad, headers }, (res) => {
      let text = "";
      res.setEncoding("utf8");
      res.on("data", (c) => (text += c));
      res.on("end", () => ok({ status: res.statusCode!, json: JSON.parse(text) }));
    });
    r.on("error", fail);
    if (body !== undefined) r.write(body);
    r.end();
  });
}

describe("Agenten in der Oberfläche", () => {
  it("/api/activity: neueste zuerst, mit lesbarem Namen und dem Titel wie auf der Karte — und nur Neues nach einer id", async () => {
    const n = store.createMemory({ title: "notes/backup-plan.md", content: "# Backup plan\nNightly." });
    protokolliere(store, { client: "claude-ai", tool: "connect", at: 1000 });
    protokolliere(store, { client: "claude-ai", tool: "memory_save", text: "notes/backup-plan.md", memoryId: n.id, at: 2000 });
    protokolliere(store, { client: "cursor-vscode", tool: "memory_search", text: "backup", count: 1, at: 3000 });
    const r = (await anfrage("GET", "/api/activity")).json;
    expect(r.entries.map((e: { who: string; tool: string; text: string; noteId: string | null }) => [e.who, e.tool, e.text, e.noteId])).toEqual([
      ["Cursor", "memory_search", "backup", null],
      ["Claude", "memory_save", "Backup plan", n.id],
      ["Claude", "connect", null, null],
    ]);
    expect(r.agents).toEqual([{ who: "Cursor", lastSeen: 3000, calls: 1 }, { who: "Claude", lastSeen: 2000, calls: 2 }]);
    expect((await anfrage("GET", `/api/activity?after=${r.entries[0].id}`)).json.entries).toEqual([]);
    // eine gelöschte Notiz verlinkt nicht mehr, ihr Titel bleibt stehen
    store.trashMemory(n.id);
    expect((await anfrage("GET", "/api/activity")).json.entries[1]).toMatchObject({ text: "notes/backup-plan.md", noteId: null });
  });

  it("/api/clients zeigt die Apps — Connect trägt KEPTA ein, nur mit Sitzungs-Token", async () => {
    fs.mkdirSync(path.join(home, ".cursor"), { recursive: true });
    const liste = (await anfrage("GET", "/api/clients")).json.clients;
    expect(liste.map((c: { id: string }) => c.id)).toEqual(["claude-desktop", "claude-code", "cursor", "windsurf", "vscode"]);
    expect(liste.find((c: { id: string }) => c.id === "cursor")).toMatchObject({ installed: true, connected: false, canConnect: true });
    expect((await anfrage("POST", "/api/clients/cursor/connect", { body: {}, ohneToken: true })).status).toBe(403);
    const r = await anfrage("POST", "/api/clients/cursor/connect", { body: {} });
    expect(r.status).toBe(200);
    expect(r.json.message).toBe("Connected. Quit and reopen Cursor to load KEPTA.");
    expect(r.json.clients.find((c: { id: string }) => c.id === "cursor").connected).toBe(true);
    expect(JSON.parse(fs.readFileSync(path.join(home, ".cursor", "mcp.json"), "utf8")).mcpServers.kepta.args).toEqual(["-y", "kepta-mcp"]);
    const nein = await anfrage("POST", "/api/clients/windsurf/connect", { body: {} });
    expect(nein.status).toBe(400);
    expect(nein.json.error).toContain("not seem to be installed");
    expect((await anfrage("POST", "/api/clients/..%2F..%2Fetc/connect", { body: {} })).status).toBe(404);
  });
});
