"""Unit tests for ILP decompose routing helpers."""

from __future__ import annotations

import asyncio

import pytest

from app.services.llm.image_tools import should_use_ilp_decompose


def test_should_use_ilp_legacy_mode_without_meta(monkeypatch):
    monkeypatch.setattr(
        "app.services.vision.ilp_client.ilp_enabled",
        lambda: True,
    )
    monkeypatch.setattr(
        "app.services.llm.image_tools.settings",
        type("S", (), {"image_layer_pipeline_mode": "legacy"})(),
    )
    assert should_use_ilp_decompose("editElements", None) is False
    assert should_use_ilp_decompose("editText", None) is False


def test_should_use_ilp_ilp_mode(monkeypatch):
    monkeypatch.setattr(
        "app.services.vision.ilp_client.ilp_enabled",
        lambda: True,
    )
    monkeypatch.setattr(
        "app.services.llm.image_tools.settings",
        type("S", (), {"image_layer_pipeline_mode": "ilp"})(),
    )
    assert should_use_ilp_decompose("editElements", None) is True


def test_should_use_ilp_meta_override(monkeypatch):
    monkeypatch.setattr(
        "app.services.vision.ilp_client.ilp_enabled",
        lambda: True,
    )
    monkeypatch.setattr(
        "app.services.llm.image_tools.settings",
        type("S", (), {"image_layer_pipeline_mode": "legacy"})(),
    )
    assert should_use_ilp_decompose("editElements", {"engine": "ilp"}) is True
    assert should_use_ilp_decompose("editElements", {"engine": "legacy"}) is False


def test_decompose_via_ilp_maps_layers(monkeypatch):
    import io

    from PIL import Image

    png = io.BytesIO()
    Image.new("RGB", (64, 48), color=(10, 20, 30)).save(png, format="PNG")
    blob = png.getvalue()

    async def fake_create(_image: str) -> str:
        return "job-1"

    async def fake_wait(_job_id: str) -> dict:
        return {
            "status": "needs_review",
            "meta": {"size": [48, 64]},
            "urls": {
                "far_background": "/files/outputs/job-1/far.png",
                "midground": "/files/outputs/job-1/mid.png",
                "foreground": "/files/outputs/job-1/fg.png",
            },
        }

    async def fake_fetch(_url: str) -> tuple[bytes, str]:
        return blob, "image/png"

    monkeypatch.setattr("app.services.vision.ilp_decompose.create_job", fake_create)
    monkeypatch.setattr("app.services.vision.ilp_decompose.wait_for_job", fake_wait)
    monkeypatch.setattr("app.services.vision.ilp_decompose.fetch_file_bytes", fake_fetch)
    monkeypatch.setattr("app.services.vision.ilp_decompose.ilp_enabled", lambda: True)

    from app.services.vision.ilp_decompose import decompose_via_ilp

    result = asyncio.run(
        decompose_via_ilp(kind="editElements", image="data:image/png;base64,abc")
    )
    assert result["kind"] == "editElements"
    assert result["width"] == 64
    assert result["height"] == 48
    assert len(result["layers"]) == 3
    assert result["layers"][0]["name"] == "远景底图"
    assert str(result["layers"][0]["src"]).startswith("data:image/png;base64,")
