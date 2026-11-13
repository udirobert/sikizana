"""Anonymous game telemetry: validation, storage, and the gated summary."""

from __future__ import annotations

import json

import pytest
from fastapi.testclient import TestClient

from src.api.main import app


@pytest.fixture()
def client(tmp_path, monkeypatch):
    monkeypatch.setenv("GAME_TELEMETRY_PATH", str(tmp_path / "events.jsonl"))
    return TestClient(app)


def _post(client, payload):
    return client.post("/api/game/telemetry", content=json.dumps(payload))


def test_records_a_chapter_event_without_identifying_the_player(client, tmp_path):
    r = _post(client, {"event": "chapter_reached", "stage": "ch1", "market": "souq"})
    assert r.status_code == 204
    assert r.headers["access-control-allow-origin"] == "*"

    stored = (tmp_path / "events.jsonl").read_text().strip().splitlines()
    assert len(stored) == 1
    row = json.loads(stored[0])
    assert row["stage"] == "ch1" and row["market"] == "souq"
    # The whole payload: timestamp, event, stage, market, and the run flags.
    assert set(row) == {"at", "event", "stage", "market", "delta", "partial", "replay"}


def test_rejects_an_unknown_market(client):
    r = _post(client, {"event": "chapter_reached", "stage": "ch1", "market": "mars"})
    assert r.status_code == 422


def test_a_finished_run_must_have_reached_the_finale(client):
    r = _post(client, {"event": "run_finished", "stage": "ch2", "market": "uk", "delta": 1.0})
    assert r.status_code == 422


def test_rejects_an_absurd_delta(client):
    r = _post(client, {"event": "run_finished", "stage": "finale", "market": "uk", "delta": 5000})
    assert r.status_code == 422


def test_summary_is_off_until_a_key_is_configured(client, monkeypatch):
    monkeypatch.delenv("MCP_API_KEY", raising=False)
    assert client.get("/api/game/telemetry/summary").status_code == 503


def test_summary_counts_the_funnel_for_the_operator(client, monkeypatch):
    monkeypatch.setenv("MCP_API_KEY", "test-key")
    for stage in ("ch1", "ch2", "ch3"):
        _post(client, {"event": "chapter_reached", "stage": stage, "market": "uk"})
    _post(client, {"event": "run_finished", "stage": "finale", "market": "uk", "delta": 4.0, "replay": False})
    _post(client, {"event": "chapter_reached", "stage": "ch1", "market": "souq"})
    _post(client, {"event": "run_finished", "stage": "finale", "market": "souq", "delta": -2.0, "replay": True})

    assert client.get("/api/game/telemetry/summary").status_code == 401
    r = client.get("/api/game/telemetry/summary", headers={"x-api-key": "test-key"})
    assert r.status_code == 200
    body = r.json()
    assert body["starts"] == 2
    assert body["finished"] == 2
    assert body["finish_rate"] == 1.0
    assert body["replays"] == 1
    assert body["replays_improved"] == 1  # only the positive delta counts
    assert body["by_market"] == {"uk": 4, "souq": 2}
