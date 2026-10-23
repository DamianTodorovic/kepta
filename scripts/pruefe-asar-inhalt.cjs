// Prueft den INHALT eines gebauten app.asar, nicht sein Verhalten.
// Aufruf: node scripts/pruefe-asar-inhalt.cjs <pfad/app.asar> [version]
//
// Grund, dass dieser Pruefer im Repo liegt und nicht auf /tmp: 3.2.16 ist nur getauscht,
// weil er zusaetzte — und bis 20:56 war er der einzige Ort, der die acht Marker kannte.
// `git ls-files scripts` nannte ihn nicht, ein geleerter /tmp-Ordner haette ihn vergessen.
//
// Gezaehlt werden nur String-Literale. Kennungen verbiegt der Minifier: gemessen am
// gebauten Paket von 20:48 traegt es `data-abschnitt` dreimal als ("data-abschnitt":"verbindung"),
// aber `ortZuletzt` (Name einer useRef-Variablen) nullmal. Ein verbotenes Marker in
// Quelltext-Syntax (ortZuletzt="anbieter") kann in einem Bundle also nie erscheinen und
// eine Pruefung darauf nie schlagen — solche Zeilen sind hier bewusst nicht drin.
const fs = require("fs");
const p = process.argv[2];
const version = process.argv[3] || "";
if (!p || !fs.existsSync(p)) {
  console.log("  KEIN ASAR unter", p);
  process.exit(2);
}
const s = fs.readFileSync(p).toString("latin1");
// was drin sein MUSS, und wie oft mindestens.
const erwartet = [
  ["data-abschnitt", 1],
  ["data-quittung", 1],
  ["widerspruch", 1],
  ["this field is not a network yet", 1],
  ["carry a concept but only", 1],
  ["58-note, 45-question", 1],
  ["Configuration saved", 1],
  ["alle=1", 1],
  // 3.2.22, gemessen am ausgelieferten Paket (app.asar 49 060 793 B, mtime 2026-10-18T20:58:45Z):
  // die Regal-Flaeche, ihr Fach mit der einen Regel, die Lebensdauer einer Quittung und ihr
  // Objekt, und die Ladefehler-Flaeche. Zaehlt nur String-Literale — Kennungen verbiegt der Minifier.
  ["graph-regal", 1],
  ["regal-woher-fach", 1],
  [".regal-woher-fach", 1],
  // "in two bands" war die Regal-Zeile aus 3.2.22 und ist seit 3.2.25 andrer Wortlaut (das Regal
  // hat ein drittes Band: die Zeit). Der aktuelle Beleg steht unten bei den 3.2.25-Markern als
  // "notes, in three bands" — ein Marker auf eine verschwundene Prosa waere eine Pruefung, die
  // wegen einer bewussten Aenderung schlaegt, nicht wegen eines Fehlers.
  ["min-width:1px", 1],
  ["the three curl test commands", 1],
  ["The server did not answer", 1],
  // 3.2.23 (HEAD 59dabea, gemessen am ausgelieferten Paket: app.asar 49 065 686 B, mtime
  // 2026-10-19T12:05:15Z, gegen das vorige Objekt 49 060 793 B / 2026-10-18T20:58:45Z):
  // die Legende weicht bei schmaler Breite, und ihre Prosa-Zeile ist ein echtes Klassen-Literal
  // in `KnowledgeGraph.tsx:4966` und `src/index.css:1524` — im alten Objekt beide **0** Treffer.
  ["hud-label legende-prosa", 1],
  [".legende-prosa", 1],
  // Kein Marker fuer den Ein-Durchstich-Leseweg (`59dabea`, store.ts): seine einzigen SQL-Literale
  // ("deleted_at IS NULL" / "IS NOT NULL") standen schon im alten Objekt, ein Wort darauf waere
  // eine Pruefung, die nie schlagen kann. Der Weg ist durch seinen Fall gedeckt, nicht durch ein Literal.
  // 3.2.24 (HEAD 9881e79 plus p5-g, die generierte Spalte aus p6-health-2s und p5-i-v2). Gegen das
  // ausgelieferte 3.2.23-Objekt (49 065 686 B, mtime 2026-10-19T12:05:15Z) gemessen: alle sechs
  // Literalen dort **0** Treffer, ebenso das Wort `embedding_hat` selbst.
  ["idx_memory_entities_entity", 1],
  ["idx_chunks_hat_model", 1],
  ["FROM chunks WHERE embedding_hat = 1", 1],
  ["CASE WHEN embedding IS NOT NULL THEN 1 ELSE 0 END", 1],
  ["idx_memories_deleted_id ON memories(deleted_at, id)", 1],
  ["absolute left-0 right-0 top-0 z-10 h-[3px] pointer-events-none", 1],
  // 3.2.25 (drei Flicken von der Bank, am 20.10. 14:20 angelegt; zwei weitere gingen zurueck,
  // weil ihr eigner Fall rot war). Gegen das installierte 3.2.24-Objekt gezaehlt: alle vier
  // hier genannten Literalen dort **0** Treffer.
  ["x-kepta-teilzeiten", 1],
  ["notes, in three bands", 1],
  // 3.2.44 (Punkt 5s Fuss-Kappe, Kopf 48712f4): die Heilung zieht `bottom:3.25rem` in die
  // Variable `--panel-fuss` und laesst `bottom-3` aus der Klassenkette der Legende fallen.
  // Beide alten Ketten messen im gebauten 3.2.44-Objekt **0** (18:01:07 MESZ, diese Sonde;
  // Gegenprobe 18:02:5x MESZ mit LC_ALL=C grep -aoE am gebauten asar, 49 102 581 B, mtime
  // 18:00:46), im installierten 3.2.43 steht `bottom:3.25rem` dagegen **1** mal. Die drei
  // neuen Marken sind samt Grund gegen das **installierte** 3.2.43 geprueft, bevor etwas
  // getauscht wurde (18:03:12 MESZ, alle drei = 0, Pfad
  // /Applications/K3PTA.app/Contents/Resources/app.asar, 49 101 261 B, mtime 17:14:07 MESZ).
  ["--panel-fuss:3.25rem", 1],
  ["--panel-fuss:.75rem", 1],
  ["graph-legende absolute left-3 hud-panel", 1],
  // p4-w (landet in 3.2.32) und p5-m (landet in 3.2.33), am **installierten** Objekt gezaehlt:
  // app.asar 49 084 029 B, mtime 21.10. 19:14:48 MESZ. Treffer dort: der Titel-Sichttext 1,
  // "Look for a local model" 1, "regal-wann" 1, "regal-koerb" 3. Die Icon-Klasse des Flickens
  // ("w-3.5 h-3.5") ist **kein** Marker: sie steht 83 mal im Objekt, also beweist ihre
  // Anwesenheit nichts ueber diesen einen Koerper.
  ["Look for a local model", 1],
  ["Ask this machine whether Ollama or LM Studio is running", 1],
  ["regal-wann", 1],
  ["regal-koerb", 1],
  // p5-p (G-72) und p1-q (G-76) und p4-y, am **gelandeten** Objekt gezaehlt 22.10. 19:16 MESZ
  // (app.asar 49 097 685 B, 19:05): "graph-farbgruppe" 2 (das zweite ist "-stand"),
  // "graph-verbindungsdicke" 2 (das zweite ist "-wert"), die beiden Saetze je 1. Kappen sind
  // auf 1 gesetzt, weil sie eine Untergrenze sind: ein zusaetzliches Vorkommen ist erlaubt,
  // ein fehlendes nicht.
  ["graph-farbgruppe", 1],
  ["graph-verbindungsdicke", 1],
  ["No model provider is chosen yet", 1],
  ["This provider needs an API key", 1],
  // 3.2.38 (P5-Achsen): gemessen 22.10. 22:12:53 MESZ im gebauten Renderer-Paket
  // (`vite build --outDir dist-marken-mess`, Exit 0) — jede der drei Ketten steht genau
  // einmal, in `assets/graph-*.js`. Ohne diese drei Marken waere die Landung am Objekt
  // unbewiesen: der Streifen-Flicken aus 3.2.37 lebt in Dashboard.tsx, die Achsenwoerter
  // in gruppen.ts und beide Flaechen — ein Paket ohne sie laeuft trotzdem und sagt
  // still dieselbe Sache in zwei Sprachen.
  ["what you work on", 1],
  ["no note carries it yet", 1],
  ["click a name to open the notes you filed under it", 1],
  // 3.2.39 und 3.2.40, gemessen 23.10. 10:54 MESZ: das gebaute Pruefobjekt
  // (`release/mac-arm64/.../app.asar`, 49 099 436 B, mtime 23.10. 10:53) gegen das
  // installierte 3.2.38-Objekt (49 098 975 B, mtime 22.10. 22:16). Alle vier Ketten
  // stehen im neuen Objekt genau **1** mal und im alten **0** — also schlagen sie,
  // wenn einer der zwei Koerper fehlt. Die Gegenprobe am alten Objekt meldete sie
  // Zeile fuer Zeile FEHLT.
  // Das Wort `graph-legende absolute left-3 bottom-3` galt bis 3.2.43 als gemeinsamer
  // Vorlauf beider Klassen und traf in beiden Objekten 1 mal. **Seit 3.2.44 ist die Kette
  // weg** (der Fuss zieht in `--panel-fuss`, `bottom-3` faellt aus der Klasse) — die Zeile
  // oben prueft jetzt die neue Form `graph-legende absolute left-3 hud-panel`.
  // Die alte Klassenkette `hud-panel rounded-lg px-3 py-2 pointer-events-none space-y-1`
  // ist im neuen Objekt **0** mal — gemeldet, nicht geprueft: diese Liste kennt nur
  // Untergrenzen, und eine Kappe auf 0 waer eine zweite Klasse von Pruefung.
  ["max-h-[calc(100%-56px)]", 1],
  ["min-[820px]:columns-2", 1],
  // 3.2.41 setzte hier `maxHeight:"calc(100% - 1.5rem)"`; 3.2.44 tauscht die Zahl gegen die
  // Variable des Fusses, also schlaegt die alte Kette fehl (gemessen 0 im gebauten Objekt
  // 18:01:07 MESZ) und die neue tritt an ihre Stelle — Kappe 1, Gegenprobe am installierten
  // 3.2.43 = 0 (18:03:12 MESZ).
  ['maxHeight:"calc(100% - 2 * var(--panel-fuss, 0.75rem))"', 1],
  ['apiKey:"",baseUrl:"",model:""', 1],
  // Die Vorwaermung des Such-Index (3.2.39, `src/core/engine.ts` und `server/bootstrap.ts`)
  // hatte bis hierher keinen Marker, weil eine Gegenprobe kurz vor 11:05 MESZ ins Leere lief:
  // der Tausch um 10:58:09 hatte `/Applications/K3PTA.app` schon durch das neue Objekt ersetzt,
  // die Sonde las also zweimal das neue Stueck und meldete 1 gegen 1. Nachgemessen 11:05:13 MESZ
  // an der **zurueckgelegten** Fassung `/tmp/K3PTA-vor-3.2.40.app` (49 098 975 B, mtime
  // 22.10. 22:16:08): dort **0** Treffer, im gebauten Objekt **1**. Regel fuer die
  // Gegenprobe: das alte Objekt nach einem Tausch an seinem Lagerpfad messen, nicht an
  // `/Applications` — und Pfad, Groesse und mtime in die Zeile schreiben.
  ["Such-Vorwaermung ausgeblieben", 1],
  // 3.2.41 (Punkt 5s Klassen-Kappe), gemessen 12:14:13 MESZ am gebauten Objekt
  // (`release/mac-arm64/.../app.asar`, 49 099 570 B, mtime 12:12:54 MESZ): 43 Pruefungen ok, EXIT 0.
  // Gegenprobe 12:14:14 MESZ — noch VOR dem Tausch — am installierten 3.2.40
  // (`/Applications/K3PTA.app`, 49 099 436 B, mtime 10:58:13 MESZ): 42 ok, `45vh` FEHLT, EXIT 1.
  // Die letzte Gegenprobe war nach einem Tausch gefahren und hatte ihr eignes neues Objekt als den
  // alten Stand gelesen; deshalb steht die Zahl hier mit Pfad, Groesse und Schreibzeit.
  // `45vh` steht im neuen Objekt 1 mal und im alten 0: die Zahlen der neuen Rechnung
  // (`min(<fest>px, <blickfeld>)`) sind Vorlagen, also ueberlebt nur der Blickfeld-Anteil als Wort.
  // Kein Marker fuer den Klick, der die Liste holt: `block:"nearest"` zaehlt 8 im neuen und 7 im
  // alten Objekt — eine Untergrenze auf ein Muster, das die Flaeche vorher schon sieben mal benutzte,
  // beweist ueber diesen Koerper nichts. Kein Marker fuer `kappeListe` und `KAPPE_PANEL`:
  // Kennungen verbiegt der Minifier (`function Li(e=320,t="45vh")`).
  ["45vh", 1],
  // 3.2.42 (Punkt 1s Gang-Lichtung #102), gemessen 12:37:34 MESZ am gebauten Objekt
  // (`release/mac-arm64/.../app.asar`, 49 100 741 B, mtime 12:36:43 MESZ): 45 Pruefungen ok, EXIT 0.
  // Nach dem Kommentar-Lauf 12:37:54 MESZ gilt dieselbe Liste unveraendert ("Inhalt passt").
  // Gegenprobe 12:37:35 MESZ am zu diesem Zeitpunkt installierten 3.2.41
  // (`/Applications/K3PTA.app`, 49 099 570 B, mtime 12:16:28 MESZ): 43 ok, beide neuen Ketten FEHLT,
  // EXIT 1. Gegenprobe **vor** dem Tausch, Pfad, Groesse und Schreibzeit in der Zeile -- die Regel,
  // die diese Tafel zweimal gelehrt hat.
  // **Kappen auf 2, nicht auf 1, mit Grund:** der Satz mit der Zahl steht an zwei Orten, auf der
  // Leinwand und im `gang-info`-Knoten. Fehlt einer der beiden, malt die Flaeche eine Zahl, die
  // der Mensch an der andern Stelle nicht sieht -- genau die Klasse, die dieses Haus "eine Zahl,
  // die niemand liest" nennt. Ein dritter Aufrufort ist erlaubt (Kappe = Untergrenze), einer
  // weniger nicht. `counted, not painted` zaehlt 4 (beide Saetze, beide Orte) und steht deshalb
  // nicht eigner Liste: es ist durch die zwei Ketten oben gedeckt.
  ["painted at this zoom", 2],
  ["too tight to paint at this zoom", 2],
  // Kein Marker fuer die zwei Heilungen der Sonde, die nur ein Wort wegnehmen:
  // `baseUrl:""` (2 -> 3) und `model:""` (1 -> 2) stehen schon im alten Objekt, eine
  // Pruefung darauf kann nie schlagen. Nur die volle Kette oben ist neu.
  // P4-16 und P4-13 bleiben ohne Marker, nicht aus Bequemlichkeit: P4-16 verwendet dieselben
  // Worte wie die Extraktionszeile aus 3.2.22 ("did not answer (" steht im alten Objekt schon
  // 1 mal), P4-13 nimmt nur einen try/fang weg und schreibt kein neues Literal. Beide haengen
  // an ihren Faellen (je einer, vorher rot gemeldet), nicht an einem Wort.
  // 3.2.43 (Punkt 3s BAU-P3-07, die erklaerte Abwesenheit eines Fremdcode-Laders), Auftrag
  // Zeile 102 des Flicken-Blatts, BEREIT gesetzt von der Leitung 12:46:32 MESZ gegen 64263c9.
  // **Kappe auf 1, mit Grund:** die Kennung steht einmal (als Wert des JSX-Attributs der Zeile),
  // der Satz steht einmal (als Wert in der Textsammlung). Ein zweiter Fund ist erlaubt, ein
  // fehlender nicht. Beide Ketten sind ASCII, denn die Sonde bricht mit EXIT 2, wenn ein Marker
  // Nicht-ASCII traegt - in ihrer latin1-Lesung waere soeine Zaehlung eine Dauer-Null.
  // Gegenprobe VOR dem Tausch, am dann installierten 3.2.42: beide Ketten muessen 0 sein,
  // sonst ist die Pruefung eine Dauer-Gruene. Gemessen 14:1x MESZ, Pfad und Zahl in der Landung.
  ["settings-keine-fremderweiterungen", 1],
  // KURZ A (Leitung 23.10. 19:50 MESZ): der Satz wurde kuerzer - 280 -> 197 Zeichen, 53 -> 36
  // Woerter, laengster Atemzug 43 -> 24 - und traegt "plugin store" nicht mehr. Die Marke haengt
  // deshalb an einem Teilstring, der im Quelltext genau 1 mal steht (src/lib/uiText.ts:72), vor dem
  // Setzen in scripts/, tests/, docs/, README.md und CHANGELOG.md 0 mal (gemessen 19:58:00 MESZ),
  // in keiner der 49 andern Marken vorkommt und kein Zeichen traegt, das der Minifier maskieren
  // muesste. Gegenprobe am installierten 3.2.44 (49 102 581 B, mtime 18:05:39 MESZ): 0 - und die
  // alte Marke dort 1, also ueberlebt ein Satzteil aus uiText.ts den Minifier woertlich. Zweitwahl
  // mit denselben Zahlen, falls kuerzer gewuenscht: "A key never unlocks part of it" (30 Zeichen).
  ["the same program on a personal and a managed machine", 1],
  // 3.2.44, ZWEITER Koerper: P4-77 (der Schluessel bleibt in der Sitzung), Auftrag Brief 76 /
  // Arbeitsaufgabe #31, Zeile 108 des Flicken-Blatts. Die Fuss-Kappe P5-t bekam ihre Marken im Zug
  // 9c3fc55, dieser Koerper hatte keine -- ohne die vier Zeilen unten waere seine Landung am Objekt
  // unbewiesen, und ein Paket ohne ihn laeuft trotzdem und sagt dieselbe Sache.
  // **Zwei Objekte, gemessen 23.10. 18:08:23 MESZ, latin1 wie diese Sonde:** ausgeliefert
  // `/Applications/K3PTA.app/Contents/Resources/app.asar` (49 102 581 B, mtime 18:05:39 MESZ) gegen
  // das Ruecklager `/tmp/K3PTA-vor-3.2.44.app/Contents/Resources/app.asar` = das gewesene 3.2.43
  // (49 101 261 B, mtime 17:14:07 MESZ). Gegenprobe VOR dem Tausch gefahren, also an zwei
  // verschiedenen Stuecken und nicht an einem Spiegel.
  // **Kappen auf 1, mit Grund:** die drei Saetze stehen an je einem Ort -- versiegelte Zeige,
  // unversiegelte Zeige, Maschenfund-Zeile. `altFund` zaehlt 5 (Kennung als Eigenschaftsname, sie
  // ueberlebt den Minifier), die Kappe bleibt eine Untergrenze: ein zweiter Fund ist erlaubt, ein
  // fehlender nicht.
  // **Kein Marker fuer den Speicher-Weg selbst:** die Kennungen des Korpers verbiegt den Minifier,
  // gemessen je 0 in beiden Objekten -- `sitzungsSchluessel`, `ohneSchluessel`,
  // `versiegeltVorhanden`, `kiSitzung`, `schluesselHuelle`. Eine Pruefung darauf kann nie schlagen.
  // Der Weg haengt an P4-77s sieben Faellen, nicht an einem Wort.
  ["altFund", 1],
  ["An older key is still in the database under a masked name", 1],
  ["No copy of the key is kept in this app", 1],
  ["It stays in this app", 1],
];
// Die Liste darf nur ASCII-Zeichen enthalten. Grund, gemessen 21.10. 19:16 MESZ am
// installierten Objekt: das Wort "Looking" plus echtes U+2026 steht dort 2 mal, diese
// Sonde zaehlt davon **0**, weil latin1 das Zeichen in zwei Byte-Fetzen zerlegt und das
// Muster dann sein eignes Ziel nicht mehr trifft. Ein Nicht-ASCII-Marker ist hier keine
// Pruefung, sondern ein Dauer-Null — also abbrechen, statt zu schlagen.
const nichtAscii = erwartet.filter(([m]) => /[^\x20-\x7E]/.test(m)).map(([m]) => m);
if (nichtAscii.length) {
  console.log("  NICHT FAHRBAR: Marker mit Nicht-ASCII-Zeichen in der Liste -- " + nichtAscii.join(" | "));
  console.log("  (latin1-Lesung zerlegt sie in Bytes, ihre Zaehlung waere immer 0)");
  process.exit(2);
}
let fehl = 0;
for (const [m, min] of erwartet) {
  const n = s.split(m).length - 1;
  const ok = n >= min;
  if (!ok) fehl++;
  console.log(`  ${ok ? "ok  " : "FEHLT"}  ${String(n).padStart(3)}  ${m}${ok ? "" : `  (erwartet >= ${min})`}`);
}
console.log(`  asar ${fs.statSync(p).size} B, mtime ${fs.statSync(p).mtime.toISOString()}${version ? `, bestellte Version ${version}` : ""}`);
if (fehl) { console.log(`  ${fehl} Pruefung(en) fehlgeschlagen`); process.exit(1); }
console.log("  Inhalt passt.");
