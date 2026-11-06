"""P118: chroma als reines Cosinus-KNN -- die dritte Mitbewerber-Stufe nach mem0 und
sqlite-vec, an demselben Korpus (58 Notizen, 45 Anfragen, bytegleich zu P110) und
demselben Einbett (nomic-embed-text 768 D; zweite Stufe bge-m3 1024 D).

Konfiguration, entschieden, weil sie die Frage trennt: ein Vektor-Speicher, nichts
sonst. Keine Wort-Suche, keine Fusion, kein Zeitstrahl, keine Entitaeten. Die
Einbettungen bringt dieses Skript selbst aus Ollama (nur auf 127.0.0.1), damit das
Produkt nicht seinen eingebauten ONNX-Einbettner zieht -- die Sonde vorher hat
gezeigt, dass ein eigenes Einbett die Dimension behaelt (8 bleibt 8, nicht 384).

Was chroma von sqlite-vec unterscheidet und deshalb mitgemessen wird: chroma rechnet
nicht exakt, sondern legt ein HNSW-Feld an. Die Index-Parameter stehen in der
Konfiguration, und der Wert `sync_threshold` sagt, ab wie vielen Vektoren ueberhaupt
indexiert wird. Unterhalb dieser Schwelle ist die Antwort exakt -- diese Behauptung
prueft das Skript nach, indem es zu jeder Anfrage zusaetzlich die exakte Cosinus-
ordnung aus denselben Vektoren rechnet und die Zahl der abweichenden Listen meldet.

Fernmeldung: chroma 1.5.9 bringt das posthog-Paket nicht einmal mit, und sein
Telemetrie-Koerper (telemetry/product/posthog.py:10) ist ein `pass`. Trotzdem laeuft
der Lauf mit ANONYMIZED_TELEMETRY=FALSE, abgeschaltet ab dem ersten Aufruf.

Rueckgaengig: rm -rf /tmp/konk-chroma-0611
"""
import json
import os
import resource
import sys
import time

import chromadb
import numpy as np
import urllib.request

HIER = os.path.dirname(os.path.abspath(__file__))
KAPSEL = "/tmp/konk-chroma-0611"
KORPUS_DATEI = os.path.join(KAPSEL, "korpus-aus-repo.json")
SPUR = os.path.join(KAPSEL, sys.argv[1] if len(sys.argv) > 1 else "spur-chroma-0611.jsonl")
ERG = os.path.join(KAPSEL, sys.argv[2] if len(sys.argv) > 2 else "ergebnis-chroma-0611.json")
MODELL = sys.argv[3] if len(sys.argv) > 3 else "nomic-embed-text"
DIM = int(sys.argv[4]) if len(sys.argv) > 4 else 768
HEIM = os.path.join(KAPSEL, "heim-" + MODELL.replace(":", "-").replace("/", "-"))
K = 5

OLLAMA = "http://127.0.0.1:11434/api/embeddings"

# Die Spur muss ihr Einbett im Namen tragen. Warum das hier steht: ein Lauf, bei dem
# die Shell die Argumente nicht zerlegt, setzt MODELL auf den Default (nomic) und
# laesst den Dateinamen bge-m3 heissen -- eine Datei, deren Name ueber Zahlen luegt,
# die sie nicht selbst gemessen hat. Die Dimensions-Pruefung unten faengt das nicht,
# weil beide Seiten gemeinsam falsch werden koennen.
STUFEN = {"nomic-embed-text": "nomic", "bge-m3": "bge-m3"}
if MODELL not in STUFEN:
    raise SystemExit(f"Einbett ohne Stufen-Kuerzel, Name ist nicht pruefbar: {MODELL}")
STUFE = STUFEN[MODELL]
if STUFE not in os.path.basename(SPUR) or STUFE not in os.path.basename(ERG):
    raise SystemExit(
        f"Name und Einbett gehoeren nicht zusammen: MODELL={MODELL}, Spur={SPUR}, Ergebnis={ERG}"
    )


def einbett(text: str):
    anfrage = urllib.request.Request(
        OLLAMA,
        data=json.dumps({"model": MODELL, "prompt": text}).encode(),
        headers={"Content-Type": "application/json"},
    )
    v = json.load(urllib.request.urlopen(anfrage, timeout=240))["embedding"]
    if len(v) != DIM:
        raise SystemExit(f"Einbettung hat {len(v)} Dimensionen, erwartet {DIM}")
    return v


def exakt_top5(abc: np.ndarray, frage: np.ndarray, k: int):
    """Brute-Force-Cosinus aus denselben Vektoren -- die Vergleichsordnung fuer den Index."""
    norms = np.linalg.norm(abc, axis=1) * np.linalg.norm(frage)
    aehnlichkeit = abc @ frage / np.maximum(norms, 1e-12)
    reihenfolge = np.argsort(-aehnlichkeit, kind="stable")[:k]
    return [float(aehnlichkeit[i]) for i in reihenfolge], [int(i) for i in reihenfolge]


def main():
    daten = json.load(open(KORPUS_DATEI, encoding="utf-8"))
    notizen, fragen = daten["korpus"], daten["fragen"]
    if len(notizen) != 58 or len(fragen) != 45:
        raise SystemExit(f"Korpus-umfang falsch: {len(notizen)} Notizen, {len(fragen)} Anfragen")
    os.makedirs(HEIM, exist_ok=True)

    client = chromadb.PersistentClient(path=HEIM)
    name = "notizen"
    try:
        client.delete_collection(name)
    except Exception:
        pass
    sammlung = client.create_collection(name, metadata={"hnsw:space": "cosine"})

    vektoren = []
    zeit_start = time.time()
    for n in notizen:
        v = einbett(n["text"])
        vektoren.append(v)
    matrix = np.asarray(vektoren, dtype=np.float64)
    sammlung.add(ids=[n["id"] for n in notizen], embeddings=vektoren,
                 documents=[n["text"] for n in notizen])
    dauer_setzen = time.time() - zeit_start

    konfig = sammlung.configuration
    hnsw = konfig["hnsw"] if isinstance(konfig, dict) else konfig.hnsw
    anzahl = sammlung.count()

    zeilen = []
    abweichungen = []
    spur = open(SPUR, "w", encoding="utf-8")
    zeuge = {
        "art": "start",
        "zeit": time.strftime("%H:%M:%S"),
        "werkzeug": "chroma " + chromadb.__version__,
        "python": sys.version.split()[0],
        "einbett": MODELL,
        "dim": DIM,
        "k": K,
        "raum": hnsw["space"],
        "heim": HEIM,
        "index": {k: hnsw[k] for k in ("ef_search", "ef_construction", "max_neighbors", "sync_threshold")},
        "vektoren_im_feld": anzahl,
        "nur_vektoren": True,
        "notizen": len(notizen),
        "anfragen": len(fragen),
    }
    spur.write(json.dumps(zeuge, ensure_ascii=False) + "\n")
    for i, n in enumerate(notizen, 1):
        spur.write(json.dumps({"art": "setze", "i": i, "note": n["id"], "text": n["text"],
                               "sek": 0.0}, ensure_ascii=False) + "\n")

    takt_start = time.time()
    for i, q in enumerate(fragen, 1):
        v = einbett(q["frage"])
        out = sammlung.query(query_embeddings=[v], n_results=K, include=["distances"])
        liste = list(out["ids"][0])
        distanzen = [round(float(d), 6) for d in out["distances"][0]]
        aehnlichkeit, idx = exakt_top5(matrix, np.asarray(v, dtype=np.float64), K)
        exakte_liste = [notizen[j]["id"] for j in idx]
        if exakte_liste != liste:
            abweichungen.append({"i": i, "frage": q["frage"], "chroma": liste, "exakt": exakte_liste})
        erwartet = q["erwartet"]
        top = liste[0] if liste else ""
        zeile = {
            "art": "suche", "i": i, "kategorie": q["kategorie"], "frage": q["frage"],
            "erwartet": erwartet, "top": top, "treffer": top in erwartet,
            "liste": liste, "abstand": distanzen[0] if distanzen else None,
            "exakte_liste": exakte_liste,
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
        "lauf": "chroma-" + MODELL,
        "zeit": time.strftime("%H:%M:%S"),
        "konfiguration": {
            "werkzeug": zeuge["werkzeug"], "python": zeuge["python"], "einbett": MODELL,
            "dim": DIM, "k": K, "raum": hnsw["space"],
            "index": zeuge["index"], "vektoren_im_feld": anzahl,
            "nur_vektoren": True, "wort_suche": False, "fusion": False,
            "zeitstrahl": False, "entitaeten": False,
            "eigner_einbettner_umgangen": True,
        },
        "korpus": {"notizen": len(notizen), "anfragen": len(fragen)},
        "hit1": hit1,
        "hit1_prozent": prozent(hit1, n),
        "recall5_in_den_5": in5,
        "recall5_prozent": prozent(in5, n),
        "nach_kategorie": nach_kategorie,
        "index_abweichungen": len(abweichungen),
        "index_abweichungs_einzeln": abweichungen,
        "dauer_sek": round(dauer_suchen, 1),
        "dauer_setzen_sek": round(dauer_setzen, 1),
        "rss_gib": round(resource.getrusage(resource.RUSAGE_SELF).ru_maxrss / 1024 / 1024 / 1024, 2),
    }
    json.dump(erg, open(ERG, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print(json.dumps({"hit1": hit1, "hit1_prozent": erg["hit1_prozent"],
                      "recall5_prozent": erg["recall5_prozent"],
                      "dauer_sek": erg["dauer_sek"], "rss_gib": erg["rss_gib"],
                      "index_abweichungen": erg["index_abweichungen"]}, ensure_ascii=False))
    print("nach Kategorie:", json.dumps(nach_kategorie, ensure_ascii=False))
    print("index:", json.dumps(zeuge["index"], ensure_ascii=False), "| vektoren im Feld:", anzahl,
          "| sync_threshold verglichen:", anzahl < int(hnsw["sync_threshold"]))


if __name__ == "__main__":
    main()
