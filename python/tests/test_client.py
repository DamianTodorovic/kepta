"""Tests gegen einen Stub-Server — kein laufendes KEPTA nötig."""

from __future__ import annotations

import json
import threading
from http.server import BaseHTTPRequestHandler, HTTPServer

import pytest

from kepta import KeptaClient, KeptaError, Memory, SearchHit, discover_url

CALLS: list[tuple[str, str, dict | None]] = []


class Stub(BaseHTTPRequestHandler):
    def log_message(self, *args):  # Testlauf ruhig halten
        pass

    def _send(self, payload, status=200):
        body = json.dumps(payload).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _read(self):
        n = int(self.headers.get("Content-Length") or 0)
        return json.loads(self.rfile.read(n)) if n else None

    def do_GET(self):
        CALLS.append(("GET", self.path, None))
        if self.path.startswith("/api/health"):
            return self._send({"ok": True, "version": "2.5.1", "count": 2})
        if self.path.startswith("/api/memories"):
            trash = "trash=1" in self.path
            return self._send([{"id": "m2" if trash else "m1",
                                "title": "Papierkorb" if trash else "Wohnort",
                                "content": "x", "tags": ["personal"], "type": "semantic"}])
        if self.path.startswith("/api/graph"):
            return self._send({"entities": [], "relations": []})
        return self._send({"error": "unbekannt"}, 404)

    def do_POST(self):
        body = self._read()
        CALLS.append(("POST", self.path, body))
        if self.path.startswith("/api/search"):
            return self._send({"results": [
                {"memory": {"id": "m1", "title": "Rezept Carbonara", "content": "Guanciale",
                            "tags": ["kochen"], "type": "semantic"},
                 "score": 0.91, "cosineScore": 0.7, "bm25Score": 0.5}
            ]})
        if self.path.endswith("/restore"):
            return self._send({"ok": True})
        if self.path.startswith("/api/memories"):
            return self._send({"memory": {"id": body.get("id", "neu"), "title": body.get("title", ""),
                                          "content": body.get("content", ""), "tags": body.get("tags", []),
                                          "type": body.get("type", "semantic")}})
        return self._send({"error": "unbekannt"}, 404)

    def do_DELETE(self):
        CALLS.append(("DELETE", self.path, None))
        return self._send({"ok": True, "permanent": "permanent=1" in self.path})


@pytest.fixture()
def client():
    CALLS.clear()
    srv = HTTPServer(("127.0.0.1", 0), Stub)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    yield KeptaClient(f"http://127.0.0.1:{srv.server_address[1]}")
    srv.shutdown()


def test_health_und_is_alive(client):
    assert client.health()["version"] == "2.5.1"
    assert client.is_alive() is True


def test_list_liefert_memories(client):
    memories = client.list()
    assert isinstance(memories[0], Memory)
    assert memories[0].title == "Wohnort"


def test_list_trash_setzt_parameter(client):
    assert client.list(trash=True)[0].title == "Papierkorb"
    assert "trash=1" in CALLS[-1][1]


def test_list_ohne_trash_haengt_keinen_parameter_an(client):
    client.list()
    assert "?" not in CALLS[-1][1]


def test_search_liefert_treffer_mit_teilwerten(client):
    hits = client.search("was koche ich mit Nudeln", top_k=3)
    assert isinstance(hits[0], SearchHit)
    assert hits[0].memory.title == "Rezept Carbonara"
    assert hits[0].score == pytest.approx(0.91)
    assert hits[0].vector_score == pytest.approx(0.7)
    assert CALLS[-1][2]["topK"] == 3


def test_search_begrenzt_top_k(client):
    client.search("x", top_k=9999)
    assert CALLS[-1][2]["topK"] == 100
    client.search("x", top_k=0)
    assert CALLS[-1][2]["topK"] == 1


def test_search_reicht_filter_durch(client):
    client.search("x", tags=["kochen"], type="episodic", scope="agent")
    body = CALLS[-1][2]
    assert body["tags"] == ["kochen"] and body["type"] == "episodic" and body["scope"] == "agent"


def test_save_schickt_felder(client):
    m = client.save("Titel", "Inhalt", tags=["a"], type="procedural", confidence=0.8)
    assert m.title == "Titel"
    body = CALLS[-1][2]
    assert body["tags"] == ["a"] and body["type"] == "procedural" and body["confidence"] == 0.8


def test_save_klemmt_konfidenz_in_den_bereich(client):
    client.save("t", "c", confidence=5)
    assert CALLS[-1][2]["confidence"] == 1.0
    client.save("t", "c", confidence=-3)
    assert CALLS[-1][2]["confidence"] == 0.0


def test_update_uebersetzt_schluessel_nach_camelcase(client):
    client.update("m1", valid_to=123, tags=["x"])
    body = CALLS[-1][2]
    assert body["id"] == "m1" and body["validTo"] == 123 and body["tags"] == ["x"]
    assert "valid_to" not in body


def test_delete_standard_ist_papierkorb(client):
    assert client.delete("m1") is True
    assert "permanent" not in CALLS[-1][1]


def test_delete_permanent_setzt_parameter(client):
    client.delete("m1", permanent=True)
    assert "permanent=1" in CALLS[-1][1]


def test_restore(client):
    assert client.restore("m1") is True


def test_graph(client):
    assert client.graph() == {"entities": [], "relations": []}


def test_fehler_bei_nicht_erreichbarem_server():
    c = KeptaClient("http://127.0.0.1:9")  # Port 9 nimmt keine Verbindungen an
    with pytest.raises(KeptaError, match="unreachable"):
        c.health()
    assert c.is_alive() is False


def test_http_fehler_wird_zu_kepta_error(client):
    with pytest.raises(KeptaError, match="404"):
        client._request("GET", "/api/gibtesnicht")


class TestMemory:
    def test_abgelaufen(self):
        assert Memory(id="1", title="t", content="c", valid_to=1).is_expired is True
        assert Memory(id="1", title="t", content="c", valid_to=None).is_expired is False

    def test_ersetzt(self):
        assert Memory(id="1", title="t", content="c", superseded_by="m2").is_superseded is True
        assert Memory(id="1", title="t", content="c").is_superseded is False

    def test_from_api_faengt_fehlende_felder_ab(self):
        m = Memory.from_api({})
        assert m.id == "" and m.tags == [] and m.type == "semantic"


class TestDiscoverUrl:
    def test_env_hat_vorrang(self, monkeypatch):
        monkeypatch.setenv("KEPTA_URL", "http://beispiel.test:1234/")
        assert discover_url() == "http://beispiel.test:1234"

    def test_liest_adressdatei(self, monkeypatch, tmp_path):
        monkeypatch.delenv("KEPTA_URL", raising=False)
        monkeypatch.setenv("KEPTA_DATA_DIR", str(tmp_path))
        (tmp_path / "endpoint.json").write_text(json.dumps({"url": "http://127.0.0.1:59999"}))
        assert discover_url() == "http://127.0.0.1:59999"

    def test_faellt_auf_standard_zurueck(self, monkeypatch, tmp_path):
        monkeypatch.delenv("KEPTA_URL", raising=False)
        monkeypatch.setenv("KEPTA_DATA_DIR", str(tmp_path))
        assert discover_url() == "http://127.0.0.1:3000"

    def test_kaputte_adressdatei_bricht_nicht(self, monkeypatch, tmp_path):
        monkeypatch.delenv("KEPTA_URL", raising=False)
        monkeypatch.setenv("KEPTA_DATA_DIR", str(tmp_path))
        (tmp_path / "endpoint.json").write_text("kein json")
        assert discover_url() == "http://127.0.0.1:3000"
