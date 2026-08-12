"""Unit tests for design skill_store — pluggable source + triggers + files."""

from __future__ import annotations

from app.services.design.prompts.skill_store import (
    NS_CORE,
    NS_EXT,
    NS_USER,
    SOURCE_ADMIN,
    SOURCE_SEED,
    _apply_mutex,
    _load_file_skills,
    _rule_matches,
    ensure_design_skills,
    filter_need_resources_by_skill_acl,
    filter_ops_by_skill_allowlist,
    format_skills_catalog,
    format_skills_details,
    normalize_need_skills,
    parse_need_skills_with_pins,
    parse_skill_pin,
    qualify_skill_key,
    reload_skills_if_disk_changed,
    reset_skills_ready_for_tests,
    resolve_storage_skill_key,
    resolve_triggered_skill_keys,
    skill_resource_allowlist,
    split_namespace_key,
    validate_against_schema,
    validate_skill_meta,
)
from app import crud


def setup_function() -> None:
    reset_skills_ready_for_tests()
    ensure_design_skills(force=True)





def test_skills_catalog_and_details_roundtrip():
    catalog = format_skills_catalog(scene="website")
    assert "need_skills" in catalog
    assert "poster_craft" in catalog
    assert "image_gen" in catalog
    details = format_skills_details(
        keys=["poster_craft", "image_gen"],
        scene="website",
    )
    assert "skill: poster_craft" in details
    assert "preferred_tools" in details


def test_rule_matches_min_prompt_chars():
    assert _rule_matches(
        {"intent_in": ["create"], "min_prompt_chars": 24},
        empty_canvas=False,
        has_images=False,
        intent="create",
        prompt_chars=30,
    )
    assert not _rule_matches(
        {"intent_in": ["create"], "min_prompt_chars": 24},
        empty_canvas=False,
        has_images=False,
        intent="create",
        prompt_chars=10,
    )


def test_rule_matches_prompt_includes_any():
    rule = {
        "intent_in": ["create"],
        "prompt_includes_any": ["海报", "poster"],
    }
    assert _rule_matches(
        rule,
        empty_canvas=True,
        has_images=False,
        intent="create",
        prompt="帮我做一张海报",
    )
    assert not _rule_matches(
        rule,
        empty_canvas=True,
        has_images=False,
        intent="create",
        prompt="画一个登录页",
    )


def test_resolve_triggered_poster_keyword():
    keys = resolve_triggered_skill_keys(
        scene="website",
        empty_canvas=True,
        has_images=False,
        intent="create",
        prompt="做一张活动海报",
    )
    assert "poster_craft" in keys
    keys2 = resolve_triggered_skill_keys(
        scene="website",
        empty_canvas=True,
        has_images=False,
        intent="create",
        prompt="随便画点什么",
    )
    assert "poster_craft" not in keys2


def test_resolve_triggered_empty_canvas_create():
    keys = resolve_triggered_skill_keys(
        scene="website",
        empty_canvas=True,
        has_images=False,
        intent="create",
    )
    assert "image_gen" in keys


def test_resolve_triggered_long_create_prompt():
    keys = resolve_triggered_skill_keys(
        scene="website",
        empty_canvas=False,
        has_images=False,
        intent="create",
        prompt_chars=40,
    )
    assert "image_gen" in keys


def test_resolve_triggered_images_create():
    keys = resolve_triggered_skill_keys(
        scene="website",
        empty_canvas=False,
        has_images=True,
        intent="create",
    )
    # Look-at-image is Decide (attachments + design_brief), not a skill trigger.
    assert "vision_extract" not in keys


def test_resolve_triggered_skips_chat():
    assert (
        resolve_triggered_skill_keys(
            scene="website",
            empty_canvas=True,
            has_images=False,
            intent="chat",
        )
        == []
    )


def test_mutex_keeps_highest_weight():
    rows = [
        {"skillKey": "a", "mutexGroup": "g", "sortWeight": 10},
        {"skillKey": "b", "mutexGroup": "g", "sortWeight": 5},
        {"skillKey": "c", "mutexGroup": None, "sortWeight": 1},
    ]
    out = _apply_mutex(rows)
    assert [r["skillKey"] for r in out] == ["a", "c"]


def test_filter_ops_allowlist():
    ops = [
        {"name": "create_shape", "args": {}},
        {"name": "explode_canvas", "args": {}},
        {"name": "align_nodes", "args": {}},
    ]
    kept, errs = filter_ops_by_skill_allowlist(
        ops, skill_keys=["poster_craft"], scene="website"
    )
    names = [o["name"] for o in kept]
    assert "create_shape" in names
    assert "align_nodes" in names
    assert "explode_canvas" not in names
    assert any("explode_canvas" in e for e in errs)


def test_file_skill_loader_returns_list():
    """Loader scans public + private ``design_skills`` packs."""
    files = _load_file_skills()
    assert isinstance(files, list)


def test_parse_pack_version_semver():
    from app.services.design.prompts.skill_store import _parse_pack_version

    label, n = _parse_pack_version("1.0.0")
    assert label == "1.0.0"
    assert n == 1_000_000


def test_source_constants():
    assert SOURCE_SEED == "seed"
    assert SOURCE_ADMIN == "admin"


def test_namespace_split_and_qualify(monkeypatch):
    assert split_namespace_key("core.legacy_key") == (NS_CORE, "legacy_key")
    assert split_namespace_key("user:my_brand") == (NS_USER, "my_brand")
    assert qualify_skill_key(NS_CORE, "legacy_key") == "legacy_key"
    assert qualify_skill_key(NS_USER, "my_brand") == "user.my_brand"
    assert resolve_storage_skill_key("poster_craft") == "poster_craft"
    # Patch the runtime module binding (resolve_storage_skill_key calls it in-file).
    from app.services.design.prompts.skill_store import runtime as skill_runtime

    monkeypatch.setattr(
        skill_runtime,
        "list_runtime_skills",
        lambda **_kwargs: [
            {
                "skillKey": "example_brand",
                "namespace": NS_EXT,
                "_localKey": "example_brand",
            }
        ],
    )
    assert resolve_storage_skill_key("ext.example_brand") == "example_brand"
    assert resolve_storage_skill_key("ext.missing_pack") is None


def test_skill_pin_and_parse_need_skills():
    assert parse_skill_pin("poster_craft@2") == ("poster_craft", 2, None)
    keys, pins, args, errs = parse_need_skills_with_pins(
        [
            "poster_craft@2",
            {"key": "brush_ops", "version": 1, "args": {}},
        ]
    )
    assert "poster_craft" in keys
    assert "brush_ops" in keys
    assert pins.get("poster_craft") == 2
    assert errs == []


def test_validate_skill_meta_admin_ok_when_seed_empty():
    """Bare keys are not core-reserved (no JSON skill seed)."""
    errs = validate_skill_meta(
        {
            "skill_key": "poster_craft",
            "name": "x",
            "prompt_positive": "body",
        },
        source=SOURCE_ADMIN,
    )
    assert not any("core_key_reserved" in e for e in errs)


def test_validate_against_schema_required():
    schema = {
        "type": "object",
        "required": ["theme"],
        "properties": {"theme": {"type": "string"}},
    }
    assert validate_against_schema(schema, {}) == ["missing_required:theme"]
    assert validate_against_schema(schema, {"theme": "dark"}) == []


def test_custom_skill_acl_platform_open():
    assert skill_resource_allowlist(["poster_craft"], scene="website") is None
    assert filter_need_resources_by_skill_acl(
        skill_keys=["poster_craft"],
        scene="website",
    ) == []


def test_hot_reload_signature_stable():
    reload_skills_if_disk_changed()
    assert reload_skills_if_disk_changed() is False


def test_file_pack_sync_overwrites_body_from_disk():
    """SOURCE_FILE skills follow seeds/design_skills on ensure (file wins)."""
    from sqlmodel import Session

    from app.core import db as core_db
    from app.services.design.prompts.skill_store.constants import SOURCE_FILE

    with Session(core_db.engine) as session:
        row = crud.get_design_skill_by_key(session=session, skill_key="poster_craft")
        assert row is not None
        assert str(row.source or "") == SOURCE_FILE
        before = str(row.prompt_positive or "")
        assert "Poster" in before or "poster" in before.lower()
        row.prompt_positive = "OPS_CUSTOM_BODY_SHOULD_BE_OVERWRITTEN"
        session.add(row)
        session.commit()

    reset_skills_ready_for_tests()
    ensure_design_skills(force=True)

    with Session(core_db.engine) as session:
        row = crud.get_design_skill_by_key(session=session, skill_key="poster_craft")
        assert row is not None
        assert str(row.source or "") == SOURCE_FILE
        got = str(row.prompt_positive or "")
        assert got != "OPS_CUSTOM_BODY_SHOULD_BE_OVERWRITTEN"
        assert "Workflow" in got or "Layer order" in got or "poster" in got.lower()


def test_obsolete_seed_skills_pruned():
    """Legacy SOURCE_SEED rows are deleted on ensure (file packs only)."""
    from sqlmodel import Session

    from app.core import db as core_db
    from app.models import DesignSkill

    with Session(core_db.engine) as session:
        existing = crud.get_design_skill_by_key(
            session=session, skill_key="design_methodology"
        )
        if existing is None:
            session.add(
                DesignSkill(
                    skill_key="design_methodology",
                    name="legacy",
                    category="create",
                    prompt_positive="obsolete body",
                    source=SOURCE_SEED,
                    namespace=NS_CORE,
                    enabled=1,
                    version=1,
                    created_at=0.0,
                    updated_at=0.0,
                )
            )
            session.commit()
        else:
            existing.source = SOURCE_SEED
            existing.namespace = NS_CORE
            existing.prompt_positive = "obsolete body"
            session.add(existing)
            session.commit()

    reset_skills_ready_for_tests()
    ensure_design_skills(force=True)

    with Session(core_db.engine) as session:
        row = crud.get_design_skill_by_key(
            session=session, skill_key="design_methodology"
        )
        assert row is None


def test_agent_skills_frontmatter_split_and_meta():
    from app.services.design.prompts.skill_store import (
        _meta_from_agent_skill_frontmatter,
        _split_skill_md_frontmatter,
    )

    fm, body = _split_skill_md_frontmatter(
        """---
name: demo-skill
description: >-
  Hello world skill for canvas.
disable-model-invocation: true
---

# Demo
Do the thing.
"""
    )
    assert fm.get("name") == "demo-skill"
    assert "Hello world" in str(fm.get("description") or "")
    assert body.startswith("# Demo")
    assert "disable-model-invocation" not in body
    meta = _meta_from_agent_skill_frontmatter(fm, folder="demo-skill")
    assert meta is not None
    assert meta["skill_key"] == "demo-skill"
    assert "Hello world" in meta["when_to_use"]


def test_load_pack_dir_agent_skills_only(tmp_path):
    from app.services.design.prompts.skill_store import _load_pack_dir

    pack = tmp_path / "demo-skill"
    pack.mkdir()
    (pack / "SKILL.md").write_text(
        """---
name: demo-skill
description: Agent skills only pack
---

# Body
Keep this prompt.
""",
        encoding="utf-8",
    )
    item = _load_pack_dir(pack)
    assert item is not None
    assert item["skill_key"] == "demo-skill"
    assert item["prompt_positive"].startswith("# Body")
    assert "---" not in item["prompt_positive"]


def test_oss_ext_packs_present():
    keys = {str(x.get("skill_key") or "") for x in _load_file_skills()}
    for key in (
        "garden_style",
        "awesome_design_md",
        "shadcn_ui",
        "banner_ad",
        "icon_set",
        "type_specimen",
        "long_scroll",
        "festival_poster",
    ):
        assert key in keys
    assert "ui_ux_pro_max" not in keys
    assert "vision_extract" not in keys
    assert "canvas_edit" not in keys
    assert "frontend_ui" not in keys
    assert "example_ext" not in keys


def test_normalize_pack_meta_aliases():
    from app.services.design.prompts.skill_store.pack_io import _normalize_pack_meta

    meta = _normalize_pack_meta(
        {
            "id": "my_plugin",
            "trigger_keywords": ["中秋海报", "holiday poster"],
            "author": "ops",
            "permissions": ["新建画布帧"],
            "enabled": True,
        },
        folder="my_plugin",
    )
    assert meta is not None
    assert meta["skill_key"] == "my_plugin"
    assert meta["triggers"][0]["prompt_includes_any"] == ["中秋海报", "holiday poster"]
    assert meta["allowed_resources"] == ["tools"]
    assert meta["_author"] == "ops"


def test_normalize_pack_meta_disabled():
    from app.services.design.prompts.skill_store.pack_io import _normalize_pack_meta

    assert (
        _normalize_pack_meta(
            {"id": "x", "enabled": False, "triggers": []},
            folder="x",
        )
        is None
    )


def test_plugin_style_pack_loads(tmp_path, monkeypatch):
    from app.services.design.prompts.skill_store import pack_io

    root = tmp_path / "plugins_skills"
    pack = root / "kw_poster"
    pack.mkdir(parents=True)
    (pack / "_meta.json").write_text(
        '{"id":"kw_poster","name":"kw_poster","trigger_keywords":["春节海报"],'
        '"preferred_tools":["create_frame","create_text"],"version":"1.0.0"}',
        encoding="utf-8",
    )
    (pack / "SKILL.md").write_text("# KW poster\n\nCreate a festive board.\n", encoding="utf-8")

    monkeypatch.setattr(pack_io, "_file_skills_dirs", lambda: [root])
    items = pack_io._load_file_skills()
    by_key = {str(x.get("skill_key")): x for x in items}
    assert "kw_poster" in by_key
    triggers = by_key["kw_poster"].get("triggers") or []
    assert triggers and "春节海报" in triggers[0].get("prompt_includes_any", [])


def test_resolve_triggered_festival_keyword():
    keys = resolve_triggered_skill_keys(
        prompt="帮我生成一张中秋红色海报",
        intent="create",
        empty_canvas=True,
        has_images=False,
    )
    assert "festival_poster" in keys
