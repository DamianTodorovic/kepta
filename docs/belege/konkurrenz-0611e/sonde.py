"""P118-Vorlauf: chroma 1.5.9 -- erst die Sonde, dann das Korpus.

Was diese Sonde beantwortet, bevor eine einzige Nummer gezeichnet wird:
  1. welche chroma-Fassung laeuft, und ob der Cosinus-Raum wirklich gesetzt ist
     (chroma nimmt unbekannte Metadaten-Schluessel lautlos hin -- ein Raum, der
     nicht gilt, wuerde eine andre Zahl liefern und trotzdem "cosine" heissen);
  2. ob der Abstand in der Antwort tatsaechlich 1 - Cosinus-Aehnlichkeit ist;
  3. welche Index-Parameter chroma setzt, denn chroma ist ein *naehernder* Index
     (HNSW), sqlite-vec dagegen hat exakt gerechnet -- eine Abweichung zwischen den
     beiden Waeren ein Index-Befund, nicht ein Methoden-Befund;
  4. ob ein selbst mitgebrachtes Einbett den eingebauten ONNX-Einbettner des
     Produkts vollstaendig umgeht (sonst waere es nicht "dasselbe Einbett wie unsres").

Rueckgaengig: rm -rf /tmp/konk-chroma-0611
"""
import json
import math
import os
import sys

import chromadb
from chromadb.api.types import QueryResult

HEIM = "/tmp/konk-chroma-0611/heim-sonde"
os.makedirs(HEIM, exist_ok=True)

client = chromadb.PersistentClient(path=HEIM)
print("chroma Version:", chromadb.__version__)

a = [1.0, 0.0, 0.0]
b = [0.0, 1.0, 0.0]
c = [0.7071, 0.7071, 0.0]  # 45 Grad zu a


def probe(raum: str):
    name = f"sonde-{raum}"
    try:
        client.delete_collection(name)
    except Exception:
        pass
    col = client.create_collection(name, metadata={"hnsw:space": raum})
    col.add(ids=["a", "b", "c"], embeddings=[a, b, c], documents=["A", "B", "C"])
    out: QueryResult = col.query(query_embeddings=[a], n_results=3, include=["distances"])
    ids = out["ids"][0]
    dist = [round(float(d), 6) for d in out["distances"][0]]
    meta = dict(col.metadata or {})
    return dict(raum=raum, ids=ids, distanzen=dist, meta=meta)


for r in ("cosine", "l2", "ip"):
    print(json.dumps(probe(r), ensure_ascii=False))

# Cosinus von Hand: 1 - (a . x / |a| |x|)
erwartete_c = round(1 - 0.7071 / math.sqrt(0.7071 ** 2 + 0.7071 ** 2), 6)
print("1 - cos(a,c) von Hand:", erwartete_c)

# Liest chroma die Konfiguration auch zurueck, wenn man die neuere API fragt?
col = client.get_collection("sonde-cosine")
cfg = {}
try:
    cfg = col.configuration
except Exception as e:  # aeltere Fassungen kennen kein configuration-Feld
    cfg = {"fehler": str(e)}
print("configuration:", json.dumps(cfg, ensure_ascii=False, default=str)[:700])

# Einbett-Aufruf: ein selbst gesetztes Einbett duerfe nirgends den eingebauten
# Einbettner des Produkts ziehen lassen. Ein leeres Dokument plus eigenes Einbett
# ist der Test; der eingebaute Einbettner wuerde onnxruntime laden und 384 D bringen.
try:
    client.delete_collection("umgehung")
except Exception:
    pass
um = client.create_collection("umgehung", metadata={"hnsw:space": "cosine"})
um.add(ids=["x"], embeddings=[[0.1] * 8], documents=["nur ein Text"])
print("dim der eigenen Einbettung:", len(um.get(ids=["x"], include=["embeddings"])["embeddings"][0]))
print("abfrage-Treffer:", json.dumps(um.query(query_embeddings=[[0.1] * 8], n_results=1,
                                              include=["distances"])["ids"], ensure_ascii=False))
print("python:", sys.version.split()[0])
