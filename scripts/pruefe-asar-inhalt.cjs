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
  // 3.2.114 zieht den Satz um (Punkt 7, Woerterbuch): "the whole store" war einer von sechs
  // Namen fuer dieselbe Sache. Der Marker folgt der Flaeche, nicht der Erinnerung.
  ["all of your notes are still arriving", 1],
  ["no zoom can bring in what the window left out", 1],
  ["this is a window, not all of your notes", 1],
  ["never reach a window this size", 1],
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
  // P99 (landet in 3.2.181): sechzehn Titel unter dem Zeiger standen ueber der Kappe von
  // 14 Woertern (gemessen 10:01:40 MEZ am Baum, der laengste 32 Woerter). Die Texte sind
  // gekuerzt, die Latte nicht. Marken sind ASCII-Ruempfe der neuen Wortlaute; die alten
  // Wortlaute stehen unten in `verboten`. Gegenprobe am **installierten** 3.2.180 vor dem
  // Tausch: jede neue Marke muss 0 sein, jede verbotene alt 1.
  ["Ask this machine if Ollama or LM Studio runs", 1],
  ["word search still works; meaning search may miss notes", 1],
  ["rank in words, meaning, graph. Absent means unseen", 1],
  ["Thickness changes the drawing, never the ranking", 1],
  ["Built once", 2],
  // P100 (landet in 3.2.182): der Sprachuebergriff auf der Flaeche nennt jetzt seinen
  // Nenner. Marke am neuen Wortlaut, Verbot am alten nackten Bruch.
  ["cross-language pairs", 1],
  ["regal-wann", 1],
  ["regal-koerb", 1],
  // P103 (landet in 3.2.183): ein Etikett nennt keine Suchmethode mehr. Die drei Spuren
  // heissen Words / Meaning / Graph, und der Vorlesername wird an einer Stelle gebaut --
  // gemessen 11:35:04 MEZ am Baum: 9 von 384 Etiketten nannten eine Methode, sechs davon auf
  // Karte und Chat. Gegenprobe am installierten 3.2.182 (11:26:06 MEZ): jede neue Marke 0,
  // jede verbotene Kette mindestens 1.
  ["Search track: ", 1],
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
  // P94 (3.2.180) zieht diese Marke nach: sie nannte den Wortlaut mit nacktem Bindestrich,
  // und der ist jetzt der Gedankenstrich des Hauses. Ein Marker kann das Zeichen nicht
  // tragen (latin1-Lesung), also bleibt der ASCII-Rumpf -- dass der Strich selbst richtig
  // ist, beweisen unten "no key needed." (2) und die Verbotliste ("machine - no key
  // needed", 0). Gezaehlt 05:36:28 MEZ im gebauten Objekt: der Rumpf steht 2 mal (Chat-Kopf
  // und System-Status), die alte Kette 0 mal.
  ["A local program on this machine", 2],
  ["px-3 pt-2 pb-0", 1],
  ["core as one marker", 1],
  // 3.2.50, SECHS Koerper (Leitung, 24.10. 01:2x MESZ). Vier davon haben ein Wort, das der
  // Minifier woertlich laesst; zwei haben keins und das steht hier als Befund, nicht als Luecke:
  // P5-v (gruppenGlyphen) und P8b (istLokaleAdresse in Settings) sind Kennungen, die beim Bauen
  // umbenannt werden -- gemessen je 0 Treffer im Leib, eine Pruefung darauf kann nie schlagen.
  // Gegenprobe VOR dem Tausch am dann installierten 3.2.49 (49 111 921 B, mtime 00:41:46 MESZ):
  // alle vier Ketten muessen dort 0 sein.
  ["volltextScans", 1],
  ["The first one's colour wins", 1],   // 3.2.144: derselbe Befund, jetzt in Alltagsworten
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
  ["Share of painted dots per group", 1],
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
  ["No note of the core is inside this picture", 1],
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
  ["index is still filling", 1],
  // P104 (landet in 3.2.184): die drei Ansichten heissen Claims / Tree / Meaning, und die
  // Erklaerung traegt den Namen voran. Marke ist das Stueck, das im Bundel zusammenhaengt --
  // der Name selbst wird zur Laufzeit vorgesetzt. Gezaehlt am installierten 3.2.183 um
  // 12:15:16 MEZ: beide neuen Ketten 0, jede alte Kette mindestens 1 (unten in "verboten").
  ["the links as your notes claim them", 1],
  ["placed by what notes mean", 1],
  // P105 (landet in 3.2.185): ein Ding, ein Wort. Gezaehlt am installierten 3.2.184 um
  // 13:31:58 MEZ (nach dem Bau, gegen dasselbe installierte 3.2.184), latin1: jede neue Kette 0 mal, jede alte Form 1 bis 2 mal. Zwei alte Formen
  // sind trotzdem NICHT verboten, und der Grund ist eine Messung, keine Bequemlichkeit:
  // "Node not found" steht 8 mal im Objekt, unser Quelltext schreibt davon 3 -- die uebrigen
  // fuenf gehoeren pdf.js (dist/assets/pdf.worker.min-*.mjs), und ein Verbot, das wir nicht
  // besitzen, schlaegt immer faelschlich. "Saves a knowledge node, or updates one" steht 2 mal
  // und die Haelfte gehoert dem Bundel (npm/bin/kepta.js), das die Leitung am Wellenende baut
  // (Wand 4). Also: neue Form als Marke, alte Form ohne Verbot, die Luecke offen gemeldet.
  ["unfolded notes are drawn as dots", 1],
  ["core marker off: no core dot inside this picture", 1],
  ["too few core dots in this picture", 1],
  ["a dot stays where you drop it", 1],
  ["New assistant note", 1],
  ["active notes, maximum is", 1],
  ["conflicting note ids", 1],
  ["notes taken over from memories.json", 1],
  ["Note not found", 1],
  ["Extract one knowledge note from", 1],
  // P106 (landet in 3.2.186): die Anweisungsform ist jetzt im Korpus der Satz-Latten, und
  // sieben Saetze fielen durch den Riegel, fuef durch den Strich. Gezaehlt am installierten
  // 3.2.185 um 13:57:49 MEZ (latin1): jede neue Kette 0 mal, jede alte Form 1 bis 2 mal.
  // Eine Ausnahme, gemeldet statt verschwiegen: "home or temp - got" steht 0 mal im Objekt --
  // src/core/chatgpt-import.ts wird nicht ausgeliefert, also ist die Heilung dort eine
  // Quelltext-anderung ohne Byte im Bundel, und kein Marker/Verbot waehr sie.
  ["the picture places notes by meaning", 1],
  ["with no meaning-place yet", 1],
  ["What the picture starts with.", 1],
  ["tools your AI apps use", 1],
  ["is not a database at all", 1],
  ["links whose other end is outside the excerpt", 1],
  ["This excerpt is the whole picture:", 1],
  // P106-B, gemessen 14:11:10 MEZ am installierten 3.2.185: ein Gedankenstrich (U+2014) im
  // Wert von `x-kepta-hinweis` warf "Invalid character in header content" und riss 14
  // Testdateien. Kopf-Werte bleiben ASCII -- die beiden Liste-Hinweise setzen jetzt einen
  // Doppelpunkt. Marke ist der Trenner selbst, denn der Rest der Kette war schon vorher da.
  [": the whole list fits", 1],
  ["This is the heavy path: page with limit=", 1],
  // Punkt Zensur/Z-05 (die Vierer-Basis) schreibt KEINEN eignen Marker: die Heilung aendert
  // nur Zahlen (10->8, 7->8, 22->24, 5->4, 7/14->8/16) und kein Wort im Objekt. Beweis ist die
  // Messung selbst: 435 Nicht-Vier-Abstaende auf Knowledge 1440 vor der Heilung
  // (audit-2026-10-09/feldzug/belege-2710/p6-zensur-67-b/zensur.json), nach ihr die gleiche
  // Sonde erneut gefahren. Eine Zahl ist hier kein Wort, und ein Wort waere eine Behauptung.
  // Punkt 118, die zweite Haelfte (3.2.88): der Bodensatz des Beziehungs-Wortes. Gewählt
  // ohne den Gedankenstrich davor, weil die Tafel nur ASCII traegt. Gegen das installierte
  // Stueck vor dem Bau gemessen: **0** mal — der Satz existierte noch nicht.
  ["claim types stay hidden until", 1],
  // Punkt 126 (3.2.89): eine Hand legt die Behauptung hin. Vier Traeger, weil der Koerper
  // aus drei Stuecken besteht — Feld in der Oberflaeche, Absage des Feldes, Leser an der
  // Tuer. Gegen das installierte 3.2.88 gemessen (08:5x, app.asar 49 143 473 B, mtime
  // 07:15:21Z): alle vier **0** mal. Kein Marker fuer "beziehungen" als Eigenschafts-
  // schluessel: den laesst der Minifier zwar stehen, aber er ist ein Name, kein sichtbares
  // Wort — und die drei Zeilen oben sind die Flaeche, die ein Mensch trifft.
  ["Claims on this note", 1],
  ["A claim needs three parts", 1],
  ["This note claims nothing yet", 1],
  // **Kappe auf 2, nicht auf 1, mit Grund:** der Pfad steht an zwei Orten — der Leser im
  // Buendel (`src/lib/store.ts`, haelt die URL aus zwei Stuecken) und die Route am Server
  // (`server/router/memories.ts`). Gemessen am gebauten Objekt 09:29:25 MESZ: 2 Treffer.
  // Fehlt einer der beiden, sieht die Flaeche ein Feld ohne Grund, weil ihr Reader ins
  // Leere laeuft — genau die Klasse "eine Zahl, die niemand liest", nur mit einem Pfad.
  ["/behauptungen", 2],
  // Punkt 128, Stufe 1 (3.2.90): die Zeile rueckt hoeher, und ihre Hilfszeile wird ein Satz
  // kuerzer, damit der Block bei 1440 x 900 ganz in den ersten Blick passt. Gegenprobe VOR dem
  // Tausch, am dann installierten 3.2.89 (app.asar 49 152 914 B, mtime 09:44), 14:11:06 MESZ:
  // der neue Wortlaut **0** mal, der alte ("A claim is the word on the line in the graph") 1 mal.
  // Am gebauten Objekt 14:10:52 MESZ (49 152 880 B): neu 1, alt 0.
  // KEINE Marke fuer die Reihenfolge selbst: die Tafel rechnet nur Vorkommen (">="), ein Index
  // ist kein Zaehlwert. Dass das Feld vor Tags und Privat steht, traegen zwei jsdom-Faelle
  // (Folge "ITPB" vor dem Bau, "IBTP" nachher) und die beidseitige Messung am Objekt.
  ["A claim is the word on the graph line", 1],
  // Punkt 128, Stufe 3 (3.2.92): der Graph sagt an der Kopfzeile, wenn keine seiner Linien ein
  // Wort von einer Hand traegt. Gegenprobe VOR dem Bau, am installierten 3.2.91 (app.asar
  // 49 153 012 B), von derselben Sonde gelesen 15:33:09 MESZ: **0** Treffer. Im Quelltext steht
  // der Satz 1 mal (KnowledgeGraph.tsx, `handWortZeile`) — die ASCII-Mitte, weil die Tafel nur
  // ASCII traegt und der Zahlteil ("none of these 5 lines") mit der Bestandsgroesse wandert.
  ["carries a word you wrote", 1],
  // Punkt 5, erster Schlag (3.2.93): die Traeger-Zeile fragt nach der FORM, nicht mehr nach dem
  // Kommen — "where it came from" ist die Frage der Herkunfts-Achse, und eine Zahl unter dem
  // falschen Wort ist keine Auskunft. Gegenprobe VOR dem Tausch, an der installierten 3.2.92
  // (app.asar 49 153 368 B), gelesen 21:13:30 von derselben Sonde: "where it came from" **2** mal
  // (Beileitung und Gruppen-Etikett), "Sort knowledge by kind" **1** mal, "In what form" **0** mal.
  // Die Tafel rechnet nur Mindestwerte (">=") und kann eine Abwesenheit nicht bestellen — dass die
  // zwei alten Worte nach dem Tausch 0 sind, zaehlt die Leitung am Objekt nach, von Hand, im BELEG.
  ["In what form", 1],
  ["in what form", 1],
  ["Sort knowledge by form and what it is about", 1],
  // Punkt 5, Fix 4 (3.2.94): die Traeger-Zeile nennt ihren Anteil, und ein Fach unter einem
  // Zehntel Prozent sagt "< 0.1 %" statt einer gerundeten 0 %. Gegenprobe VOR dem Bau, an der
  // installierten 3.2.93 (app.asar 49 153 460 B), gelesen 23:38:54 von derselben Sonde: **0**
  // Treffer. Die Zahlen selbst (0.4 %, 52.2 %) taugen nicht als Marke — sie wachsen mit dem
  // Bestand und wandern mit jeder Landung; nur die Schwelle bleibt.
  ["< 0.1 %", 1],
  // Punkt 5, Fix 4 nach der Sichtpruefung (3.2.95): ein Fach, das fast alles fuellt, sagt
  // ">99.9 %" statt einer gerundeten 100 %, und ein einziges Fach ueberhaupt keinen Anteil.
  // Gegenprobe VOR dem Bau, am installierten 3.2.94 (app.asar 49 153 703 B), gelesen 23:59:00
  // von derselben Sonde: **0** Treffer (ihr "< 0.1 %" steht dort 1 mal, die Marke von eben).
  [">99.9 %", 1],
  // D0 (3.2.96): das Einpass-Steuer traegt eine Marke, damit die Bildstrasse es findet, ohne
  // einen Satz nachzusprechen, der eine Entscheidung ist. Gegenprobe VOR dem Bau, am
  // installierten 3.2.95, gelesen 00:54:5x von derselben Sonde: "graph-fit" **0** mal.
  ["graph-fit", 1],
  // Punkt 5, Fix 1 + 2 (3.2.97): JSON heisst Daten, die Restklasse heisst Anderes. Zwei Marken,
  // weil beide Faecher eine eigne Auskunft tragen — und weil ein Fach, das nur im Modell existiert,
  // im Bild niemand sieht. Gegenprobe VOR dem Bau, am installierten 3.2.96, gelesen 02:17:4x von
  // derselben Sonde: beide **0** Treffer.
  ["read, not run", 1],
  ["no known form", 1],
  // Punkt 124b (3.2.98): die Haufen-Groessenordnung ueber dem ganzen Bestand. Zwei Marken: die
  // Tuer selbst (`/api/graph/haufen` — ohne sie ist die Rechenstelle ein Publikum ohne Saal) und
  // der Satz, der den Erfolg nicht verkauft (`as dust, not as a division` — gemessen 13:12:48 UTC
  // an einem Bestand in seiner Form: groesstes Fach 0,02 %, Latte erfuellt, Median 1. Wer nur die
  // erste Zahl sieht, kauft eine Teilung, die keine ist). Gegenprobe VOR dem Bau, am
  // installierten 3.2.97 (app.asar 49 154 498 B, mtime 02:24), gelesen 13:15 von derselben Sonde:
  // beide **0** Treffer, wie auch `haufenFeld` und `can reach no cluster` dort 0 stehen.
  ["/api/graph/haufen", 1],
  ["as dust, not as a division", 1],
  // 3.2.99: das Feld der Haufen-Tuer heisst richtig `notizenOhneBegriff`. Gegenprobe VOR dem
  // Bau, am installierten 3.2.98 (app.asar 49 163 951 B), gelesen 14:10:32 von derselben Sonde:
  // richtig **0** Treffer, falsch geschrieben **1**. Ein Feldname ist die Verabredung, nicht ein
  // Schmuck - spaeter ist es ein Bruch statt einer Korrektur.
  ["notizenOhneBegriff", 1],
  // 3.2.100, EIN Koerper (Punkt 127, die Agenten-Pforte der Behauptung). Gegenprobe VOR dem Bau,
  // am installierten 3.2.99 (app.asar 49 163 952 B), gelesen 23:28:08 von derselben Sonde: beide
  // Ketten dort **0**. `beziehungen` selbst ist als Marke unbrauchbar und steht hier darum nicht:
  // die REST-Tuer trug das Wort schon in 3.2.99 (3 Treffer gemessen), ein Marker darauf schlage
  // durch, auch ohne diesen Koerper. Die zwei Ketten sind Woerter, die nur der Agentenvertrag
  // sagt — die Felderklaerung in der Tafel und das Feld, das die Antwort ueber den Stand nennt.
  ["send [] to remove them all", 1],
  ["claims standing on this note after the write", 1],
  // 3.2.101, EIN Koerper (Punkt 4, erste Scheibe: das Gedaechtnis des Tabs), in 3.2.103 auf den
  // Hauspraefix umbenannt. Gegenprobe VOR dem Bau, 31.10. 01:12 von derselben Sonde: installiert
  // 3.2.99 (49 163 952 B) **0**, gebaut 3.2.100 (49 168 016 B) **0**. Die naechstliegende Kette
  // ist als Marke unbrauchbar und steht darum nicht hier: `aria-pressed` traegt das Objekt schon
  // heute **26** mal (andre Schirme), ein Marker darauf schluege durch, auch ohne diesen Koerper -
  // die >=-Semantik kennt keine Abwesenheit. Weil die >=-Semantik auch den alten Namen nicht
  // verbieten kann, wird seine Abwesenheit von Hand gegen den gebauten Leib gemessen und im
  // BELEG genannt (31.10., 3.2.103): `ki_gehirn_einstellungen_tab` muss dort 0 Treffer tragen.
  ["kepta_einstellungen_tab", 1],
  // Punkt 9: der Graph gibt sein Bild heraus (Knopf "Export" an der Zoom-Reihe). Gegenprobe VOR
  // dem Bau, 31.10. 17:40:30 am installierten 3.2.103 (49 168 813 B): diese Kette dort **0**, des-
  // gleichen `graph-export`. Beide Ketten sind ASCII und kommen nur von dieser Bewegung vor.
  ["Save the graph as a PNG image", 1],
  // 3.2.104, Punkt 2, **KEINE Marke — und das ist ein Befund, keine Luecke** (dasselbe Gesetz wie
  // am 27.10. an der Tafel und am 31.10. frueh an der Trefferstufe): die Seitenleisten-Stufe hat
  // kein eignes Wort. Ihr erster Beweis war die Utility `rounded-[var(--r-btn)]` in der Bauteilkette,
  // und genau die ist wieder raus — ein Wert im Escape war fuer beide Wachen unsichtbar (die
  // Radien-Wache liest nur `src/index.css`, die Klassen-Wache verlor durch die Klammer ihren Rufer,
  // 18 Waisen wurden 19). Der Radius wohnt jetzt in der Hausregel `.sidebar-nav-btn,
  // .sidebar-tag-btn`, und dort steht er zwischen drei andern desselben Worts: jede Kette dieser
  // Art ist im Objekt schon heute vorhanden, ein Marker schlage durch, auch ohne die Bewegung.
  // Beweis ist darum die Messung am Leib: der Radius-Schenkel des Fenster-Pruefers meldet die
  // gemalten Werte, und die Gegenprobe von Hand zaehlt `borderRadius:2` (1 im Leib von 3.2.103,
  // 0 im gebauten von 3.2.104).
  // 3.2.102, KEINE Marke — und das ist ein Befund, keine Luecke (dasselbe Gesetz wie am 27.10.
  // an der Tafel): dieser Koerper aendert eine Rechnung, kein Wort. Die einzige neue Kette im
  // Quelltext ("matches \u00b7 show all") traegt einen Mittel-Punkt, den der latin1-Griff
  // zerlegt — ein Nicht-ASCII-Marker ist hier ein Dauer-Null, also abbrechen statt pruefen.
  // Beweis sind stattdessen die sechs Faelle (drei davon vor dem Bau rot, ein Biss laesst drei
  // fallen) und der Weg durch das echte Fenster (`scripts/pruefe-einstellungen-im-fenster.mjs`,
  // Zyklus "treffer"): Stufe 5 -> fuenf Zeilen, Reload, wieder fuenf.
  // 3.2.105 (Punkt 114 ohne Breite geloest, die Ausnahme der Bilanz, der Fit-Anker bei
  // decidedem Lesbarkeits-Boden): drei Literalen, am **installierten** Objekt gezaehlt
  // (app.asar 49 169 712 B, 31.10. 19:44 MESZ) — alle drei dort **0**, im gebauten dist je 1.
  // Das CSS liegt minifiziert im Leib: lightningcss macht aus den zwei Regeln eine Liste und
  // schreibt `data-legende=zu` ohne Anfuehrung, also ist die Marke die Regel, nicht ihr Wort.
  // Zwei Spuren am Schreibweg (Punkt 6, Commits 869052d und 49b9214): beide Namen stehen im
  // Schema-Text und damit im Bund. Am **installierten** 3.2.105 gezaehlt (app.asar
  // 49 170 164 B, mtime 20:18:03 MESZ, Griffe 00:46:31): beide **0** Treffer. Im gebauten Bund
  // (dist-pf1/server.cjs, 23:41) je **1**. Die Marken sind die Spuren selbst, nicht ihr Plan —
  // der Plan ist in tests/store-titel-index.test.ts und tests/store-kanten-index.test.ts gehalten.
  // Punkt 5 / A4, 1.11. (die Themen-Achse engt sich): beide Zeichenketten stehen unveraendert im
  // Bund — die Regex als Literal, der Hinweis als Wort. Gegen das installierte 3.2.106 gezaehlt
  // (app.asar 49 174 329 B, 01:59): beide **0**. Im gebauten Stand erwartet: die Regex-Endung
  // zweimal (server.cjs und das Renderer-Chunk `graph-*.js`), der Hinweis einmal.
  // Punkt 5, dritter Schritt, 1.11. (die Achse muss sich selbst pruefen koennen): beide Namen
  // sind Objekt-Schluessel im Leib der Zahl-Route und ueberleben die Minifizierung — am
  // private gebauten server.cjs (/tmp/kepta-kreuz, 13:22:21 MESZ) je **1 Zeile** gefunden. Gegen das
  // installierte 3.2.107 gezaehlt (13:24, app.asar 49 174 237 B): beide **0** — die Gegenprobe
  // steht im BELEG dieses Stands.
  ["themenNachTraeger", 1],
  ["ohneThemaNachTraeger", 1],
  // Punkt 1, Aufgabe 25, 1.11. (die Kantenmarke): die Marke liegt im Malweg, ihr Wort ist eine
  // Datensatz-Kennung - die ueberlebt den Minifier, weil er Eigenschaftsnamen nicht verbiegt.
  // Gegen das installierte 3.2.109 gezaehlt: **0** (app.asar 49 174 652 B). Zaehlung am
  // gebauten Stand steht im BELEG dieses Stands.
  ["dataset.kanten", 1],
  ["angelshop|freqtrade|shop", 1],
  ["a client, a case, a shop", 1],
  // Punkt 2, 1.11. (die Rundungsskala am Token gezogen, nicht an 247 Klassenstellen geflickt):
  // die Marke liegt im minifizierten CSS des Leibs. Im gebauten dist-p2 gezaehlt (2 Asset-Dateien,
  // index-Dqq3qlNs.css): **1**. Gegen das installierte 3.2.105 (app.asar 49 170 164 B) gezaehlt:
  // **0** — also eine Marke auf diesen Stand und nicht auf einen, der sie schon trug.
  ["--radius-lg:var(--r-btn)", 1],
  ["idx_memories_title", 1],
  ["idx_relations_memory", 1],
  ["hud-label tnum legende-zustand legende-bilanz", 1],
  [":not(.legende-bilanz)", 1],
  [".legende-griffe{display:none}", 1],
  // Punkt 4, 2.11. (die Index-Zeile bindet ihr Wort an die eigne Antwort): gemessen am
  // ausgelieferten 3.2.109 (app.asar 49 174 652 B, mtime 2026-11-01T13:10:*), vor dem Tausch
  // gezaehlt — alle drei Marken dort **0**. "In sync" und "Local storage in sync" standen dort
  // schon je 1 mal und taugen nicht als Marke: sie waren der Defekt, nicht die Heilung.
  ["No answer from the store", 1],
  ["Asking the store", 1],
  ["status-dot status-dot-leise", 1],
  // Punkt 2, 2.11. (derselbe Zustand, derselbe Sitz): der Chat-Kopf malt die Ruhe nicht mehr von
  // Hand, sondern ruft dieselbe Klasse. Gegen das installierte 3.2.109 gezaehlt: **0** fuer die
  // ganze Kette (`status-dot-leise` selbst war dort schon 0, die Kette ist die eigne Marke).
  ["-right-0.5 status-dot status-dot-leise", 1],
  // Punkt 7, 2.11. (zwei Erstleser ohne Projektkenntnis, 07:33 MESZ, derselbe Korpus, zwei
  // unabhaengige Laeufe): die Flaeche nannte Speicherschluessel, Feldschema und "node", und Today
  // schrieb "since … ago". Gegen das installierte 3.2.109 gezaehlt: alle drei **0**.
  ["pieces ready", 1],
  ["saved as a new note", 1],
  ["what happened in the last", 1],
  // Punkt 7, 2.11. (das Woerterbuch der Flaeche, 3.2.114): gegen das installierte 3.2.109 gezaehlt
  // **0** fuer jede dieser vier Ketten — die alte Flaeche sagt "entries in the index", "42 entries",
  // "Title of this entry" und "not all of your notes" nirgends.
  ["notes in the search index", 1],
  ["Title of this note", 1],
  ["notes shown", 1],
  ["not all of your notes", 1],
  // Punkt 7, 2.11. (3.2.115, der letzte Name der Sammlung): gegen das installierte 3.2.114
  // gezaehlt je **0**. "in the store" stand dort 7 mal — die Abwesenheit kann diese Liste nicht
  // ausdruecken (nur `>=`), darum beweist sie der Zyklus `saetze` am gemalten Text.
  // P197 (3.2.210): die Kette "N notes in all" hing an der Baum-Ansicht — mit
  // dem Baum ist sie aus der Quelle geflogen; das Feld sagt "in this view"/"in all".
  ["claims in all", 1],
  ["More of your notes", 1],
  // Punkt 4 und 7, 2.11. (3.2.116): gegen das installierte 3.2.115 gezaehlt je **0**.
  // Bewusste Abweichung, benannt statt verschwiegen: der Duplett-Chip heisst jetzt "No
  // duplicates" — dieser String stand im 3.2.115 schon 1 mal (der Panel-Text "No duplicates
  // found"), eine Marke darauf waere eine Pruefung, die nie schlagen kann. Sein Beweis ist
  // der Fall tests/components/dashboard-keine-duplikate-kein-befehl.test.tsx am gemalten
  // Chip, nicht ein Zaehler.
  ["No questions yet", 1],
  ["nothing is sent until you press Enter", 1],
  // Punkt 7, 2.11. (3.2.117, die Zustands-Tafel): gegen das installierte 3.2.116 gezaehlt je **0**.
  // Die Zeile "No notes yet - drop files…" waere ein Nicht-ASCII-Marker (Gedankenstrich) und ist
  // darum durch den ASCII-freien Teil derselben Zeile ersetzt — ein Nicht-ASCII-Marker zaehlt hier
  // immer 0, also keine Pruefung, sondern ein Dauer-Null.
  // ["notes stored", 1] stand hier bis zum 2.11. und hat die Landung 3.2.117 verhindert — der Tausch
  // ist nicht gefahren, das installierte Stueck blieb 3.2.116. Grund: in `{c===1?'note':'notes'} stored`
  // reisst die JSX-Interpolation die Wortfolge auseinander, das Buendel traegt `" stored"` als eignes
  // Literal und "notes stored" zusammen NIE (gemessen: 0 im gebauten 3.2.117, 0 im ausgelieferten 3.2.116).
  // Sechste Form des Dauer-Nulls: nicht die Zeichensatz-Zerlegung, sondern die Bundle-Syntax.
  // Der Ersatz ist ein echtes Literal, der title-Wert aus Dashboard.tsx:1945: 1 im gebauten
  // 3.2.117, 0 im ausgelieferten 3.2.116 — schlaegt also in beide Richtungen.
  ["Notes in the database on this computer", 1],
  ["The database on this computer", 1],
  ["searchable by meaning", 1],
  ["Encrypted on this disk", 1],
  ["drop files into the window", 1],
  // Punkt 7/4, 2.11. (3.2.118, die Klasse hinter den drei Funden): dreizehn "brain"-Stellen in
  // `grep -rni brain src`, davon neun in gemaltem Text. Zwei davon waren im Korpus von 12:28:56Z
  // unsichtbar, weil zustandsgesteuert (die warm-Streifen des Suchindex) — ihr Beweis ist darum
  // dieser Pruefer am ausgelieferten Objekt, nicht das Bild.
  // Alle zwölf gegen das installierte 3.2.116/3.2.117 gezaehlt: je **0** (gemessen 02.11. 13:36).
  // Jeder Marker ist ein zusammenhaengendes Literal im Buendel — keine Wortfolge ueber eine
  // JSX-Interpolation hinweg (die Lehre von "notes stored", oben).
  ["notes in the prompt", 1],
  ["Warming the search index", 1],
  ["Search index warm", 1],
  ["One set of notes for every AI app", 1],
  ["kept in one file on this computer", 1],
  ["Connect Claude Desktop and Cursor", 1],
  ["how many of your notes have a vector", 1],
  ["Type of this note", 1],
  ["Agents read and write the same notes over MCP", 1],
  ["a chat can leave a note behind", 1],
  ["saving your first notes", 1],
  ["Save these", 1],
  // Punkt 4, 2.11. (3.2.119, die Quittungen, die nicht fragten, ob das Werk gelang): drei
  // Stellen, von mir selbst nachgelesen, bevor hier etwas stand — Dashboard.tsx:1178 (der
  // Import-Zaehler stieg zu jeder Schreibung, gleichgueltig gegen ihr Ergebnis),
  // Dashboard.tsx:563 (der Inbox-Scan fragte `r.ok` nie und malte "undefined files scanned"
  // im gruenen Kasten), OnboardingWizard.tsx:108 (0 von 0 geretteten Notizen stand gruen,
  // und der Schirm schloss sich trotzdem). Gegen das installierte 3.2.118 gezaehlt: je **0**
  // (gemessen 02.11. 14:26). Die Zeile des TEILERFOLGS ("N of M notes saved") hat hier
  // keinen Platz: die Interpolation zerlegt sie, und "notes saved" stand schon im 118er
  // Objekt — sie haelt allein der Fall in tests/components/quittung-ohne-beweis.test.tsx.
  ["Nothing was saved", 1],
  ["refused every note", 1],
  ["the store answered", 1],
  ["carried no counts", 1],
  ["notes came through", 1],
  ["One page of 100 notes", 1],
  // Punkt 4, 2.11. (3.2.120, vier Fehlerpfade ohne Grund): gegen das installierte 3.2.118
  // gezaehlt je **0** (gemessen 02.11. 15:03). Die Inbox-Zeile ist derselbe Zug wie die Tuer
  // von 3.2.111: ein ausstehender Messwert ist ein Zustand, kein "ich lade noch" fuer immer.
  ["More entries did not arrive", 1],
  ["The seal check did not run", 1],
  // 3.2.120 setzte "the answer was empty" als Marker fuer die Zeile "ein ausstehender Messwert
  // ist ein Zustand". P47/#47 (3.2.131) macht aus dem internen Wortlaut einen Satz fuer den
  // Menschen: TodayView wirft jetzt "Today's briefing came back empty." Gezaehlt am gebauten
  // 3.2.131 (18:30 MEZ): alte Form 0, neue Form 1 — dieselbe Auskunft, in menschenleslicher
  // Hand. Der Fall, der die Zeile prueft, bleibt tests/components/quittung-ohne-beweis.test.tsx
  // und die EnterpriseViews-Faelle in tests/components/EnterpriseViews.test.tsx.
  ["Today's briefing came back empty", 1],
  ["No answer from the inbox", 1],
  // P51/#21, 3.11. abend (3.2.132): die Vektor-Spur traegt nach, statt neu zu bauen. Dafuer
  // hat der Store einen dritten Zaehler, und sein Name ist ein String-Literal — also im Koerper
  // pruefbar. Gegen das installierte 3.2.131 gezaehlt (app.asar 49 185 874 B, bytes.count(),
  // 3.11. 19:21 MEZ): **0** mal. Die Zahl "deltapatches" taugt hier NICHT als Marke: sie stand
  // schon 4 mal im Koerper, weil der Kandidaten-Vorrat sie seit #104 ebenso zaehlt — ein Marker
  // mit vorher 4 waere keine Pruefung, sondern eine Dekoration.
  ["embed_generation", 1],
  // #31 Fehler-Feger, 3.11. spaet (3.2.133): ein Profil, das nicht in die Anfrage kam, war
  // bis hierhin spurlos — `catch {}` ohne Wort. Gezaehlt gegen das installierte 3.2.132
  // (app.asar 49 192 281 B, bytes.count()): **0** mal. Die dazugehoerige Zwischenablage-
  // Meldung in der Vorschau braucht keine eigene Marke: ihr Wortlaut ist seit 3.2.129 im
  // Koerper (chat) und wird dort schon gehalten.
  ["user profile did not reach the prompt", 1],
  // #31 Fehler-Feger, zweiter Griff (3.2.134): zwei eigne Einstellungen — die gewaehlte
  // KI-Verbindung und das Profil — verschwanden wortlos, wenn sie nicht zu lesen waren.
  // Gezaehlt gegen das installierte 3.2.133 (app.asar 49 192 436 B, bytes.count()):
  // beide Wortlaute **0** mal.
  ["stored AI settings could not be read", 1],
  ["stored profile could not be read", 1],
  // #31, dritter Griff (3.2.135): die Sonde nach einem alten Schluessel meldete "kein Fund",
  // wenn die Tuer nicht antwortete. Gezaehlt gegen das installierte 3.2.134
  // (app.asar 49 192 617 B, bytes.count()): **0** mal.
  ["legacy key check did not answer", 1],
  // #31, vierter Griff (3.2.136): der Rueckweg der eignen Verbindung in drei stillen
  // Faellen — Tuer nicht erreichbar, Tuer weist ab, Spiegel da aber unlesbar. Gezaehlt
  // gegen das installierte 3.2.135 (app.asar 49 192 748 B, bytes.count()): alle drei
  // Wortlaute **0** mal.
  ["mirrored AI settings could not be read", 1],
  ["settings door refused", 1],
  ["own AI settings could not be restored", 1],
  // #31, fuenfter Griff (3.2.138): der Umschlag und die Versiegelungs-Sonde. Beide sagten
  // "keinen Schluessel", wenn sie nicht fragen oder nicht aufmachen konnten. Gezaehlt gegen
  // das installierte 3.2.137 (app.asar 49 193 142 B, bytes.count()): beide **0** mal.
  ["stored key could not be opened", 1],
  ["sealing check did not answer", 1],
  // Punkt 7, 4.11. (3.2.139, jedes Etikett erklaert sein eignes Wort): die sechs Saetze
  // sind die Traeger der Erklaerung, gezaehlt gegen das installierte 3.2.138
  // (app.asar 49 193 564 B, bytes.count()): alle sechs **0** mal. Die zwei Saetze, die
  // sie ersetzen, stehen unten in der verbotenen Liste.
  ["Knowledge is everything you have saved", 1],
  ["A Dossier is a written brief", 1],
  ["Activity lists every thing K3PTA did", 1],
  // P99: derselbe Satz, jetzt mit der Kappe getragen. Der alten Marke war dieses Fragment
  // -- ein Kuerzer, das nur im alten Titel stand (gemessen im Bau 10:20:06 MEZ: 0).
  ["Searches the meaning of your question", 1],
  ["The audit log is the sealed list", 1],
  ["Follows the people, projects and systems", 1],
  // Punkt 1/4/7, 2.11. (3.2.121, zwei Quellen, die ohne Wort wechselten): gegen das
  // installierte 3.2.120 gezaehlt je **0** (gemessen 02.11. 16:30:05). Beide Saetze sind
  // zustandsgesteuert — die antwortende Kapsel malt sie nie —, darum ist der Marker hier
  // der Beweis am Objekt und nicht ein Bild.
  ["entity links did not arrive", 1],
  ["Local ranking", 1],
  ["not from the semantic", 1],
  ["every note you use", 1],
  ["notes are loaded right now", 1],
  ["notes (token budget", 1],
  // Punkt 4, 2.11. abend (3.2.122, drei Einstellungen, die abgewiesen wurden und gespeichert
  // aussahen): gegen das installierte 3.2.121 gezaehlt je **0** (gemessen 02.11. 17:03:05).
  // Alle vier sind Zustandstexte — eine antwortende Kapsel malt keinen davon —, also ist der
  // Marker hier der Beweis am Objekt und der Fall in tests/components/einstellung-verweigert.test.tsx
  // die Heilung.
  ["Your choice did not stick", 1],
  ["the scan did not answer", 1],
  ["Models could not be loaded", 1],
  ["Suggestions did not arrive", 1],
  // Punkt 4/7, 2.11. abend (3.2.123, die Absage, die wie eine Leere aussah): gegen das
  // installierte 3.2.122 gezaehlt je **0** (gemessen 02.11. 17:44:58). Wieder Zustandstexte —
  // eine antwortende Kapsel malt "did not answer" nie, also haelt sie der Marker am Objekt.
  ["The journal did not answer", 1],
  ["No AI app has read this note", 1],
  ["the audit log did not answer", 1],
  ["Earlier versions could not be read", 1],
  // Punkt 4/8, 2.11. nacht (3.2.124, die Egress-Scheibe): das Fenster darf nichts nach aussen
  // rufen, was nicht sein eigner Rechner ist, und ein fernes Bild in einer Modell-Antwort wird
  // nicht still verschluckt, sondern benannt abgewiesen. Gegen das installierte 3.2.123
  // (app.asar 49 180 861 B, mtime 02.11. 17:54) gezaehlt: alle fuenf Marken **0mal**
  // (gemessen 23:47:41 mit LC_ALL=C grep -aoc). Der Gegenbeweis liegt ausserhalb dieser Liste,
  // weil sie nur ">=" kennt: die alte CSP-Zeile Stueck fuer Stueck
  // "http://127.0.0.1:* https:; connect-src" steht dort **1** mal und muss nach dem Tausch 0
  // mal stehen — ein Zaun, der nur breiter gemacht wurde, ist keine Aenderung.
  ["Remote image not loaded", 1],
  ["keeps this window local", 1],
  ["bild-abgewiesen", 1],
  ["Open in browser:", 1],
  ["img-src 'self' data: http://localhost:* http://127.0.0.1:*; connect-src", 1],
  // Punkt 3/4/7, 3.11. morgen (3.2.125, Aufgabe #43): die Verbindungsmeldung des Chats
  // muss sagen, was sie gemessen hat. Gegen das installierte 3.2.124 gezaehlt: alle vier
  // Marken **0** mal (gemessen 06:4x, LC_ALL=C grep -aFo). Der Beweis der andern Seite ist
  // die Sonde scripts/egress-im-fenster.mjs --anbieter custom --basis <gelieferte Flaeche>:
  // sie meldete am Objekt "No AI connected", wo dieselbe Adresse durch die eigne Tuer
  // antwortete, und nach der Heilung nennt sie die Verbindung beim Namen.
  ["The model program is not answering", 1],
  ["sent no list of models", 1],
  ["has no models loaded yet", 1],
  ["chat-verbindung", 1],
  // Punkt 7/8, 3.11. nachmittag (3.2.126, Aufgabe #42): die Flaeche versprach
  // Sprachkenntnis, die kein Lauf gemessen hatte. Der Lauf jetzt
  // (docs/belege/tag-0311/sprachuebergriff-nomic-1406.log.txt) meldet 4 von 15, also nennt
  // die Zeile eine Zahl statt eines Wunsches. Gegen das installierte 3.2.125 gezaehlt
  // (app.asar 49 183 453 B, mtime 03.11. 06:42, LC_ALL=C grep -aFo | wc -l, 14:1x): die drei
  // neuen Marken **0** mal. Der Beweis der andern Seite steht ausserhalb dieser Liste, weil
  // sie nur ">=" kennt: die beiden alten Saetze "Semantic similarity across languages" und
  // "with vectors it is stronger across languages too" stehen dort je **1** mal und muessen
  // nach dem Tausch **0** mal stehen — sonst ist die Korrektur nur ueber der Zahl, nicht ueber
  // dem Wort.
  ["Meaning, not only the exact words", 1],
  ["it does not bridge languages", 1],
  ["found 4 of 15", 1],
  // Punkt 4, 3.11. nachmittag (3.2.127, Aufgabe #45): ein Ollama, ein Loeser. Vorher lasen
  // drei Stellen zwei verschiedene Umgebungs-Knoepfe, und die Zustands-Tafel konnte einen
  // Dienst melden, den der Einbett-Lauf nicht benutzte. Gegen das installierte 3.2.126
  // gezaehlt (app.asar 49 183 551 B, LC_ALL=C grep -aFo | wc -l, 15:44:32): der neue Loeser
  // **0** mal. Die erste Fassung dieser Marke (`KEPTA_OLLAMA_URL||process.env.OLLAMA_HOST`)
  // war **1** mal — schon am alten Objekt, weil die Modelle-Liste denselben Anfang hatte. Eine
  // Marke, die das alte Objekt auch erfuellt, beweist nichts; sie ist ersetzt durch den Schwanz,
  // den nur der eine Loeser schreibt. Der Gegenbeweis steht wieder ausserhalb dieser Liste:
  // die Einbett-Route mit ihrem einzigen Namen `process.env.OLLAMA_HOST||"http://localhost:11434"`
  // steht **2** mal und die Modelle-Liste mit drei Namen
  // `KEPTA_OLLAMA_URL||process.env.OLLAMA_HOST||"http://localhost:11434"` **1** mal — beide
  // muessen nach dem Tausch **0** mal stehen, sonst ist aus drei Lesern nur ein vierter
  // gemacht worden.
  ['process.env.OLLAMA_HOST||"http://127.0.0.1:11434"', 1],
  // Punkt 4, 3.11. spaetnachmittag (3.2.128, Aufgabe #46): die Tuer unterschreibt jede
  // Antwort, damit ein fremder Hoerer nicht als eigne durchgeht. Gegen das installierte
  // 3.2.127 gezaehlt (app.asar 49 183 620 B, LC_ALL=C grep -aFo | wc -l, 16:38:37): **0** mal.
  // Der Gegenbeweis liegt wieder ausserhalb dieser Liste: die Marke muss im
  // Server-Buendel stehen UND vor dem Rechner-Zaun montiert sein — die zweite Seite prueft
  // tests/server-marke.test.ts am Quelltext, weil ein Zaun, der erst nach der Schranke
  // steht, die 401-Absagen unteschrieben liesse.
  ["x-kepta-marke", 1],
  // Punkt 4, 3.11. abend (3.2.129, P4-UEBRIGE-VIER Punkte 1, 3, 4): drei stille Pfade
  // nennen jetzt ihre Ursache. Gegen das installierte 3.2.128 gezaehlt (app.asar
  // 49 183 715 B, LC_ALL=C grep -aFo | wc -l, 17:01:35): alle drei **0** mal. Der
  // Gegenbeweis steht wieder ausserhalb dieser Liste: das alte Wort
  // "your browser did not allow access" steht **1** mal und muss nach dem Tausch **0**
  // mal stehen — eine Absage, die nur um eine Zeile reicher ist, waere keine Heilung.
  // Die Saetze sind in zwei Haelften geteilt, wie im Haus ueblich: ein Marker ueber ein
  // U+2014 wird in latin1 nicht gefunden.
  ["the window did not get the clipboard", 1],
  ["The scan rules did not arrive", 2],
  // P80 (3.2.169): die Onboarding-Absage war 25 Woerter lang und damit ausserhalb der Kappe,
  // die der Census seit 3.2.139 an der Flaeche misst -- und sie war dem Raster unsichtbar,
  // weil ihr Semikolon und ihr U+2014 sie als Code aussehen liessen. Neu: 14 Woerter, ASCII.
  ["Next start asks again", 1],
  // P80, zweite Stelle: der Inhaltsgate meldete um 23:39:55 MEZ "ZU VIEL 1" fuer die
  // verbotene K3PTA-Absage -- server/router/chat.ts:187 trug denselben alten Wortlaut wie
  // src/lib/tuergrund.ts. Heilung ist eine Klasse, nicht ein Fund: beide Stellen jetzt
  // gleich, 9 Woerter, eigne Marke am Gebauten (1 mal im Server-Bund).
  ["the server log keeps the reason", 1],
  // P81 (3.2.170): das More-Menue des Graphen verspricht eine Zahl und haelt Glieder --
  // gemessen 6.11.2026 00:07:23 MEZ im Fenster waren 13 Glieder sichtbar und eines ohne Auskunft
  // ("datum", die Weiche fiel auf `default: return ""`). Die Erklaerung ist jetzt Text,
  // 12 Woerter, und der neue Zyklus `erklaerungen` meldet jedes stumme Glied beim Namen.
  ["The day the picture is read from", 1],
  // P81b (3.2.171): die zweite stumme Menue-Stelle, bei 390 px gefunden (gemessen
  // 6.11.2026 00:19:31 MEZ: 17 Glieder, `zeitregler` ohne Auskunft; am installierten
  // 3.2.170 stand der neue Satz dort 0 mal). Gezaehlt am installierten 3.2.171: 1 mal.
  ["right is today, applied on release", 1],
  // P82 (3.2.172): `server/` ist eine Census-Lage geworden, weil fuenf Stellen den Leib
  // einer Antwort in die Flaeche schreiben (Settings.tsx:340 und :379, Chat.tsx:680,
  // store.ts:327 und :489). Gezaehlt am installierten 3.2.171 (6.11.2026 00:34:11 MEZ,
  // latin1): die vier alten Kurzfassungen 1, 2, 1, 1 mal; die neuen Enden 0 mal. Im
  // gebauten 3.2.172 kehrt sich das um.
  ["so nothing was restored", 1],
  ["Batching is gone from MCP 2026-07-28", 1],
  ["there was nothing to embed", 1],
  ["more than 5000 notes", 1],
  // Punkt 4, 3.11. abend (3.2.130, Aufgabe #47): ein Import-Fehler druckte den
  // Ausnahmewortlaut auf den Knopf, im Testlauf samt Pfad. Nach aussen geht jetzt ein
  // fester Satz. Gegen das installierte 3.2.129 gezaehlt (app.asar 49 184 866 B,
  // bytes.count() ueber den ganzen Koerper, 2026-11-03 17:56 MEZ, Beleg
  // `belege-0311/landung-130/marker-paar-am-objekt.txt` in der Mappe): **0** mal. Die
  // andre Seite des Beweises ist das Bild aus scripts/pfade-im-fenster.mjs: dort stand der
  // Wortlaut sichtbar auf der Flaeche.
  ["Import did not run", 1],
  // P47/#47, 3.11. 18:30 (3.2.131): die Klasse, nicht der Einzelfall. 25 Stellen gaben
  // einer Ausnahme ihren Wortlaut direkt an die Flaeche; seit dieser Landung laeuft jede
  // ueber absage(satz, e) aus src/lib/absage.ts. Gezaehlt gegen das installierte 3.2.130
  // (app.asar 49 184 982 B, bytes.count(), 2026-11-03 18:22 MEZ): alle sechs **0** mal.
  ["That decision was not recorded", 1],
  ["The recovery key could not be shown", 1],
  ["The switch did not stay", 1],
  ["The activity list did not arrive", 1],
  ["The answer stopped partway", 1],
  ["No answer from that service", 1],
  // Punkt 6, 4.11. (3.2.140): das Entity-Bein fragt die Stuecke der ANFRAGE gegen den
  // Namensindex, statt die Rangfolge aller Begriffe durchzugehen. Gezaehlt am gebauten Bund
  // dieses Baums (dist-pf1/server.cjs, gebaut 01:41, gezaehlt 02:04 MEZ am 4.11.):
  // "begriffeImWortlaut" 2 mal,
  // "graphRang" 2 mal (die Rangfolge bleibt dem Graphfenster), "entityNamen" 0 mal. Am
  // installierten 3.2.139: "begriffeImWortlaut" 0 mal, "entityNamen" 2 mal.
  ["begriffeImWortlaut", 1],
  // Punkt 6 / Aufgabe #53, 4.11. (3.2.142): die Vektor-Spur prueft ihren Nachtrag an einer
  // Zahl, die sie vorher nicht kannte. Gezaehlt am gebauten Bund des Baums (dist-pf1,
  // 05:50 MEZ): "vektorZeilen" 2 mal. Am zurueckgelegten 3.2.140-Bund (dist-pf1-vor,
  // ausgepackt aus /tmp/K3PTA-vor-3.2.141.app): 0 mal.
  ["vektorZeilen", 1],
  // Punkt 1 / Aufgabe #51, 4.11. (3.2.143): der Rat zur Zahl der Linien ohne Wort steht nicht
  // mehr in der Kopfzeile, sondern in einer eignen Zeile hinter der Klappe - sonst reisst die
  // zugeklappte Legende die Latte von P114 (28.5 % gegen 25 %, gemessen am Objekt 06:07 MEZ).
  // Gezaehlt am gebauten Renderer (dist/assets, 06:11 MEZ): die kurze Zahl bleibt **1** mal,
  // der Rat ist **1** mal neu, die alte Lange in der Kopfzeile ist **0** mal.
  ["Name a claim in a note to put a word on a line", 1],
  // Punkt 4 / Aufgabe #60, 5.11. 09:47 MEZ (3.2.153): die Gesundheits-Tuer nennt ihre Zahl, und
  // die Zeile, die den Grund traegt, wird gemalt. Gezaehlt am installierten 3.2.152 (app.asar
  // 49 200 848 B, 09:46:35 MEZ, bytes.count() in latin1): "The health check did not arrive" **0**
  // mal, "settings-health-grund" **0** mal. Die Marke ist die Zeile selbst, nicht das Wort: ein
  // Zustand, den keine Flaeche malt, ist im Objekt unsichtbar und darum keine Pruefung.
  ["The health check did not arrive", 1],
  ["settings-health-grund", 1],
  // Punkt 4 / Aufgabe #61, 5.11. 12:12 MEZ (3.2.154): die dritte Census-Runde fand sechs Wege,
  // die den Koerper vor der Antwort lasen -- ein HTML-Fehlerblatt warf beim JSON-Lesen, und die
  // eigne Zahl der Tuer ging im Fang unter. Jetzt nennt jeder Weg sie, und jeder sagt aus, wenn
  // eine 200-Antwort ohne lesbaren Text ankommt. Gezaehlt am installierten 3.2.153 (asar
  // 49 201 094 B, 12:11 MEZ, bytes.count() in latin1): "arrived without readable text" **0** mal
  // (fuenf Saetze dieser Form sind neu, die Sonde haelt die Untergrenze 1).
  ["arrived without readable text", 1],
  // Punkt 4 / Aufgabe #61, 5.11. 12:28 MEZ (3.2.155): der Papierkorb-Zaehler unterschied nicht
  // "nicht gelesen" von "gelesen: null". Gezaehlt am installierten 3.2.154 (asar 49 201 527 B,
  // 12:27:36 MEZ, bytes.count() in latin1): "The count did not arrive in this answer" **0** mal.
  // Die Knopf-Zeile selbst ("Trash — the count did not arrive") taugt nicht als Marke: sie traegt
  // einen echten Gedankenstrich, und die Sonde bricht mit EXIT 2 ueber einem Nicht-ASCII-Marker.
  ["The count did not arrive in this answer", 1],
  // Punkt 4 / Aufgabe #61 und Punkt 7, 5.11. 12:58 MEZ (3.2.157): der Grund des lokalen
  // Rankings hat drei Zweige bekommen. Gezaehlt am installierten 3.2.154 (asar 49 201 527 B,
  // 12:57 MEZ, Sekunde nicht gemessen, bytes.count() in latin1): "the search index answered without a list" **0** mal.
  ["the search index answered without a list", 1],
  // Punkt 4 / Aufgabe #31, 5.11. 15:13:16 MEZ (3.2.160): die Objekt-Sonde kannte das
  // Verbot der Konsole nur in Kleinschreibung, das Objekt trug denselben Wortlaut mit
  // grosssem Anfang zweimal (Dashboard.tsx:1242, SystemStatus.tsx:181). Jetzt nennt die
  // Import-Quittung ihre eigne Zaehlung, und die Sonde faehrt jedes verbotene Muster in
  // beiden Anfangsformen. Gezaehlt am installierten 3.2.160 vor der Heilung: beide neuen
  // Saetze 0 mal.
  // Punkt 5 / Aufgabe #63, 5.11. 15:38 MEZ an seinem Bestand (21 064 Notizen, durch die
  // eigne Tuer gemessen): die Themen-Achse ist die einzige, die in vier Faelle zwischen
  // 7,90 und 48,38 % teilt. Neu an der Flaeche: der Gruppenknopf und die benannte Gruppe.
  ["By topic", 1],
  ["No topic yet", 1],
  ["No note was written", 1],
  ["What is saved stays in your notes", 1],
  // Punkt 4 / Aufgabe #31, 5.11.2026 20:30 MEZ (3.2.165): ein halber Import nannte nur die
  // Schreibungen, obwohl die zweite Datei nie gelesen wurde. Gezaehlt am installierten
  // 3.2.164 (asar 49 202 497 B): "left unread" dort 0 mal -- der Satz existierte nicht.
  ["left unread", 1],
  // Punkt 4 / Aufgabe #59, 4.11. 23:46 MEZ (3.2.152): die Herkunfts-Kante gilt an allen fuenf
  // Absage-Stellen, nicht nur im Helfer. Gezaehlt am installierten 3.2.151 (app.asar
  // 49 200 864 B, mtime 22:26:45 MEZ, bytes.count() in latin1): "the wording of this thrower
  // stays in the log" dort **0** mal — der Satz schreibt das Protokoll, seit der Grund im
  // Speicher gefiltert wird. Keine der andern neuen Zeilen taugt als Marke: "Could not read the
  // claims of this note" steht schon **1** mal im alten Objekt (ihr Satz verlor nur den
  // Klammer-Inhalt), und "antwortKlausel" ist eine Kennung, die der Minifier verbiegt.
  ["the wording of this thrower stays in the log", 1],
  // Punkt 7 / P78, 5.11.2026 21:05 MEZ (3.2.167): die Werkzeug-Lage nannte Fachwoerter ohne
  // Grund, und ihr Leser ist ein Modell. Gezaehlt am installierten 3.2.166 (app.asar
  // 49 200 667 B) gegen das gebaute 3.2.167 (49 200 915 B), latin1: "so answers stay small"
  // 0 -> 2, "use 1 for a quick lookup" 0 -> 2, "the model answered fewer vectors than lines"
  // 0 -> 2. Zwei der drei alten Woerter konnten nicht verboten werden, weil sie Vorsilben der
  // neuen sind: "Graph depth 1-4, default 2" steht 2 mal in beiden, "Embedding count does not
  // match" ebenso -- darum buergen hier die neuen Enden, und die alte memory_graph-Zeile ist
  // unten in `verboten`.
  ["so answers stay small", 1],
  ["use 1 for a quick lookup", 1],
  ["the model answered fewer vectors than lines", 1],
  // P83 (3.2.173): die 20-px-Stufe hat eine Utility und einen Rufer; der eine Sitz,
  // der sie bisher unter Tailwinds Namen nannte (`text-xl`, DossierView.tsx:232), heisst
  // jetzt `fs-6 lh-dicht`. Gezaehlt am installierten 3.2.172 (app.asar 49 200 999 B, latin1,
  // Leerstand zusammengezogen, 6.11.2026 01:11:04 MEZ): "fs-6 lh-dicht" 0 mal,
  // "text-xl font-semibold" 1 mal. Die beiden nackten Woerter zaehlen je 1 -- es sind die
  // Token-Namen --fs-6 und --lh-dicht; nur das Paar ist ein Sitz, darum ist es die Marke.
  ["fs-6 lh-dicht", 1],
  // P84 (3.2.174): der Sweep -- 262 Groessensitze und 40 Zeilenmassen-Sitze heissen jetzt
  // Leiter. Gezaehlt am installierten 3.2.173 (latin1, Leerstand zusammengezogen,
  // 6.11.2026 01:26:36 MEZ): "fs-2 lh-dicht" 0, "fs-4 lh-lesbar" 0, "fs-5 lh-lesbar" 0,
  // "lh-marke" 0, "lh-prosa" 1 (das ist der Token --lh-prosa, kein Sitz). Die Unterzahl ist
  // die Zeilenzahl in src, gemessen 01:27:13 MEZ: 105 / 126 / 6 / 2 / 35.
  // Kein Verbot der nackten Woerter "text-xs", "text-sm", "leading-relaxed" hier: gemessen
  // 01:26:59 MEZ stehen sie im ausgelieferten Stueck 132 / 134 / 37 mal, und die Funde sind
  // nicht unsre -- Tailwinds eigne Variablen (--text-xs, .text-xs-Regel, --line-height) und
  // ein Fremd-Baustein im Bundel mit `className:"text-xs font-semibold px-3 py-..."`. Ein
  // Verbot, das wir nicht besitzen, waere eine Marke, die immer faelschlich schlaegt.
  // Gate der Sitze ist tests/leitern-in-den-bausteinen.test.ts, und das zaehlt nur src.
  ["fs-2 lh-dicht", 100],
  ["fs-4 lh-lesbar", 120],
  ["fs-5 lh-lesbar", 6],
  ["lh-marke", 2],
  ["lh-prosa", 30],
  // P90 (3.2.178): die Gefahr-Farbe ist ein Token, kein Rahmenwerk-Griff. Gezaehlt am
  // installierten 3.2.177 (latin1, Leerstand zusammengezogen, 04:14:56 MEZ):
  // "hover:!border-gefahr" 0 mal, "--color-gefahr" 0 mal, "border-red-500/40" 1 mal.
  ["hover:!border-gefahr", 1],
  ["--color-gefahr", 1],
  // P93 (3.2.179): die Treffflaeche eines Knopfs ohne Wort. Gezaehlt im gebauten Bund
  // (dist, dieselbe Normalisierung, 05:07:00 MEZ): ".treff:after" 1, "--treff:44px" 1,
  // "btn-ghost treff" 4 (Loesch-Knopf, Zoom her, Zoom ran, Papierkorb), "seiten-knopf treff
  // w-9 h-9" 1 (Diener), "seiten-knopf-einrichten treff" 1 (Richtknopf), "btn-primary treff"
  // 1 (Senden). Sieben Sitze, und die Regel selbst ist im CSS -- ein Name ohne Regel faellt
  // seit P89 die Landung, eine Regel ohne Rufer seit P83 ebenso.
  [".treff:after", 1],
  ["--treff:44px", 1],
  ["btn-ghost treff", 4],
  ["btn-primary treff", 1],
  ["seiten-knopf treff w-9 h-9", 1],
  ["seiten-knopf-einrichten treff", 1],
  // P94 (3.2.180): der Gedankenstrich des Hauses in sechs Saetzen, die ein Mensch liest.
  // Ein Marker darf hier kein Nicht-ASCII-Zeichen tragen (die latin1-Lesung zerlegt es in
  // Bytes, ihre Zaehlung waere eine Dauer-Null), also gilt der Beweis von beiden Seiten:
  // der Schwanz des Satzes muss stehen (unten), und die alte Form mit Bindestrich muss
  // weg sein (in der Verbotsliste). Die zwei Server-Saetze sind die Ausnahme: esbuild
  // schreibt den Strich dort als Escape, und das Escape ist ASCII -- also kann die neue
  // Form selbst gemarkt werden. Gezaehlt im gebauten Stand 05:33:36 MEZ.
  ["no key needed.", 2],
  ["keep scrolling", 1],
  ["the number is off because nothing of it is here", 1],
  ["write the first one below, it saves with the note", 1],
  ["earlier stand yet \\u2014 it has not been edited", 1],
  ["claims nothing yet \\u2014 the graph draws only mentions", 1],
  // P86 (3.2.176): die Farb-Sitze heissen wie im Vertrag, und der Rahmenwerk-Scanner ist
  // gesetzt. Gezaehlt am installierten 3.2.175 (latin1, Leerstand zusammengezogen,
  // 6.11.2026 02:41:07 MEZ): "bg-knopf" 0, "bg-blatt" 0, das Paar "bg-white dark:bg-zinc-800"
  // 4, das Paar "text-zinc-900 dark:text-zinc-100" 1. Die nackten Woerter bleiben ungeprueft
  // -- 14 mal bg-white und 5 mal text-xs im Objekt sind Fremd-Baustein und Tailwinds eigne
  // Variablen, gemessen 01:26:59 MEZ; ein Verbot, das wir nicht besitzen, schlaegt immer
  // faelschlich. Die Paare dagegen schreibt nur unser Quelltext.
  ["bg-knopf", 5],
  ["bg-blatt", 4],
  // Punkt 7 / P79, 5.11.2026 22:39 MEZ (3.2.168): der depth-Satz von 3.2.167 war dem Riegel
  // entglitten -- sein Semikolon trifft die Code-Kante der Sonde, also zaehlt er nicht und
  // kann nichts melden. Nachgewiesen an drei Formen: alt ohne Semikolon Kandidat, mit
  // Semikolon verworfen, mit Komma und "and" Kandidat. Gezaehlt am installierten 3.2.167
  // (app.asar 49 200 915 B, latin1): "default 2, and use 1" 0 mal, "default 2; use 1" 2 mal.
  ["default 2, and use 1 for a quick lookup", 1],
  // P80 (3.2.169), gemessen 23:22 MEZ an der Quelle: die Sonde sah neun Flaechen-Saetze und
  // zwei Werkzeug-Beschreibungen nicht, weil ihr Semikolon, ihr Gleichheitszeichen oder ihre
  // Klammer sie als Code lesen liess. Nach dem Raster-Fix (Satzgestalt schuetzt) sind sie
  // da -- und jeder Satz wurde kuerzer oder bekommt seinen Grund. Gezaehlt am installierten
  // 3.2.168 (app.asar 49 200 923 B, latin1) sind die neuen Enden 0 mal, und die alten Formen
  // unten in `verboten` stehen dort 1 mal (die neun Flaechen-Saetze, ein Bund) bzw. 2 mal
  // (K3PTA-Absage, memory_search, memory_save -- in zwei Bunds). Am gebauten 3.2.169 kehrt
  // sich das um: neue Enden je 1 bis 2, alte Formen 0.
  ["Under 50 % the legend says why", 1],
  ["Unexpected rule shape, so none were read", 1],
  ["this view shows, never edits", 1],
  ["The logs keep it.", 1],
  ["the logs say why. Ask again or pick another model", 1],
  ["the logs show the rest", 1],
  ["Pick its conversations.json", 1],
  ["Searches your notes three ways at once", 1],
  ["so a name you write joins the graph on its own", 1],
  // P116 (landet in 3.2.190): ein Satz ueber einem alten Schluessel trug 24 Woerter in
  // einem Feld, das kein Muster las -- drei Saetze draus, jeder unter der Kappe.
  // Gezaehlt am installierten 3.2.189 um 18:12:30 MEZ (latin1): jede neue Kette 0 mal,
  // die alte Form 1 mal (sie steht unten in `verboten`).
  ["Nothing was carried across, and nothing was deleted.", 1],
  ["Enter the key once to seal it.", 1],
  // P117 (landet in 3.2.191): die Graph-Zeile endet nicht mehr auf einem nackten
  // Bindestrich an der Fuge zu ihrem naechsten Feld. Gezaehlt am installierten 3.2.190
  // um 18:27:40 MEZ (latin1): neue Kette 0 mal, alte Kette 1 mal (unten in `verboten`).
  ["claims reach this picture; ", 1],
  // P120: der trefferlose Such-Hinweis ist eine Auskunft der FLAECHe, nicht nur des
  // Quelltextes. Gezaehlt am installierten 3.2.190 um 19:33:42 MEZ (latin1): die Kette
  // steht 1 mal. Der Ledger-Satz "die Flaeche erklaert den leeren Zustand" gilt damit
  // nur, solange das Bundel sie traegt -- und die Kette prueft es bei jeder Landung.
  ["Try different terms, raise the result count, or switch to keyword search", 1],
];

// Was NICHT mehr drin sein darf. Bisher war "der alte Wortlaut ist weg" eine Behauptung im
// Kommentar ueber dem neuen Marker und keine Pruefung — diese Liste macht sie maschinell.
// Aufgenommen ist nur, was eine bewusste Landung ersetzt hat, mit ihrem Schnitt dahinter.
const verboten = [
  // P99 (landet in 3.2.181): die fuenf alten Wortlaute der gekuerzten Hover-Titel. Sie sind
  // hier, weil ein gekuerzter Satz, der am alten Wortlaut im Objekt haengt, keine Kuerzung
  // ist, sondern ein zweiter Text. Gezaehlt am **installierten** 3.2.180 vor dem Tausch:
  // jede dieser Ketten muss dort 1 sein (Gegenprobe, see the run log of 10:10 MEZ).
  "Ask this machine whether Ollama or LM Studio is running",
  "found 4 of 15. Embeddings",
  "Semantic search looks for the meaning",
  "the position in each retrieval track",
  "The vector index is still being built in the background",
  "from now on, every saved note only patches it",
  // bis 3.2.130 Prafix an drei Flaechen (TodayView, DossierView, und der Wortlaut des
  // Schalter-Fangs); P47/#47 nennt jetzt an jeder Stelle, WAS nicht geschah. Am
  // installierten 3.2.130 gezaehlt 2026-11-03 18:22 MEZ: "That did not work" 2 mal,
  // "The switch could not be saved" 1 mal, "Today could not be loaded" 1 mal.
  "That did not work",
  "The switch could not be saved",
  "Today could not be loaded",
  // Punkt 7 (3.2.139): die beiden Saetze waren die Fachwort-Alleingaenger — "entities"
  // ohne Erklaerung an der Graph-Spur, und "Local storage in sync" als Titel ueber dem
  // Sync-Punkt. Gezaehlt gegen das installierte 3.2.138: beide **1** mal; gegen das
  // gebaute 3.2.139: beide **0** mal.
  "Mentions of knowledge entities",
  "Local storage in sync",
  // Punkt 6 (3.2.140): der alte Weg des Entity-Beins. `entityNamen` hielt die Rangfolge aller
  // Begriffe als Vorrat, geachtet an `datenGeneration`, und jeder Schreibfall hob diese Zahl -
  // die erste Anfrage danach baute die Rangfolge ueber 360 000 Kanten und 40 008 Begriffe neu:
  // 134.74 ms von 157 ms an der Tuer, gemessen 4.11. an 40 000 Notizen
  // (docs/belege/tag-0411/tuer-48-vor-3-2-139-0123.log.txt). Gezaehlt am installierten
  // 3.2.139: 2 mal; am gebauten 3.2.140: 0 mal.
  "entityNamen",
  // Punkt 1 / Aufgabe #51 (3.2.143): die Lange gehoerte in die Kopfzeile, und die Kopfzeile
  // steht immer - darum war sie der Grund, warum die zugeklappte Legende bei 390 x 844 28.5 %
  // der Leinwand deckte (Latte 25 %, P114). Der Rat zieht in eine eigne Zeile hinter die
  // Klappe; die kurze Zahl bleibt. Gezaehlt am gebauten Renderer 4.11. 06:11 MEZ: die alte
  // Lange **0** mal, die kurze Zahl **1** mal, der Rat **1** mal.
  "carries a word you wrote; a line without one",
  // Punkt 7 (3.2.144): "endpoint", "chunk" und "index" waren die drei Woerter, die die Flaeche
  // fuer Dinge benutzte, die ein Mensch nie benennt - ein Zaehler ueber alle 324 Menschensaetze
  // im ausgelieferten Objekt meldete 25 Saetze mit Fachwort ohne Grund und ohne Taetigkeit
  // (scripts/verstaendlichkeit.mjs, docs/belege/tag-0411/verstaendlichkeit-objekt-0800.log.txt).
  // Die Absagen und tooltips nennen jetzt das Werkzeug, die Stuecke und die Ergebnisse beim
  // Alltagswort. Verboten ist die alte Wortwahl an den vier Stellen, die ein Test oder eine
  // Marke frueher hielt; gezaehlt am gebauten Renderer: je **0** mal.
  "Your endpoint is not answering",
  "did not send a model list",
  "listed no models yet",
  "Local endpoint - this address needs no key.",
  // Punkt 7 (3.2.144), dieselbe Stelle in der Regal-Flaeche: der alte Wortlaut nannte
  // die Farbe "painted in the first group's tone" und war die 15-Woerter-Zeile, die der
  // Sprachzaehler als Fachwort ohne Grund meldete. Ersetzt durch "two groups? The first
  // one's colour wins." Gezaehlt am gebauten Objekt 4.11. 15:41 MEZ: die alte Kette 0 mal,
  // die neue 1 mal. Der Inhaltsgate hat den Bruch selbst gemeldet (FEHLT 0, INHALT_EXIT=1),
  // bevor etwas getauscht wurde -- dafuer sitzt er in der Kette.
  "is painted in the first group",
  // Punkt 4 / Aufgabe #60 (3.2.153): "did not answer" war eine Behauptung ueber die eigne Tuer,
  // wo sie 503 antwortete -- der Grund fiel unter den Tisch, weil ein kahler Error dem
  // Absage-Helfer ein Fremder ist. Gezaehlt am installierten 3.2.152: **1** mal; am gebauten
  // 3.2.153: **0** mal. Ebenso die Ausrede, der Grund stehe in der Entwickler-Konsole, waehrend
  // die eigne Zahl auf der Flaeche stehen darf (Export, 1 mal alt).
  "The health check did not answer",
  "the reason is in the developer console",
  // Punkt 7 / P79 (3.2.168): die Halbsatz-Schreibung mit Semikolon ist die Form, die die Sonde
  // als Code verwirft -- ein Werkzeugsatz, den der Riegel nicht sieht, meldet 0 Funde, egal ob
  // er einen hat. Gezaehlt am installierten 3.2.167: **2** mal; am gebauten 3.2.168: **0** mal.
  "default 2; use 1",
  // P83 (3.2.173): Tailwinds Name fuer 20 px ist seit der fs-6-Utility kein Ausrede-Name
  // mehr -- verboten ist die Klassen-Kette, wie sie in der Flaeche stand.
  "text-xl font-semibold",
  // P86 (3.2.176): die dunkel gegabelten Farb-Sitze. Am installierten 3.2.175 gezaehlt
  // 02:41:18 MEZ: das Paar "bg-white dark:bg-zinc-800" 4 mal, das Paar
  // "text-zinc-900 dark:text-zinc-100" 1 mal -- beide schreibt nur unser Quelltext, also
  // schlagen sie. Die nackten Palettenwoerter bleiben draussen (bg-white 14, text-xs 5 am
  //selben Objekt): Fremd-Baustein und Tailwinds eigne Variablen, kein Besitz von uns.
  "bg-white dark:bg-zinc-800",
  "text-zinc-900 dark:text-zinc-100",
  // P90 (3.2.178): die alte Gefahren-Form. Am installierten 3.2.177 1 mal (04:14:56 MEZ);
  // sie war 1,57:1 gegen das helle Panel und 1,65:1 gegen das dunkle -- unter der Rand-Bar
  // von 3:1. Der Vertrag heisst jetzt --gefahr.
  "border-red-500/40",
  // P94 (3.2.180): die andre Seite desselben Beweises. Am installierten 3.2.179 steht jede
  // dieser sechs Formen 1 mal (05:34:05 MEZ, eigne Zaehlung); nach dem Schnitt muss jede 0
  // sein, waehrend ihr Satz-Schwanz oben weiter zaehlt. Ein nackter Bindestrich zwischen
  // Woertern war keine Zierde: der Census trennt Saetze an ihm, und die zwei Diener-Zeilen
  // des Speicherverweisers zaehlten als vier. Gemessen am zugehoerigen Objekt: Diener 53
  // (05:31:59 MEZ, 3.2.179) -> 51 (05:44:44 MEZ, 3.2.180), Flaeche bleibt 348, Kappe bleibt
  // 80,5 % gegen ihre 80-er Latte. Eine Zwischenlesung um 05:32:32 MEZ meldete 346 und
  // 80,3 % -- das war der Baum vor seinem eignen Objekt (der Tausch war nicht gefahren),
  // und diese Zahl ist hier zurueckgenommen, nicht behalten.
  "machine - no key needed",
  "more below - keep scrolling",
  "picture - the number is off",
  "claimed yet - write the first one",
  "earlier stand yet - it has not been edited",
  "nothing yet - the graph draws only mentions",
  // P82 (3.2.172): die vier knappen Diener-Absagen, die ein Fachwort ohne Grund und
  // ohne Taetigkeit liessen (gemessen 00:30:54 MEZ als 4 der 5 Funde in 62 Kandidaten).
  "Node or stand not found",
  "Batching is not supported (MCP 2026-07-28 removed it)",
  "No input given for embedding",
  "Too many nodes (max 5000)",
  // P80 (3.2.169): die alten Formen derselben elf Saetze. Verboten, weil die Kuerze und der
  // Grund der Schnitt sind -- nicht, weil sie nie existiert haetten: gemessen am
  // installierten 3.2.168 steht jede Kette 1 mal (Flaeche) bzw. 2 mal (Server-Bund).
  "this computer blocked saving it",
  "Wide end = who claims",
  "The scan rules arrived but did not read as rules",
  "Roles are centrally managed",
  "That address only accepts POST requests",
  "The answer failed inside K3PTA.",
  "The file arrived empty, so nothing was read.",
  "The file is not valid JSON, so nothing was read.",
  "This file is neither a ChatGPT nor a Claude export",
  "Hybrid retrieval (BM25 + vectors + knowledge graph) over K3PTA memory.",
  "become linked entities",
  // P103 (landet in 3.2.183): die alten Etikett-Wortlaute. Gezaehlt am installierten
  // 3.2.182 um 11:39:29 MEZ: "bm25 #" 2, "vector #" 2, "Retrieval tracks" 1,
  // "Search depth (top-k)" 2, der alte Karten-Titel 1. "Track BM25" steht hier **nicht** --
  // die alte Flaeche baute den Vorleser-Namen aus `Track ${label}`, im Bundel liegt also
  // "Track " und "BM25" getrennt, und die Kette war am Objekt 0. Eine Sperre, die die Welt
  // nicht schreibt, meldet ewig Sauberkeit.
  "bm25 #",
  "vector #",
  "Retrieval tracks",
  "Search depth (top-k)",
  "rank in words, vectors, graph. Absent means unseen",
  // P104 (landet in 3.2.184): die alten Ansichts- und Verfahrensworte. Gezaehlt am
  // installierten 3.2.183 um 12:15:16 MEZ: "Semantic map" 2, "Force view" 1, "Dendrogram " 1
  // -- mit Leerzeichen, denn der Gedankenstrich dahinter ist in UTF-8 drei Bytes und die Sonde
  // liest latin1: eine Kette mit echtem Strich waere ein Dauer-Null, der ewig Sauberkeit
  // meldet. "Semantic index is still filling" 1, "the links as they are claimed" 1,
  // "placed by meaning, not words" 1, "Force and Tree need only the notes themselves" 1.
  "Semantic map",
  "Force view",
  "Dendrogram ",
  "Semantic index is still filling",
  "the links as they are claimed",
  "placed by meaning, not words",
  "Force and Tree need only the notes themselves",
  // P105 (landet in 3.2.185): "ein Ding, ein Wort". Jede Kette hier stand am installierten
  // 3.2.184 zwischen 1 und 8 mal in den Bytes, die ein Mensch bekommt (Gegenprobe 13:31:58
  // MEZ, latin1). Drei alte Formen sind bewusst NICHT aufgenommen, und der Grund ist eine
  // Messung: "Node not found" 8 mal bei 3 eignen Stellen (pdf.js besitzt den Rest), "Saves a
  // knowledge node, or updates one" 2 mal bei 1 eigner Stelle (die zweite liegt im Bundel,
  // Wand 4), und ein nacktes "Node" traf in minifiziertem Drittcode immer.
  "unfolded notes are drawn as nodes",
  "no core node inside this picture",
  "too few core nodes in this picture",
  "a node stays where you drop it",
  "New assistant node",
  "Node size",
  "active nodes, maximum is",
  "active nodes exceed the limit",
  "conflicting node ids",
  "nodes taken over from memories.json",
  "Extract one knowledge node from",
  // P106 (landet in 3.2.186): die alten Formen der sieben Riegel- und vier Strich-Saetze.
  // Die Gedankenstrich-Faelle sind nur verbietbar, weil der nackte Bindestrich ASCII ist;
  // die neue Form mit U+2014 waehr kein Marker, weil latin1 das Zeichen in Bytes zerlegt.
  "the map holds",
  "without a vector, parked at the rim",
  "What the graph starts with.",
  "tools for AI apps (MCP ",
  "is not a SQLite database at all",
  "edges; the door dropped",
  "This excerpt is the whole graph:",
  "not for a claim - pick",
  " - the last match is before this page",
  "written by a hand - each one",
  " - the whole list fits",
  "This is the heavy path - page with limit=",
  // P109 (3.2.189): der nackte Bindestrich in Literalen, die kein Census-Kandidat sind.
  // Gezaehlt am installierten 3.2.188 (16:18:31 MEZ, asar 49 197 041 B, latin1, eigener Lauf
  // durch diese Sperre): **zwölf** Ketten 1 bis 2 mal, also hat jede Biss. Der Rohlauf des
  // Census meldet nach dem Schnitt 0 Funde bei 3 Literalen Umfang (der Rest sind
  // Rechnungen, CSS-Masse, Aufzaehlungen). Eine dreizehnte Kette hatte ich zuerst
  // ("whole base`} - ") -- 0 mal im Leib, also ohne Biss, und darum wieder raus.
  // "is neither" (9 mal) ist keine Marke: dieselbe Wendung lebt in geheilten Saetzen weiter,
  // verboten ist nur der Strich davor ("up`} - got").
  " - the whole result fits in this page",
  " - the whole stand list fits in this page",
  " - all of your notes are still arriving",
  " - the store did not answer",
  " - the entity links did not arrive",
  " - this is a window, not all of your notes",
  "is not a claim - fill who",
  "the same term - a claim needs",
  "is required - nothing was written",
  "exactly 1 or true - or leave it out",
  " - the page was pinned to",
  "up`} - got",
  // P116: der 24-Woerter-Satz. Ein Satz, der kuerzer gemeldet wird, aber am alten Wortlaut
  // im Objekt haengt, ist keine Kuerzung, sondern ein zweiter Text.
  "so nothing was carried across and nothing was deleted: enter the key once to seal it",
  // P117: das eine Wort an der Fuge zweier Felder. Die Latte sieht es erst, seit `+` als
  // Anfuehrung gilt -- und dann ist der Bindestrich ein zweites Mal derselbe Fehler wie P109.
  "claims reach this picture - ",
];
// Die Liste darf nur ASCII-Zeichen enthalten. Grund, gemessen 21.10. 19:16 MESZ am
// installierten Objekt: das Wort "Looking" plus echtes U+2026 steht dort 2 mal, diese
// Sonde zaehlt davon **0**, weil latin1 das Zeichen in zwei Byte-Fetzen zerlegt und das
// Muster dann sein eignes Ziel nicht mehr trifft. Ein Nicht-ASCII-Marker ist hier keine
// Pruefung, sondern ein Dauer-Null — also abbrechen, statt zu schlagen.
const nichtAscii = [...erwartet.map(([m]) => m), ...verboten].filter((m) => /[^\x20-\x7E]/.test(m));
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
for (const m of verboten) {
  // Grosse oder kleine Anfangsbuchstabe: die Liste steht klein, die Flaeche schreibt
  // ihre Saetze mit grosssem Anfang. Gemessen 5.11. 15:12 MEZ am ausgelieferten 3.2.160:
  // `the reason is in the developer console` war verboten und wurde 0 mal gezaehlt,
  // waehrend das Objekt denselben Wortlaut mit grosssem Anfang an zwei Stellen trug
  // (Dashboard.tsx:1242 und SystemStatus.tsx:181). Eine Sonde, die an der Grossschrift
  // vorbeisieht, meldet Sauberkeit fuer Ungelesenes -- also jedes verbotene Muster in
  // beiden Anfangsformen, und die Zeile nennt die Trefferform.
  const varianten = (() => { const gross = m.charAt(0).toUpperCase() + m.slice(1); return gross === m ? [m] : [m, gross]; })();
  const n = varianten.reduce((a, x) => a + (s.split(x).length - 1), 0);
  const treffer = varianten.filter((x) => (s.split(x).length - 1) > 0).map((x) => `[${x}] ${s.split(x).length - 1}x`).join(", ") || "keine Form";
  const ok = n === 0;
  if (!ok) fehl++;
  console.log(`  ${ok ? "ok  " : "ZU VIEL"}  ${String(n).padStart(3)}  ${m}${ok ? "  (verboten, beide Anfangsformen)" : `  (verboten — ein frueherer Wortlaut ist zurueckgekehrt: ${treffer})`}`);
}
// P88 (3.2.177): jede Klasse, die ein Baustein ruft, muss im ausgelieferten CSS eine Regel
// finden. Von Hand gemessen 6.11.2026 03:29:51 MEZ am ausgelieferten 3.2.176: 455 gerufene
// Klassenwoerter gegen 1537 Regeln, und zwei Woerter fanden keine -- `prose` und `prose-sm`,
// Ueberreste eines Typography-Plugins, das nie eingetragen war (die Antwort malt `.chat-prose`,
// src/index.css:664). Ein Name ohne Regel ist eine Verabredung, die niemand haelt.
const { spawnSync } = require("node:child_process");
const klassen = spawnSync(process.execPath,
  [require("path").join(__dirname, "pruefe-klassen-im-objekt.cjs"), p], { encoding: "utf8" });
for (const z of (klassen.stdout || "").split("\n").filter(Boolean)) console.log("  " + z.trim());
for (const z of (klassen.stderr || "").split("\n").filter(Boolean)) console.log("  FEHLER " + z.trim());
if (klassen.status !== 0) {
  fehl++;
  console.log("  (Klassendeckung fehlgeschlagen — Exit " + klassen.status + ")");
}
console.log(`  asar ${fs.statSync(p).size} B, mtime ${fs.statSync(p).mtime.toISOString()}${version ? `, bestellte Version ${version}` : ""}`);
if (fehl) { console.log(`  ${fehl} Pruefung(en) fehlgeschlagen`); process.exit(1); }
console.log("  Inhalt passt.");
