// #83 (4) im Kern — ein Kanten-Typ-Produzent, damit die Agenten-Tür mehr weiss als
// „alles heisst mentions".
//
// Vorher gemessen an Damians laufender App (lesend durch ihre Tür, 14./15.10.): 1.666
// Kanten im Bestand, **979 von 979 im Fenster tragen das eine Wort `mentions`**. Die App
// setzt seit #83 zwei Naturen auseinander: ein Titel, der einen Begriff nennt, ist
// `mentions`; zwei Begriffe, die in derselben Aussage stehen, sind `co-mentions`.
//
// Der Kern hatte beides nicht: `src/core/mcp.ts` hand-setzte pro gespeicherter Notiz
// einen `mentions`-Stich pro Wiki-Link (Zeile ~491), und **jedes Wieder-Speichern legte
// denselben Stich noch einmal** — `addRelation` ist eine nackte INSERT-Zeile
// (`src/core/store.ts:936`), ein Loeschen kennt der Pfad nicht. Dieselbe Aussage,
// zweimal gemalt, zaehlt als zwei Belege.
//
// gebaut: `store.verknuepfeNotiz(memoryId, titel, namen)` — derselbe Name wie in der App,
// damit die Parität grepbar bleibt. Der Kern liest dabei **keinen Text** (kein
// `begiffe.ts`): Begriffe kommen hier von dem, der schreibt. Und das Pairing ist auf die
// ersten acht Begriffe gekappt: aus 14 Namen wuerden 91 Paare, und eine Notiz waere ein
// Knotenwerk statt einer Aussage.
//
// Hausvertrag: kein request(app), hier gar kein Hoerer — der Produzent sitzt im Speicher.
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { tmpdir } from "node:os";
import path from "node:path";
import fs from "node:fs";
import { KeptaStore } from "../src/core/store";
import { handleRpc } from "../src/core/mcp";

function freshStore(): KeptaStore {
  const dir = fs.mkdtempSync(path.join(tmpdir(), "kepta-kantentyp-"));
  return new KeptaStore(path.join(dir, "test.db"));
}

const worte = (g: { relations: { relation: string }[] }) => [...new Set(g.relations.map((r) => r.relation))].sort();
const paare = (g: { relations: { sourceId: number; targetId: number; relation: string }[] }) => {
  const map = new Map<string, string[]>();
  for (const r of g.relations) {
    const k = [r.sourceId, r.targetId].sort((a, b) => a - b).join("|");
    map.set(k, [...(map.get(k) ?? []), r.relation]);
  }
  return map;
};

describe("verknuepfeNotiz im Kern: zwei Naturen, nicht eine", () => {
  let store: KeptaStore;
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 503, json: async () => ({}) })));
    store = freshStore();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    store.close();
  });

  it("der Titel nennt einen Begriff, und zwei Begriffe nennen sich gegenseitig — zwei Worte", () => {
    const m = store.createMemory({ title: "Docker Setup", content: "Nutzt Docker und Traefik" });
    store.verknuepfeNotiz(m.id, "Docker Setup", ["docker", "traefik"]);
    const g = store.getGraph();
    const namen = new Map(g.entities.map((e) => [e.id, e.name]));

    expect(worte(g), `der Kern kennt nur: ${worte(g).join(", ")}`).toEqual(["co-mentions", "mentions"]);

    const titelStich = g.relations.find((r) => namen.get(r.sourceId) === "docker setup" || namen.get(r.targetId) === "docker setup");
    expect(titelStich, "kein Stich vom Titel auf einen Begriff").toBeDefined();
    expect(titelStich!.relation, "der Titel-Stich heisst nicht mentions").toBe("mentions");

    const gegeneinander = g.relations.find(
      (r) =>
        (namen.get(r.sourceId) === "docker" && namen.get(r.targetId) === "traefik") ||
        (namen.get(r.sourceId) === "traefik" && namen.get(r.targetId) === "docker"),
    );
    expect(gegeneinander, "zwei Begriffe derselben Aussage haengen nicht aneinander").toBeDefined();
    expect(gegeneinander!.relation, "das Mittraeger-Paar heisst nicht co-mentions").toBe("co-mentions");
  });

  it("zweimal setzen derselben Notiz schreibt keine Zeile doppelt und kein Paar auf zwei Worte", () => {
    const m = store.createMemory({ title: "Deploy Setup", content: "Docker, PM2" });
    store.verknuepfeNotiz(m.id, "Deploy Setup", ["docker", "pm2"]);
    const vorher = store.getGraph().relations.length;
    expect(vorher, "die erste Setzung legt keine Kante").toBeGreaterThan(0);

    store.verknuepfeNotiz(m.id, "Deploy Setup", ["docker", "pm2"]);
    store.verknuepfeNotiz(m.id, "Deploy Setup", ["docker", "pm2"]);
    const danach = store.getGraph();
    expect(danach.relations.length, `${vorher} Kanten vor dem Wiederholen, ${danach.relations.length} danach`).toBe(vorher);

    const gemischt = [...paare(danach)].filter(([, w]) => new Set(w).size > 1);
    expect(gemischt.map(([k]) => k), `Paar(e) mit zwei Worten fuer dieselbe Aussage: ${gemischt.map(([k, w]) => k + ":" + w.join("/")).join(", ") || "keine"}`).toHaveLength(0);
  });

  it("ein Begriff allein ohne zweiten Namen hinterlaesst einen Titel-Stich, kein Paar", () => {
    const m = store.createMemory({ title: "Nur eins", content: "ein Begriff" });
    store.verknuepfeNotiz(m.id, "Nur eins", ["eins zwei drei"]);
    const g = store.getGraph();
    expect(worte(g), `die Kontrollgruppe malt: ${worte(g).join(", ")}`).toEqual(["mentions"]);
    expect(g.relations).toHaveLength(1);
  });

  it("ein Begriff, der aus der Aussage faellt, nimmt seine Kante mit", () => {
    const m = store.createMemory({ title: "Plan", content: "Docker, Traefik, PM2" });
    store.verknuepfeNotiz(m.id, "Plan", ["docker", "traefik", "pm2"]);
    const voll = store.getGraph().relations.length;
    expect(voll, "die Dreier-Setzung legt keine Kanten").toBeGreaterThan(0);
    store.verknuepfeNotiz(m.id, "Plan", ["docker"]);
    const nach = store.getGraph();
    expect(nach.relations.length, `${voll} Kanten vorher, ${nach.relations.length} nach dem Wegfall zweier Begriffe — die alten bleiben stehen`).toBe(1);
    expect(worte(nach)).toEqual(["mentions"]);
  });

  it("die Paarbildung ist gekappt: 14 Namen legen 28 Paare an, nicht 91", () => {
    const m = store.createMemory({ title: "Werkstatt", content: "vierzehn Begriffe" });
    const namen = Array.from({ length: 14 }, (_, i) => `sachverhalt ${i + 1}`);
    store.verknuepfeNotiz(m.id, "Werkstatt", namen);
    const g = store.getGraph();
    const paarKanten = g.relations.filter((r) => r.relation === "co-mentions").length;
    const titelKanten = g.relations.filter((r) => r.relation === "mentions").length;
    // 14 Begriffe: jeder haengt am Titel (14 Stiche), aber nur die ersten acht sind
    // untereinander gesetzt — 8 Choose 2 = 28 Paare.
    expect(titelKanten, `Titel-Stiche gemalt: ${titelKanten}`).toBe(14);
    expect(paarKanten, `Paare ohne Kappe gemalt: ${paarKanten}`).toBe(28);
  });
});

// ---------- derselbe Beweis durch die Tuer ----------
// Der Speicher-Produzent ist nur die halbe Auskunft. Was ein Mensch oder ein Agent
// sieht, entscheidet die Antwort des Werkzeugs `memory_graph`.
interface ToolResult {
  content: { type: string; text: string }[];
  structuredContent: Record<string, unknown>;
  isError?: boolean;
}

describe("memory_save und memory_graph im Kern: zwei Worte durch die Tuer", () => {
  let store: KeptaStore;
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 503, json: async () => ({}) })));
    store = freshStore();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    store.close();
  });

  async function werkzeug(name: string, args: Record<string, unknown>): Promise<Record<string, unknown>> {
    const res = await handleRpc({ store, transport: "stdio" }, {
      jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args },
    });
    if (!res || !("result" in res)) throw new Error("keine Ergebnis-Antwort vom Werkzeug " + name);
    return (res.result as unknown as ToolResult).structuredContent;
  }

  it("zwei Wiki-Links in einer Aussage ergeben an der Tuer zwei Kantentypen", async () => {
    await werkzeug("memory_save", { title: "Edge-Stack", content: "Laeuft ueber [[Docker]] und [[Traefik]]" });
    const g = await werkzeug("memory_graph", { entity: "docker", depth: 2 }) as {
      entities: { name: string }[];
      relations: { source: string; target: string; relation: string }[];
    };
    expect(g.relations.length, "die Tuer nennt keine Kante").toBeGreaterThan(0);
    const typen = [...new Set(g.relations.map((r) => r.relation))].sort();
    expect(typen, `die Agenten-Tuer kennt nur: ${typen.join(", ")}`).toEqual(["co-mentions", "mentions"]);
  });

  it("dieselbe Notiz, ueber ihre id neu gesetzt, legt keine Kante nach", async () => {
    // Selbst berichtigt: zuerst stand hier ein Speichern **ohne** id. Das macht eine
    // ZWEITE Notiz, und vier Kanten fuer zwei Notizen sind richtig — der Fall mass die
    // Zahl der Notizen, nicht die Idempotenz. Also wird jetzt dieselbe id gesetzt.
    const zuerst = (await werkzeug("memory_save", { title: "Deploy", content: "Nutzt [[Docker]] und [[PM2]]" })) as unknown as {
      memory?: { id?: string };
    };
    const id = String(zuerst.memory?.id ?? "");
    expect(id, "memory_save nennt keine id in `memory` — der Fall kann das Wiedersetzen nicht pruefen").toBeTruthy();
    const vorher = ((await werkzeug("memory_graph", { entity: "docker", depth: 1 })) as { relations: unknown[] }).relations.length;
    expect(vorher, "die erste Setzung zeigt keine Kante — Fall greift nicht").toBeGreaterThan(0);
    await werkzeug("memory_save", { id, title: "Deploy", content: "Nutzt [[Docker]] und [[PM2]]" });
    const danach = ((await werkzeug("memory_graph", { entity: "docker", depth: 1 })) as { relations: unknown[] }).relations.length;
    expect(danach, `${vorher} Kanten vor dem zweiten Setzen derselben id, ${danach} danach`).toBe(vorher);
  });
});
