// Enterprise Milestone E1 — Team-Scopes und Rollen.
// Matrix: team:* nur mit business/enterprise-Edition; Rollen aus der verwalteten
// Datei (admin/member schreiben, viewer nur lesen); nicht-team-Scopes bleiben
// exakt wie der ALLOW_ALL-Default (Pro-Regressionsschutz). Plus /api/team.
import { describe, it, expect, beforeEach, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import request from "supertest";

const paar: { privat?: string; oeffentlich?: string } = {};

vi.mock("../src/core/lizenz", async (importOriginal) => {
  const echt = await importOriginal<typeof import("../src/core/lizenz")>();
  const { generateKeyPairSync } = await import("node:crypto");
  // globalThis statt Modul-Konstante: vi.mock-Factories laufen bei der Modul-
  // Auflösung — eine const dort wäre in TDZ. (Muster von lizenz-api.test.ts.)
  const g = globalThis as typeof globalThis & { __teamTestPaar?: { privat: string; oeffentlich: string } };
  if (!g.__teamTestPaar) {
    const { publicKey, privateKey } = generateKeyPairSync("ed25519");
    g.__teamTestPaar = {
      privat: privateKey.export({ type: "pkcs8", format: "der" }).toString("base64"),
      oeffentlich: publicKey.export({ type: "spki", format: "der" }).toString("base64"),
    };
  }
  return {
    ...echt,
    pruefeSchluessel: (name: string, key: string) => echt.pruefeSchluessel(name, key, g.__teamTestPaar!.oeffentlich, new Set()),
    validiereSchluessel: (name: string, key: string) => echt.pruefeSchluessel(name, key, g.__teamTestPaar!.oeffentlich, new Set()).gueltig,
  };
});

process.env.KEPTA_NO_AUTOSTART = "1";
// Hermetisch: Tests dürfen nie den echten Schlüsselbund berühren (22.9. gelernt —
// ein Keychain-Zugriff aus Tests hat den echten Datenbank-Schlüssel überschrieben).
// Die Nebendateien-Verschlüsselung selbst deckt tests/nebendateien.test.ts mit
// eigenen Schlüsseln ab.
process.env.KEPTA_ENCRYPTION = "off";

const paarPrivat = (): string => (globalThis as typeof globalThis & { __teamTestPaar?: { privat: string } }).__teamTestPaar!.privat;

import { KeptaStore } from "../src/core/store";
import { defaultExtensions, ALLOW_ALL } from "../src/core/extensions";
import { liesTeamKonfig, rolleFuer, darfSchreiben, teamPolicy, editionAusStore, istTeamScope } from "../src/lib/team";
import { richtlinienCacheLeeren } from "../src/lib/richtlinien";
import { signiere } from "../src/core/lizenz";
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
  const business = { edition: () => "business" as const };
  const konfig = () => liesTeamKonfig({ team: { name: "K", rollen: { petra: "admin", jonas: "member", gast: "viewer" } } });
  const team = istTeamScope("team:acme");

  it("team:* ohne Edition (free/pro) → weder lesen noch schreiben", () => {
    const gate = teamPolicy({ edition: () => undefined }, konfig).policy;
    expect(gate.canRead({ actorId: "petra", scope: "local" }, { id: "1", scope: "team:acme", type: "semantic" })).toBe(false);
    expect(gate.canWrite({ actorId: "petra", scope: "local" }, { id: "1", scope: "team:acme", type: "semantic" })).toBe(false);
  });

  it("pro-Edition → ebenfalls dicht (Team-Daten sind lizenzierte Daten)", () => {
    const gate = teamPolicy({ edition: () => "pro" }, konfig).policy;
    expect(gate.canRead({ actorId: "petra", scope: "local" }, { id: "1", scope: "team:acme", type: "semantic" })).toBe(false);
  });

  it("business: admin/member schreiben, viewer nur lesen, Unbekannt = viewer", () => {
    const gate = teamPolicy(business, konfig).policy;
    const ref = { id: "1", scope: "team:acme", type: "semantic" };
    expect(gate.canWrite({ actorId: "petra", scope: "local" }, ref)).toBe(true);
    expect(gate.canWrite({ actorId: "jonas", scope: "local" }, ref)).toBe(true);
    expect(gate.canRead({ actorId: "gast", scope: "local" }, ref)).toBe(true);
    expect(gate.canWrite({ actorId: "gast", scope: "local" }, ref)).toBe(false);
    expect(gate.canWrite({ actorId: "fremd", scope: "local" }, ref)).toBe(false);
    expect(gate.canRead({ actorId: "fremd", scope: "local" }, ref)).toBe(true);
  });

  it("business ohne Rollen-Datei → dicht bleibt dicht", () => {
    const gate = teamPolicy(business, () => null).policy;
    expect(gate.canRead({ actorId: "petra", scope: "local" }, { id: "1", scope: "team:acme", type: "semantic" })).toBe(false);
    expect(gate.canWrite({ actorId: "petra", scope: "local" }, { id: "1", scope: "team:acme", type: "semantic" })).toBe(false);
  });

  it("nicht-team-Scopes bleiben IMMER frei — auch free und ohne Konfiguration (Pro-Regressionsschutz)", () => {
    const gate = teamPolicy({ edition: () => undefined }, () => null).policy;
    const ref = { id: "1", scope: "local", type: "semantic" };
    expect(gate.canRead({ actorId: "lokal", scope: "local" }, ref)).toBe(true);
    expect(gate.canWrite({ actorId: "lokal", scope: "local" }, ref)).toBe(true);
    expect(gate.canRead({ actorId: "lokal", scope: "local" }, { id: "2", scope: "agent:claude", type: "semantic" })).toBe(true);
    // und identisch zum bisherigen Default:
    expect(ALLOW_ALL.canWrite({ actorId: "lokal", scope: "local" }, ref)).toBe(true);
  });

  it("filterResults entfernt team-Zeilen ohne Recht, lässt den Rest unangetastet", () => {
    const gate = teamPolicy({ edition: () => undefined }, konfig).policy;
    const zeilen = [
      { id: "1", scope: "local", type: "semantic" },
      { id: "2", scope: "team:acme", type: "semantic" },
      { id: "3", scope: "user:x", type: "semantic" },
    ];
    expect(gate.filterResults({ actorId: "lokal", scope: "local" }, zeilen).map((r) => r.id)).toEqual(["1", "3"]);
    const gateBusiness = teamPolicy(business, konfig).policy;
    expect(gateBusiness.filterResults({ actorId: "gast", scope: "local" }, zeilen).map((r) => r.id)).toEqual(["1", "2", "3"]);
  });
});

describe("Store-Integration: createMemory durch die Team-Policy", () => {
  function storeMitEdition(edition: "business" | "pro" | undefined, rollen: Record<string, string> = { local: "admin" }): KeptaStore {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "team-store-"));
    const konfig = { team: { name: "K", rollen, standardRolle: "viewer" } };
    const gate = teamPolicy({ edition: () => edition }, () => liesTeamKonfig(konfig)).policy;
    return new KeptaStore(path.join(dir, "test.db"), { ...defaultExtensions(), policy: gate });
  }

  it("business + admin-Rolle → team-Scope speichern", () => {
    const store = storeMitEdition("business");
    const r = store.createMemory({ title: "Frist", content: "USt-Abgabe Q3", scope: "team:acme" });
    expect(r.scope).toBe("team:acme");
  });

  it("viewer-Rolle → PolicyGate verweigert das Schreiben", () => {
    const store = storeMitEdition("business", {});
    expect(() => store.createMemory({ title: "Frist", content: "x", scope: "team:acme" })).toThrow(/PolicyGate/);
  });

  it("pro-Edition → team-Scope verweigert, local unverändert", () => {
    const store = storeMitEdition("pro");
    expect(() => store.createMemory({ title: "F", content: "x", scope: "team:acme" })).toThrow(/PolicyGate/);
    expect(store.createMemory({ title: "Lokal", content: "x" }).scope).toBe("local");
  });

  it("editionAusStore: ohne Lizenz undefined, mit gültiger Business-Lizenz 'business'", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "team-ed-"));
    const store = new KeptaStore(path.join(dir, "test.db"));
    expect(editionAusStore(store)).toBeUndefined();
    store.setzeEinstellungen({ license_name: "Mandels Kanzlei", license_key: signiere("Mandels Kanzlei", 8, paarPrivat(), "business", 5) });
    expect(editionAusStore(store)).toBe("business");
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
    app = createApp(store, { lizenziert: () => true });
  });

  it("free → edition null, team null", async () => {
    const res = await request(app).get("/api/team");
    expect(res.status).toBe(200);
    expect(res.body.edition ?? null).toBeNull();
    expect(res.body.team).toBeNull();
  });

  it("business + verwaltete Rollen → Edition, Seats, Rollen, meineRolle", async () => {
    verwalteteDatei({ team: { name: "Kanzlei Weber", rollen: { local: "admin", gast: "viewer" }, standardRolle: "member" } }, dir);
    process.env.KEPTA_MANAGED_CONFIG = path.join(dir, "managed-settings.json");
    richtlinienCacheLeeren();
    store.setzeEinstellungen({ license_name: "Mandels Kanzlei", license_key: signiere("Mandels Kanzlei", 8, paarPrivat(), "business", 5) });
    try {
      const res = await request(app).get("/api/team");
      expect(res.status).toBe(200);
      expect(res.body.edition).toBe("business");
      expect(res.body.seats).toBe(5);
      expect(res.body.team.name).toBe("Kanzlei Weber");
      expect(res.body.team.meineRolle).toBe("admin");
    } finally {
      delete process.env.KEPTA_MANAGED_CONFIG;
      richtlinienCacheLeeren();
    }
  });
});
