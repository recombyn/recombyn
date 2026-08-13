"""Widen design_system_prompt.body (MySQL VARCHAR(255) → LONGTEXT).

Revision ID: 0013_design_system_prompt_body_text
Revises: 0012_project_document_json_text
Create Date: 2026-08-13
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0013_design_system_prompt_body_text"
down_revision = "0012_project_document_json_text"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name != "mysql":
        return
    insp = sa.inspect(bind)
    if "design_system_prompt" not in set(insp.get_table_names()):
        return
    op.execute(
        sa.text(
            "ALTER TABLE design_system_prompt MODIFY body LONGTEXT NOT NULL"
        )
    )


def downgrade() -> None:
    # Do not shrink LONGTEXT back to VARCHAR — would truncate production data.
    pass
