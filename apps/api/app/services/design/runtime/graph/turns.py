from __future__ import annotations

"""Turn parsing, Ask choice UI, and decide-to-paint routing helpers."""

import logging
from typing import Any
from app.services.design.ops.tool_ops_contract import normalize_need_tools
from app.services.design.ops.validate import extract_json_object
from app.services.design.prompts.prompt_build import _edit_context_block
from app.services.design.prompts.rules_text import _as_text
from app.services.design.runtime.host import (
    interaction_mode_rules_pack,
    require_prompt_pack,
)
from app.services.design.runtime.models_route import (
    CANVAS_WORK_INTENTS,
    normalize_user_intent,
    paint_ops_intent,
)
from app.services.design.runtime.graph.state import (
    AgentRunState,
    _agent_turn_parser,
    _thought_chat_prompt,
)

_log = logging.getLogger(__name__)


_ASK_CHOICE_MODES = frozenset({"confirm", "single", "multi", "buttons", "text"})
_ASK_CHOICE_ACTIONS = frozenset({"apply", "reply", "dismiss"})


def _thought_context_limits(rt: Any) -> tuple[int, int, int, int]:
    """Bound memory and scene context by the work being decided."""
    intent = normalize_user_intent(getattr(rt, "classified_intent", None))
    if intent == "canvas_op":
        return 900, 3, 280, 1400
    if getattr(rt, "pending_skill_details", ""):
        return 1400, 4, 320, 1800
    return 1800, 5, 360, 2200


def _is_canvas_work_intent(raw: str | None) -> bool:
    return normalize_user_intent(raw) in CANVAS_WORK_INTENTS

def _resolve_paint_want(rt: Any, turn_intent: str | None = None) -> str:
    """create|edit for paint validation / tool kit."""
    t = str(turn_intent or "").strip().lower()
    if t in ("edit", "create"):
        return t
    lane = str(getattr(rt, "classified_paint_lane", None) or "").strip().lower()
    if lane in ("edit", "create"):
        return lane
    return paint_ops_intent(
        getattr(rt, "classified_intent", None) or t,
        lane,
    )

def _append_prompt_pack(system: str, pack: str) -> str:
    base = str(system or "").strip()
    extra = str(pack or "").strip()
    if not extra:
        return base
    if extra in base:
        return base
    return f"{base}\n\n{extra}" if base else extra

def _lc_design_needs_canvas_ops(
    *,
    classified: str,
    turn_intent: str,
    has_ops: bool,
    has_clarify: bool = False,
    ask_mode: bool = False,
) -> bool:
    """True when runtime must route to paint_ops (not narrate-only / clarify)."""
    if has_ops:
        return False
    t = (turn_intent or "").strip().lower()
    # Clarify waits only in Ask mode. Agent mode continues with defaults (mode pack).
    _ = has_clarify
    if t == "ask" and ask_mode:
        return False
    if _is_canvas_work_intent(classified):
        return True
    return _is_canvas_work_intent(t)

def _should_route_to_paint(
    *,
    classified: str,
    turn_intent: str,
    has_clarify: bool,
    ask_mode: bool = False,
) -> bool:
    """Decision stage → paint_ops when canvas work is required."""
    return _lc_design_needs_canvas_ops(
        classified=classified,
        turn_intent=turn_intent,
        has_ops=False,
        has_clarify=has_clarify,
        ask_mode=ask_mode,
    )

def _turn_has_clarify(turn: dict[str, Any] | None) -> bool:
    """True when the model asked the user with chips / choice_ui (not bare ask)."""
    if not isinstance(turn, dict):
        return False
    return bool(turn.get("choice_ui"))

def _clear_ask_choice_state(st: AgentRunState) -> None:
    st.choice_ui = None

def _normalize_choice_option(raw: Any) -> dict[str, str] | None:
    """One option: label (AI text) + action (format enum)."""
    if isinstance(raw, str):
        label = raw.strip()[:48]
        if not label:
            return None
        return {"label": label, "action": "reply"}
    if not isinstance(raw, dict):
        return None
    label = _as_text(raw.get("label")).strip()[:48]
    action = _as_text(raw.get("action") or "reply").strip().lower()
    if action not in _ASK_CHOICE_ACTIONS:
        action = "reply"
    # apply/dismiss may omit label — FE fills i18n chrome.
    if not label and action == "reply":
        return None
    return {"label": label, "action": action}

def _choice_ui_raw_from_turn(obj: dict[str, Any]) -> Any:
    """Nested ``choice_ui`` only — flattened top-level mode/options is invalid."""
    return obj.get("choice_ui")


def _normalize_choice_ui(raw: Any) -> dict[str, Any] | None:
    """Validate Ask choice format. Content labels stay model-authored."""
    mode = ""
    options_raw: list[Any] = []
    placeholder = ""
    if isinstance(raw, dict):
        mode = _as_text(raw.get("mode")).strip().lower()
        options_raw = list(raw.get("options") or [])
        placeholder = _as_text(raw.get("placeholder")).strip()[:120]
    elif isinstance(raw, list):
        options_raw = list(raw)
    else:
        return None
    options: list[dict[str, str]] = []
    for item in options_raw[:8]:
        opt = _normalize_choice_option(item)
        if not opt:
            continue
        options.append(opt)
    # text mode is valid with zero options (user types freeform).
    if not options and mode != "text":
        return None
    if mode not in _ASK_CHOICE_MODES:
        # Infer mode from actions — still format, not content keywords.
        actions = {o["action"] for o in options}
        if actions <= {"apply", "dismiss"}:
            mode = "confirm"
        elif "apply" in actions:
            mode = "buttons"
        else:
            mode = "single"
    # Dedupe by label+action, keep order.
    seen: set[tuple[str, str]] = set()
    uniq: list[dict[str, str]] = []
    for opt in options:
        key = (opt["label"], opt["action"])
        if key in seen:
            continue
        seen.add(key)
        uniq.append(opt)
    out: dict[str, Any] = {"mode": mode, "options": uniq[:8]}
    if placeholder:
        out["placeholder"] = placeholder
    return out

def _absorb_ask_choices(st: AgentRunState, turn: dict[str, Any]) -> None:
    """Persist Ask choice_ui from the model turn."""
    st.choice_ui = _normalize_choice_ui(_choice_ui_raw_from_turn(turn))

def _ensure_propose_choice_ui(st: AgentRunState) -> dict[str, Any]:
    """Propose must expose format-valid choice_ui; do not invent question content."""
    ui = _normalize_choice_ui(st.choice_ui)
    if not ui:
        # Structural chrome only — empty labels → FE i18n for confirm/cancel.
        ui = {
            "mode": "confirm",
            "options": [
                {"label": "", "action": "apply"},
                {"label": "", "action": "dismiss"},
            ]
        }
    elif not any(str(o.get("action") or "") == "apply" for o in ui.get("options") or []):
        # Ops ready but no apply action — keep mode (incl. text); add format slot.
        opts = list(ui.get("options") or [])
        opts.insert(0, {"label": "", "action": "apply"})
        ui = {**ui, "options": opts[:8]}
    st.choice_ui = ui
    return ui

def _ask_propose_user_text(*, model_reply: str, detail: str) -> str:
    """User-facing propose copy: model reply only. Never append ops-detail lines."""
    del detail  # detail reads like already painted; Confirm chips carry the ask.
    return (model_reply or "").strip()

def _normalize_agent_turn_obj(obj: dict[str, Any] | None) -> dict[str, Any]:
    """Normalize a structured AgentTurn dict for graph flags."""
    obj = obj if isinstance(obj, dict) else {}
    intent = str(obj.get("intent") or "").strip().lower()
    if intent not in ("chat", "ask", "done", "edit", "create"):
        intent = "edit" if obj.get("tool_ops") else "chat"
    reply = _as_text(obj.get("reply")).strip()
    thought = _as_text(obj.get("thought")).strip()
    ops_raw = obj.get("tool_ops")
    done = obj.get("done")
    if done is None:
        done = intent in ("chat", "ask", "done")
    choice_ui = _normalize_choice_ui(_choice_ui_raw_from_turn(obj))
    need_tools = normalize_need_tools(
        obj.get("need_tools")
    )
    from app.services.design.prompts.skill_store import parse_need_skills_with_pins
    from app.services.design.runtime.subagent import parse_need_subagents

    need_skills, skill_version_pins, skill_input_args, skill_parse_errs = (
        parse_need_skills_with_pins(obj.get("need_skills"))
    )
    need_subagents = parse_need_subagents(
        obj.get("need_subagents")
    )
    return {
        "intent": intent,
        "reply": reply,
        "thought": thought,
        "tool_ops_raw": ops_raw,
        "need_tools": need_tools,
        "need_skills": need_skills,
        "need_subagents": need_subagents,
        "skill_version_pins": skill_version_pins,
        "skill_input_args": skill_input_args,
        "skill_parse_errs": skill_parse_errs,
        "choice_ui": choice_ui,
        "done": bool(done),
        "raw_obj": obj
    }

def _parse_agent_turn(content: str) -> dict[str, Any]:
    """Parse free-form model text → normalized turn (fallback path)."""
    obj: dict[str, Any] = {}
    try:
        parsed = _agent_turn_parser().parse(content or "")
        obj = parsed.model_dump() if hasattr(parsed, "model_dump") else dict(parsed)
    except Exception:
        obj = extract_json_object(content) or {}
    return _normalize_agent_turn_obj(obj)

def _turn_from_structured(structured: Any) -> dict[str, Any]:
    """LangChain ``with_structured_output`` / response_format result → turn dict."""
    if structured is None:
        return _normalize_agent_turn_obj({})
    if hasattr(structured, "model_dump"):
        return _normalize_agent_turn_obj(structured.model_dump())
    if isinstance(structured, dict):
        return _normalize_agent_turn_obj(structured)
    return _normalize_agent_turn_obj({})

def _append_pending_reinject(
    parts: list[str],
    details: str,
    *,
    rules: dict[str, str] | None,
    prompt_key: str,
) -> None:
    """Append resource details + Admin-editable reinject instruction (if any)."""
    from app.services.design.runtime.graph.llm_io import _prompt_text
    text = str(details or "").strip()
    if not text:
        return
    parts.append(text)
    reinject = _prompt_text(rules, prompt_key).strip()
    if reinject:
        parts.append(reinject)

def _thought_prompt_variables(rt: Any) -> dict[str, str]:
    """Variables for LangChain ChatPromptTemplate (thought turn)."""
    from app.services.design.readpath.canvas_scene import explicit_canvas_size
    from app.services.design.runtime.graph.llm_io import _prompt_text
    from app.services.design.runtime.graph.scene_log import _scene_digest
    st = rt.run
    if rt.w > 0 and rt.h > 0:
        canvas_size = f"{rt.w}x{rt.h}"
        if explicit_canvas_size(getattr(rt, "canvas_size", None)):
            # Composer chip WxH wins over any size written in USER_PROMPT.
            canvas_size = (
                f"{rt.w}x{rt.h}\n"
                "CLIENT_SIZE_LOCK: composer size chip is authoritative. "
                "Ignore conflicting WxH in USER_PROMPT; layout ONLY inside "
                f"{rt.w}x{rt.h} (frame-local 0..w, 0..h). Do not emit create_frame "
                "with a different size."
            )
    elif _as_text(rt.canvas_size).strip().lower() in ("", "auto"):
        hint = (rt.size_auto_hint or _prompt_text(rt.rules, "agent.prompt.size_auto")).strip()
        canvas_size = ("auto\n" + hint) if hint else "auto"
    else:
        canvas_size = _as_text(rt.canvas_size).strip() or "unknown"

    memory_limit, dialogue_count, dialogue_limit, edit_context_limit = _thought_context_limits(rt)
    pending_parts: list[str] = []
    _append_pending_reinject(
        pending_parts,
        rt.pending_tool_details,
        rules=rt.rules,
        prompt_key="agent.prompt.pending_tools",
    )
    _append_pending_reinject(
        pending_parts,
        rt.pending_skill_details,
        rules=rt.rules,
        prompt_key="agent.prompt.pending_skills",
    )
    _append_pending_reinject(
        pending_parts,
        getattr(rt, "pending_subagent_details", "") or "",
        rules=rt.rules,
        prompt_key="agent.prompt.pending_subagents",
    )
    pending_blocks = ("\n\n".join(pending_parts) + "\n\n") if pending_parts else ""
    # Decide thought budget — paint reloads TOOL_DETAILS; keep skill essays bounded.
    if len(pending_blocks) > 6_000:
        pending_blocks = pending_blocks[:6_000] + "\n…(pending truncated)\n\n"

    plan_block = ""
    execution_plan = getattr(rt, "design_plan", None)
    if isinstance(execution_plan, dict):
        target_ids = [str(value)[:64] for value in execution_plan.get("target_node_ids", []) if str(value).strip()][:8]
        plan_block += (
            "EXECUTION_PLAN (authoritative):\n"
            f"goal={str(execution_plan.get('goal') or '')[:1200]}\n"
            f"intent={str(execution_plan.get('intent') or '')} "
            f"lane={str(execution_plan.get('paint_lane') or '')}\n"
            f"target_frame_id={str(execution_plan.get('target_frame_id') or '')[:64]}\n"
            f"target_node_ids={', '.join(target_ids) or '(none)'}\n"
            f"constraints={'; '.join(str(value)[:160] for value in execution_plan.get('constraints', [])[:6]) or '(none)'}\n"
            f"acceptance={'; '.join(str(value)[:160] for value in execution_plan.get('acceptance_criteria', [])[:6]) or '(none)'}\n\n"
        )
    if st.plan:
        plan_block += (
            "PLAN:\n"
            + "\n".join(f"{i+1}. {s}" for i, s in enumerate(st.plan[:12]))
            + "\n\n"
        )
    memory_block = f"MEMORY:\n{rt.mem_blocks[:memory_limit]}\n\n" if rt.mem_blocks else ""
    recent_dialogue = ""
    if rt.mem_short:
        dial_lines: list[str] = []
        for t in list(rt.mem_short)[-dialogue_count:]:
            if not isinstance(t, dict):
                continue
            role = "User" if str(t.get("role") or "") == "user" else "Assistant"
            text = _as_text(t.get("text")).strip()
            if not text:
                continue
            dial_lines.append(f"{role}: {text[:dialogue_limit]}")
        if dial_lines:
            recent_dialogue = (
                "RECENT_DIALOGUE (continue this thread; do not re-greet):\n"
                + "\n".join(dial_lines)
                + "\n\n"
            )
    error_parts: list[str] = []
    if st.errors:
        trail = "\n".join(f"- {e}" for e in st.errors[-5:])
        error_parts.append(f"PRIOR_ERRORS (fix):\n{trail}")
    if st.reflect_note:
        error_parts.append(f"LAST_ERROR (fix):\n{st.reflect_note}")
    error_block = ("\n\n".join(error_parts) + "\n\n") if error_parts else ""

    edit_context = ""
    # Compact only — full SCENE JSON is redundant with scene_digest (fills included).
    # Skip on lean turns: paint_kit lean path never reads edit_context.
    try:
        from app.services.design.runtime.graph.paint_kit import _is_lean_paint_turn

        lean_turn = _is_lean_paint_turn(rt)
    except Exception:
        lean_turn = False
    if not lean_turn and (rt.scene_nodes or rt.scene_frames):
        edit_context = _edit_context_block(
            rt.rules,
            "",
            include_full_svg=False,
            scene_nodes=rt.scene_nodes,
        )
        if len(edit_context) > edit_context_limit:
            edit_context = edit_context[:edit_context_limit] + "\n…(edit_context truncated)"


    try:
        fw = int(rt.w or 0)
        fh = int(rt.h or 0)
    except (TypeError, ValueError):
        fw, fh = 0, 0
    return {
        "system": str(rt.system or ""),
        "prompt": str(rt.prompt or ""),
        "canvas_size": canvas_size,
        "scene": str(rt.scene_key or "-"),
        "scene_digest": _scene_digest(
            rt.scene_nodes,
            rt.scene_frames,
            focus_id=rt.focus_id,
            focus_w=fw,
            focus_h=fh,
        ),
        "pending_blocks": pending_blocks,
        "plan_block": plan_block,
        "recent_dialogue": recent_dialogue,
        "memory_block": memory_block,
        "error_block": error_block,
        "edit_context": edit_context
    }

def _format_thought_messages(rt: Any) -> tuple[str, str]:
    """Return (system, user) strings via LangChain ChatPromptTemplate."""
    vars_ = _thought_prompt_variables(rt)
    messages = _thought_chat_prompt().format_messages(**vars_)
    system = ""
    user = ""
    for m in messages:
        role = getattr(m, "type", None) or ""
        content = m.content if isinstance(m.content, str) else str(m.content or "")
        if role in ("system",):
            system = content
        elif role in ("human", "user"):
            user = content
    return system or vars_["system"], user

__all__ = [
    '_ASK_CHOICE_MODES',
    '_ASK_CHOICE_ACTIONS',
    '_is_canvas_work_intent',
    '_resolve_paint_want',
    '_append_prompt_pack',
    '_lc_design_needs_canvas_ops',
    '_should_route_to_paint',
    '_turn_has_clarify',
    '_clear_ask_choice_state',
    '_normalize_choice_option',
    '_normalize_choice_ui',
    '_absorb_ask_choices',
    '_ensure_propose_choice_ui',
    '_ask_propose_user_text',
    '_normalize_agent_turn_obj',
    '_parse_agent_turn',
    '_turn_from_structured',
    '_append_pending_reinject',
    '_thought_prompt_variables',
    '_format_thought_messages',
]
