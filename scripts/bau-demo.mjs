// Baut aus den Einzelbildern, die scripts/screenshots.mjs schreibt, den Film —
// GIF und MP4 — ohne dass dafür ein Systempaket installiert werden muss.
//
// Warum ein eigenes Skript: screenshots.mjs sagt in seinem Kopf, `docs/demo.gif`
// entstehe mit ffmpeg ≥ 7. Auf diesem Rechner liegt kein ffmpeg auf dem Pfad
// (gemessen 10.10.: ffmpeg, gifsicle, gifski, convert, magick — alle fehlen), die
// Kette war also für niemanden hier fahrbar. Zwei Wege, die ohne Installation
// gehen: Pillow 12.3 für das GIF (Palette über den ganzen Film, echte Dauer je
// Bild, loop 0) und ein ffmpeg, wenn einer auffindbar ist — auf dem Pfad oder als
// statisches Binary des bereits liegenden pip-Pakets `imageio-ffmpeg`. Ohne den
// zweien bleibt das MP4 aus, und das Skript sagt hörbar warum, statt still ein
// halbes Artefakt zu liefern.
//
// Die Einzelbilder tragen ihre echte Dauer schon in `liste.txt` (Format:
// `file 'f0000.png'` / `duration 0.080`, geschrieben in screenshots.mjs). Dieses
// Skript respektiert diese Dauer — das alte Verhalten, alle Bilder auf eine
// Rate zu glätten, ist der Grund, warum ein Film im Schaufenster stehen kann,
// dessen Satz eine Szene verspricht, die er nicht hergibt.
//
//   node scripts/bau-demo.mjs --frames /tmp/x            # GIF + MP4 nach /tmp/x/out
//   node scripts/bau-demo.mjs --frames docs/screenshots --dauer 2,4 --out /tmp/probe
//   node scripts/bau-demo.mjs --frames /tmp/x --out docs --manifest   # der echte Weg
//
// `--out docs` ist absichtlich nötig: nichts hier überschreibt `docs/demo.gif`,
// nur weil ein Testlauf zufällig denselben Ordner erwischt.
import { execFileSync, spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { gif } from "./pruefe-bild.mjs"; // dasselbe Maß wie die Wache, nicht ein zweites

const WURZEL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const BREITE = 1280;

const optionen = (() => {
  const argv = process.argv.slice(2);
  const out = { frames: null, out: null, dauer: null, manifest: false, liste: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--frames") out.frames = path.resolve(argv[++i]);
    else if (a === "--out") out.out = path.resolve(argv[++i]);
    else if (a === "--dauer") out.dauer = argv[++i].split(",").map(Number);
    else if (a === "--liste") out.liste = path.resolve(argv[++i]);
    else if (a === "--manifest") out.manifest = true;
    else if (a === "--help") { console.log(fs.readFileSync(fileURLToPath(import.meta.url), "utf8").split("\n").slice(0, 26).join("\n")); process.exit(0); }
    else { console.error(`bau-demo: unbekannte Option ${a}`); process.exit(2); }
  }
  if (!out.frames || !fs.existsSync(out.frames)) {
    console.error("bau-demo: --frames <Ordner mit Einzelbildern> ist nötig und muss existieren.");
    process.exit(2);
  }
  return out;
})();

/** ffmpeg: erst der Pfad, dann das statische Binary des schon liegenden pip-Pakets. */
function ffmpeg() {
  try {
    execFileSync("ffmpeg", ["-version"], { stdio: "ignore" });
    return "ffmpeg";
  } catch { /* nicht auf dem Pfad */ }
  try {
    const p = execFileSync("python3", ["-c", "import imageio_ffmpeg as f;print(f.get_ffmpeg_exe())"], { encoding: "utf8" }).trim();
    return p && fs.existsSync(p) ? p : null;
  } catch {
    return null;
  }
}

/** `liste.txt` lesen: Datei + echte Dauer, in der Reihenfolge des Laufs. */
function ausListe(pfad) {
  const texte = fs.readFileSync(pfad, "utf8");
  const bilder = [];
  let wartend = null;
  for (const roh of texte.split(/\r?\n/)) {
    const zeile = roh.trim();
    const f = /^file\s+'(.+)'$/.exec(zeile) || /^file\s+"(.+)"$/.exec(zeile) || /^file\s+(.+)$/.exec(zeile);
    if (f) {
      if (wartend) bilder.push(wartend);
      wartend = { datei: f[1], dauer: null };
      continue;
    }
    const d = /^duration\s+([\d.]+)/.exec(zeile);
    if (d && wartend) wartend.dauer = parseFloat(d[1]);
  }
  if (wartend) bilder.push(wartend);
  // Konvention des concat-Formats: die letzte Datei steht zweimal, die zweite
  // Zeile hält nur das Schlussbild und hat keine Dauer. Als Bild gezählt würde
  // sie einen Geister-Frame mit Grunddauer anhängen.
  if (bilder.length && bilder.at(-1).dauer === null) bilder.pop();
  return bilder.filter((b) => fs.existsSync(path.join(path.dirname(pfad), b.datei)));
}

function framesSammlen() {
  const ordner = optionen.frames;
  const liste = optionen.liste ?? path.join(ordner, "liste.txt");
  let bilder = fs.existsSync(liste) ? ausListe(liste) : [];
  if (bilder.length === 0) {
    const pngs = fs.readdirSync(ordner).filter((n) => /\.(png|jpe?g|webp)$/i.test(n)).sort();
    if (pngs.length === 0) {
      console.error(`bau-demo: in ${ordner} liegt kein Einzelbild und keine liste.txt.`);
      process.exit(2);
    }
    bilder = pngs.map((n) => ({ datei: n, dauer: null }));
    console.log(`bau-demo: keine liste.txt — ${pngs.length} Bilder in Dateinamen-Reihenfolge.`);
  }
  return bilder.map((b, i) => ({
    datei: b.datei,
    dauer: b.dauer ?? (Array.isArray(optionen.dauer) ? (optionen.dauer[i] ?? optionen.dauer.at(-1)) : 0.08),
  }));
}

const PY_GIF = `
import sys, json, os
from PIL import Image

breite = ${BREITE}
plan = json.loads(sys.argv[1])
ziel = sys.argv[2]

bilder = []
for eintrag in plan:
    im = Image.open(eintrag["pfad"]).convert("RGB")
    if im.width != breite:
        hoehe = round(im.height * breite / im.width)
        im = im.resize((breite, hoehe), Image.Resampling.LANCZOS)
    bilder.append(im)

# Eine Palette für den ganzen Film, nicht je Bild: sonst wandert die Grundfarbe
# von Szene zu Szene und der Film flackert.
stichprobe = bilder if len(bilder) <= 24 else [bilder[i] for i in range(len(bilder)) if i % max(1, len(bilder) // 24) == 0]
streifen_hoehe = sum(b.height for b in stichprobe)
streifen = Image.new("RGB", (breite, streifen_hoehe))
y = 0
for b in stichprobe:
    streifen.paste(b, (0, y)); y += b.height
vorlage = streifen.quantize(colors=256, method=Image.MEDIANCUT, dither=Image.Dither.NONE)
rahmen = [b.quantize(palette=vorlage, dither=Image.Dither.FLOYDSTEINBERG) for b in bilder]
dauern = [max(20, round(e["dauer"] * 1000)) for e in plan]  # Pillow zählt Millisekunden
rahmen[0].save(ziel, save_all=True, append_images=rahmen[1:], duration=dauern, loop=0, optimize=True)
print(json.dumps({"bilder": len(rahmen), "breite": breite, "hoehe": bilder[0].height,
                  "sekunden": round(sum(dauern) / 1000, 2), "bytes": os.path.getsize(ziel)}))
`;

function baueGif(bilder, ziel) {
  const plan = bilder.map((b) => ({ pfad: path.join(optionen.frames, b.datei), dauer: b.dauer }));
  const aus = spawnSync("python3", ["-", JSON.stringify(plan), ziel], { input: PY_GIF, encoding: "utf8" });
  if (aus.status !== 0) {
    console.error(`bau-demo: Pillow konnte das GIF nicht bauen.\n${aus.stderr}`);
    return null;
  }
  return JSON.parse(aus.stdout.trim().split("\n").at(-1));
}

function baueMp4(bilder, ff, ziel) {
  const liste = path.join(optionen.out, "concat.txt");
  fs.writeFileSync(
    liste,
    bilder.map((b) => `file '${path.join(optionen.frames, b.datei)}'\nduration ${b.dauer.toFixed(3)}`).join("\n") +
      `\nfile '${path.join(optionen.frames, bilder.at(-1).datei)}'\n`
  );
  const aus = spawnSync(ff, [
    "-hide_banner", "-y", "-f", "concat", "-safe", "0", "-i", liste,
    "-vf", `scale=${BREITE}:-1:flags=lanczos`, "-fps_mode", "vfr",
    "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "20", "-movflags", "+faststart",
    ziel,
  ], { encoding: "utf8" });
  fs.rmSync(liste, { force: true });
  if (aus.status !== 0) {
    console.error(`bau-demo: ffmpeg konnte das MP4 nicht bauen.\n${(aus.stderr || "").split("\n").slice(-8).join("\n")}`);
    return null;
  }
  return { sekunden: bilder.reduce((s, b) => s + b.dauer, 0), bytes: fs.statSync(ziel).size };
}

function stand() {
  try {
    return execFileSync("git", ["rev-parse", "--short", "HEAD"], { cwd: WURZEL, encoding: "utf8" }).trim();
  } catch {
    return "unbekannt";
  }
}

function version() {
  try {
    return JSON.parse(fs.readFileSync(path.join(WURZEL, "package.json"), "utf8")).version;
  } catch {
    return "unbekannt";
  }
}

const sha = (p) => crypto.createHash("sha256").update(fs.readFileSync(p)).digest("hex").slice(0, 16);

function main() {
  const bilder = framesSammlen();
  optionen.out = optionen.out ?? path.join(optionen.frames, "out");
  fs.mkdirSync(optionen.out, { recursive: true });
  const gesamt = bilder.reduce((s, b) => s + b.dauer, 0);
  console.log(`bau-demo: ${bilder.length} Bilder, ${gesamt.toFixed(1)} s echte Laufzeit, ${BREITE} px breit`);

  const gifPfad = path.join(optionen.out, "demo.gif");
  const gemessen = baueGif(bilder, gifPfad);
  if (gemessen) {
    const nach = gif(gifPfad);
    console.log(`  GIF: ${nach.breite}×${nach.hoehe}, ${nach.bilder} Bilder, ${nach.sekunden} s, loop=${nach.loop}, ${(fs.statSync(gifPfad).size / 1024).toFixed(0)} kB`);
    if (nach.sekunden < gesamt - 0.5 || nach.sekunden > gesamt + 0.5) {
      console.error(`  BEFUND: Film-Laufzeit ${nach.sekunden} s statt der erwarteten ${gesamt.toFixed(1)} s — die Dauer je Bild ist nicht durchgekommen.`);
    }
  }

  const ff = ffmpeg();
  const mp4Pfad = path.join(optionen.out, "demo.mp4");
  if (ff) {
    const m = baueMp4(bilder, ff, mp4Pfad);
    if (m) console.log(`  MP4: ${fs.statSync(mp4Pfad).size / 1024 | 0} kB (ffmpeg: ${ff})`);
  } else {
    console.error("  MP4: NICHT gebaut — kein ffmpeg auf dem Pfad und kein statisches Binary auffindbar.");
    console.error("       Das GIF ist fertig; für das MP4 einmal `brew install ffmpeg` (oder das pip-Paket");
    console.error("       `imageio-ffmpeg`), dann dieses Skript erneut fahren.");
  }

  if (optionen.manifest) {
    const pfad = path.join(WURZEL, "docs", "bilder-manifest.json");
    const manifest = fs.existsSync(pfad) ? JSON.parse(fs.readFileSync(pfad, "utf8")) : {};
    const eintrag = {
      version: version(),
      stand: stand(),
      gebaut: new Date().toISOString().slice(0, 16).replace("T", " "),
      bilder: bilder.length,
      sekunden: +gesamt.toFixed(2),
      breite: BREITE,
      sha256: {},
    };
    for (const p of [gifPfad, mp4Pfad]) if (fs.existsSync(p)) eintrag.sha256[path.basename(p)] = sha(p);
    manifest[path.relative(WURZEL, gifPfad)] = eintrag;
    if (fs.existsSync(mp4Pfad)) manifest[path.relative(WURZEL, mp4Pfad)] = { ...eintrag, sha256: { "demo.mp4": sha(mp4Pfad) } };
    fs.writeFileSync(pfad, JSON.stringify(manifest, null, 2) + "\n");
    console.log(`  Manifest: ${path.relative(WURZEL, pfad)} (Version ${eintrag.version}, Stand ${eintrag.stand})`);
  }
  console.log(`bau-demo: Artefakte in ${path.relative(WURZEL, optionen.out) || optionen.out}`);
}

main();
