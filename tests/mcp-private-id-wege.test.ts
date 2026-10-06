import { describe, it, expect, beforeEach } from "vitest";
import { tmpdir } from "node:os";
import path from "node:path";
import fs from "node:fs";
import { KeptaStore } from "../src/core/store";
import { handleRpc, type JsonRpcRequest } from "../src/core/mcp";
import { DEFAULT_EMBED_MODEL } from "../src/core/embeddings";

/**
 * Die id-Wege des Agentenkanals gegen private Notizen.
 *
 * Der Privatheits-Floor der App filtert `search` und `list` (`mcp.ts:358`,
 * `:467`) — das war gemessen richtig und ist hier nicht das Thema. Was er nicht
 * deckt, ist der Weg über eine bekannte id: `memory_update` gab Titel und
 * Inhalt einer privaten Notiz im Antwortkörper zurück, `memory_delete` trashed
 * und purgt sie, und `supersededBy` einer offenen Notiz nannte die id einer
 * privaten Nachfolgerin. Ein Agent an der stdio-Tür (Claude, Cursor) konnte
 * damit lesen und zerstören, was der Besitzer als privat markiert hat.
 *
 * Der Kern hält das seit 3.1.2 zu (`aussenVor`, `zeigerFürAgenten` in
 * `kepta-core/src/core/mcp.ts:365-388`). Diese Datei ist die Wache für die
 * App-Kopie — und der Wortlaut ist Teil des Vertrags: die Absage muss sich von
 * „nicht gefunden" nicht unterscheiden lassen, sonst ist die Antwort ein
 * Existenznachweis.
 */

interface ToolErgebnis {
  content: { type: string; text: string }[];
  structuredContent: Record<string, unknown>;
  isError?: boolean;
}

function alsErgebnis(res: Awaited<ReturnType<typeof handleRpc>>): ToolErgebnis {
  if (!res || !("result" in res)) throw new Error("Erwartete Ergebnis-Antwort, bekam: " + JSON.stringify(res));
  return res.result as unknown as ToolErgebnis;
}
/**
 * Eine Absage kommt als Werkzeugergebnis mit `isError` zurück, nicht als
 * JSON-RPC-Fehler — der Agent soll den Grund im Text sehen, die Tür aber nicht
 * verletzen. Der Wortlaut ist Teil des Vertrags, deshalb wird er verglichen.
 */
function alsAbsage(res: Awaited<ReturnType<typeof handleRpc>>): string {
  const r = alsErgebnis(res);
  if (!r.isError) throw new Error("Erwartete Absage, bekam Erfolg: " + JSON.stringify(r.structuredContent).slice(0, 200));
  return String(r.structuredContent.error ?? "");
}

/**
 * Fake-Embeddings für den Konsolidierungsfall: ohne Vektoren fände die
 * Duplettensuche nichts, und „kein Kandidat" wäre kein Beweis, sondern Pech.
 * Gleicher Text → gleicher Vektor, wie in tests/engine.test.ts.
 */
function gleicheVektoren(store: KeptaStore): void {
  for (const m of store.listMemories({ limit: 200 })) {
    for (const c of store.getChunks(m.id)) {
      const v = new Float32Array(16);
      for (const w of c.text.toLowerCase().split(/\W+/)) {
        if (!w) continue;
        v[w.length % 16] += 1;
        v[(w.charCodeAt(0) + w.charCodeAt(w.length - 1)) % 16] += 1;
      }
      store.setEmbedding(m.id, c.seq, v, DEFAULT_EMBED_MODEL);
    }
  }
}

function frischerStore(): KeptaStore {
  const ordner = fs.mkdtempSync(path.join(tmpdir(), "kepta-privat-"));
  return new KeptaStore(path.join(ordner, "test.db"));
}

async function werkzeug(store: KeptaStore, name: string, args: Record<string, unknown>) {
  const anfrage: JsonRpcRequest = { jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } };
  return handleRpc({ store, transport: "stdio" }, anfrage);
}

describe("Private Notizen auf den id-Wegen des Agentenkanals", () => {
  let store: KeptaStore;
  let privatId: string;
  let offenId: string;

  beforeEach(async () => {
    store = frischerStore();
    const privat = store.createMemory({
      title: "Zeugnisverweigerung — Mandantengeheimnis",
      content: "Der Inhalt dieser Notiz verlässt KEPTA nie.",
      scope: "private",
    });
    privatId = privat.id;
    const offen = store.createMemory({ title: "Fristkalender", content: "Fristen des Mandanten." });
    offenId = offen.id;
    // Der Pfad, über den eine offene Notiz den Verweis auf eine private bekommt.
    store.supersedeMemory(offenId, privatId);
  });

  it("memory_update gibt eine private Notiz nicht zurück und ändert sie nicht", async () => {
    const res = await werkzeug(store, "memory_update", { id: privatId, content: "überschrieben" });
    expect(alsAbsage(res).length).toBeGreaterThan(0);
    expect(store.getMemory(privatId)!.content).toBe("Der Inhalt dieser Notiz verlässt KEPTA nie.");
  });

  it("die Absage klingt wie bei einer unbekannten id — kein Existenznachweis", async () => {
    // Verglichen wird der Satzbau, nicht der String: die id steht in der
    // Meldung, und eine Meldung, die „privat" sagte, wäre ein Existenznachweis.
    const geruest = (meldung: string) => meldung.replace(/k-[0-9a-z-]+/g, "<id>");
    const privateAntwort = geruest(alsAbsage(await werkzeug(store, "memory_update", { id: privatId, content: "x" })));
    const unbekannteAntwort = geruest(alsAbsage(await werkzeug(store, "memory_update", { id: "k-gibt-es-nicht", content: "x" })));
    expect(privateAntwort).toBe(unbekannteAntwort);
    expect(privateAntwort.toLowerCase()).not.toContain("privat");
  });

  it("memory_update auf einer offenen Notiz funktioniert weiter (kein Übergriff)", async () => {
    const res = alsErgebnis(await werkzeug(store, "memory_update", { id: offenId, content: "neuer Text" }));
    expect(res.structuredContent.updated).toBe(true);
    expect(store.getMemory(offenId)!.content).toBe("neuer Text");
  });

  it("memory_delete wirft keine private Notiz in den Papierkorb", async () => {
    const res = await werkzeug(store, "memory_delete", { id: privatId });
    expect(alsAbsage(res).length).toBeGreaterThan(0);
    expect(store.getMemory(privatId)!.deletedAt ?? null).toBeNull();
  });

  it("memory_delete mit permanent löscht keine private Notiz — und klingt gleich", async () => {
    const geruest = (meldung: string) => meldung.replace(/k-[0-9a-z-]+/g, "<id>");
    const privat = geruest(alsAbsage(await werkzeug(store, "memory_delete", { id: privatId, permanent: true })));
    const unbekannt = geruest(alsAbsage(await werkzeug(store, "memory_delete", { id: "k-gibt-es-nicht", permanent: true })));
    expect(privat).toBe(unbekannt);
    expect(store.getMemory(privatId)).not.toBeNull();
  });

  it("memory_forget kommt an eine private Notiz nicht heran", async () => {
    const res = await werkzeug(store, "memory_forget", { id: privatId, mode: "delete" });
    expect(alsAbsage(res).length).toBeGreaterThan(0);
    expect(store.getMemory(privatId)).not.toBeNull();
  });

  it("supersededBy auf eine private Nachfolgerin wird für Agenten zu null", async () => {
    const treffer = alsErgebnis(await werkzeug(store, "memory_search", { query: "Fristkalender" }));
    // Die Treffer sind flach: memoryToOut-Felder plus score/expired/superseded.
    const hits = treffer.structuredContent.hits as Record<string, unknown>[];
    const eigener = hits.find((h) => h.id === offenId);
    expect(eigener).toBeTruthy();
    expect(eigener!.supersededBy).toBeNull();
    // Der Status selbst bleibt sichtbar — „ersetzt" ist eine Tatsache, die
    // Nachfolgerin nicht.
    expect(eigener!.superseded).toBe(true);
  });

  it("memory_list und memory_search nennen die private id nicht", async () => {
    const liste = alsErgebnis(await werkzeug(store, "memory_list", { limit: 50 }));
    expect(JSON.stringify(liste.structuredContent)).not.toContain(privatId);
    const such = alsErgebnis(await werkzeug(store, "memory_search", { query: "Mandantengeheimnis" }));
    expect(JSON.stringify(such.structuredContent)).not.toContain(privatId);
  });

  it("memory_graph nennt eine Entität nicht, die nur in privaten Notizen steht", async () => {
    await werkzeug(store, "memory_save", { title: "Geheime Absprache", content: "Trifft [[Stille Vereinbarung]].", scope: "private" });
    await werkzeug(store, "memory_save", { title: "Sichtbare Notiz", content: "Trifft [[Laute Sache]]." });
    const g = alsErgebnis(await werkzeug(store, "memory_graph", { depth: 2 }));
    const namen = (g.structuredContent.entities as { name: string }[]).map((e) => String(e.name).toLowerCase());
    expect(namen.some((n) => n.includes("stille"))).toBe(false);
    // Positive Kontrolle: die offene Entität bleibt — sonst ist der Riegel eine
    // Leere, die zufällig durchgeht.
    expect(namen.some((n) => n.includes("laute"))).toBe(true);
  });

  it("memory_consolidate meldet eine private Duplette nicht als Kandidat", async () => {
    const text = "Erhöhung der Löhne für das Buchhaltungsteam ab Oktober, die Zahlen liegen im HR-Ordner.";
    const privat = alsErgebnis(await werkzeug(store, "memory_save", { title: "Salär Team intern", content: text, scope: "private" }));
    const privatenId = String((privat.structuredContent.memory as { id: string }).id);
    await werkzeug(store, "memory_save", { title: "Salär Team", content: text });
    gleicheVektoren(store);
    const c = alsErgebnis(await werkzeug(store, "memory_consolidate", { dryRun: true, threshold: 0.01 }));
    expect(JSON.stringify(c.structuredContent)).not.toContain(privatenId);
    expect(JSON.stringify(c.structuredContent)).not.toContain(privatId);

    // Gegenprobe: zwei offene Dupletten müssen weiterhin gemeldet werden, sonst
    // hätte ich die Konsolidierung nur abgeschaltet.
    await werkzeug(store, "memory_save", { title: "Portal Start", content: "Das Kundenportal ging für alle Kunden live." });
    await werkzeug(store, "memory_save", { title: "Portal Launch", content: "Das Kundenportal ging für alle Kunden live." });
    gleicheVektoren(store);
    const gegen = alsErgebnis(await werkzeug(store, "memory_consolidate", { dryRun: true, threshold: 0.01 }));
    expect((gegen.structuredContent.candidates as unknown[]).length).toBeGreaterThan(0);
  });
});
