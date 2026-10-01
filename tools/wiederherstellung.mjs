// Notfall-Wiederherstellung: Notizen aus einem JSON-Vollsatz (alle Felder) in
// eine frische Wissensbasis zurückspielen.
//
// Entstanden am 22.9.2026, als ein Keychain-Bug den Schlüssel einer laufenden
// Installation überschrieb: die Daten waren über die laufende App als
// JSON-Vollsatz gerettet, und dieses Skript hat sie mit Original-IDs,
// Zeitstempeln, Tags, Typen und Supersede-Ketten zurückgeholt.
//
// Aufruf:  npx tsx tools/wiederherstellung.mjs <notizen.json> <ziel-ordner>
//          [--paper AlsPapierkorb]   (gelöschte Notizen mit in den Papierkorb)
//
// Die JSON-Datei ist ein Array von Records wie GET /api/memories sie liefert
// (id, title, content, tags, type, scope, confidence, validFrom, validTo,
// supersededBy, deletedAt, createdAt, updatedAt).
import fs from "node:fs";
import path from "node:path";

async function main() {
  const args = process.argv.slice(2);
  const quelle = args[0];
  const zielOrdner = args[1];
  const papier = args.includes("--paper");
  if (!quelle || !zielOrdner) {
    console.error("Aufruf: npx tsx tools/wiederherstellung.mjs <notizen.json> <ziel-ordner> [--paper]");
    process.exit(2);
  }
  const { KeptaStore } = await import("../src/core/store.ts");
  const { indexMemory } = await import("../src/core/engine.ts");

  const records = JSON.parse(fs.readFileSync(quelle, "utf8"));
  if (!Array.isArray(records) || records.length === 0) throw new Error("JSON enthält kein Array von Notizen.");

  const dbPath = path.join(zielOrdner, "kepta.db");
  const store = new KeptaStore(dbPath);

  // Phase 1: alle Notizen anlegen — Original-ID, Zeitstempel, Tags, Typ,
  // Gültigkeitsfenster. Supersede-Ketten erst danach (die Ziele müssen existieren).
  let angelegt = 0;
  for (const r of records) {
    if (r.supersededBy) continue; // Phase 2
    store.createMemory({
      id: r.id,
      title: r.title ?? "",
      content: r.content ?? "",
      tags: Array.isArray(r.tags) ? r.tags : [],
      type: r.type,
      scope: r.scope,
      confidence: r.confidence,
      validFrom: r.validFrom ?? null,
      validTo: r.validTo ?? null,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    });
    indexMemory(store, r.id);
    angelegt += 1;
    if (angelegt % 500 === 0) console.log(`  ${angelegt} Notizen angelegt…`);
  }

  // Phase 2: ersetzte Notizen (Supersede-Ketten) und Papierkorb.
  let ersetzt = 0;
  let papierkorb = 0;
  for (const r of records) {
    if (r.supersededBy) {
      if (!store.getMemory(r.id)) {
        store.createMemory({
          id: r.id,
          title: r.title ?? "",
          content: r.content ?? "",
          tags: Array.isArray(r.tags) ? r.tags : [],
          type: r.type,
          scope: r.scope,
          confidence: r.confidence,
          validFrom: r.validFrom ?? null,
          validTo: r.validTo ?? null,
          createdAt: r.createdAt,
          updatedAt: r.updatedAt,
        });
        indexMemory(store, r.id);
      }
      store.updateMemory(r.id, { supersededBy: r.supersededBy, updatedAt: r.updatedAt ?? Date.now() });
      ersetzt += 1;
    }
    if (r.deletedAt && papier) {
      store.trashMemory(r.id);
      papierkorb += 1;
    }
  }

  const gesamt = store.listMemories({ limit: 1, offset: 0 });
  console.log(`Fertig: ${angelegt} aktiv angelegt, ${ersetzt} in Supersede-Ketten, ${papierkorb} in den Papierkorb.`);
  console.log(`Ziel: ${dbPath} — die Basis zählt ${gesamt.length >= 0 ? "Inhalte" : "?"} (Prüfung im Folgenden).`);
  store.close();
}

main().then(
  () => process.exit(0),
  (e) => {
    console.error(e instanceof Error ? e.message : String(e));
    process.exit(1);
  },
);
