"""ADR 0006 façade + Alembic single-head gate."""

from __future__ import annotations

from pathlib import Path


def test_resolve_chat_endpoint_aliases_get_llm_endpoint(monkeypatch):
    from app.services import llm as mod

    sentinel = mod.LlmEndpoint(
        base_url="https://example.test/v1",
        api_key="k",
        model_id="m",
        provider="doubao",
    )
    monkeypatch.setattr(mod, "get_llm_endpoint", lambda model_string=None: sentinel)
    assert mod.resolve_chat_endpoint("any") is sentinel


def test_chat_model_for_delegates_to_build_chat_model(monkeypatch):
    from app.services import llm as mod

    called: dict[str, object] = {}

    def _fake(model=None, **kwargs):
        called["model"] = model
        called["kwargs"] = kwargs
        return "llm-stub"

    monkeypatch.setattr(mod, "build_chat_model", _fake)
    out = mod.chat_model_for("deepseek-v4-flash", streaming=True, source="test")
    assert out == "llm-stub"
    assert called["model"] == "deepseek-v4-flash"
    assert called["kwargs"]["streaming"] is True
    assert called["kwargs"]["source"] == "test"


def test_memory_tiers_documented():
    from app.services.agent_memory.service import MEMORY_TIERS

    assert set(MEMORY_TIERS) == {"session", "project", "global"}
    for note in MEMORY_TIERS.values():
        assert note.strip()


def test_alembic_single_head():
    """CI gate: migration graph must have exactly one head (no branches)."""
    from alembic.config import Config
    from alembic.script import ScriptDirectory

    api_root = Path(__file__).resolve().parents[2]
    cfg = Config(str(api_root / "alembic.ini"))
    script = ScriptDirectory.from_config(cfg)
    heads = script.get_heads()
    assert len(heads) == 1, f"expected one alembic head, got {heads}"
