"""P118-Fortsetzung: haelt unsre Fuehrung auch dort, wo das Vergleichsverfahren sich nicht
entscheiden kann?

Die eine Anfrage, die chroma und sqlite-vec an der bge-Stufe trennt, ist ein echter
Gleichstand (m16 gegen m17, Aehnlichkeit gleich auf 16 Stellen, float64 und float32, und
beide melden Abstand 0,499727). Das wirft die unbequeme Frage auf: **ist unsre Fuehrung von
vier bis fuenf Anfragen zum Teil Glueck?** Ein reines KNN kann eine Anfrage nur dann nicht
entscheiden, wenn die beste und die zweitbeste Aehnlichkeit gleich sind -- also wird fuer
alle 45 Anfragen je Stufe der Gleichstands-Zensus gefahren:

  A. Gleichstand auf Platz 1: ist Platz 1 gleich Platz 2 (Abstand <= 1e-12)?
  B. entscheidender Gleichstand: sind darunter genau *teilweise* gueltige Ausweise
     (eine der Notizen gilt, eine andre nicht) -- dann haengt Hit@1 an der Speicherordnung;
  C. Gleichstand tiefer in den ersten fuenf: dieselbe Frage an den Plaetzen 2 bis 5, weil
     dort die Index-Abweichung zwischen chroma und meiner exakten Ordnung lag;
  D. unsre eigne erste Stelle auf denselben Anfragen.

Laeuft gegen Ollama auf 127.0.0.1:
    /tmp/konk-chroma-0611/venv/bin/python docs/belege/konkurrenz-0611e/gleichstands-zensus.py
"""
import json
import os
import urllib.request

import numpy as np

BELEG = os.path.dirname(os.path.abspath(__file__))
OLLAMA = "http://127.0.0.1:11434/api/embeddings"
STUFEN = (("nomic-embed-text", 768, "nomic"), ("bge-m3", 1024, "bge-m3"))
TOLERANZ = 1e-12


def einbett(text, modell):
    anfrage = urllib.request.Request(
        OLLAMA,
        data=json.dumps({"model": modell, "prompt": text}).encode(),
        headers={"Content-Type": "application/json"},
    )
    return np.asarray(json.load(urllib.request.urlopen(anfrage, timeout=240))["embedding"], dtype=np.float64)


korpus = json.load(open(os.path.join(BELEG, "korpus-aus-repo.json"), encoding="utf-8"))
ids = [n["id"] for n in korpus["korpus"]]
texte = [n["text"] for n in korpus["korpus"]]
fragen = [(q["frage"], set(q["erwartet"]), q["kategorie"]) for q in korpus["fragen"]]

for modell, dim, kuerzel in STUFEN:
    print(f"--- Stufe {modell} ({dim} D)")
    abc = np.vstack([einbett(t, modell) for t in texte])
    abc = abc / np.maximum(np.linalg.norm(abc, axis=1, keepdims=True), 1e-12)
    uns = {}
    for zeile in open(os.path.join(BELEG, f"spur-uns-{kuerzel}-0611e.jsonl"), encoding="utf-8"):
        d = json.loads(zeile)
        if d.get("art") == "suche":
            uns[d["frage"]] = d

    platz1 = []
    tiefer = []
    for frage, erwartet, kategorie in fragen:
        v = einbett(frage, modell)
        v = v / max(np.linalg.norm(v), 1e-12)
        aehnlichkeit = abc @ v
        reihenfolge = np.argsort(-aehnlichkeit, kind="stable")
        s1 = float(aehnlichkeit[reihenfolge[0]])
        gruppe = {ids[i] for i in range(len(ids)) if abs(float(aehnlichkeit[i]) - s1) <= TOLERANZ}
        if abs(float(aehnlichkeit[reihenfolge[1]]) - s1) <= TOLERANZ:
            gueltige = gruppe & erwartet
            platz1.append((frage, kategorie, sorted(gruppe), sorted(gueltige),
                           uns[frage]["top"], bool(uns[frage]["treffer"])))
        else:
            # Gleichstaende innerhalb der ersten fuenf Plaetze, aber nicht auf Platz 1
            fenster = reihenfolge[:5]
            for a in range(len(fenster) - 1):
                i, j = fenster[a], fenster[a + 1]
                if abs(float(aehnlichkeit[i]) - float(aehnlichkeit[j])) <= TOLERANZ:
                    tiefer.append((frage, kategorie, ids[i], ids[j], float(aehnlichkeit[i]),
                                   a + 1, sorted({ids[i], ids[j]} & erwartet)))
                    break

    entschieden = [g for g in platz1 if 0 < len(g[3]) < len(g[2])]
    print(f"    A. Gleichstand auf Platz 1: {len(platz1)} von 45 Anfragen")
    print(f"    B. davon haengt Treffer oder Fehlgriff daran: {len(entschieden)}")
    for frage, kategorie, gruppe, gueltige, unser_top, unser_treffer in platz1:
        print(f"       {frage!r} [{kategorie}] Gruppe {gruppe} | gueltige {gueltige} | "
              f"unsre erste Stelle {unser_top} (treffer={unser_treffer})")
    print(f"    C. Gleichstand tiefer in den ersten fuenf (nicht Platz 1): {len(tiefer)} Anfragen")
    for frage, kategorie, i, j, wert, stelle, gueltige in tiefer:
        print(f"       {frage!r} [{kategorie}] Plaetze {stelle} und {stelle + 1}: {i} gegen {j}, "
              f"cos {wert!r} | gueltige darunter {gueltige}")
    print(f"    D. unsre Fusion auf den Platz-1-Gleichstands-Anfragen: "
          f"{sum(1 for g in platz1 if g[5])} von {len(platz1)} getroffen")
