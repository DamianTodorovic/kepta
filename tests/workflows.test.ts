import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { spawnSync } from "node:child_process";
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

describe("Registry-Eintrag im Veroeffentlichungs-Workflow: 400 ist kein Erfolg", () => {
  const d = YAML.parse(fs.readFileSync(path.join(verzeichnis, "publish.yml"), "utf-8")) as Record<string, never>;
  const job = (d.jobs as Record<string, never>).publish as Record<string, never>;
  const schritt = (job.steps as { name?: string; run?: string }[]).find((s) => /MCP-Registry eintragen/.test(s.name ?? ""));
  const version = (JSON.parse(fs.readFileSync(path.join(process.cwd(), "npm", "package.json"), "utf-8")) as { version: string }).version;

  /**
   * Fuehrt den echten Schritttext in einer Sandbox aus — GitHub-Default-Schale
   * inklusive (-e). curl, sleep und ./mcp-publisher sind Stubs; alles andere
   * (node, grep, die Logik) ist der Satz, der spaeter in CI laeuft.
   */
  function ausfuehren(opts: { listetAb?: number; publisherExit?: number; publisherLog?: string } = {}) {
    expect(schritt?.run, "Schritt 'In die MCP-Registry eintragen' existiert").toBeTruthy();
    const wurzel = fs.mkdtempSync(path.join(os.tmpdir(), "kepta-publish-"));
    const bin = path.join(wurzel, "bin");
    fs.mkdirSync(bin, { recursive: true });
    fs.mkdirSync(path.join(wurzel, "npm"));
    fs.writeFileSync(path.join(wurzel, "npm", "package.json"), JSON.stringify({ version }));
    fs.writeFileSync(
      path.join(bin, "curl"),
      `#!/bin/sh\n` +
        `n=0; [ -f "$KEPTA_STUB_ZAEHLER" ] && n=$(cat "$KEPTA_STUB_ZAEHLER")\n` +
        `n=$((n+1)); printf %s "$n" > "$KEPTA_STUB_ZAEHLER"\n` +
        `if [ "$n" -ge "$KEPTA_LISTET_AB" ]; then printf %s "$KEPTA_REGISTRY_JSON"; else printf %s '{"servers":[]}'; fi\n`,
      { mode: 0o755 }
    );
    fs.writeFileSync(path.join(bin, "sleep"), "#!/bin/sh\nexit 0\n", { mode: 0o755 });
    fs.writeFileSync(
      path.join(wurzel, "mcp-publisher"),
      `#!/bin/sh\nprintf %s "$KEPTA_PUBLISHER_LOG"\nexit "$KEPTA_PUBLISHER_EXIT"\n`,
      { mode: 0o755 }
    );
    const schrittPfad = path.join(wurzel, "schritt.sh");
    fs.writeFileSync(schrittPfad, schritt!.run!);
    const res = spawnSync("/bin/bash", ["-e", schrittPfad], {
      cwd: wurzel,
      encoding: "utf-8",
      timeout: 30_000,
      env: {
        ...process.env,
        PATH: `${bin}:${process.env.PATH ?? ""}`,
        KEPTA_STUB_ZAEHLER: path.join(wurzel, "aufrufe"),
        KEPTA_LISTET_AB: String(opts.listetAb ?? 99),
        KEPTA_REGISTRY_JSON: `{"servers":[{"version":"${version}"}]}`,
        KEPTA_PUBLISHER_LOG: opts.publisherLog ?? "",
        KEPTA_PUBLISHER_EXIT: String(opts.publisherExit ?? 0),
      },
    });
    fs.rmSync(wurzel, { recursive: true, force: true });
    return { code: res.status ?? -1, out: `${res.stdout ?? ""}${res.stderr ?? ""}` };
  }

  it("bereits gelistete Version wird uebersprungen, der Publisher bleibt zu", () => {
    const lauf = ausfuehren({ listetAb: 1 });
    expect(lauf.code, lauf.out).toBe(0);
    expect(lauf.out).toContain("bereits in der MCP-Registry");
  });

  it("genuiner Duplikats-Konflikt bleibt ein Skip", () => {
    for (const meldung of ["409 Conflict", "server already exists", "already registered"]) {
      const lauf = ausfuehren({ listetAb: 99, publisherExit: 1, publisherLog: meldung });
      expect(lauf.code, `${meldung}: ${lauf.out}`).toBe(0);
    }
  });

  it("HTTP 400 ist eine Ablehnung, kein Erfolg", () => {
    // Der Fehler, den der Schritt bis 3.1.2 beging: 400 / bad request lief ueber
    // das selbe "already"-Muster — ein ungueltiges server.json oder ein
    // unbekannter mcpName machte den Release-Lauf gruen, ohne Eintrag.
    for (const meldung of ["400 Bad Request", "bad request: invalid mcpName"]) {
      const lauf = ausfuehren({ listetAb: 99, publisherExit: 1, publisherLog: meldung });
      expect(lauf.code, `${meldung}: ${lauf.out}`).toBe(1);
      expect(lauf.out).toContain("wurde nicht eingetragen");
    }
  });

  it("nach einem Abweis entscheidet die Registry, nicht der Publisher", () => {
    // Der Publisher kann mit Fehler enden, waehrend der Eintrag laengst steht
    // (Timeout nach dem Schreiben). Zweiter Blick in die Registry == Skip.
    const lauf = ausfuehren({ listetAb: 2, publisherExit: 1, publisherLog: "connection reset" });
    expect(lauf.code, lauf.out).toBe(0);
    expect(lauf.out).toContain("steht nach dem Publish in der MCP-Registry");
  });

  it("erfolgreicher Publish ohne Registry-Treffer bleibt Erfolg", () => {
    // Der Publisher sagt 0 — dem wird vertraut, die Registry muss die neue
    // Version nicht schon in demselben Lauf zurueckliefern.
    const lauf = ausfuehren({ listetAb: 99, publisherExit: 0 });
    expect(lauf.code, lauf.out).toBe(0);
  });
});
