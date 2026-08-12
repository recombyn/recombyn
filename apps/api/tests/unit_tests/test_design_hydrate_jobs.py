"""Unit tests for async job store + hydrate enqueue (ADR 0005)."""

from __future__ import annotations

from typing import Any
from unittest.mock import MagicMock

import pytest


def test_job_store_kind_prefixes_keys():
    from app.services import job_store as js

    assert js.job_key("abc", kind="import") == "import_job:abc"
    assert js.job_key("abc", kind="hydrate") == "hydrate_job:abc"
    assert js.job_key("abc", kind="Hydrate!") == "hydrate__job:abc"


def test_run_image_hydrate_job_persists_result(monkeypatch: pytest.MonkeyPatch):
    from worker import tasks as wt

    store: dict[str, dict[str, Any]] = {
        "j1": {
            "job_id": "j1",
            "ops": [
                {
                    "name": "create_image",
                    "args": {"genPrompt": "a red square", "width": 100, "height": 100},
                }
            ],
            "limit": 2,
            "policy": "auto",
            "rules": {},
        }
    }

    def _get(job_id: str, *, kind: str = "import"):
        assert kind == "hydrate"
        return store.get(job_id)

    def _update(job_id: str, *, kind: str = "import", **fields: Any):
        assert kind == "hydrate"
        cur = store.setdefault(job_id, {"job_id": job_id})
        cur.update(fields)
        return cur

    async def _fake_hydrate(ops, **_k):
        out = []
        for op in ops:
            args = dict(op.get("args") or {})
            args["src"] = "https://example.com/x.png"
            out.append({"name": "create_image", "args": args})
        return out, 1

    monkeypatch.setattr(wt, "get_job", _get)
    monkeypatch.setattr(wt, "update_job", _update)
    monkeypatch.setattr(
        "app.services.design.ops.image_hydrate._hydrate_tool_ops_images",
        _fake_hydrate,
    )

    result = wt.run_image_hydrate_job.run("j1")
    assert result["status"] == "done"
    assert result["filled"] == 1
    assert store["j1"]["status"] == "done"
    assert store["j1"]["progress"] == 100
    assert store["j1"]["result"]["filled"] == 1
    assert store["j1"]["result"]["ops"][0]["args"]["src"].startswith("https://")


def test_create_hydrate_job_enqueues(monkeypatch: pytest.MonkeyPatch):
    from fastapi.testclient import TestClient

    from app.main import app
    from app.api import deps
    from app.services.auth import SessionUser

    saved: dict[str, Any] = {}

    def _save(job_id: str, payload: dict[str, Any], *, kind: str = "import"):
        saved["kind"] = kind
        saved["job_id"] = job_id
        saved["payload"] = payload

    delay = MagicMock()

    monkeypatch.setattr("app.api.routes.design_hydrate_jobs.save_job", _save)
    monkeypatch.setattr("app.api.routes.design_hydrate_jobs.run_image_hydrate_job.delay", delay)
    app.dependency_overrides[deps.get_current_user] = lambda: SessionUser(
        id="u1",
        email="t@example.com",
        name="t",
        avatar=None,
        provider="email",
        role="user",
    )

    try:
        client = TestClient(app)
        res = client.post(
            "/api/v1/design/hydrate/jobs",
            json={
                "ops": [{"name": "create_image", "args": {"genPrompt": "cat"}}],
                "limit": 2,
            },
        )
        assert res.status_code == 200, res.text
        body = res.json()
        assert body["status"] == "queued"
        assert body["job_id"]
        assert saved["kind"] == "hydrate"
        delay.assert_called_once()
    finally:
        app.dependency_overrides.clear()
