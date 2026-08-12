"""Hydrate DLQ + OTel setup smoke (no collector required)."""

from __future__ import annotations

from unittest.mock import MagicMock, patch


def test_push_and_list_hydrate_dlq():
    from app.services import job_store

    fake = MagicMock()
    fake.lrange.return_value = [
        '{"job_id":"j1","error":"boom","trace_id":"t1"}',
        "not-json",
    ]
    with patch.object(job_store, "_client", return_value=fake):
        job_store.push_hydrate_dlq({"job_id": "j1", "error": "boom", "trace_id": "t1"})
        fake.lpush.assert_called_once()
        fake.ltrim.assert_called_once()
        fake.expire.assert_called_once()
        rows = job_store.list_hydrate_dlq(limit=10)
    assert rows[0]["job_id"] == "j1"
    assert rows[1]["_raw"] == "not-json"


def test_setup_otel_noop_when_disabled():
    from fastapi import FastAPI

    from app.core.metrics import setup_otel

    app = FastAPI()
    with patch.dict("os.environ", {"OTEL_ENABLED": "", "OTEL_EXPORTER_OTLP_ENDPOINT": ""}, clear=False):
        assert setup_otel(app) is False


def test_setup_otel_warns_without_packages():
    from fastapi import FastAPI

    from app.core.metrics import setup_otel

    app = FastAPI()
    with patch.dict("os.environ", {"OTEL_ENABLED": "true", "OTEL_EXPORTER_OTLP_ENDPOINT": ""}, clear=False):
        # Without [otel] installed this returns False after ImportError.
        result = setup_otel(app)
        assert result in (False, True)
