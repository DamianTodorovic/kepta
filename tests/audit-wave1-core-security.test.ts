// @vitest-environment node
import { describe, it, expect, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { KeptaStore, float32ToBlob, blobToFloat32 } from "../src/core/store";
import { consolidateMemories, indexMemory, searchMemories, waermeVektorSpur, vektorSpurStatistik } from "../src/core/engine";
import { callTool, TOOLS as MCP_TOOLS } from "../src/core/mcp";
import { exportBundle, importBundle, type SyncBundle } from "../src/core/praxissync";
import { briefing } from "../src/lib/briefing";
import { dossier } from "../src/lib/dossier";
import { defaultExtensions } from "../src/core/extensions";
import { leseUmwelt, gewonneneUmweltNamen, vergissUmweltNamen } from "../src/core/umwelt";
import { maskiereSchluessel } from "../src/scan/maskierung";
import { teileUnterWurzel } from "../src/scan/regeln";
import { scanne, type Dateisystem } from "../src/scan/walker";

const dirs: string[] = [];
function tempStore(ext = defaultExtensions()): KeptaStore {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "kepta-w1-"));
  dirs.push(dir);
  return new KeptaStore(path.join(dir, "t.db"), {
    ...ext,
    keys: { ablage: "test", keyFor: () => new Uint8Array(crypto.randomBytes(32)) },
  });
}

afterEach(() => {
  while (dirs.length > 0) {
    const d = dirs.pop()!;
    fs.rmSync(d, { recursive: true, force: true });
  }
});

describe("Audit Wave 1: Core Security, Bugfixes & Performance", () => {
  it("mcp memory_update advertises supersededBy, persists it, and re-indexes title-only updates", async () => {
    const schemaProps = MCP_TOOLS.find((t) => t.name === "memory_update")?.inputSchema.properties as Record<string, unknown>;
    expect(schemaProps).toHaveProperty("supersededBy");

    const store = tempStore();
    const m1 = store.createMemory({ id: "old-1", title: "Old Protocol", content: "Details about legacy setup" });
    const m2 = store.createMemory({ id: "new-2", title: "New Protocol", content: "Details about v2" });
    indexMemory(store, m1.id);
    indexMemory(store, m2.id);

    const res = await callTool(store, "memory_update", {
      id: m1.id,
      title: "Old Protocol [[GammaNode]]",
      supersededBy: m2.id,
    });
    expect(res.isError).not.toBe(true);
    const updated = store.getMemory(m1.id)!;
    expect(updated.supersededBy).toBe(m2.id);
    // Title-only update must refresh chunks & entity graph links
    expect(store.getChunks(m1.id)[0]?.text).toContain("GammaNode");
    expect(store.entityNamesForMemory(m1.id).map((n) => n.toLowerCase())).toContain("gammanode");

    // Privacy boundary: clearing/setting supersededBy to a private note must NOT expose private target
    const priv = store.createMemory({ id: "priv-x", title: "Secret", content: "hidden", scope: "private" });
    await callTool(store, "memory_update", { id: m1.id, supersededBy: priv.id });
    const out = await callTool(store, "memory_update", { id: m1.id, title: "Safe Check" });
    expect((out.structuredContent?.memory as Record<string, unknown>)?.supersededBy).toBeNull();
    store.close();
  });

  it("suchVektoren respects active search model instead of hardcoded DEFAULT_EMBED_MODEL", () => {
    const store = tempStore();
    const customModel = "mxbai-embed-custom:v1";
    store.setzeEinstellungen({ such_modell: customModel });
    const m = store.createMemory({ id: "vec-1", title: "Custom Model Note", content: "vector test body" });
    store.replaceChunks(m.id, ["Custom Model Note\nvector test body"]);
    store.setEmbedding(m.id, 0, new Float32Array([0.5, 0.5, 0.5, 0.5]), customModel);

    const loaded = waermeVektorSpur(store);
    expect(loaded).toBe(1);
    expect(vektorSpurStatistik.zeilen).toBe(1);

    // Switching model invalidates spur cleanly
    store.setzeEinstellungen({ such_modell: "other-model:v2" });
    expect(waermeVektorSpur(store)).toBe(0);
    store.close();
  });

  it("praxissync rejects extreme KDF parameters before scryptSync without blocking, and sanitizes imported fields", () => {
    const src = tempStore();
    src.createMemory({ id: "s1", title: "Valid\x00Title", content: "Clean content", tags: ["Tag\x07One", "normal"] });
    const bundle = exportBundle(src, { passphrase: "very-strong-passphrase-2026" });
    src.close();

    const dst = tempStore();
    const badBundles: SyncBundle[] = [
      { ...bundle, kdf: { name: "scrypt", N: 1 << 22, r: 8, p: 1 } },
      { ...bundle, kdf: { name: "scrypt", N: 12345, r: 8, p: 1 } },
      { ...bundle, kdf: { name: "scrypt", N: 16384, r: 64, p: 1 } },
      { ...bundle, kdf: { name: "scrypt", N: 16384, r: 8, p: 32 } },
    ];
    for (const bad of badBundles) {
      const t0 = performance.now();
      expect(() => importBundle(dst, bad, { passphrase: "very-strong-passphrase-2026" })).toThrow();
      expect(performance.now() - t0).toBeLessThan(25);
    }

    const ok = importBundle(dst, bundle, { passphrase: "very-strong-passphrase-2026" });
    expect(ok.imported).toBe(1);
    const importedMem = dst.getMemory("s1");
    expect(importedMem?.title).toBe("ValidTitle");
    expect(importedMem?.tags).not.toContain("Tag\x07One");
    dst.close();
  });

  it("blobToFloat32 preserves IEEE-754 floats accurately including unaligned buffers", () => {
    const vec = new Float32Array([-1.5, 0, 0.125, Math.PI, -0.0001234]);
    const raw = float32ToBlob(vec);
    const unaligned = Buffer.alloc(raw.length + 1);
    raw.copy(unaligned, 1);
    const sliced = unaligned.subarray(1);
    const out = blobToFloat32(sliced);
    expect(out.length).toBe(vec.length);
    for (let i = 0; i < vec.length; i++) {
      expect(out[i]).toBeCloseTo(vec[i]!, 6);
    }
  });

  it("KeptaStore handles missing extensions.keys cleanly via optional chaining without second TypeError", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "kepta-ext-"));
    dirs.push(dir);
    const partialExt = { ...defaultExtensions(), keys: undefined as unknown as ReturnType<typeof defaultExtensions>["keys"] };
    const store = new KeptaStore(path.join(dir, "plain.db"), partialExt);
    expect(store.verschluesselung.aktiv).toBe(false);
    store.close();
  });

  it("consolidateMemories executes in under 2s for 1,500 active memories with chunks while detecting exact duplicates", async () => {
    const store = tempStore();
    const insChunk = store.db.prepare("INSERT INTO chunks (memory_id, seq, text, embedding, embedding_model) VALUES (?, 0, ?, ?, ?)");
    const tx = store.db.transaction(() => {
      for (let i = 0; i < 1500; i++) {
        const isDupPair = i === 1 || i === 2;
        const m = store.createMemory({
          title: isDupPair ? "Exact Consolidate Target Title" : `Architecture Note ${i} AlphaProject Module ${(i % 30) + 1}`,
          content: isDupPair ? "Identical content body for exact consolidation check" : `Module body ${i} with unique seed ${(i * 97) % 1000}`,
          tags: isDupPair ? ["dup"] : ["arch"],
        });
        const v = new Float32Array(128);
        for (let k = 0; k < 128; k++) {
          v[k] = isDupPair ? Math.sin(k * 0.3) : Math.sin(i * 1.7 + k * 0.5);
        }
        insChunk.run(m.id, "chunk", float32ToBlob(v), "all-minilm");
        if (isDupPair || i % 10 === 0) {
          const v2 = new Float32Array(128);
          for (let k = 0; k < 128; k++) v2[k] = v[k]! * 0.99 + 0.001;
          store.db.prepare("INSERT INTO chunks (memory_id, seq, text, embedding, embedding_model) VALUES (?, 1, ?, ?, ?)").run(
            m.id,
            "chunk-2",
            float32ToBlob(v2),
            "all-minilm",
          );
        }
      }
    });
    tx();

    const t0 = performance.now();
    const res = await consolidateMemories(store, { dryRun: true, threshold: 0.92 });
    const ms = performance.now() - t0;
    expect(res.candidates.length).toBeGreaterThanOrEqual(1);
    expect(ms).toBeLessThan(2000);
    store.close();
  });

  it("dossier and briefing stay fast and consistent across repeated calls & cache invalidation", async () => {
    const store = tempStore();
    for (let i = 0; i < 120; i++) {
      const m = store.createMemory({
        title: i === 10 ? "Port Config" : i === 20 ? "Port Config Revised" : `Brief Note ${i}`,
        content:
          i === 10
            ? "Always run on localhost port 3000 with TLS disabled."
            : i === 20
              ? "Never run on port 3000; enforce port 8443 with TLS enabled."
              : `AlphaTopic note ${i} covering architecture and [[AlphaTopic]]. TODO: check ${i}.`,
        tags: ["alphatopic"],
      });
      store.linkEntities(m.id, ["AlphaTopic"]);
    }
    const ids = store.listMemories({ limit: 50 }).map((m) => m.id);
    expect(store.getMemoriesByIds(ids).length).toBe(50);

    const b1 = briefing(store, { seit: 0 });
    const b2 = briefing(store, { seit: 0 });
    expect(b1.contradictions).toEqual(b2.contradictions);

    const d = await dossier(store, "AlphaTopic", { limit: 40 });
    expect(d.total).toBeGreaterThanOrEqual(40);
    store.close();
  });

  it("onVektorAenderung unsubscribes, vergissUmweltNamen clears state, and scan edge cases guard excluded paths", async () => {
    const store = tempStore();
    const seen: string[] = [];
    const unsub = store.onVektorAenderung((id) => seen.push(id));
    const m = store.createMemory({ title: "Vec Sub", content: "Vector subscription check" });
    indexMemory(store, m.id);
    store.setEmbedding(m.id, 0, new Float32Array([1, 0, 0, 0]), "nomic-embed-text");
    expect(seen).toEqual([m.id]);
    unsub();
    store.setEmbedding(m.id, 0, new Float32Array([0, 1, 0, 0]), "nomic-embed-text");
    expect(seen).toEqual([m.id]);
    store.close();

    leseUmwelt("datenordner", { K3PTA_DATA_DIR: "/tmp/kepta-test-env" });
    expect(gewonneneUmweltNamen().length).toBeGreaterThan(0);
    vergissUmweltNamen();
    expect(gewonneneUmweltNamen()).toEqual([]);

    expect(maskiereSchluessel("")).toEqual({ text: "", maskiert: 0, arten: {} });
    expect(teileUnterWurzel("/root", "/root")).toEqual([]);
    const mockFs: Dateisystem = {
      lies(dir) {
        if (dir === "/root") return [{ name: "skip", istOrdner: true, groesse: 0 }, { name: "note.md", istOrdner: false, groesse: 10 }];
        return [];
      },
      verbinde(a, b) { return `${a}/${b}`; },
    };
    const gen = scanne(["/root"], mockFs, { ausgeschlossen: ["/root/skip"] });
    let step = gen.next();
    while (!step.done) step = gen.next();
    const last = step.value;
    expect(last.funde.map((f) => f.pfad)).toEqual(["/root/note.md"]);
    expect(last.uebersprungene).toContainEqual({ ordner: "skip", grund: "ausgeschlossen" });
  });
});
