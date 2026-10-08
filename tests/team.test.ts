// Milestone E1 — Team-Scopes und Rollen.
// Matrix: team:* nur mit einer Rollen-Datei (admin/member schreiben, viewer nur
// lesen); nicht-team-Scopes bleiben exakt wie der ALLOW_ALL-Default
// (Regressionsschutz für alles bisherige). Plus /api/team.
//
// Bis 10.10.2026 verlangte diese Matrix zusätzlich eine Business-/Enterprise-
// Lizenz. Die herunterladbare App hat kein Schlüssel-System mehr, also schaltet
// allein die verwaltete Rollen-Datei — die Fälle hier prüfen genau das.
import { describe, it, expect, beforeEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import request from "supertest";

process.env.KEPTA_NO_AUTOSTART = "1";
// Hermetisch: Tests dürfen nie den echten Schlüsselbund berühren (22.9. gelernt —
// ein Keychain-Zugriff aus Tests hat den echten Datenbank-Schlüssel überschrieben).
// Die Nebendateien-Verschlüsselung selbst deckt tests/nebendateien.test.ts mit
// eigenen Schlüsseln ab.
process.env.KEPTA_ENCRYPTION = "off";

import { KeptaStore } from "../src/core/store";
import { defaultExtensions, ALLOW_ALL } from "../src/core/extensions";
import { liesTeamKonfig, rolleFuer, darfSchreiben, teamPolicy, istTeamScope } from "../src/lib/team";
import { richtlinienCacheLeeren } from "../src/lib/richtlinien";
import { createApp } from "../server/app";

const verwalteteDatei = (inhalt: unknown, dir: string): string => {
  const p = path.join(dir, "managed-settings.json");
  fs.writeFileSync(p, JSON.stringify(inhalt));
  return p;
};

describe("Team-Konfiguration aus der verwalteten Datei", () => {
  beforeEach(() => richtlinienCacheLeeren());

  it("liest gültige Rollen, verwirft ungültige", () => {
    const p = verwalteteDatei({ team: { name: "Kanzlei Weber", rollen: { Petra: "admin", jonas: "member", x: "gott" }, standardRolle: "viewer" } }, fs.mkdtempSync(path.join(os.tmpdir(), "team-")));
    const k = liesTeamKonfig({ team: { name: "Kanzlei Weber", rollen: { Petra: "admin", jonas: "member", x: "gott" }, standardRolle: "viewer" } })!;
    expect(k.name).toBe("Kanzlei Weber");
    expect(k.rollen["petra"]).toBe("admin");
    expect(k.rollen["jonas"]).toBe("member");
    expect(k.rollen["x"]).toBeUndefined();
    expect(k.standardRolle).toBe("viewer");
    void p;
  });

  it("kein team-Abschnitt → null", () => {
    expect(liesTeamKonfig({})).toBeNull();
    expect(liesTeamKonfig(null)).toBeNull();
  });

  it("rolleFuer: gelistete Rolle gewinnt, sonst standardRolle, sonst viewer", () => {
    const k = liesTeamKonfig({ team: { rollen: { petra: "admin" }, standardRolle: "member" } })!;
    expect(rolleFuer(k, "petra")).toBe("admin");
    expect(rolleFuer(k, "jonas")).toBe("member");
    expect(rolleFuer(liesTeamKonfig({ team: { rollen: { petra: "admin" } } })!, "jonas")).toBe("viewer");
    expect(darfSchreiben("admin")).toBe(true);
    expect(darfSchreiben("member")).toBe(true);
    expect(darfSchreiben("viewer")).toBe(false);
  });
});

describe("Team-Policy-Matrix", () => {
  const konfig = () => liesTeamKonfig({ team: { name: "K", rollen: { petra: "admin", jonas: "member", gast: "viewer" } } });
  void istTeamScope;

  it("Rollen-Datei da: admin/member schreiben, viewer nur lesen, Unbekannt = viewer", () => {
    const gate = teamPolicy(konfig).policy;
    const ref = { id: "1", scope: "team:acme", type: "semantic" };
    expect(gate.canWrite({ actorId: "petra", scope: "local" }, ref)).toBe(true);
    expect(gate.canWrite({ actorId: "jonas", scope: "local" }, ref)).toBe(true);
    expect(gate.canRead({ actorId: "gast", scope: "local" }, ref)).toBe(true);
    expect(gate.canWrite({ actorId: "gast", scope: "local" }, ref)).toBe(false);
    expect(gate.canWrite({ actorId: "fremd", scope: "local" }, ref)).toBe(false);
    expect(gate.canRead({ actorId: "fremd", scope: "local" }, ref)).toBe(true);
  });

  it("keine Rollen-Datei → team:* ist dicht, lesen und schreiben", () => {
    const gate = teamPolicy(() => null).policy;
    expect(gate.canRead({ actorId: "petra", scope: "local" }, { id: "1", scope: "team:acme", type: "semantic" })).toBe(false);
    expect(gate.canWrite({ actorId: "petra", scope: "local" }, { id: "1", scope: "team:acme", type: "semantic" })).toBe(false);
  });

  it("nicht-team-Scopes bleiben IMMER frei — auch ohne Rollen-Datei", () => {
    const gate = teamPolicy(() => null).policy;
    const ref = { id: "1", scope: "local", type: "semantic" };
    expect(gate.canRead({ actorId: "lokal", scope: "local" }, ref)).toBe(true);
    expect(gate.canWrite({ actorId: "lokal", scope: "local" }, ref)).toBe(true);
    expect(gate.canRead({ actorId: "lokal", scope: "local" }, { id: "2", scope: "agent:claude", type: "semantic" })).toBe(true);
    // und identisch zum bisherigen Default:
    expect(ALLOW_ALL.canWrite({ actorId: "lokal", scope: "local" }, ref)).toBe(true);
  });

  it("filterResults entfernt team-Zeilen ohne Rollen-Datei, lässt den Rest unangetastet", () => {
    const zeilen = [
      { id: "1", scope: "local", type: "semantic" },
      { id: "2", scope: "team:acme", type: "semantic" },
      { id: "3", scope: "user:x", type: "semantic" },
    ];
    expect(teamPolicy(() => null).policy.filterResults({ actorId: "lokal", scope: "local" }, zeilen).map((r) => r.id)).toEqual(["1", "3"]);
    expect(teamPolicy(konfig).policy.filterResults({ actorId: "gast", scope: "local" }, zeilen).map((r) => r.id)).toEqual(["1", "2", "3"]);
  });
});

describe("Store-Integration: createMemory durch die Team-Policy", () => {
  function storeMitRollen(rollen: Record<string, string>): KeptaStore {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "team-store-"));
    const gate = teamPolicy(() => liesTeamKonfig({ team: { name: "K", rollen, standardRolle: "viewer" } })).policy;
    return new KeptaStore(path.join(dir, "test.db"), { ...defaultExtensions(), policy: gate });
  }

  it("admin-Rolle → team-Scope speichern", () => {
    const store = storeMitRollen({ local: "admin" });
    const r = store.createMemory({ title: "Frist", content: "USt-Abgabe Q3", scope: "team:acme" });
    expect(r.scope).toBe("team:acme");
  });

  it("viewer-Rolle → PolicyGate verweigert das Schreiben", () => {
    const store = storeMitRollen({ local: "viewer" });
    expect(() => store.createMemory({ title: "Frist", content: "x", scope: "team:acme" })).toThrow(/PolicyGate/);
  });

  it("ohne gelistete Person → standardRolle viewer, und local bleibt frei", () => {
    const store = storeMitRollen({});
    expect(() => store.createMemory({ title: "F", content: "x", scope: "team:acme" })).toThrow(/PolicyGate/);
    expect(store.createMemory({ title: "Lokal", content: "x" }).scope).toBe("local");
  });
});

describe("/api/team", () => {
  let dir: string;
  let store: KeptaStore;
  let app: import("express").Express;

  beforeEach(() => {
    richtlinienCacheLeeren();
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "team-api-"));
    store = new KeptaStore(path.join(dir, "test.db"));
    app = createApp(store);
  });

  it("ohne Rollen-Datei → team null, und die Antwort nennt keine Stufe mehr", async () => {
    const res = await request(app).get("/api/team");
    expect(res.status).toBe(200);
    expect(res.body.team).toBeNull();
    expect(res.body).not.toHaveProperty("edition");
    expect(res.body).not.toHaveProperty("seats");
  });

  it("verwaltete Rollen → Name, Rollen und meineRolle", async () => {
    const pfad = verwalteteDatei({ team: { name: "Kanzlei Weber", rollen: { local: "admin", gast: "viewer" }, standardRolle: "member" } }, dir);
    process.env.KEPTA_MANAGED_CONFIG = pfad;
    richtlinienCacheLeeren();
    try {
      const res = await request(app).get("/api/team");
      expect(res.status).toBe(200);
      expect(res.body.team.name).toBe("Kanzlei Weber");
      expect(res.body.team.meineRolle).toBe("admin");
      expect(res.body.team.rollen.gast).toBe("viewer");
    } finally {
      delete process.env.KEPTA_MANAGED_CONFIG;
      richtlinienCacheLeeren();
    }
  });
});
