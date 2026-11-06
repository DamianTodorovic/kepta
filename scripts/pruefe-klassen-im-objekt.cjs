// P88: jeder Klassenname, den ein Baustein ruft, muss im ausgelieferten CSS eine Regel haben.
// Von Hand gefahren 6.11.2026 01:57 bis 02:00 MEZ und dort fundiert: `prose` und `prose-sm`
// werden gerufen (Chat.tsx:1052), und keine Regel dazu ist im ausgelieferten Stueck.
// Nutzung: node scripts/pruefe-klassen-im-objekt.cjs [pfad/zu/app.asar]
const fs = require("node:fs");
const path = require("node:path");
const asar = require("@electron/asar");

const OBJEKT = process.argv[2] || "/Applications/K3PTA.app/Contents/Resources/app.asar";
if (!fs.existsSync(OBJEKT)) { console.log("KEIN OBJEKT: " + OBJEKT); process.exit(2); }

// 1) Klassenwoerter aus den Bausteinen: nur className/class-Attribute und Klassenketten in
//    String-Literalen, nie Fliesstext.
const rufer = new Map();
(function geh(d) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) { geh(p); continue; }
    if (!/\.tsx$/.test(e.name)) continue;
    const zeilen = fs.readFileSync(p, "utf8").split("\n");
    zeilen.forEach((z, i) => {
      for (const m of z.matchAll(/class(?:Name)?\s*=\s*(?:\{)?\s*(["'`])([^"'`]*)\1/g)) {
        for (const w of m[2].split(/\s+/)) {
          if (!w || !/^[a-zA-Z[][\w:./[\]#%()-]*$/.test(w)) continue;
          const kern = w.replace(/\\/g, "");
          if (!/[a-z]/.test(kern)) continue;
          if (!rufer.has(kern)) rufer.set(kern, path.relative(process.cwd(), p) + ":" + (i + 1));
        }
      }
    });
  }
})("src");

// 2) Die CSS-Regeln im ausgelieferten Stueck: alle Asset-Dateien, die auf .css enden.
let css = "";
for (const rel of asar.listPackage(OBJEKT)) {
  if (!/\.css$/.test(rel)) continue;
  try { css += asar.extractFile(OBJEKT, rel.replace(/^\//, "")).toString("latin1"); } catch { /* ungepackt */ }
}
const regeln = new Set();
const entkommen = (t) => t.replace(/\\(.)/g, "$1");
for (const m of css.matchAll(/\.((?:[-\w]|\\.)+)/g)) {
  const kern = m[1];
  regeln.add(kern);
  regeln.add(entkommen(kern));
}
const hat = (w) => {
  if (regeln.has(w)) return true;
  const ohne = w.replace(/^(?:hover|focus|active|disabled|group-hover|dark):!?/, "");
  if (regeln.has(ohne)) return true;
  const stamm = ohne.replace(/\/[\d.]+$/, "");
  if (regeln.has(stamm)) return true;
  return [...regeln].some((r) => r === stamm || r.startsWith(stamm + "-") || r.startsWith(stamm + ":"));
};

// Marker-Klassen des Rahmenwerks tragen eigne Regel nie -- sie sind Namen fuer eine
// Verwandten-Regel (`group-hover/code:`) und keine Style-Regel. Sie werden gezaehlt und
// gedruckt, nicht still geschluckt: gemessen 03:29:51 MEZ am ausgelieferten 3.2.176 sind es
// zwei (`group/code` in Chat.tsx:1110 und eine zweite), und die Zahl steht in der Meldung.
const MARKER = /^(group|peer)(\/[\w-]+)?$/;
const marker = [...rufer].filter(([w]) => MARKER.test(w));
const kahl = [...rufer].filter(([w]) => !MARKER.test(w) && !hat(w));
console.log(" CSS-Regeln im Objekt: " + regeln.size + " | gerufene Klassenwoerter: " + rufer.size);
console.log(" Marker ohne eigne Regel (erlaubt, mit Namen): " + marker.length + (marker.length ? " -- " + marker.map(([w]) => w).join(" ") : ""));
console.log("ohne Regel im ausgelieferten CSS: " + kahl.length);
for (const [w, wo] of kahl.slice(0, 40)) console.log("   KAHL  " + w.padEnd(28) + wo);
process.exitCode = kahl.length ? 1 : 0;
