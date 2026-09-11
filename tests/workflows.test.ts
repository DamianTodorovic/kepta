import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import YAML from "yaml";

// Ein Workflow mit Tippfehler laedt einfach nicht — GitHub sagt dazu nichts, es
// passiert nur nichts. Bei einem Release-Workflow heisst das: kein Release, und
// niemand merkt es, bis jemand nach der neuen Version fragt.
const verzeichnis = path.join(process.cwd(), ".github", "workflows");
const dateien = fs.readdirSync(verzeichnis).filter((f) => f.endsWith(".yml") || f.endsWith(".yaml"));

describe("GitHub-Workflows", () => {
  it("es gibt welche", () => {
    expect(dateien.length).toBeGreaterThan(0);
  });

  it.each(dateien)("%s ist gueltiges YAML mit name, on und jobs", (datei) => {
    const roh = fs.readFileSync(path.join(verzeichnis, datei), "utf-8");
    const d = YAML.parse(roh) as Record<string, unknown>;
    expect(d).toBeTruthy();
    expect(typeof d.name).toBe("string");
    // YAML 1.1 liest das blanke "on" als Boolean true — beide Formen zulassen.
    expect(d.on ?? (d as Record<string, unknown>)["true"]).toBeTruthy();
    expect(Object.keys(d.jobs as object).length).toBeGreaterThan(0);
  });
});

describe("Veroeffentlichungs-Workflow", () => {
  const d = YAML.parse(fs.readFileSync(path.join(verzeichnis, "publish.yml"), "utf-8")) as Record<string, never>;
  const job = (d.jobs as Record<string, never>).publish as Record<string, never>;

  it("laeuft auf v-Tags", () => {
    const ausloeser = (d.on ?? d["true"]) as { push?: { tags?: string[] } };
    expect(ausloeser.push?.tags).toContain("v*");
  });

  it("darf ein OIDC-Zertifikat anfordern — sonst schlagen beide Uploads fehl", () => {
    // Ohne id-token: write gibt es kein Trusted Publishing, weder bei npm noch
    // bei der MCP-Registry. Das ist die eine Zeile, deren Fehlen alles kippt.
    expect((job.permissions as Record<string, string>)["id-token"]).toBe("write");
  });

  it("veroeffentlicht erst nach den Tests", () => {
    const namen = (job.steps as { name?: string; run?: string }[]).map((s) => s.name ?? s.run ?? "");
    const test = namen.findIndex((n) => /^Tests$/.test(n));
    const npmPublish = namen.findIndex((n) => /npm veroeffentlichen/i.test(n));
    const registry = namen.findIndex((n) => /MCP-Registry eintragen/i.test(n));
    expect(test).toBeGreaterThanOrEqual(0);
    expect(npmPublish).toBeGreaterThan(test);
    expect(registry).toBeGreaterThan(npmPublish);
  });

  it("wartet auf die npm-Verbreitung, bevor die Registry den Besitz prueft", () => {
    // Die Registry ruft das npm-Paket ab und liest dessen mcpName. Ist die neue
    // Version dort noch nicht sichtbar, wird der Eintrag abgelehnt.
    const namen = (job.steps as { name?: string }[]).map((s) => s.name ?? "");
    const warten = namen.findIndex((n) => /Verbreitung warten/i.test(n));
    const registry = namen.findIndex((n) => /MCP-Registry eintragen/i.test(n));
    expect(warten).toBeGreaterThanOrEqual(0);
    expect(registry).toBeGreaterThan(warten);
  });

  it("es gibt genau einen Weg, das npm-Paket zu veroeffentlichen", () => {
    // Zwei Workflows mit npm publish waeren ein Fallstrick: Trusted Publishing
    // bindet an genau einen Dateinamen, der andere Weg scheitert stumm.
    const mitPublish = dateien.filter((f) =>
      fs.readFileSync(path.join(verzeichnis, f), "utf-8").includes("npm publish")
    );
    expect(mitPublish).toEqual(["publish.yml"]);
  });
});
