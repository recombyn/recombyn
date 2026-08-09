from app.services.design.prompts.prompt_pack_store import (
    list_prompt_nodes_from_flow,
    seed_prompt_overlay_nodes,
)
from app.services.design.prompts.skill_store import format_skills_details


def test_seed_prompt_overlay_nodes_empty():
    """need_* overlay nodes are not seeded (skills carry playbooks)."""
    nodes = seed_prompt_overlay_nodes()
    assert nodes == []


def test_methodology_lives_in_skills():
    from app.services.design.prompts.skill_store import (
        _SEED as _SKILL_SEED,
        ensure_design_skills,
        reset_skills_ready_for_tests,
    )

    reset_skills_ready_for_tests()
    ensure_design_skills(force=True)
    details = format_skills_details(keys=["design_methodology"], scene="website")
    assert "create_shape" in details and "create_text" in details
    assert "skill: design_methodology" in details or "design_methodology" in details
    seed_pos = next(
        (
            str(it.get("prompt_positive") or "")
            for it in _SKILL_SEED
            if it.get("skill_key") == "design_methodology"
        ),
        "",
    )
    assert (
        "brief → 结构" in seed_pos
        or "brief → structure" in seed_pos
        or "自检" in seed_pos
        or "self-check" in seed_pos
    )


def test_list_prompt_nodes_from_explicit_graph():
    graph = {
        "nodes": [
            {
                "id": "prompt_custom",
                "kind": "prompt",
                "phaseKey": "prompt_custom",
                "promptText": "custom body with create_shape",
                "inject": {"scenes": "all"},
            }
        ],
        "edges": [],
    }
    rows = list_prompt_nodes_from_flow(graph=graph)
    assert any(r["kind"] == "custom" for r in rows)
    assert any("create_shape" in str(r.get("body") or "") for r in rows)


def test_ensure_prompt_packs_resyncs_body_from_seed(tmp_path, monkeypatch):
    """Re-running ensure overwrites DB body with git seed (seed is source of truth)."""
    from sqlmodel import Session

    from app import crud
    from app.core.db import engine, reset_engine
    from app.services.design.prompts import prompt_pack_store as pps
    from tests.conftest import restore_default_sqlite_engine

    db_path = tmp_path / "packs.db"
    monkeypatch.setenv("SQLITE_DB_PATH", str(db_path))
    monkeypatch.setenv("DATABASE_URL", "")
    from app.core.config import settings as settings_mod

    settings_mod.sqlite_db_path = str(db_path)
    settings_mod.database_url = ""
    reset_engine()
    pps._PACKS_READY = False
    try:
        pps.ensure_design_prompt_packs()
        with Session(engine) as session:
            rows = crud.list_all_design_prompt_packs(session=session)
            assert rows
            target = rows[0]
            kind = target.kind
            seed_body = str(
                (pps._SEED_BY_KIND.get(kind) or {}).get("body") or ""
            )
            assert seed_body.strip()
            target.body = "ADMIN_EDITED_BODY_SHOULD_BE_OVERWRITTEN"
            session.add(target)
            session.commit()

        pps._PACKS_READY = False
        pps.ensure_design_prompt_packs()
        with Session(engine) as session:
            again = crud.list_design_prompt_packs_by_kind(session=session, kind=kind)
            assert again
            assert again[0].body.replace("\r\n", "\n").strip() == seed_body.replace(
                "\r\n", "\n"
            ).strip()
    finally:
        pps._PACKS_READY = False
        restore_default_sqlite_engine()


def test_oss_ask_system_seed_documents_choice_ui():
    from app.services.design.prompts.prompt_pack_store import _SEED_BY_KIND

    body = str((_SEED_BY_KIND.get("agent.prompt.ask_system") or {}).get("body") or "")
    assert "choice_ui" in body
    assert "apply" in body and "dismiss" in body
    assert "提案确认" in body or "Propose / confirm" in body or "Propose canvas work" in body
    assert "问法策略" in body or "Ask strategy" in body
    assert "每轮只问" in body or "One blocking question" in body
