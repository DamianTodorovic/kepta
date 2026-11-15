"""P178: mem0 2.2.1, faire Konfiguration, zweites Einbett (bge-m3) — die Zeile,
die im Konkurrenz-Ledger fehlte: sqlite-vec und chroma haben ihre bge-m3-Stufe
(66,7 / 68,9), mem0 nur ihre nomic-Stufe (51,1). Dieselbe Frage wie P102:
mem0s eigne Rangfolge ohne LLM-Extraktion (infer=False), ganzes Notiz-Stueck,
jetzt mit bge-m3 (1024 D) statt nomic (768 D) — derselbe Embedder, mit dem auch
sqlite-vec, chroma und unsre eigne Spur auf der zweiten Stufe gefahren sind.

Alles lokal: bge-m3 über Ollama, qdrant-local unter /tmp, HOME gekapselt (Wand 3).
Kein Netz nach außen; rückgängig mit `rm -rf /tmp/kepta-mem0`.

Feldnamen wie der 6.11-Fair-Trace, damit dieselbe Auswertung beide liest.
"""
import json
import os
import resource
import sys
import time

from mem0 import Memory

BELEG = os.path.dirname(os.path.abspath(__file__))
HEIM = "/tmp/kepta-mem0/qdrant"
SPUR = os.path.join(BELEG, "spur-mem0-bgem3-0911.jsonl")
ERG = os.path.join(BELEG, "ergebnis-mem0-bgem3-0911.json")
USER = "k58bgem3"

_K = json.load(open(os.path.join(BELEG, "korpus-aus-repo.json"), encoding="utf-8"))
KORPUS, FRAGEN = _K["korpus"], _K["fragen"]

cfg = {
    "vector_store": {"provider": "qdrant", "config": {"collection_name": "k58bgem3", "path": HEIM, "embedding_model_dims": 1024}},
    "llm": {"provider": "ollama", "config": {"model": "llama3.2:3b", "ollama_base_url": "http://127.0.0.1:11434"}},
    "embedder": {"provider": "ollama", "config": {"model": "bge-m3", "ollama_base_url": "http://127.0.0.1:11434", "embedding_dims": 1024}},
    "history_db_path": "/tmp/kepta-mem0/history.db",
}


def zeit():
    return time.strftime("%H:%M:%S")


def rss_gib():
    return resource.getrusage(resource.RUSAGE_SELF).ru_maxrss / (1024 ** 3)


out = open(SPUR, "w")


def schreibe(zeile):
    out.write(json.dumps(zeile, ensure_ascii=False) + "\n")
    out.flush()


t0 = time.time()
schreibe({"art": "start", "zeit": zeit(), "einbett": "bge-m3", "infer": False,
          "heim": HEIM, "notizen": len(KORPUS), "anfragen": len(FRAGEN)})
print("START", zeit(), "| Notizen", len(KORPUS), "| Anfragen", len(FRAGEN), flush=True)

m = Memory.from_config(cfg)
print("Memory gebaut", zeit(), flush=True)

for i, notiz in enumerate(KORPUS, 1):
    t = time.time()
    m.add(notiz["text"], user_id=USER, metadata={"note": notiz["id"]}, infer=False)
    schreibe({"art": "setze", "i": i, "note": notiz["id"], "sek": round(time.time() - t, 1)})
    if i % 10 == 0:
        print("gesetzt", i, "von", len(KORPUS), zeit(), "RSS %.2f GiB" % rss_gib(), flush=True)

treffer = 0
r5 = 0
nach_kat = {}
for q in FRAGEN:
    t = time.time()
    r = m.search(q["frage"], top_k=5, filters={"user_id": USER})
    ergebnisse = r.get("results", [])
    liste = [(e.get("metadata") or {}).get("note") for e in ergebnisse]
    top = liste[0] if liste else None
    hit = top in q["erwartet"]
    in5 = any(x in q["erwartet"] for x in liste[:5])
    treffer += 1 if hit else 0
    r5 += 1 if in5 else 0
    k = q["kategorie"]
    nach_kat.setdefault(k, [0, 0])
    nach_kat[k][0] += 1 if hit else 0
    nach_kat[k][1] += 1
    schreibe({"art": "suche", "frage": q["frage"], "kategorie": k, "erwartet": q["erwartet"],
              "top": top, "treffer": bool(hit), "liste": liste, "sek": round(time.time() - t, 1)})
    print("Q:", "TREFFER" if hit else "daneben", "|", q["frage"][:60], flush=True)

n = len(FRAGEN)
ergebnis = {
    "lauf": "mem0-bgem3-0911",
    "zeit": zeit(),
    "werkzeug": "mem0 2.2.1",
    "konfiguration": {"ganzes_stueck": True, "infer": False, "einbett": "bge-m3 (1024 D)",
                      "llm": "llama3.2:3b (nicht gerufen, infer=False)", "vektor_speicher": "qdrant lokal", "top_k": 5},
    "korpus": {"notizen": len(KORPUS), "anfragen": n},
    "hit1": treffer,
    "hit1_prozent": round(100 * treffer / n, 1),
    "recall5_in_den_5": r5,
    "recall5_prozent": round(100 * r5 / n, 1),
    "nach_kategorie": {k: "%d/%d" % (v[0], v[1]) for k, v in nach_kat.items()},
    "dauer_sek": round(time.time() - t0, 1),
    "rss_gib": round(rss_gib(), 2),
}
json.dump(ergebnis, open(ERG, "w"), ensure_ascii=False, indent=1)
schreibe({"art": "fertig", **ergebnis})
print(json.dumps(ergebnis, ensure_ascii=False), flush=True)
out.close()
