"""Widen design_task snapshot/text columns (MySQL VARCHAR(255) → LONGTEXT).

Revision ID: 0019_design_task_text_columns
Revises: 0018_rename_wallet_tokens_to_credits
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0019_design_task_text_columns"
down_revision = "0018_rename_wallet_tokens_to_credits"
branch_labels = None
depends_on = None

_MYSQL_ALTERS = (
    "ALTER TABLE design_task MODIFY actual_models LONGTEXT NULL",
    "ALTER TABLE design_task MODIFY prompt LONGTEXT NULL",
    "ALTER TABLE design_task MODIFY result_svg LONGTEXT NULL",
    "ALTER TABLE design_task MODIFY error_message TEXT NULL",
    "ALTER TABLE design_task MODIFY meta_json LONGTEXT NULL",
)


def upgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name != "mysql":
        return
    insp = sa.inspect(bind)
    if "design_task" not in set(insp.get_table_names()):
        return
    for stmt in _MYSQL_ALTERS:
        op.execute(sa.text(stmt))


def downgrade() -> None:
    # Do not shrink LONGTEXT back to VARCHAR — would truncate production data.
    pass
