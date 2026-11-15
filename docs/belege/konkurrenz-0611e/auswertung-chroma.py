"""P118-Auswertung: die vier chroma-Spuren gegen die zwei sqlite-vec-Spuren und gegen
unsre eigne Rangfolge (0611c), in derselben Einheit (von 45 Anfragen).

Gefaehrdet und deshalb vermieden: die Zeilennummer der Anfrage. Die chroma-Spur numeriert
1..45, unsre eigne Spur 0..44 -- wollte man ueber den Zaehler vergleichen, fielen zwei
Anfragen still aus der Gleichung heraus. Verglichen wird deshalb ueber den Wortlaut der
Frage, und die Zahl der gefundenen Anfragen wird vor jeder Rechnung geprueft (45).

Was hier steht: Hit@1 und Recall@5, neu gerechnet aus den Spuren, nicht aus den
Ergebnis-Dateien; Werkzeug gegen Werkzeug an derselben Stufe; Stufe gegen Stufe innerhalb
chroma; der Abstand zu unsrer Fusion in Anfragen und Prozentpunkten.

Was hier nicht steht: alles ueber die Geschwindigkeit an einem echten Bestand. 58 Notizen
sind ein Korpus, kein Bestand.
"""
import json
import os
import sys

# Diese Auswertung liegt neben ihren eignen Artefakten und liest nur die -- sie laeuft
# damit auch, wenn die Kapsel langst zurueckgegeben ist.
BELEG = os.path.dirname(os.path.abspath(__file__))

_K = json.load(open(os.path.join(BELEG, "korpus-aus-repo.json"), encoding="utf-8"))
ERWARTET = {q["frage"]: set(q["erwartet"]) for q in _K["fragen"]}
MEHRERE = [f for f, e in ERWARTET.items() if len(e) > 1]


def lade(pfad):
    spur = {}
    kopf = None
    for zeile in open(pfad, encoding="utf-8"):
        d = json.loads(zeile)
        if d["art"] == "start":
            kopf = d
        elif d["art"] == "suche":
            erwartet = d["erwartet"]
            spur[d["frage"]] = dict(frage=d["frage"], i=d["i"], kategorie=d["kategorie"],
                                    erwartet=set(erwartet) if isinstance(erwartet, list) else {erwartet},
                                    liste=list(d["liste"]), top=d["top"],
                                    r5=d.get("r5"))
    return kopf, spur


def zahl(spur):
    """Erwartung immer aus dem Korpus, nie aus dem Feld der Spur: das Feld einer
    Konkurrenz-Spur traegt die ganze Liste, das Feld von P112s eigner Spur nur den
    ersten Ausweis. Wer beide gleich behandelt, maht unsre Zahl um vier Anfragen zu
    niedrig -- der Fall unten in dieser Auswertung benennt die Groesse."""
    n = len(spur)
    hit1 = sum(1 for f, z in spur.items() if z["top"] and f in ERWARTET and z["top"] in ERWARTET[f])
    in5 = sum(1 for f, z in spur.items() if f in ERWARTET and any(x in ERWARTET[f] for x in z["liste"][:5]))
    return n, hit1, in5


def zahl_uns(spur):
    """Unsre eigne Spur (0611c und 0611e) nennt in `liste` nur die relevanten Treffer, nicht
    das Fuenfer-Fenster -- ihr Recall@5 ist deshalb das Mittel der gekappten `r5`-Zeilen und
    wird hier nicht aus der Liste gerechnet. Wer das verwechselt, vergleicht eine Precision
    mit einem Recall, und das ist genau der Fehler, den der Eval-Ausdruck bis 13.10. gemeldet
    hat."""
    n = len(spur)
    hit1 = sum(1 for f, z in spur.items() if z["top"] and f in ERWARTET and z["top"] in ERWARTET[f])
    fehlend = [f for f, z in spur.items() if z["r5"] is None]
    if fehlend:
        raise SystemExit(f"unsre Spur hat {len(fehlend)} Anfragen ohne r5-Feld")
    r5 = round(100 * sum(z["r5"] for z in spur.values()) / n, 1)
    return n, hit1, r5




def umfang(name, spur):
    n, _, _ = zahl(spur)
    if n != 45:
        raise SystemExit(f"{name}: {n} Anfragen in der Spur, erwartet 45 -- Vergleich ungueltig")
    return spur


def vergleich(a, b):
    """Beide Spuren nach Fragentext. Zaehlt Listen-, Erst-Treffer- und Treffer-Kippen."""
    h = set(a) & set(b)
    if len(h) != 45:
        raise SystemExit(f"Ueberlappung {len(h)} von 45 -- die Fragen stimmen nicht ueberein")
    listen = [f for f in a if a[f]["liste"][:5] != b[f]["liste"][:5]]
    tops = [f for f in a if a[f]["top"] != b[f]["top"]]
    gekippt = [f for f in a if (a[f]["top"] in ERWARTET[f]) != (b[f]["top"] in ERWARTET[f])]
    return listen, tops, gekippt


def pp(a, b=45):
    return round(100 * a / b, 1)


aus = []


def sag(*zeilen):
    for z in zeilen:
        print(z)
        aus.append(str(z))


spuren = {}

sag("=== chroma, vier Laeufe, Hit@1 und Recall@5 aus der Spur gerechnet ===")
for stufe, datei in (("nomic", "spur-chroma-nomic-eins.jsonl"),
                     ("nomic", "spur-chroma-nomic-zwei.jsonl"),
                     ("bge-m3", "spur-chroma-bge-m3-eins.jsonl"),
                     ("bge-m3", "spur-chroma-bge-m3-zwei.jsonl")):
    kopf, spur = lade(os.path.join(BELEG, datei))
    umfang(datei, spur)
    spuren.setdefault(stufe, []).append((datei, kopf, spur))
    n, hit1, in5 = zahl(spur)
    sag(f"{datei}: Hit@1 {hit1}/{n} = {pp(hit1)} %, in den ersten 5 {in5}/{n} = {pp(in5)} %"
        f" | {kopf['werkzeug']}, Raum {kopf['raum']}, dim {kopf['dim']}, k={kopf['k']},"
        f" {kopf['vektoren_im_feld']} Vektoren im Feld, sync_threshold {kopf['index']['sync_threshold']}")

sag("")
sag("=== die zwei sqlite-vec-Lauefe je Stufe (P110/P111), dieselbe Rechenstelle ===")
for stufe, dateien in (("nomic", ("spur-sqlitevec-0611.jsonl", "spur-sqlitevec-0611-zwei.jsonl")),
                       ("bge-m3", ("spur-sqlitevec-bge-m3.jsonl", "spur-sqlitevec-bge-m3-zwei.jsonl"))):
    for d in dateien:
        _, spur = lade(os.path.join(BELEG, "..", "konkurrenz-0611b", d))
        umfang(d, spur)
        spuren.setdefault("sqlitevec-" + stufe, []).append((d, None, spur))
        sag(f"sqlite-vec {stufe}: {d} -> Hit@1 {zahl(spur)[1]}/45 = {pp(zahl(spur)[1])} %")

sag("")
sag("=== unsre ausgelieferte Rangfolge an beiden Stufen, neu geschrieben mit vollem "
    "erwartet-Feld (0611e), und gegen P112s erste Stelle verglichen ===")
for stufe in ("nomic", "bge-m3"):
    _, uns = lade(os.path.join(BELEG, f"spur-uns-{stufe}-0611e.jsonl"))
    umfang(stufe, uns)
    spuren.setdefault("uns-" + stufe, []).append((f"spur-uns-{stufe}-0611e", None, uns))
    n, hit1, r5 = zahl_uns(uns)
    _, alt = lade(os.path.join(BELEG, "..", "konkurrenz-0611c", f"spur-uns-{stufe}-0611.jsonl"))
    selbe_top = sum(1 for f in uns if uns[f]["top"] == alt[f]["top"])
    sag(f"K3PTA Fusion {stufe}: Hit@1 {hit1}/45 = {pp(hit1)} %, Recall@5 (gekappt) {r5} %"
        f" -- R@5 aus dem r5-Feld, nicht aus der Liste (unsre Liste fuehrt nur die Treffer)")
    sag(f"   erste Stelle gegen P112 (17:09 MEZ, zwei Stunden frueher): {selbe_top} von 45 gleich")

sag("")
sag("=== das Feld, das in P112 zu wenig sagt: erwartet war dort der erste Ausweis allein ===")
for stufe, soll in (("nomic", 34), ("bge-m3", 35)):
    _, alt = lade(os.path.join(BELEG, "..", "konkurrenz-0611c", f"spur-uns-{stufe}-0611.jsonl"))
    n, hit1, _ = zahl_uns(alt)
    aus_feld = sum(1 for f in alt if alt[f]["top"] in (alt[f]["erwartet"] or set()))
    sag(f"{stufe}: gegen das Korpus {hit1}/45 (Ledger {pp(hit1)} %), gegen das Feld allein "
        f"{aus_feld}/45 -- Differenz {hit1 - aus_feld} Anfragen, und das Korpus hat "
        f"{len(MEHRERE)} Anfragen mit mehr als einem gueltigen Ausweis")

sag("")
sag("=== Reproduzierbarkeit: zwei Laeufe je Stufe, Liste gegen Liste ===")
for stufe in ("nomic", "bge-m3"):
    (da, _, a), (db, _, b) = spuren[stufe]
    listen, tops, gekippt = vergleich(a, b)
    sag(f"chroma {stufe}: Listen verschieden {len(listen)}/45, Erst-Treffer verschieden {len(tops)}/45,"
        f" Treffer gekippt {len(gekippt)}/45 -> Hit@1 gleich: {zahl(a)[1] == zahl(b)[1]}")

sag("")
sag("=== chroma gegen sqlite-vec, Stufe fuer Stufe: gleiches Verfahren, andres Werkzeug ===")
gekippte_alle = []
for stufe in ("nomic", "bge-m3"):
    a = spuren[stufe][0][2]
    b = spuren["sqlitevec-" + stufe][0][2]
    listen, tops, gekippt = vergleich(a, b)
    sag(f"{stufe}: chroma Hit@1 {zahl(a)[1]}/45 = {pp(zahl(a)[1])} %, sqlite-vec {zahl(b)[1]}/45 = {pp(zahl(b)[1])} %"
        f" | Listen verschieden {len(listen)}, Erst-Treffer verschieden {len(tops)}, Treffer gekippt {len(gekippt)}")
    for f in gekippt:
        sag(f"   gekippt: {f!r} ({a[f]['kategorie']}) | chroma top {a[f]['top']},"
            f" sqlite-vec top {b[f]['top']} | erwartet {sorted(ERWARTET[f])}")
        gekippte_alle.append((stufe, f, a[f]["top"], b[f]["top"]))
    for f in listen:
        if f not in gekippt:
            sag(f"   nur Reihenfolge: {f!r} | chroma {a[f]['liste'][:5]} | sqlite-vec {b[f]['liste'][:5]}")

sag("")
sag("=== Stufenwechsel innerhalb chroma (nomic -> bge-m3), dieselbe Einheit wie P112 ===")
a = spuren["nomic"][0][2]
b = spuren["bge-m3"][0][2]
listen, tops, gekippt = vergleich(a, b)
richtig_wechsel = [f for f in tops if (a[f]["top"] in ERWARTET[f]) != (b[f]["top"] in ERWARTET[f])]
unveraendert = [f for f in a if a[f]["liste"][:5] == b[f]["liste"][:5]]
sag(f"Hit@1 {zahl(a)[1]} -> {zahl(b)[1]} ({pp(zahl(a)[1])} % -> {pp(zahl(b)[1])} %)")
sag(f"Erst-Treffer wechselt die Richtigkeit: {len(richtig_wechsel)} von 45 = {pp(len(richtig_wechsel))} %")
sag(f"anderer erster Treffer ueberhaupt: {len(tops)} von 45 = {pp(len(tops))} %")
sag(f"ganze Liste unveraendert: {len(unveraendert)} von 45 = {pp(len(unveraendert))} %")
sag("zum Vergleich, sqlite-vec (P112): Richtigkeit wechselte 15 von 45 = 33,3 %,"
    " anderer Erst-Treffer 25 von 45 = 55,6 %, ganze Liste unveraendert 0 von 45")

sag("")
sag("=== Abstand unsre Fusion gegen chroma, an beiden Stufen (von 45) ===")
for stufe in ("nomic", "bge-m3"):
    uns = spuren["uns-" + stufe][0][2]
    chroma = spuren[stufe][0][2]
    h_uns, h_ch = zahl_uns(uns)[1], zahl(chroma)[1]
    h_sql = spuren["sqlitevec-" + stufe][0][2]
    sag(f"{stufe}: Fusion {h_uns}/45 = {pp(h_uns)} % | chroma {h_ch}/45 = {pp(h_ch)} %"
        f" -> Abstand {h_uns - h_ch} Anfragen = {round(pp(h_uns) - pp(h_ch), 1)} Pp"
        f" | sqlite-vec {zahl(h_sql)[1]}/45 -> Abstand {h_uns - zahl(h_sql)[1]} ="
        f" {round(pp(h_uns) - pp(zahl(h_sql)[1]), 1)} Pp")

sag("")
sag("=== Kategorien, chroma beide Stufen ===")
for stufe in ("nomic", "bge-m3"):
    spur = spuren[stufe][0][2]
    for kate in sorted({z["kategorie"] for z in spur.values()}):
        teil = [z for z in spur.values() if z["kategorie"] == kate]
        treffer = sum(1 for z in teil if z["top"] and z["top"] in ERWARTET[z["frage"]])
        sag(f"{stufe:8} {kate:14} {treffer} von {len(teil)}")

pfad = os.path.join(BELEG, "auswertung-chroma-0611.txt")
open(pfad, "w", encoding="utf-8").write("\n".join(aus) + "\n")
print(f"\ngeschrieben: {pfad}", file=sys.stderr)
