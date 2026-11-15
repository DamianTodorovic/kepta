"""P110: sqlite-vec als reines Cosinus-KNN -- die zweite Konkurrenz-Stufe nach mem0.

Konfiguration, entschieden, weil sie die Frage trennt: ein Vektor-Speicher, nichts sonst.
Keine Wort-Suche, keine RRF-Fusion, kein Zeitstrahl, keine Entitaeten -- nur die
Cosinus-Naehe derselben Einbettung, die auch der faire mem0-Lauf benutzt hat
(nomic-embed-text, 768 Dimensionen, Ollama ausschliesslich auf 127.0.0.1).

Korpus und Fragen sind nicht neu erfunden: sie kommen aus scripts/eval-corpus.ts und sind
gegen die mem0-Kapsel nachgeprueft (58 Notiztexte und 45 Anfragen, identisch).

Der Trace schreibt dieselben Feldnamen wie die mem0-Traces, damit ein Test beide mit
demselben Code lesen kann.

Rueckgaengig: rm -rf /tmp/konk-sqlitevec-0611
"""
import json
import os
import resource
import sys
import time

import apsw
import urllib.request
import sqlite_vec

HIER = os.path.dirname(os.path.abspath(__file__))
KORPUS_DATEI = os.path.join(HIER, "korpus-aus-repo.json")
SPUR = os.path.join(HIER, sys.argv[1] if len(sys.argv) > 1 else "spur-sqlitevec-0611.jsonl")
ERG = os.path.join(HIER, sys.argv[2] if len(sys.argv) > 2 else "ergebnis-sqlitevec-0611.json")
DB = os.path.join(HIER, "vektor.db")

OLLAMA = "http://127.0.0.1:11434/api/embeddings"
MODELL = "nomic-embed-text"
DIM = 768
K = 5


def einbett(text):
    anfrage = urllib.request.Request(OLLAMA, data=json.dumps({"model": MODELL, "prompt": text}).encode(),
                                     headers={"Content-Type": "application/json"})
    v = json.load(urllib.request.urlopen(anfrage, timeout=180))["embedding"]
    if len(v) != DIM:
        raise SystemExit(f"Einbettung hat {len(v)} Dimensionen, erwartet {DIM}")
    return v


def serialisiere(v):
    return sqlite_vec.serialize_float32(v)


def main():
    daten = json.load(open(KORPUS_DATEI, encoding="utf-8"))
    notizen, fragen = daten["korpus"], daten["fragen"]
    if len(notizen) != 58 or len(fragen) != 45:
        raise SystemExit(f"Korpus-umfang falsch: {len(notizen)} Notizen, {len(fragen)} Anfragen")

    if os.path.exists(DB):
        os.remove(DB)
    db = apsw.Connection(DB)
    db.enableloadextension(True)
    db.loadextension(sqlite_vec.loadable_path())
    db.enableloadextension(False)
    cur = db.cursor()
    cur.execute("BEGIN")
    cur.execute(f"CREATE TABLE vektoren (id TEXT PRIMARY KEY, text TEXT)")
    cur.execute(
        f"CREATE VIRTUAL TABLE vec_vektoren USING vec0(id TEXT PRIMARY KEY, einbettung float[{DIM}] distance_metric=cosine)"
    )
    offen = open(os.path.join(HIER, "setze-" + os.path.basename(SPUR)), "w", encoding="utf-8")
    zeit_start = time.time()
    for i, n in enumerate(notizen, 1):
        v = einbett(n["text"])
        offen.write(json.dumps({"art": "setze", "i": i, "note": n["id"], "text": n["text"], "sek": 0.0}, ensure_ascii=False) + "\n")
        cur.execute("INSERT INTO vektoren (id, text) VALUES (?, ?)", (n["id"], n["text"]))
        cur.execute("INSERT INTO vec_vektoren (id, einbettung) VALUES (?, ?)", (n["id"], serialisiere(v)))
    cur.execute("COMMIT")
    dauer_setzen = time.time() - zeit_start
    offen.close()

    zeilen = []
    spur = open(SPUR, "w", encoding="utf-8")
    zeuge = {
        "art": "start",
        "zeit": time.strftime("%H:%M:%S"),
        "werkzeug": "sqlite-vec " + cur.execute("select vec_version()").fetchone()[0],
        "sqlite": cur.execute("select sqlite_version()").fetchone()[0],
        "python": sys.version.split()[0],
        "einbett": MODELL,
        "dim": DIM,
        "k": K,
        "heim": DB,
        "notizen": len(notizen),
        "anfragen": len(fragen),
    }
    spur.write(json.dumps(zeuge, ensure_ascii=False) + "\n")
    for zeile in open(os.path.join(HIER, "setze-" + os.path.basename(SPUR)), encoding="utf-8"):
        spur.write(zeile)

    takt_start = time.time()
    for i, q in enumerate(fragen, 1):
        v = einbett(q["frage"])
        treffer = list(
            cur.execute(
                "select id, distance from vec_vektoren where einbettung match ? and k = ? order by distance",
                (serialisiere(v), K),
            )
        )
        liste = [r[0] for r in treffer]
        top = liste[0] if liste else ""
        erwartet = q["erwartet"]
        zeile = {
            "art": "suche",
            "i": i,
            "kategorie": q["kategorie"],
            "frage": q["frage"],
            "erwartet": erwartet,
            "top": top,
            "treffer": top in erwartet,
            "liste": liste,
            "abstand": round(treffer[0][1], 6) if treffer else None,
        }
        zeilen.append(zeile)
        spur.write(json.dumps(zeile, ensure_ascii=False) + "\n")
    dauer_suchen = time.time() - takt_start
    spur.close()

    n = len(zeilen)
    hit1 = sum(1 for z in zeilen if z["treffer"])
    in5 = sum(1 for z in zeilen if any(x in z["erwartet"] for x in z["liste"][:5]))
    prozent = lambda a, b: round(100 * a / b, 1) if b else 0.0
    nach_kategorie = {}
    for kate in sorted({z["kategorie"] for z in zeilen}):
        teil = [z for z in zeilen if z["kategorie"] == kate]
        nach_kategorie[kate] = {
            "anfragen": len(teil),
            "hit1": sum(1 for z in teil if z["treffer"]),
            "hit1_prozent": prozent(sum(1 for z in teil if z["treffer"]), len(teil)),
        }
    erg = {
        "lauf": "sqlitevec-0611",
        "zeit": time.strftime("%H:%M:%S"),
        "konfiguration": {
            "werkzeug": zeuge["werkzeug"],
            "sqlite": zeuge["sqlite"],
            "python": zeuge["python"],
            "einbett": MODELL,
            "dim": DIM,
            "k": K,
            "nur_vektoren": True,
            "wort_suche": False,
            "fusion": False,
            "zeitstrahl": False,
            "entitaeten": False,
        },
        "korpus": {"notizen": len(notizen), "anfragen": len(fragen)},
        "hit1": hit1,
        "hit1_prozent": prozent(hit1, n),
        "recall5_in_den_5": in5,
        "recall5_prozent": prozent(in5, n),
        "nach_kategorie": nach_kategorie,
        "dauer_sek": round(dauer_suchen, 1),
        "dauer_setzen_sek": round(dauer_setzen, 1),
        "rss_gib": round(resource.getrusage(resource.RUSAGE_SELF).ru_maxrss / 1024 / 1024 / 1024, 2),
    }
    json.dump(erg, open(ERG, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    db.close()
    print(json.dumps({"hit1": hit1, "hit1_prozent": erg["hit1_prozent"],
                      "recall5_prozent": erg["recall5_prozent"],
                      "dauer_sek": erg["dauer_sek"], "rss_gib": erg["rss_gib"]}, ensure_ascii=False))
    print("nach Kategorie:", json.dumps(nach_kategorie, ensure_ascii=False))


if __name__ == "__main__":
    main()
