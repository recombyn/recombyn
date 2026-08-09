from __future__ import annotations

from typing import Any

from app.services.design.prompts.prompt_pack_store import render_prompt_body
from app.services.design.prompts.rules_text import render_prompt_template
from app.services.design.runtime.agent_profile import (
    AgentProfile,
    get_active_agent_profile,
)


def require_prompt_pack(rules: dict[str, str] | None, key: str, **variables: Any) -> str:
    """Load Admin pack body; missing pack is a hard error (no code fallback prose)."""
    try:
        text = render_prompt_body(key, rules=rules, **variables).strip()
    except Exception:
        text = ""
        if rules is not None:
            from app.services.design.prompts.rules_text import _rule_text

            raw = _rule_text(rules, key).strip()
            if raw:
                text = render_prompt_template(raw, **variables).strip() if variables else raw
    if not text:
        raise RuntimeError(
            f"missing prompt pack: {key} "
            "(Admin → 系统提示词 / seeds/design_prompt_packs)"
        )
    return text


def interaction_mode_rules_pack(
    rules: dict[str, str] | None,
    *,
    ask_mode: bool,
    profile: AgentProfile | None = None,
) -> str:
    """Mode-only rules: Ask → ask overlay; Agent → agent overlay (from Profile)."""
    prof = profile or get_active_agent_profile()
    key = prof.mode_overlay_key(ask_mode=ask_mode)
    try:
        return require_prompt_pack(rules, key)
    except RuntimeError:
        return ""


def assemble_stage_system(
    rules: dict[str, str] | None,
    *,
    stage: str,
    ask_mode: bool,
    persona: str = "",
    catalog_blocks: list[str] | None = None,
    profile: AgentProfile | None = None,
) -> str:
    """Assemble stage system prompt from Profile pack keys + Ask/Agent mode pack."""
    prof = profile or get_active_agent_profile()
    stage_key = str(stage or "").strip().lower()
    protocol_key = prof.stage_protocol(stage_key)

    parts: list[str] = []
    persona_s = str(persona or "").strip()
    if persona_s:
        parts.append(
            persona_s
            if persona_s.startswith("IDENTITY:")
            else f"IDENTITY: {persona_s}"
        )
    parts.append(require_prompt_pack(rules, protocol_key))
    # Review (and any stage with mode_overlay: false) stays undiluted.
    if prof.stage_uses_mode_overlay(stage_key):
        mode_pack = interaction_mode_rules_pack(
            rules, ask_mode=ask_mode, profile=prof
        )
        if mode_pack.strip():
            parts.append(mode_pack.strip())
    for block in catalog_blocks or []:
        b = str(block or "").strip()
        if b:
            parts.append(b)
    return "\n\n".join(parts)
