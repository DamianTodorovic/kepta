import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

// Verzeichnisse wie Glama starten den Server ueber dieses Abbild und pruefen, ob
// er auf Introspektion antwortet. Beim ersten Versuch tat er das nicht: VOLUME
// legt /data als root an, der Prozess laeuft als node, und der Start endete mit
// "unable to open database file". Ohne Test faellt so etwas erst dort auf, wo
// man es am wenigsten braucht — im Pruefdurchlauf eines fremden Verzeichnisses.
const dockerfile = fs.readFileSync(path.join(process.cwd(), "Dockerfile"), "utf-8");

describe("Dockerfile", () => {
  it("gibt das Datenverzeichnis dem unprivilegierten Nutzer, bevor er uebernimmt", () => {
    const chown = dockerfile.indexOf("chown -R node:node /data");
    const user = dockerfile.indexOf("USER node");
    expect(chown).toBeGreaterThan(-1);
    expect(user).toBeGreaterThan(-1);
    expect(chown).toBeLessThan(user);
  });

  it("laeuft nicht als root", () => {
    expect(dockerfile).toMatch(/^USER node$/m);
  });

  it("legt die Datenbank an eine Stelle, die einen Neustart uebersteht", () => {
    expect(dockerfile).toMatch(/ENV KEPTA_DATA_DIR=\/data/);
    expect(dockerfile).toMatch(/VOLUME \["\/data"\]/);
  });

  it("baut aus dem Quelltext dieses Repos, nicht aus dem veroeffentlichten Paket", () => {
    // Sonst prueft das Verzeichnis eine andere Fassung als die, die hier liegt.
    expect(dockerfile).toContain("npm run build:npm");
    expect(dockerfile).not.toMatch(/npm i(nstall)? -g kepta-mcp/);
  });

  it("spricht stdio — der Einstiegspunkt ist der Server selbst", () => {
    expect(dockerfile).toMatch(/ENTRYPOINT \["kepta"\]/);
  });
});
