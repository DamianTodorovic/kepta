// Zählt die Struktur eines Kunstbestands, bevor und nachdem man an ihm arbeitet.
//
//   npx tsx scripts/korpus-zaehler.mjs                 # Kern-Korpus (src/demo.ts)
//   npx tsx scripts/korpus-zaehler.mjs --korpus app    # Harbor Advisory aus der App
//   npx tsx scripts/korpus-zaehler.mjs --korpus pfad.json [--bis 400]
//
// Warum ein Zähler und kein Urteil: die Frage „klingt der Bestand nach Leben?"
// entscheidet niemand am Geschmack, sondern daran, was im Bild steht. Dieser
// Läufer meldet Zahl der Notizen, Typverteilung, Tag-Multiset, die Kanten nach
// Sorte und einen Struktur-Fingerabdruck. Der Fingerabdeck deckt NUR Typ, Tags
// und [[Link]]-Ziele ab — nicht die Wörter. Bleibt er gleich und bewegen sich
// die echten Kanten nicht, war die Umschreibung, was sie sein soll: dieselbe
// Struktur in anderen Worten.
//
// Die Kanten rechnet `baueNotizBild` — derselbe Vertrag, aus dem die Fläche und
// `GET /api/graph/bild` schöpfen. Kein Server, kein Store, keine echten Daten.
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { baueNotizBild } from "../src/ui/graph";
import { demoKorpus } from "../src/demo";

const argv = process.argv.slice(2);
const schalter = (name, fallback) => {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : fallback;
};

async function laden() {
  const k = schalter("--korpus", "kern");
  if (k === "kern") {
    return demoKorpus(1760000000000).map((e) => ({ art: e.type, titel: e.title, inhalt: e.content, tags: e.tags, monate: 0 }));
  }
  if (k === "app") {
    const pfad = path.resolve(import.meta.dirname, "../../kepta-app/scripts/demo-korpus.mjs");
    if (!fs.existsSync(pfad)) throw new Error(`App-Korpus nicht gefunden: ${pfad}`);
    const { DEMO } = await import(pathToFileURL(pfad).href);
    return DEMO.map((e) => ({ art: e.type, titel: e.title, inhalt: e.content, tags: e.tags, monate: e.monate }));
  }
  const texte = JSON.parse(fs.readFileSync(path.resolve(k), "utf8"));
  const liste = Array.isArray(texte) ? texte : texte.notizen ?? [];
  return liste.map((e) => ({ art: e.type ?? e.art, titel: e.title ?? e.titel, inhalt: e.content ?? e.inhalt, tags: e.tags ?? [], monate: e.monate ?? 0 }));
}

const korpus = await laden();
const begrenzt = Number(schalter("--bis", korpus.length));
const teile = korpus.slice(0, begrenzt);

// IDs aus dem Index, nicht aus der Uhr: zwei Läufe desselben Bestands müssen
// dieselbe Zahl ausspucken, sonst misst man die Zufallsbits der Notiz-ID.
const notizen = teile.map((e, i) => ({ id: `m-${String(i).padStart(4, "0")}`, titel: e.titel, inhalt: e.inhalt, tags: e.tags, art: e.art }));
const bild = baueNotizBild(notizen);

const typen = {};
for (const k of bild.knoten) typen[k.art] = (typen[k.art] ?? 0) + 1;
const tags = new Map();
for (const e of teile) for (const t of e.tags ?? []) tags.set(t, (tags.get(t) ?? 0) + 1);
const echt = bild.kanten.filter((k) => k.sorte === "echt").length;
const ahnlich = bild.kanten.filter((k) => k.sorte === "aehnlich").length;
const mitTitel = teile.filter((e) => (e.titel ?? "").trim().length > 0).length;
const zahlenImTitel = teile.filter((e) => /\b\d{3,}\b/.test(e.titel ?? "")).length;

// Struktur = Typ + Tags + Linkziele. Die Wörter fehlen absichtlich.
const struktur = teile.map((e, i) => {
  const ziele = [...String(e.inhalt ?? "").matchAll(/\[\[([^\]|]+)/g)].map((m) => m[1]).sort();
  return `${i}|${e.art}|${[...(e.tags ?? [])].sort().join(",")}|${ziele.join(">")}`;
});
const finger = createHash("sha256").update(struktur.join("\n")).digest("hex").slice(0, 16);

console.log(
  JSON.stringify(
    {
      korpus: schalter("--korpus", "kern"),
      notizen: teile.length,
      typen,
      tags: tags.size,
      knoten: bild.knoten.length,
      kanten: bild.kanten.length,
      echt,
      ahnlich,
      mitTitel,
      titelMitZahl: zahlenImTitel,
      bestand: bild.bestand,
      gekappt: { knoten: bild.kuerzung.uebrig.knoten, kanten: bild.kuerzung.uebrig.kanten },
      strukturFinger: finger,
    },
    null,
    1
  )
);
