"""P118-Nachtrag: die Gleichstaende zwischen m16 und m17, in beiden Stufen und in beiden
Rechenwegen -- weil die Frage nicht ist, ob zwei Notizen sich aehnlich sind, sondern ob
irgendein Rundungsschritt sie trennt.

Zwei Anfragen, dieselben zwei Notizen:
  bge-m3, "Hetzner"             -- hier entscheidet sich die Konkurrenz-Zahl (31 gegen 30)
  nomic,  "Deployment und Domain" -- hier weicht chroma von meiner egnen exakten Ordnung ab
Erwartet sind fuer "Hetzner" m01, m16, m36, m37: m16 gilt, m17 nicht.

Gemessen wird die Aehnlichkeit auf zwei Wegen: float64 (meine Rechnung) und float32 (der
Pfad, den beide Werkzeuge speichern). Sind beide Wege fuer beide Notizen gleich, ist der
Gleichstand **kein Rundungs-Effekt**, sondern eine echte Gleichheit -- und dann entscheidet
nur die Speicherordnung des Produkts, welches zuerst steht.

Laeuft ohne Kapsel, nur gegen Ollama auf 127.0.0.1 und die committeten Spuren:
    python3 docs/belege/konkurrenz-0611e/gleichstand-hetzner.py
"""
import json
import os
import urllib.request

import numpy as np

BELEG = os.path.dirname(os.path.abspath(__file__))
OLLAMA = "http://127.0.0.1:11434/api/embeddings"
FELLE = (("bge-m3", "Hetzner"), ("nomic-embed-text", "Deployment und Domain"))


def einbett(text, modell):
    anfrage = urllib.request.Request(
        OLLAMA,
        data=json.dumps({"model": modell, "prompt": text}).encode(),
        headers={"Content-Type": "application/json"},
    )
    return np.asarray(json.load(urllib.request.urlopen(anfrage, timeout=240))["embedding"], dtype=np.float64)


def cos(a, b):
    return float(a @ b / (np.linalg.norm(a) * np.linalg.norm(b)))


def cos32(a, b):
    a32, b32 = a.astype(np.float32), b.astype(np.float32)
    return float(a32 @ b32 / (np.linalg.norm(a32) * np.linalg.norm(b32)))


korpus = json.load(open(os.path.join(BELEG, "korpus-aus-repo.json"), encoding="utf-8"))
texte = {n["id"]: n["text"] for n in korpus["korpus"]}

for modell, frage in FELLE:
    q = einbett(frage, modell)
    print(f"--- Stufe {modell}, Frage {frage!r}")
    for mid in ("m16", "m17"):
        v = einbett(texte[mid], modell)
        print(f"  {mid}: float64 cos = {cos(q, v)!r} | float32-Pfad cos = {cos32(q, v)!r}")
    v16, v17 = einbett(texte["m16"], modell), einbett(texte["m17"], modell)
    for weg, f in (("float64", cos), ("float32", cos32)):
        gleich = round(f(q, v16), 16) == round(f(q, v17), 16)
        print(f"  m16 und m17 gleich auf 16 Stellen, {weg}: {gleich} "
              f"({round(f(q, v16), 16)} / {round(f(q, v17), 16)})")

for pfad, werk in ((os.path.join(BELEG, "spur-chroma-bge-m3-eins.jsonl"), "chroma 1.5.9, bge-m3"),
                   (os.path.join(BELEG, "..", "konkurrenz-0611b", "spur-sqlitevec-bge-m3.jsonl"),
                    "sqlite-vec 0.1.9, bge-m3"),
                   (os.path.join(BELEG, "spur-chroma-nomic-eins.jsonl"), "chroma 1.5.9, nomic"),
                   (os.path.join(BELEG, "..", "konkurrenz-0611b", "spur-sqlitevec-0611.jsonl"),
                    "sqlite-vec 0.1.9, nomic")):
    for zeile in open(pfad, encoding="utf-8"):
        d = json.loads(zeile)
        if d.get("art") == "suche" and d.get("frage") in {f for _, f in FELLE}:
            print(f"{werk}: {d['frage']!r} top {d['top']}, Abstand {d['abstand']}, Liste {d['liste'][:5]}")
