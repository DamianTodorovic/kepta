// Die post-run-Haelfte der Zahlenwache.
//
// Sie laeuft direkt nach dem Lauf, an seinem eigenen Bericht — das ist der
// einzige Moment, in dem eine Zahl fuer GENAU DIESEN Lauf beglaubigt werden kann.
// tests/doku-zahlen.test.ts hoeren auf dieselbe Quelle (scripts/test-bericht.mjs),
// mitten im Lauf am Bericht des letzten Laufs. Beide vergleichen exakt: die Doku
// nennt die Zahl der Faelle, die durchgelaufen sind, sonst nichts.
//
// Frueher las dieses Skript einen abgelegten Bericht und nannte ihn "der letzte
// Lauf" — am 10.10. hat die App-Wache damit gemeldet: "1967 Tests gelaufen, die
// READMEs nennen eine passende Zahl", obwohl der Bericht drei Tage alt war, 118
// von 131 Testdateien kannte und 22 Dateien seither geaendert waren. Eine Wache,
// die nicht pruefen kann, muss das sagen. Deshalb exit 1 mit Grund, wenn der
// Bericht fehlt, aelter als der Baum, aus einem Teillauf stammt oder rot war.
import fs from "node:fs";
import path from "node:path";
import { dokuVergleich, leseBericht, readmeDateien } from "./test-bericht.mjs";
import { beschlag, ruedig, sonde } from "./ruhe-sonde.mjs";

/** Die Ursachen kurz vorlesen — die Meldung soll zeigen, WAS die Last sieht. */
function beschreibungDerLast(ursachen) {
  return ursachen.join("; ");
}

const bericht = leseBericht();
if (!bericht.ok) {
  console.error(`doku-check: ICH KANN NICHT PRUEFEN — ${bericht.grund}\n  ${bericht.hinweis}`);
  process.exit(1);
}

const dateien = readmeDateien();
if (dateien.length === 0) {
  console.error("doku-check: kein README.md im Baum — hier steht keine Testzahl, die man pruefen koennte.");
  process.exit(1);
}

// Die Gruen-Pflicht liegt hier, nicht in tests/doku-zahlen.test.ts: dieses Skript
// laeuft ausserhalb der Suite (per `&&` nach ihr), sein eigener Befund kann die
// Zahl also nicht veraendern. Innerhalb der Suite fuehrt dieselbe Forderung zu
// einem Widerspruch, den keine Zahl aufloest — siehe test-bericht.mjs.
if (bericht.fehlgeschlagen > 0) {
  // Ein roter Lauf ist nur dann ein Urteil ueber den Code, wenn die Maschine eines
  // faellen durfte. F10s Sonde meldete "ruhig" bei zwei gleichzeitigen vollen
  // Suite-Laeufen — also wird hier gemessen, nicht gefragt: max/median und
  // node-Prozesse sehen die Last, der Median allein und der load average nicht.
  const messung = sonde();
  const ruhe = ruedig(messung);
  if (!ruhe.ruhig) {
    console.error(
      `doku-check: KEIN URTEIL — ${bericht.fehlgeschlagen} ${bericht.fehlgeschlagen === 1 ? "Test ist" : "Tests sind"} in diesem Lauf fehlgeschlagen, ` +
        `aber die Maschine war belegt: ${beschreibungDerLast(ruhe.ursachen)}.\n` +
      `  ${beschlag(messung)}\n` +
      `  Zeitfaelle unter fremder Last sind kein Befund; bei einer Ruhe-Maschine gilt der Fehlerteil wieder als Urteil. ` +
      `Die Zahl selbst ist davon unberuehrt (${bericht.zahl} ausgefuehrte Faelle) — beglaubigt wird sie erst in einem ruhigen gruenen Lauf.`
    );
    process.exit(1);
  }
  console.error(
    `doku-check: ICH KANN NICHT BEGLAUBIGEN — ${bericht.fehlgeschlagen} ${bericht.fehlgeschlagen === 1 ? "Test ist" : "Tests sind"} in diesem Lauf fehlgeschlagen ` +
      `(bestanden: ${bericht.bestanden}). Die Maschine war ruhig (${beschlag(messung)}) — das ist ein Befund, kein Wetter. Erst die Suite gruen machen, dann die Zahl.`
  );
  process.exit(1);
}

const uebersprungene = bericht.uebersprungen > 0 ? `, ${bericht.uebersprungen} uebersprungene Faelle nicht gezaehlt` : "";
const fehler = [];

// Die Regel selbst steht in test-bericht.mjs (dokuVergleich) — hier und in
// tests/doku-zahlen.test.ts wird nur angewendet, nicht zweimal formuliert.
for (const datei of dateien) {
  const text = fs.readFileSync(path.join(process.cwd(), datei), "utf8");
  fehler.push(...dokuVergleich(text, bericht, datei));
}

if (fehler.length > 0) {
  console.error(
    `doku-check: die Testzahl in der Doku passt nicht zum Lauf vom ${bericht.zeit}:\n  ` +
      fehler.join("\n  ") +
      `\n  Beglaubigte Zahl: ${bericht.zahl} (${bericht.dateienBericht} Testdateien${uebersprungene}).`
  );
  process.exit(1);
}

console.log(
  `doku-check: ${bericht.zahl} Tests sind im Lauf vom ${bericht.zeit} durchgelaufen ` +
    `(${bericht.dateienBericht} Testdateien${uebersprungene}) — ${dateien.join(" und ")} ${dateien.length === 1 ? "nennt" : "nennen"} diese Zahl und diesen Stand.`
);
