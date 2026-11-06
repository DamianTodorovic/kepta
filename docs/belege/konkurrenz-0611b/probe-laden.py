import apsw, sqlite_vec, sys, os, glob

print("python:", sys.version.split()[0])
print("apsw-Version:", apsw.versioninfo, "| sqlite-Bibliothek:", apsw.sqlitelibversion if hasattr(apsw, "sqlitelibversion") else apsw.version)
ordner = os.path.dirname(sqlite_vec.__file__)
print("sqlite-vec-Dateien:", sorted(os.path.basename(p) for p in glob.glob(os.path.join(ordner, "*"))))
db = apsw.Connection(":memory:")
try:
    sqlite_vec.load(db)
    for zeile in db.cursor().execute("select vec_version()"):
        print("vec_version ueber apsw:", zeile[0])
except Exception as e:
    print("sqlite_vec.load(db) fehlgeschlagen:", type(e).__name__, e)
    try:
        dylib = [p for p in glob.glob(os.path.join(ordner, "*.dylib")) + glob.glob(os.path.join(ordner, "**", "*.dylib"), recursive=True)][0]
        db.enableloadext(True)
        db.loadextension(dylib)
        print("vec_version ueber loadextension:", next(db.cursor().execute("select vec_version()"))[0], "|", dylib)
    except Exception as e2:
        print("auch das nicht:", type(e2).__name__, e2)
