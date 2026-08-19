"""Widen remaining MySQL VARCHAR(255) payload columns to LONGTEXT.

Revision ID: 0020_widen_payload_varchar_columns
Revises: 0019_design_task_text_columns
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0020_widen_payload_varchar_columns"
down_revision = "0019_design_task_text_columns"
branch_labels = None
depends_on = None

# table.column → NULL-able. Names/titles stay VARCHAR(255).
_MYSQL_COLUMNS: tuple[tuple[str, str, bool], ...] = (
    ("users", "avatar", True),
    ("users", "default_avatar", True),
    ("users", "bio", True),
    ("wallet_ledger", "detail", True),
    ("plaza_submissions", "author_avatar", True),
    ("plaza_submissions", "reject_reason", True),
    ("user_follows", "followee_avatar", True),
    ("assets", "url", False),
    ("assets", "prompt", True),
    ("assets", "meta_json", True),
    ("design_stage_review", "comment", True),
    ("design_stage_review", "preview_svg", True),
    ("design_dict", "description", True),
    ("design_layer_lock", "allowed_skills", True),
    ("design_layer_lock", "forbidden_attrs", True),
    ("design_token_pack", "tokens_json", False),
    ("design_token_pack", "note", True),
    ("design_system_prompt", "description", True),
    ("fonts", "faces_json", False),
    ("notices", "body", False),
    ("document_shares", "editor_user_ids", True),
    ("document_shares", "viewer_user_ids", True),
    ("design_skill_group", "skill_ids", False),
    ("design_execute_flow", "skill_ids", False),
    ("design_execute_flow", "force_validate_flags", True),
    ("design_execute_flow", "step_token_caps", True),
    ("agent_session_snapshot", "task_state_json", False),
    ("agent_long_memory", "text", False),
    ("agent_kg_triple", "object", False),
    ("agent_episode", "goal", False),
    ("agent_episode", "summary", False),
    ("agent_episode", "actions_json", True),
    ("agent_episode", "observe_json", True),
    ("model_usage", "usage_json", True),
    ("model_usage", "meta_json", True),
    ("model_usage", "error", True),
    ("design_optimize_patch", "patch_json", False),
    ("design_optimize_patch", "rationale", True),
    ("design_optimize_patch", "flags_json", True),
    ("design_cold_blob", "meta_json", True),
    ("user_byok_providers", "website", True),
    ("user_byok_providers", "base_url", False),
    ("user_byok_providers", "api_key_cipher", False),
)


def upgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name != "mysql":
        return
    insp = sa.inspect(bind)
    tables = set(insp.get_table_names())
    for table, column, nullable in _MYSQL_COLUMNS:
        if table not in tables:
            continue
        cols = {c["name"] for c in insp.get_columns(table)}
        if column not in cols:
            continue
        null_sql = "NULL" if nullable else "NOT NULL"
        op.execute(
            sa.text(
                f"ALTER TABLE `{table}` MODIFY `{column}` LONGTEXT {null_sql}"
            )
        )


def downgrade() -> None:
    pass
