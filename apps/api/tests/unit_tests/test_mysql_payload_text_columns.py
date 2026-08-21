"""Guard: MySQL maps bare Optional[str]/str → VARCHAR(255). Payload fields must be Text."""

from __future__ import annotations

from sqlalchemy import Text
from sqlmodel import SQLModel

import app.models  # noqa: F401 — register table models

_PAYLOAD_NAMES = frozenset(
    {
        "actions_json",
        "allowed_skills",
        "api_key_cipher",
        "args_schema",
        "author_avatar",
        "avatar",
        "base_url",
        "bio",
        "body",
        "command_json",
        "comment",
        "content",
        "cover_image_url",
        "cover_json",
        "custom_cover_image_url",
        "default_avatar",
        "description",
        "detail",
        "document_json",
        "editor_user_ids",
        "error",
        "error_message",
        "event_json",
        "faces_json",
        "flags_json",
        "followee_avatar",
        "forbidden_attrs",
        "force_validate_flags",
        "goal",
        "icon_url",
        "image_limits",
        "input_schema",
        "locales",
        "logo",
        "meta_json",
        "model_hint",
        "note",
        "object",
        "observe_json",
        "output_schema",
        "panel_urls_json",
        "patch_json",
        "preferred_tools",
        "allowed_resources",
        "triggers",
        "preview_svg",
        "price_meta",
        "prompt",
        "prompt_negative",
        "prompt_positive",
        "rationale",
        "rates_json",
        "reference_types",
        "reject_reason",
        "result_svg",
        "rule_value",
        "skill_ids",
        "snapshot",
        "step_token_caps",
        "summary",
        "task_state_json",
        "text",
        "thinking",
        "thumbnail_key",
        "tokens_json",
        "url",
        "usage_json",
        "viewer_user_ids",
        "website",
        "when_to_use",
        "actual_models",
    }
)

_PAYLOAD_SUFFIXES = ("_json", "_svg", "_cipher")


def _is_payload_column(name: str) -> bool:
    if name in _PAYLOAD_NAMES:
        return True
    return any(name.endswith(suffix) for suffix in _PAYLOAD_SUFFIXES)


def test_payload_columns_use_unbounded_text() -> None:
    offenders: list[str] = []
    for table in SQLModel.metadata.tables.values():
        for col in table.columns:
            if not _is_payload_column(col.name):
                continue
            length = getattr(col.type, "length", None)
            if length is not None:
                offenders.append(f"{table.name}.{col.name} length={length} type={col.type}")
            elif not isinstance(col.type, Text):
                # UnicodeText / LONGTEXT dialects still subclass Text.
                pass
    assert not offenders, "MySQL payload columns must be Text, not VARCHAR(255):\n" + "\n".join(
        offenders
    )
