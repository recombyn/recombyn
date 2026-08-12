"""ADR 0006 façade + Alembic single-head gate."""

from __future__ import annotations

from pathlib import Path


def test_llm_facade_exports_endpoint_and_chat_model():
    from app.services import llm as mod

    assert callable(mod.get_llm_endpoint)
    assert callable(mod.build_chat_model)
    assert not hasattr(mod, "resolve_chat_endpoint")
    assert not hasattr(mod, "chat_model_for")


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
