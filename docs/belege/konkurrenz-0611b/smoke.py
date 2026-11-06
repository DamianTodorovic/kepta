import json
import urllib.request
import apsw
import sqlite_vec


def einbett(text):
    anfrage = urllib.request.Request(
        "http://127.0.0.1:11434/api/embeddings",
        data=json.dumps({"model": "nomic-embed-text", "prompt": text}).encode(),
        headers={"Content-Type": "application/json"},
    )
    return json.load(urllib.request.urlopen(anfrage, timeout=180))["embedding"]


v = einbett("Wo läuft die Produktion?")
print("Dimensionen:", len(v))
db = apsw.Connection(":memory:")
db.enableloadextension(True)
db.loadextension(sqlite_vec.loadable_path())
db.enableloadextension(False)
c = db.cursor()
print("vec_version:", c.execute("select vec_version()").fetchone()[0])
c.execute("create virtual table vv using vec0(id text primary key, e float[768] distance_metric=cosine)")
for nid, text in [("m01", "Die Produktions-App läuft auf Hetzner CPX31"), ("m99", "Rechnungen werden monatlich gestellt")]:
    c.execute("insert into vv (id, e) values (?, ?)", (nid, sqlite_vec.serialize_float32(einbett(text))))
for zeile in c.execute("select id, distance from vv where e match ? and k = 2 order by distance",
                       (sqlite_vec.serialize_float32(v),)):
    print("  Rang:", zeile)
