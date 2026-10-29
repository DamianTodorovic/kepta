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
  ["the field gathers into one core marker", 1],
  ["the rest sits in one core marker", 1],
  ["the whole store is still arriving", 1],
  ["no zoom can bring in what the window left out", 1],
  ["this is a window, not the whole store", 1],
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
  // ABGELOEST 3.2.50: `min-[820px]:columns-2` verlangte die Multicol-Klasse zurueck, die Punkt 2s
  // Raster-Flicken (p2-raster-2310.patch) durch ein zweispaltiges Grid ersetzt -- Grund: bei
  // 1024 x 768 legte Multicol eine dritte Spalte hinter der rechten Kante an (Reihen bei x 988
  // bis 1 317 gegen Klappe 985, kein Rollweg). Die Zeile ist damit kein Beweis mehr, sondern eine
  // Forderung nach dem alten Fehler. Was jetzt gepraeft wird, steht am Ende dieser Liste:
  // `min-[820px]:grid`. Die Fuss-Kappe von 3.2.40 bleibt unangetastet (Zeile darueber, 1 Treffer).
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
  ["btn-ghost p-2 rounded-lg inline-flex items-center gap-1", 1],
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
  // 3.2.48, DREI Koerper in einem Zug (Leitung, 24.10. 00:0x MESZ). Marken an dem, was der
  // Minifier woertlich ueberlaesst: zwei Saetze/Klassen aus den Flaechen, ein Array aus der
  // Zuordnung. Vor dem Tausch gemessen am dann installierten 3.2.47 (49 103 416 B, mtime
  // 23:12:48 MESZ): alle drei je 0 Treffer, die 53 aeltern Marken je ok (EXIT 1, die fehlenden
  // drei namentlich). P1s Sammelmarke hatte eine vierte Marke ("core as one marker"); dieser
  // Koerper ist zurueckgebaut und faellt nicht durch, also ist auch seine Marke nicht drin.
  // P2 Faltkante: der Hinweis am Fusse der More-Klappe traegt seine Klasse.
  ["graph-mehr-draussen", 1],
  // P4 c: fremder Bibliotheks-Wortlaut wird nicht mehr kopiert, die Klasse antwortet eigne.
  ["The request was not usable as sent", 1],
  // P5 v2: die Zuordnung laeuft ueber die bewegte Liste, im einen Aufruf. Kennungen verbiegt
  // der Minifier (`vergabeNachBelegung` = 0 in beiden Objekten), das Array ueberlebt.
  ['["md","json","txt"]', 1],
  // 3.2.49, VIER Koerper (Leitung, 24.10. 00:3x MESZ): Punkt 3s Standfolge, Punkt 4s lokale
  // Adresse, Punkt 2s Streifen-Reparatur, Punkt 1s Sammelmarke v4. Marken sind Wortlaute, die der
  // Minifier woertlich laesst. Gegenprobe VOR dem Tausch am dann installierten 3.2.48
  // (49 105 753 B, mtime 00:09 MESZ): jede dieser vier Ketten muss dort 0 sein.
  ["memory_stande", 1],
  ["Local endpoint - this address needs no key.", 1],
  ["px-3 pt-2 pb-0", 1],
  ["core as one marker", 1],
  // 3.2.50, SECHS Koerper (Leitung, 24.10. 01:2x MESZ). Vier davon haben ein Wort, das der
  // Minifier woertlich laesst; zwei haben keins und das steht hier als Befund, nicht als Luecke:
  // P5-v (gruppenGlyphen) und P8b (istLokaleAdresse in Settings) sind Kennungen, die beim Bauen
  // umbenannt werden -- gemessen je 0 Treffer im Leib, eine Pruefung darauf kann nie schlagen.
  // Gegenprobe VOR dem Tausch am dann installierten 3.2.49 (49 111 921 B, mtime 00:41:46 MESZ):
  // alle vier Ketten muessen dort 0 sein.
  ["volltextScans", 1],
  ["is painted in the first group", 1],
  ["preview-stands-none", 1],
  ["min-[820px]:grid", 1],
  // 3.2.51, EIN Koerper mit DREI Zellen (Leitung, 24.10. 02:3x MESZ): Punkt 4s #92 (Stream-Route
  // schickt Grund statt Ausnahmewortlaut), #93 (Sperre sticky am Fuss) und #94 (Chat-Kopf ruft
  // dasselbe Lokal-Kriterium wie die Tuer). Zwei Woerter, und warum nicht mehr:
  // #92 kann NICHT mit `anbieter-lehnt-ab` gemessen werden - die Kennung liegt schon im
  // ausgelieferten 3.2.50 (2 Treffer, aus der nicht-streamenden Route), ein Marker darauf
  // schluege durch, auch ohne diesen Koerper. #94 hat gar kein moegliches Wort: `istLokaleAdresse`
  // ist eine Kennung, die der Minifier verbiegt (gemessen 0 Treffer im Leib), das ist ein Befund
  // und keine Luecke - Beweis sind die zwei gelandeten Faelle, einer davon die Kontrolle.
  // Gegenprobe VOR dem Tausch am dann installierten 3.2.50 (49 115 689 B, mtime 01:22:47 MESZ):
  // beide Ketten muessen dort 0 sein - gemessen 02:38:25 MESZ: sperre-sichtbar 0,
  // "kepta: provider refused the stream" 0.
  ["sperre-sichtbar", 1],
  ["kepta: provider refused the stream", 1],
  // 3.2.52, EIN Koerper (Leitung, 24.10. 03:0x MESZ): Punkt 5s #97 - der Gruppen-Name bei
  // Telefonbreite. Der Koerper traegt keinen Fall (zwei Dateien, +19 / -2, reine Darstellung),
  // also ist DIESE Pruefung hier sein Netz: zwei Klassen, die im gebauten CSS stehen und deren
  // Wegfall die Heilung stumm rueckgaengig machen wuerde. Gegenprobe VOR dem Tausch am
  // ausgelieferten 3.2.51 (49 116 667 B, mtime 02:48:02 MESZ): beide Ketten dort 0 - gemessen
  // 03:01:07 MESZ im eignen Bau (dist-sonde): regal-marke 2, regal-zeile 3.
  ["regal-marke", 1],
  ["regal-zeile", 1],
  // 3.2.53, DREI Stuecke (Leitung, 24.10. 13:09 MESZ): Punkt 5s #96-Leistenband, sein nachgereichter
  // Fall zu #97, und Punkt 3s Eine-Wort-Berichtigung. Zwei Marken fuer das Band - eine Kennung, eine
  // sichtbare Ansage; Gegenprobe VOR dem Tausch am ausgelieferten 3.2.52 (49 116 810 B, mtime
  // 03:09:14 MESZ): beide dort 0.
  ["graph-gruppenband", 1],
  ["Share of painted nodes per group", 1],
  // 3.2.54, EIN Koerper mit ZWEI Zellen (Leitung, 24.10. 13:55 MESZ): Punkt 3s #95 (die Such-Tuer
  // seitet wie die Liste) und #99 (eigne Such-Kappe statt der Chat-Kappe von 20/min). Gegenprobe VOR
  // dem Tausch am ausgelieferten 3.2.53 (49 118 229 B, mtime 13:18:07 MESZ): beide Ketten dort 0 -
  // eigne Griffe 13:55:34 MESZ.
  ["X-Kepta-Suche-Kappe", 1],
  ["the whole result fits in this page", 1],
  // 3.2.55, Punkt 1s #88 (Leitung, 24.10. 14:5x MESZ): die Sammelmarke zahlt ueber dem Punkt statt
  // rechts daneben, und die Leinwand traegt ihr Rechteck als Kennzeichen. Gegenprobe VOR dem Tausch
  // am ausgelieferten 3.2.54 (49 119 269 B, mtime 14:04:38 MESZ) und im eignen Bau ohne Koerper:
  // beide 0, im Bau mit Koerper 2 (Zeile und Rueckbau-Zweig) - eigne Griffe 14:39:52 MESZ.
  ["dataset.kernMarke", 1],
  // 3.2.56, Zelle #98 erster Schritt (Leitung, 24.10. 15:33 MESZ): beide Such-Wege nennen ihre
  // Teilzeiten (Kopf x-kepta-teilzeiten, Leib teilzeiten). Der Kopf selbst unterscheidet NICHT -
  // er steht seit den lesenden Routen schon 4 mal im Objekt (gemessen 15:34 am ausgelieferten
  // 3.2.55), also sind die zwei neuen Marken die Namen, die nur die Suche fuehrt. Gegenprobe am
  // ausgelieferten 3.2.55 (49 119 613 B, mtime 15:04): beide 0.
  ["rueckmeldung", 1],
  ["vorarbeit", 1],
  // 3.2.57, Zelle #98 zweiter Schritt (Punkt 3, von der Leitung 24.10. 18:29 MESZ gelegt): die
  // Engine misst ihre eigne Arbeit und die Route fuehrt die drei Felder in Kopf UND Leib.
  // Marke ist `wortlese` - der Name, den vor diesem Zug keine Zeile des Objekts trug.
  // Gegenprobe am ausgelieferten 3.2.56 (49 120 066 B, mtime 15:43, eigne Zaehlung 18:28):
  // **wortlese = 0**, waehrend `einbettung` schon 1 mal steht (die Gesundheits-Route) und
  // `teilzeiten` 8 mal, `vektor` 17 mal — die drei sind als Marken zu blind, nur `wortlese`
  // unterscheidet diese Fassung von der vorherigen.
  ["wortlese", 1],
  // 3.2.59, Punkt 6s Leerlauf-Vorwaermung (Koerper p6-vektorvorwaermung-2510.patch, von dieser
  // Runde 11:48:50 MESZ gelegt). Gegenprobe VOR dem Tausch, eigne Zaehlung ueber latin1-Bytes,
  // 11:55:43 MESZ: beide Ketten **0** in der ausgelieferten 3.2.58 (49 124 459 B) UND **0** im
  // Ruecklager 3.2.57 (49 120 066 B). Die erste Kette ist ein Wortlaut aus dem Logsatz, den die
  // Vorwaermung selbst spricht (bootstrap.ts), die zweite ist der Name des neuen Feldes im
  // Gesundheits-Leib (system.ts) - keine Kennung, die der Minifier verbiegen kann.
  // **Warum diese zwei ueberhaupt hier stehen:** derselbe Koerper ist am Morgen schon einmal
  // gelegt und zurueckgebaut worden; ohne Marke am Objekt waere eine verlorene Lieferung
  // unsichtbar geblieben.
  ["Vektor-Vorwaermung:", 1],
  ["vektorSpur", 1],
  // NACHGESETZT 26.10. **15:22:51 MEZ (+0100)** fuer **3.2.58** (Zeile 154, Punkt 1s Randklemme #101):
  // diese Landung trug, wie die von 3.2.60, keine Marke. Eigne Zaehlung ueber latin1-Bytes
  // (15:21:5x bis 15:22:5x MEZ, Gegenprobe desselben Laufs) an den
  // beiden Ruecklagern — gewesenes 3.2.57 `/tmp/K3PTA-vor-3.2.58.app/.../app.asar`
  // (49 121 151 B, mtime 17:40:34) gegen gewesenes 3.2.58
  // `/tmp/K3PTA-vor-3.2.59.app/.../app.asar` (49 124 459 B, mtime 11:35:37):
  // `dotYGenau` **0 gegen 1**, und im **ausgelieferten** 3.2.60 ebenfalls **1** (49 126 415 B,
  // mtime 15:11:25) — die Marke ueberlebt drei Fassungen, weil ein Objekt-Feldname nicht umbenannt
  // wird. **Zwei Befunde, keine Luecken, beide gemessen:** `markeKippt` (der Funktionsname) steht in
  // **beiden** Objekten 0 — der Minifier verbiegt ihn, eine Pruefung darauf kann nie schlagen;
  // und der zweite Koerper derselben Fassung (Zeile 151, Punkt 3s Eine-Wort-Kriterium #103) hat
  // **kein einziges ueberlebendes Literal**: `lokalhost` 0 gegen 0, `dieser Rechner` 0 gegen 0,
  // `istLokaleAdresse` 1 gegen 1, `.localhost` 4 gegen 4. Sein Beweis sind die zwei gelandeten
  // Faelle, nicht ein Wort im Leib.
  ["dotYGenau", 1],
  // 3.2.60, Punkt 4s #107 (Koerper p4-107-gegen-ueberlauf.patch, von der Bau-Runde 14:49:10 MESZ
  // gelegt, Kopf 2a3aa64). **Diese zwei Marken setzt die Leitung selbst, 15:16 MESZ** — die
  // Landung war ohne sie erfolgt, und die Gegenprobe hat das gezeigt: die Sonde meldete
  // "Inhalt passt" EXIT 0 gegen die zurueckgelegte Huelle 3.2.59, waehrend sie die bestellte
  // Version 3.2.60 nannte. Ein Pruefer, der zwei aufeinanderfolgende Objekte nicht
  // unterscheidet, ist bei der naechsten Landung blind.
  // Eigne Zaehlung ueber latin1-Bytes, 15:16:4x MESZ: ausgeliefert
  // `/Applications/K3PTA.app/Contents/Resources/app.asar` (49 126 415 B, mtime 15:11:25) gegen
  // das Ruecklager `/tmp/K3PTA-vor-3.2.60.app/.../app.asar` = das gewesene 3.2.59
  // (49 126 346 B, mtime 12:05:01): `calc(100% / ` **1 gegen 0**,
  // `relative h-screen w-full overflow-hidden` **1 gegen 0**.
  // Die Gegenrichtung ist gemeldet, nicht geprueft: die alte Wurzel-Kette
  // `relative h-screen w-screen overflow-hidden` steht im neuen Objekt **0**, im alten **1** —
  // diese Liste kennt nur Untergrenzen, eine Kappe auf 0 waere eine zweite Klasse von Pruefung.
  ["calc(100% / ", 1],
  // `relative h-screen w-full overflow-hidden` war die Wurzel-Marke von 3.2.60 und ist
  // **zurückgezogen**: Punkt 4s Körper für #107 tauscht die Viewport-Höhe gegen die
  // h-full-Kette. Gemessen 20:37:03 MEZ — im gebauten Objekt von 20:35:33 steht die alte
  // Kette **0**, im ausgelieferten 3.2.61 **1**; die neue Kette steht **1** gegen **0**.
  // Eine Marke, die ein späterer Körper zu Recht ablöst, wird umgestellt — nicht die
  // Heilung weichgemacht. Die Gegenrichtung (alte Kette muss 0 sein) steht hier als
  // Messung, weil diese Liste nur Untergrenzen kennt.
  ["relative h-full w-full overflow-hidden", 1],
  // 3.2.61, Punkt 5s #96 (Koerper p5-ac-farbsteuer-ankunft-99c15b8.patch, zwei Dateien,
  // von der Bau-Runde 15:27:48 MEZ gelegt, Zeile 157 des Flicken-Blatts). Drei Marken, weil
  // dieser Koerper drei verschiedene Dinge schreibt: die Kennung des neuen Knotens, den Satz
  // den er malt, und den Namen den das Steuer traegt.
  // Gegenprobe VOR dem Tausch, eigne Zaehlung ueber latin1-Bytes um 15:48:19 MEZ am
  // ausgelieferten 3.2.60 (/Applications/K3PTA.app/Contents/Resources/app.asar, 49 126 415 B,
  // mtime 15:11:25 MEZ): alle drei **0**. Zum Vergleich dieselbe Sonde auf dem gemeinsamen
  // Vorlauf `graph-farbgruppe`: **2** Treffer (die Stand- und die Basis-Kennung), also ist
  // nur die volle Kette `graph-farbgruppe-bild` eine Unterscheidung, nicht ihr Stamm.
  // Kein Marker fuer die vier Kennungen des Koerpers (`gruppenAnkunftRef`, `gruppenAnzahlRef`,
  // `strengImRahmen`, `gruppenAnkunft`): Kennungen verbiegt der Minifier, eine Pruefung darauf
  // kann nie schlagen.
  ["graph-farbgruppe-bild", 1],
  ["groups arrive in this picture", 1],
  ["colour by group", 1],
  // Schritt 4a, 26.10. 17:25:58 MEZ, von der Lande-Runde VOR dem Tausch gelegt, weil der
  // Pruefer bis hierher kein Wort kannte, das nur der neue Koerper spricht. Zaehlt gegen das
  // ausgelieferte 3.2.61 (/Applications/K3PTA.app/Contents/Resources/app.asar, 49 126 944 B,
  // mtime 2026-10-26T14:57:10Z, latin1-Lesung 17:25:58): diese drei stehen dort **0** mal, ein
  // eigener Bau muss sie je >= 1 tragen. Zwei Kandidaten aus demselben Koerper sind **keine
  // Marke** und darum nicht drin: "Back to current" 1 und "preview-stand-back" 1 im alten
  // Objekt -- sie trennen 3.2.61 nicht von 3.2.62.
  ["preview-stand-restore", 1],
  ["Restore this stand", 1],
  ["Restore failed. Nothing was changed.", 1],
  // Punkt 105 und 107, gelegt 26.10. gegen Kopf `783a6c8`. **Alle fuenf Worte standen im
  // ausgelieferten 3.2.61 genau 0 mal**, gemessen 19:23:30 und 19:23:41 gegen dasselbe
  // 49 126 944 B grosse Objekt mit derselben latin1-Zaehlung wie hier. **Zwei Kandidaten
  // fielen vorher durch meine eigne Messung:** `h-full overflow-y-auto` steht schon 5 mal
  // drin (waere gruen von selbst), und `Settings-elementkante` ist ein Testdateiname —
  // Tests werden nicht mitverpackt, die Marke waere dauerhaft 0 und jede Landung verloren.
  ["The core is mostly outside this picture", 1],
  ["No node of the core is inside this picture", 1],
  ["graph-kern-zustand", 1],
  ["min-w-0 break-words", 1],
  ["rounded-2xl p-3 sm:p-5", 1],
  // Punkt 106, gelegt 26.10. gegen Kopf `4181c0e`. **Dieses Wort stand im ausgelieferten
  // 3.2.61 genau 0 mal**, gemessen 22:1x Uhr gegen dasselbe 49 126 944 B grosse Objekt mit
  // derselben latin1-Zaehlung wie hier: der Gang-Satz hatte damals keine Zeilenzahl, weil
  // er nie gebrochen wurde.
  ["gangZeilen", 1],
  // Punkt 109, gelegt 26.10. 23:30:14 MESZ VOR dem Bau gegen das AUSGELIEFERTE Stueck
  // (3.2.62, /Applications/K3PTA.app/Contents/Resources/app.asar, 49 131 413 B,
  // mtime 22:36:24, latin1-Zaehlung wie hier): **0** mal. Dieselbe Sonde zaehlt
  // `gangZeilen` dort **1** — das ist der Beweis, dass ein Name an einem
  // dataset-Eigenschaftszugriff den Minifier ueberlebt, und der Grund, warum diese
  // Marke eine ist. Nicht aufgenommen: `markeLage` und `randGehalten`, beide **0**
  // im alten wie im neuen Objekt — Kennungen verbiegt der Minifier, eine Pruefung
  // darauf kann nie schlagen.
  ["kernOrt", 1],
  // Punkt 109, zweite Haelfte, gelegt 26.10. 23:59:06 MESZ VOR dem Bau gegen das
  // AUSGELIEFERTE Stueck (3.2.63, dasselbe Objekt von oben, 49 132 261 B,
  // mtime 23:37:33): **0** mal. Dasselbe Feld `kernOrt` steht dort schon 2 mal -
  // die Zahl kennt ihren Ort, aber noch nicht, dass sie ihn geraeumt hat. Nicht
  // aufgenommen: `gewichen` als Kennung, und die Woerter `frei` (30 mal) und `eng`
  // (26 391 mal) - ein Muster, das die Welt schon schreibt, trennt keine Fassung.
  ["gewichen", 1],
  // Punkt 54 (die Klappe der Legende), gelegt 27.10. 01:50:52 MESZ VOR dem Bau gegen das
  // AUSGELIEFERTE Stueck (3.2.64, 49 132 423 B, mtime 00:08): beide **0** mal, mit derselben
  // latin1-Zaehlung wie hier. Die zwei Worte sind sichtbare Fliesentexte des Knopfs und seiner
  // Anmeldung, keine Kennung — ein Minifier findet sie nicht. Nicht genommen: der
  // localStorage-Schluessel `kepta_graph_legende` (steht 0 im alten Objekt, ist aber eine
  // Konstante, die auch ein andrer Zweig tragen koennte, und die zwei oben sind die Wirkung).
  ["Show the legend", 1],
  ["graph-legende-klappe", 1],
  // Punkt 113 (der Nenner der Begriffe) schreibt KEINEN eignen Marker: die Heilung
  // lebt jetzt in der Kopfzeile als ` of ${zahl} in the store` — beide Woerter
  // stehen im alten Objekt schon (Notiz-Haelfte, 3.2.66), ein Muster daraus
  // trennt keine Fassung. Der Beweis ist das Verhalten, gemessen am gebauten
  // Stueck: Kopfzeile "0 concepts of 120 in the store" bei 390 und 1440
  // (belege-2710/p113-bild-67-kopf). Dieselbe Grenze wie 3.2.66, dort notiert.
  // Punkt 115 (der Nenner am Einbett-Chip) ebenso: ` of ${zahl} chunks` zerfaellt in zwei
  // Woerter, die das alte Objekt schon zaehlt — " chunks" 288 mal, " of " 10 850 mal
  // (latin1-Zaehlung in `/Applications/K3PTA.app`, 27.10. 14:18 MESZ). Beweis ist der Fall
  // `tests/components/dashboard-einbett-chip.test.tsx` und das Bild am Stueck.
  // Punkt 114 (die Faltung der Zustandszeilen hinter die Klappe), gelegt 27.10. 15:19 MESZ VOR dem
  // Bau gegen das AUSGELIEFERTE Stueck (3.2.66, 49 133 243 B): alle drei **0** mal, latin1 wie hier.
  // `legende-zustand` ist der Halter an den Zeilen, `data-legende` der Zustand an der Karte (beide
  // ueberleben den Minifier als String), das dritte Wort ist der erweiterte Titel des Griffs.
  ["legende-zustand", 1],
  ["data-legende", 1],
  ["including what this view is missing", 1],
  // Punkt 117, Schnitt 2 — der Haufen-Kanal. Drei neue Woerter, alle je 0 im
  // ausgelieferten 3.2.70 (23:21 nachgezaehlt), also tragen sie eine echte Aenderung.
  ["colour by community", 1],
  ["clusters over", 1],
  ["communities over", 1],
  ["named after its best-connected member", 1],
  // Punkt 116 (die Meldung ueber dem fuellenden Index), gelegt 27.10. 20:38 MESZ VOR dem Bau
  // gegen das AUSGELIEFERTE Stueck (3.2.67): **0** mal, latin1. Der Satz ist sichtbarer
  // Fliesentext ueber den Ergebnissen, keine Kennung — der Minifier laesst ihn stehen.
  ["Semantic index is still filling", 1],
  // Punkt Zensur/Z-05 (die Vierer-Basis) schreibt KEINEN eignen Marker: die Heilung aendert
  // nur Zahlen (10->8, 7->8, 22->24, 5->4, 7/14->8/16) und kein Wort im Objekt. Beweis ist die
  // Messung selbst: 435 Nicht-Vier-Abstaende auf Knowledge 1440 vor der Heilung
  // (audit-2026-10-09/feldzug/belege-2710/p6-zensur-67-b/zensur.json), nach ihr die gleiche
  // Sonde erneut gefahren. Eine Zahl ist hier kein Wort, und ein Wort waere eine Behauptung.
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
