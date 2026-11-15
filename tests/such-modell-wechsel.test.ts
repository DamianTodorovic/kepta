/* P184 (#44): der Such-Modell-Wechsel — die Maschine hinter dem Settings-Schalter.
   Die Search-Model-Zeile (P183) nannt die Wahrheit ohne Button; diese Datei baut
   die Tür dazu: Wechsel persistiert im Store (einstellungen.such_modell), die
   EmbeddingQueue wechselt mit, die Zählung nennt, was neu eingebettet werden
   muss, und ein Modell, das Ollama nicht kennt, wird ehrlich abgewiesen.
   Die Validation ist eine reine Funktion (Tags als Argument — kein Netz im Test);
   die Tür testet gegen einen lauschenden Server mit gestubbten Ollama-Tags. */
import { describe, it, expect, afterEach, vi } from "vitest";
import { tmpdir } from "node:os";
import path from "node:path";
import fs from "node:fs";
import { KeptaStore } from "../src/core/store";
import { EmbeddingQueue, aktivesSuchModell } from "../src/core/embeddings";
import { indexMemory } from "../src/core/engine";
import { suchModellWechseln } from "../server/helfer/such-modell";
import { createApp } from "../server/app";
import { hoerer } from "./helfer/hoerer";

const TAGS = ["nomic-embed-text:latest", "bge-m3:latest", "llama3.2:3b"];

function frischerStore(): KeptaStore {
  const dir = fs.mkdtempSync(path.join(tmpdir(), "kepta-modellwechsel-"));
  return new KeptaStore(path.join(dir, "test.db"));
}

afterEach(() => vi.unstubAllGlobals());

// Die testkapsel-Pflicht: wer den Server baut, beugt HOME und den Datenordner
// — sonst findet os.homedir() den Nutzer (Wand 3). Der Store selbst sitzt im
// tmpdir; createApp kriegt über die Umgebung denselben Kapsel-Ordner.
process.env.HOME = fs.mkdtempSync(path.join(tmpdir(), "kepta-horchen-h-"));
process.env.KEPTA_DATA_DIR = fs.mkdtempSync(path.join(tmpdir(), "kepta-horchen-d-"));

describe("P184: der Such-Modell-Wechsel (die Maschine hinter dem Schalter)", () => {
  it("persistiert die Wahl im Store und stellt die Queue um — die Zählung nennt den Rest", () => {
    const store = frischerStore();
    const queue = new EmbeddingQueue(store, { immediate: true });
    const vorab = store.chunksNeedingEmbedding(1000, "bge-m3").length;
    expect(vorab, "ohne Notizen nichts zu tun").toBe(0);

    const ziel = store.createMemory({ title: "Notiz", content: "Der Bestand, der neu eingebettet werden muss." });
    indexMemory(store, ziel.id);
    store.setEmbedding(ziel.id, 0, new Float32Array([0.1, 0.2]), "nomic-embed-text");
    // Chunks, die unter dem alten Modell stehen, sind der Re-Einbettungs-Rest.
    expect(store.chunksNeedingEmbedding(1000, "bge-m3").length).toBeGreaterThan(0);

    const ergebnis = suchModellWechseln(store, queue, "bge-m3", TAGS);
    expect(ergebnis.ok).toBe(true);
    if (!ergebnis.ok) throw new Error("unerreicht");
    expect(ergebnis.modell).toBe("bge-m3");
    expect(ergebnis.neuZuEinbetten).toBeGreaterThan(0);
    // Persistenz: die Wahl ueberlebt einen frischen Store-Blick.
    expect(aktivesSuchModell(store)).toBe("bge-m3");
    expect(store.einstellungen()["such_modell"]).toBe("bge-m3");
    // Der Rest wird aus den Jahren des aktiven Modells gezaehlt: nach dem
    // Wechsel sind es genau die Chunks, die noch nicht im neuen Modell liegen.
    expect(store.chunksNeedingEmbedding(1000, "bge-m3").length).toBe(ergebnis.neuZuEinbetten);
  });

  it("ein Modell, das Ollama nicht kennt, wird mit der Tag-Liste abgewiesen — nichts wird geschrieben", () => {
    const store = frischerStore();
    const queue = new EmbeddingQueue(store, { immediate: true });
    const ergebnis = suchModellWechseln(store, queue, "gpt-nicht-da", TAGS);
    expect(ergebnis.ok).toBe(false);
    if (ergebnis.ok) throw new Error("unerreicht");
    expect(ergebnis.fehler).toContain("bge-m3:latest");
    expect(store.einstellungen()["such_modell"]).toBeUndefined();
    expect(aktivesSuchModell(store)).toBe("nomic-embed-text");
  });

  it("ohne Wahl gilt das ausgelieferte Modell (Env-Fallback)", () => {
    const store = frischerStore();
    expect(aktivesSuchModell(store)).toBe("nomic-embed-text");
  });

  it("die Tuer am lauschenden Server: GET nennt das aktive Modell, POST wechselt", async () => {
    const echtFetch = globalThis.fetch.bind(globalThis);
    vi.stubGlobal(
      "fetch",
      vi.fn(async (eingabe: unknown, init?: unknown) => {
        const url = String(eingabe);
        if (url.includes("/api/tags")) {
          return { ok: true, json: async () => ({ models: TAGS.map((n) => ({ name: n })) }) };
        }
        // Alles andere (die eigene lauschende Tür) geht ans echte Netz.
        return echtFetch(eingabe as Parameters<typeof echtFetch>[0], init as Parameters<typeof echtFetch>[1]);
      }),
    );
    const store = frischerStore();
    const queue = new EmbeddingQueue(store, { immediate: true });
    const app = createApp(store, { embeddingQueue: queue });
    // Der gesegnete Hörer aus dem Vorrat (setup.horchen) — kein eigener listen.
    const server = hoerer(app);
    const basis = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
    try {
      const gelesen = await (await fetch(`${basis}/api/such-modell`)).json() as { modell?: string; modelle?: string[] };
      expect(gelesen.modell).toBe("nomic-embed-text");
      expect(Array.isArray(gelesen.modelle)).toBe(true);

      const post = await fetch(`${basis}/api/such-modell`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ modell: "bge-m3" }),
      });
      expect(post.status).toBe(200);
      const kopf = (await post.json()) as { modell: string; neuZuEinbetten: number };
      expect(kopf.modell).toBe("bge-m3");
      expect(store.einstellungen()["such_modell"]).toBe("bge-m3");

      const daneben = await fetch(`${basis}/api/such-modell`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ modell: "gibt-es-nicht" }),
      });
      expect(daneben.status).toBe(400);
    } finally {
      // Der Pool-Hörer wird von hoererSchliessen (afterAll) geschlossen — hier nichts eigenes schließen.
    }
  });
});
