// Malt einen echten Graphen aus der echten Engine — als PNG für LinkedIn, ohne
// die Oberfläche zu brauchen.
//
//   npx tsx scripts/graf-bild.mjs [--groesse 1200x627] [--out pfad.png] [--quadratisch]
//
// Warum im Kern und nicht in der App: `KeptaStore`, `baueNotizBild`,
// `berechneWelt` und der erfundene Korpus wohnen alle hier. In der App wäre ein
// Import über eine Repo-Grenze nötig — und ein Bild, das aus einer *anderen*
// Rechnung kommt als die Fläche, ist genau die Lüge, die dieses Skript verbietet.
// Die Lage kommt aus `src/core/graf-kraft.ts`, also aus derselben Physik, die
// auch `GET /api/graph/bild` und damit die Fläche zeichnet.
//
// Daten: der fiktive Kanzlei-Korpus aus `src/demo.ts` (`demoKorpus`) — derselbe,
// den `npx kepta-mcp demo` fährt. Niemals ein echter Bestand: eigener
// Tempat-Ordner, eigenes HOME, eigener Schlüssel aus der Umgebung, damit kein
// Blick in den Schlüsselbund des Rechners fällt und `~/.kepta` unberührt bleibt.
//
// Die ehrliche Zeile unten im Bild ist kein Schmuck: sie nennt Bestand, gezeigte
// Knoten und Kanten, was gekappt wurde und wie viele Knoten einen Titel haben —
// dieselben Größen, die `kuerzung` und `bestand` im Vertrag tragen.
import { execFileSync, spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { KeptaStore } from "../src/core/store";
import { indexMemory } from "../src/core/engine";
import { demoKorpus } from "../src/demo";
import { baueNotizBild } from "../src/ui/graph";
import { berechneWelt } from "../src/core/graf-kraft";

const argv = process.argv.slice(2);
const schalter = (name, fallback) => {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : fallback;
};
const BREITE = Number(schalter("--breite", 1200));
const HOEHE = Number(schalter("--hoehe", 627));
const ZIEL = path.resolve(schalter("--out", path.join(os.tmpdir(), `kepta-graf-${BREITE}x${HOEHE}.png`)));

// Ein Schlüssel aus der Umgebung, nie aus dem Schlüsselbund: der Rechner des
// Nutzers bleibt unberührt, die Datei ist verschlüsselt wie im Feld.
const schluessel = crypto.randomBytes(32).toString("hex");
process.env.KEPTA_DB_KEY = schluessel;
const heim = fs.mkdtempSync(path.join(os.tmpdir(), "kepta-grafbild-"));
process.env.HOME = heim;
const dbPfad = path.join(heim, "kepta.db");

const store = new KeptaStore(dbPfad);
let knoten, kanten, kuerzung, bestand, welt;

/**
 * Zwei Bestände, ein Bildweg. `kern` ist die Kanzlei aus `src/demo.ts`, `app`
 * ist „Harbor Advisory" aus dem App-Korpus — beide erfunden, beide mit Namen,
 * Beträgen und Fristen. Für ein Diagnose-Bild (dicht, voll, unleserlich) wird
 * ein Mess-Füller gebraucht; der liegt außerhalb dieses Skripts, weil ein
 * Werbe-Bild nie aus ihm gebaut werden darf.
 */
async function korpus(jetzt) {
  const MONAT = 30 * 24 * 60 * 60 * 1000;
  const k = schalter("--korpus", "kern");
  if (k === "kern") return demoKorpus(jetzt);
  if (k === "app") {
    const pfad = path.resolve(import.meta.dirname, "../../kepta-app/scripts/demo-korpus.mjs");
    if (!fs.existsSync(pfad)) throw new Error(`App-Korpus nicht gefunden: ${pfad}`);
    const { DEMO } = await import(pathToFileURL(pfad).href);
    return DEMO.map((e) => ({ type: e.type, title: e.title, content: e.content, tags: e.tags, validFrom: jetzt - e.monate * MONAT }));
  }
  const liste = JSON.parse(fs.readFileSync(path.resolve(k), "utf8"));
  return (Array.isArray(liste) ? liste : liste.notizen ?? []).map((e) => ({
    type: e.type ?? e.art,
    title: e.title ?? e.titel,
    content: e.content ?? e.inhalt,
    tags: e.tags ?? [],
    validFrom: jetzt - (e.monate ?? 0) * MONAT,
  }));
}

try {
  // Die IDs tragen die Zeit, und `keim(id)` macht aus der ID die Startposition —
  // ohne festen Anker malt jeder Lauf ein etwas anderes Bild. `--jetzt` pinnt es.
  const jetzt = Number(schalter("--jetzt", Date.now()));
  for (const e of await korpus(jetzt)) {
    const r = store.createMemory({
      type: e.type,
      title: e.title,
      content: e.content,
      tags: e.tags,
      confidence: 1,
      validFrom: e.validFrom,
      validTo: e.validTo,
      createdAt: e.validFrom,
      updatedAt: e.validFrom,
    });
    indexMemory(store, r.id);
  }
  const notizen = store
    .listMemories({ limit: 400 })
    .map((n) => ({ id: n.id, titel: n.title, inhalt: n.content, tags: n.tags, art: n.type, privat: n.scope === "private" }));
  const bild = baueNotizBild(notizen);
  knoten = bild.knoten;
  kanten = bild.kanten;
  kuerzung = bild.kuerzung;
  bestand = bild.bestand;
  welt = berechneWelt({
    knoten: knoten.map((k) => ({ id: k.id })),
    kanten: kanten.map((k) => ({ quelle: k.quelle, ziel: k.ziel, sorte: k.sorte, feder: k.feder })),
  });
} finally {
  store.close();
}

const platziert = knoten.map((k) => {
  const p = welt.get(k.id);
  return { ...k, x: p?.x ?? 500, y: p?.y ?? 500, verankert: p?.verankert ?? false };
});
const nachId = new Map(platziert.map((k) => [k.id, k]));

// Etiketten-Budget: der Grad entscheidet, nicht die Reihenfolge — und was keinen
// Platz mehr findet, bleibt unbenannt. Die Fläche macht dasselbe (MAX_LABELS und
// ihre drei Dichtestufen); ein Bild mit mehr Beschriftung wäre schöner als die
// Wirklichkeit.
const budget = Number(schalter("--etiketten", Math.max(8, Math.round(platziert.length / 3))));
const gereiht = [...platziert].sort((a, b) => b.gradEcht + b.gradVermutet - (a.gradEcht + a.gradVermutet));
const betitelt = new Set(gereiht.slice(0, budget).map((k) => k.id));

const plan = {
  breite: BREITE,
  hoehe: HOEHE,
  hintergrund: "#060607",
  // Die vier Typ-Farben sind die der Fläche (KnowledgeGraph.tsx,
  // DEFAULT_TYPE_COLORS) — nicht fünf neue.
  farben: { semantic: "#56749a", episodic: "#916b85", procedural: "#62866b", reference: "#97785b", begriff: "#6b7280" },
  knoten: platziert.map((k) => ({
    x: k.x,
    y: k.y,
    r: 6 + 2.4 * Math.sqrt(k.gradEcht) + 1.1 * Math.sqrt(k.gradVermutet),
    farbe: k.art,
    titel: betitelt.has(k.id) ? k.titel : "",
    echt: k.gradEcht,
    vermutet: k.gradVermutet,
  })),
  kanten: kanten
    .filter((e) => nachId.has(e.quelle) && nachId.has(e.ziel))
    .map((e) => {
      const a = nachId.get(e.quelle), b = nachId.get(e.ziel);
      return {
        x1: a.x, y1: a.y, x2: b.x, y2: b.y,
        echt: e.sorte === "echt",
        dicke: e.sorte === "echt" ? 1.8 : 0.7 + 1.6 * (e.maess.wert ?? 0),
        mess: e.maess.wert,
        basis: e.maess.basis,
        belege: e.belege,
      };
    }),
  zeilen: [
    `Bestand ${bestand.knoten} Notizen · ${bestand.kanten} Kanten gerechnet — im Bild ${knoten.length} Knoten · ${kanten.length} Kanten (${kanten.filter((k) => k.sorte === "echt").length} echt durchzogen, ${kanten.filter((k) => k.sorte === "aehnlich").length} ähnlich gestrichelt)`,
    `betitelt {ETIKETT} von ${knoten.length} · gekappt ${kuerzung.uebrig.knoten} Knoten, ${kuerzung.uebrig.kanten} Kanten${kuerzung.grund.length ? ` (${kuerzung.grund.join(", ")})` : ""} · ${kuerzung.gefiltert.privat} private Notizen nicht gezeigt`,
  ],
  fuss: `KEPTA — knowledge graph, computed by the engine · ${neuesterStand()} · erfundener Demo-Bestand, keine echten Daten`,
};

function neuesterStand() {
  try {
    const wurzel = path.resolve(import.meta.dirname, "..");
    const rev = execFileSync("git", ["rev-parse", "--short", "HEAD"], { cwd: wurzel, encoding: "utf8" }).trim();
    // Der Arbeitsbaum kann über dem Commit stehen (andere Scheiben arbeiten hier):
    // ein Bild, das `bfbfaa5` nennt und von einem dreckigen Baum malt, lügt eine
    // Zeile lang. `-dirty` ist die ehrliche Form.
    const schmutzig = execFileSync("git", ["status", "--porcelain", "--", "src", "server.ts"], { cwd: wurzel, encoding: "utf8" }).trim();
    return rev + (schmutzig ? "-dirty" : "");
  } catch {
    return "Stand unbekannt";
  }
}

fs.writeFileSync(path.join(heim, "plan.json"), JSON.stringify(plan));

const PY = `
import json, sys, os
from PIL import Image, ImageDraw, ImageFont

plan = json.load(open(sys.argv[1]))
ZIEL = sys.argv[2]
B, H = plan["breite"], plan["hoehe"]
bild = Image.new("RGB", (B, H), plan["hintergrund"])
d = ImageDraw.Draw(bild)

def rgb(h, a=255):
    h = h.lstrip("#")
    return (int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16), a)

FARBEN = {k: rgb(v) for k, v in plan["farben"].items()}

# Schriftpfade nur, wo sie wirklich liegen; sonst Pillow-Default in echter Groesse.
kandidaten = [
    "/System/Library/Fonts/Helvetica.ttc",
    "/System/Library/Fonts/Supplemental/Arial.ttf",
    "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
]
pfad = next((p for p in kandidaten if os.path.exists(p)), None)
SCHRIFT = max(18, round(B * 0.015))          # mindestens 18 px auf 1200 px Breite
klein = max(18, round(SCHRIFT * 0.78))       # die ehrliche Zeile ist auch Text, keine Beilage
def font(g):
    if pfad:
        try: return ImageFont.truetype(pfad, g)
        except Exception: pass
    return ImageFont.load_default(size=g)
f_titel, f_fuss, f_zeile = font(SCHRIFT), font(klein), font(klein)

rand_l, rand_o, rand_u = 28, 24, 104
welt = [k for k in plan["knoten"]]
xs = [k["x"] for k in welt]; ys = [k["y"] for k in welt]
minx, maxx, miny, maxy = min(xs), max(xs), min(ys), max(ys)
spiel_b, spiel_h = B - 2 * rand_l, H - rand_o - rand_u
sx = spiel_b / max(1, maxx - minx); sy = spiel_h / max(1, maxy - miny)
s = min(sx, sy)
ox = rand_l + (spiel_b - (maxx - minx) * s) / 2
oy = rand_o + (spiel_h - (maxy - miny) * s) / 2
px = lambda x: ox + (x - minx) * s
py = lambda y: oy + (y - miny) * s

for e in plan["kanten"]:
    a, b = (px(e["x1"]), py(e["y1"])), (px(e["x2"]), py(e["y2"]))
    if e["echt"]:
        d.line([a, b], fill=(150, 90, 62, 255), width=max(1, round(e["dicke"])))
    else:
        # gestrichelt: Aehnlichkeit ist Vermutung, nicht Behauptung
        dx, dy = b[0]-a[0], b[1]-a[1]
        laenge = (dx*dx + dy*dy) ** 0.5
        if laenge < 1: continue
        schritte = max(1, int(laenge // 9))
        for i in range(schritte):
            t0, t1 = i/schritte, min(1, (i + 0.55)/schritte)
            d.line([(a[0]+dx*t0, a[1]+dy*t0), (a[0]+dx*t1, a[1]+dy*t1)],
                   fill=(120, 124, 132, 255), width=max(1, round(e["dicke"])))

for k in plan["knoten"]:
    cx, cy = px(k["x"]), py(k["y"])
    r = max(4, k["r"] * (s if s < 1 else 1))
    farbe = FARBEN.get(k["farbe"], FARBEN["begriff"])
    d.ellipse([cx-r, cy-r, cx+r, cy+r], fill=farbe, outline=(255, 255, 255, 60), width=1)

# Titel zuletzt, damit sie über Linien liegen; Kollision weicht aus (ein Etikett
# pro Zeile, das zweite in derselben Höhe fällt weg).
belegt = []
for k in sorted(plan["knoten"], key=lambda q: -(q["echt"] + q["vermutet"])):
    if not k["titel"]: continue
    cx, cy = px(k["x"]), py(k["y"])
    r = max(4, k["r"] * (s if s < 1 else 1))
    t = k["titel"] if len(k["titel"]) <= 34 else k["titel"][:33] + "…"
    bb = d.textbbox((0, 0), t, font=f_titel)
    y = cy + r + 3
    if any(abs(y - alt) < (bb[3]-bb[1]) + 2 and abs(cx - xalt) < 260 for alt, xalt in belegt):
        continue
    # Ein Titel, der aus der Leinwand läuft, ist kein Titel.
    tx = min(max(cx - (bb[2]-bb[0])//2, 6), B - (bb[2]-bb[0]) - 6)
    ty = min(y, H - rand_u - (bb[3]-bb[1]) - 6)
    d.text((tx, ty), t, font=f_titel, fill=(226, 228, 232, 255))
    belegt.append((ty, cx))

d.line([(0, H - rand_u + 10), (B, H - rand_u + 10)], fill=(60, 62, 68, 255), width=1)
# Die ehrliche Zeile nennt, was wirklich gemalt ist — nicht das Budget.
y = H - rand_u + 20
for zeile in plan["zeilen"]:
    d.text((rand_l, y), zeile.replace("{ETIKETT}", str(len(belegt))), font=f_zeile, fill=(176, 180, 188, 255))
    y += klein + 7
d.text((rand_l, y), plan["fuss"], font=f_fuss, fill=(120, 124, 132, 255))

bild.save(ZIEL, "PNG")
print(json.dumps({"pfad": ZIEL, "bytes": os.path.getsize(ZIEL), "breite": B, "hoehe": H,
                  "knoten": len(plan["knoten"]), "kanten": len(plan["kanten"]),
                  "betitelt": len(belegt), "budget": sum(1 for k in plan["knoten"] if k["titel"]),
                  "schrift_px": SCHRIFT, "font": pfad or "Pillow-Default"}))
`;

const aus = spawnSync("python3", ["-", path.join(heim, "plan.json"), ZIEL], { input: PY, encoding: "utf8" });
if (aus.status !== 0) {
  console.error("graf-bild: Pillow konnte nicht malen.\n" + (aus.stderr || ""));
  process.exit(1);
}
console.log(aus.stdout.trim());
console.log("Plan: " + path.join(heim, "plan.json"));
