"""P178: cognee 1.6.7 am selben 45-Anfragen-Korpus — die zweite Produkt-Zeile im Konkurrenz-Ledger.

Konfiguration, entschieden, weil sie dieselbe Frage stellt wie der faire mem0-Lauf (P102):
das Produkt darf sein eignes Verfahren fahren — cognees Pipeline ist LLM-basierte
Erfassung (cognify) plus Vektor-/Graph-Retrieval — und wir zählen, was seine Rangfolge
an derselben Aufgabe trifft. Alles lokal: llama3.2:3b + nomic-embed-text über Ollama,
LanceDB unter /tmp, HOME gekapselt (Wand 3). Kein Netz nach außen; rückgängig mit
`rm -rf /tmp/kepta-cognee`.

Der Trace schreibt dieselben Feldnamen wie der mem0-Trace, damit die Auswertung
derselben Einheit folgt (Hit@1, Recall@5, von 45). Zuordnung Chunk -> Notiz über
normalisierten Text-Anfang (kein Metadaten-Kanal in cognees CHUNKS-Antwort);
unmappbare Chunks zählen als Miss und werden geloggt.
"""
import asyncio
import json
import os
import re
import sys
import time

import cognee

try:
    from cognee import SearchType
except ImportError:  # ältere Fassungen
    from cognee.api.v1.search import SearchType  # type: ignore

BELEG = os.path.dirname(os.path.abspath(__file__))
SPUR = os.path.join(BELEG, "spur-cognee-0911.jsonl")
ERG = os.path.join(BELEG, "ergebnis-cognee-0911.json")
SONDE = os.path.join(BELEG, "sonde-cognee-0911.txt")

_K = json.load(open(os.path.join(BELEG, "korpus-aus-repo.json"), encoding="utf-8"))
KORPUS, FRAGEN = _K["korpus"], _K["fragen"]


def norm(s):
    return re.sub(r"[^a-z0-9]+", "", (s or "").lower())


_notiz_norm = {n["id"]: norm(n["text"])[:4000] for n in KORPUS}
_notiz_start = {n["id"]: norm(n["text"])[:80] for n in KORPUS}


def mappe_chunk(text):
    """Chunk-Text -> Notiz-ID: der normalisierte Anfang des Chunks muss im
    normalisierten Notiz-Text stecken; sonst Mittelscheiben, sonst None."""
    c = norm(text)
    for stelle in (0, 40, 80):
        s = c[stelle:stelle + 60]
        if len(s) < 20:
            continue
        for nid, ntext in _notiz_norm.items():
            if s in ntext:
                return nid
    return None


def zeit():
    return time.strftime("%H:%M:%S")


out = open(SPUR, "w")


def schreibe(zeile):
    out.write(json.dumps(zeile, ensure_ascii=False) + "\n")
    out.flush()


async def haupt():
    t0 = time.time()
    schreibe({"art": "start", "zeit": zeit(), "cognee": getattr(cognee, "__version__", "?"),
              "notizen": len(KORPUS), "anfragen": len(FRAGEN)})
    print("START", zeit(), "| cognee", getattr(cognee, "__version__", "?"),
          "| Notizen", len(KORPUS), "| Anfragen", len(FRAGEN), flush=True)

    # ---- Sonde: zwei Notizen, eine Anfrage — der Raum muss gelten, bevor eine Zahl gezeichnet wird.
    sonde_texte = [KORPUS[0]["text"], KORPUS[7]["text"]]
    for t in sonde_texte:
        await cognee.add(t, dataset_name="sonde")
    await cognee.cognify(datasets=["sonde"])
    sres = await cognee.search(query_type=SearchType.CHUNKS, query_text=KORPUS[0]["titel"] or "erster Notiz")
    stexte = [(r if isinstance(r, str) else getattr(r, "text", str(r))) for r in sres]
    gemappt = [mappe_chunk(s) for s in stexte]
    with open(SONDE, "w") as f:
        f.write(f"Sonde {zeit()}: {len(stexte)} Chunk-Ergebnisse, gemappt: {gemappt}\n")
        f.write("\n".join(s[:120].replace("\n", " | ") for s in stexte) + "\n")
    print("SONDE:", len(stexte), "Chunks, gemappt", gemappt, flush=True)
    schreibe({"art": "sonde", "chunks": len(stexte), "gemappt": gemappt})
    if not stexte:
        print("Sonde lieferte keine Chunks — Abbruch, keine Zahl.", flush=True)
        sys.exit(2)

    # ---- Vollfahrt: alle 58 Notizen in ein eigenes Datenset.
    await cognee.delete(datasets=["sonde"]) if hasattr(cognee, "delete") else None
    for i, n in enumerate(KORPUS, 1):
        t = time.time()
        await cognee.add(n["text"], dataset_name="k58")
        if i % 10 == 0:
            print("gesetzt", i, "von", len(KORPUS), zeit(), "%.0f s" % (time.time() - t0), flush=True)
    print("cognify laeuft (LLM-Erfassung, llama3.2:3b lokal) ...", flush=True)
    tc = time.time()
    await cognee.cognify(datasets=["k58"])
    print("cognify fertig", zeit(), "nach %.0f s" % (time.time() - tc), flush=True)
    schreibe({"art": "cognify", "sek": round(time.time() - tc, 1)})

    treffer = 0
    r5 = 0
    unmappbar = 0
    nach_kat = {}
    for q in FRAGEN:
        t = time.time()
        res = await cognee.search(query_type=SearchType.CHUNKS, query_text=q["frage"])
        stexte = [(r if isinstance(r, str) else getattr(r, "text", str(r))) for r in res]
        liste = []
        for s in stexte[:5]:
            nid = mappe_chunk(s)
            if nid is None:
                unmappbar += 1
            liste.append(nid)
        top = liste[0] if liste and liste[0] else None
        hit = top in q["erwartet"]
        in5 = any(x in q["erwartet"] for x in liste[:5])
        treffer += 1 if hit else 0
        r5 += 1 if in5 else 0
        k = q["kategorie"]
        nach_kat.setdefault(k, [0, 0])
        nach_kat[k][0] += 1 if hit else 0
        nach_kat[k][1] += 1
        schreibe({"art": "suche", "frage": q["frage"], "kategorie": k, "erwartet": q["erwartet"],
                  "top": top, "treffer": bool(hit), "liste": liste, "roh": [s[:100] for s in stexte[:5]],
                  "sek": round(time.time() - t, 1)})
        print("Q:", "TREFFER" if hit else "daneben", "|", q["frage"][:60], flush=True)

    n = len(FRAGEN)
    ergebnis = {
        "lauf": "cognee-0911",
        "zeit": zeit(),
        "werkzeug": f"cognee {getattr(cognee, '__version__', '?')}",
        "konfiguration": {"llm": "llama3.2:3b (cognify)", "einbett": "nomic-embed-text",
                          "vektor_speicher": "lancedb lokal", "suchtyp": "CHUNKS", "top_k": 5},
        "korpus": {"notizen": len(KORPUS), "anfragen": n},
        "hit1": treffer,
        "hit1_prozent": round(100 * treffer / n, 1),
        "recall5_in_den_5": r5,
        "recall5_prozent": round(100 * r5 / n, 1),
        "unmappbare_chunks": unmappbar,
        "nach_kategorie": {k: "%d/%d" % (v[0], v[1]) for k, v in nach_kat.items()},
        "dauer_sek": round(time.time() - t0, 1),
    }
    json.dump(ergebnis, open(ERG, "w"), ensure_ascii=False, indent=1)
    schreibe({"art": "fertig", **ergebnis})
    print(json.dumps(ergebnis, ensure_ascii=False), flush=True)


asyncio.run(haupt())
out.close()
