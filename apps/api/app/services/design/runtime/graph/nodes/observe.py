"""Observe node — scene feedback HITL + structural critique.

Kernel boundary: observe only gates *host/structure* (empty board, invalid
placement, stacked creates). Aesthetic / deliverable craft lives in Skills;
Review LLM judges craft via SKILL_DETAILS — never hardcode taste here.
"""
from __future__ import annotations

import asyncio
from typing import Any

from langgraph.types import Command, interrupt

from app.services.design.runtime.graph.state import (
    AgentRunState,
    AgentRuntime,
    GraphState,
    _SCENE_WAIT_SEC,
)
from app.services.design.runtime.graph.support import (
    _bump,
    _emit,
    _emit_ux_tip,
    _structure_verify_issues,
)

# Complaint-oriented prompts — not positive create asks like "高级感海报".
_TASTE_REVIEW_HINTS = (
    "太丑",
    "好丑",
    "难看",
    "不好看",
    "丑死",
    "丑爆",
    "太土",
    "土气",
    "审美不行",
    "配色很差",
    "排版很乱",
    "看着廉价",
    "太ai",
    "ai感",
    "重新设计",
    "重做审美",
    "换个风格",
    "好看点",
    "精致一点",
    "ugly",
    "hideous",
    "looks bad",
    "looks ugly",
    "too plain",
    "too generic",
    "ai looking",
    "redesign this",
    "make it prettier",
    "make it nicer",
    "fix the look",
    "more polished",
)


def _scene_interrupt_payload(st: AgentRunState, *, round_i: int) -> dict[str, Any]:
    return {
        "kind": "scene_feedback",
        "task_id": st.task_id,
        "trace_id": st.trace_id,
        "round": int(round_i),
        "timeout_ms": int(_SCENE_WAIT_SEC * 1000),
    }


def _normalize_resume_snap(raw: Any) -> dict[str, Any] | None:
    """Command(resume=…) value → scene snapshot, or None for timeout/empty."""
    if raw is None:
        return None
    if isinstance(raw, dict):
        if raw.get("timeout") or raw.get("kind") == "timeout":
            return None
        if raw.get("cancelled") or raw.get("paused"):
            return None
        if any(k in raw for k in ("nodes", "frames", "op_results", "spatial", "preview_image")):
            out = {
                "nodes": list(raw.get("nodes") or [])
                if isinstance(raw.get("nodes"), list)
                else [],
                "frames": list(raw.get("frames") or [])
                if isinstance(raw.get("frames"), list)
                else [],
                "spatial": raw.get("spatial")
                if isinstance(raw.get("spatial"), dict)
                else None,
                "op_results": list(raw.get("op_results") or [])
                if isinstance(raw.get("op_results"), list)
                else [],
            }
            prev = str(raw.get("preview_image") or "").strip()
            if prev.startswith("data:image/") or prev.startswith("http"):
                out["preview_image"] = prev
            return out
    return None


def _critique_enabled(rt: Any | None = None) -> bool:
    """Prefer AgentProfile / rules overlay, then settings.design_critique_enabled."""
    rules = getattr(rt, "rules", None) if rt is not None else None
    if isinstance(rules, dict):
        raw = str(rules.get("design.critique.enabled") or "").strip().lower()
        if raw in ("0", "false", "off", "no"):
            return False
        if raw in ("1", "true", "on", "yes"):
            return True
    try:
        from app.services.design.runtime.agent_profile import get_active_agent_profile

        prof = get_active_agent_profile()
        if "critique_enabled" in prof.runtime_flags:
            return bool(prof.runtime_flags["critique_enabled"])
    except Exception:
        pass
    try:
        from app.core.config import settings

        return bool(getattr(settings, "design_critique_enabled", True))
    except Exception:
        return True


def _review_stage_enabled() -> bool:
    """Profile still lists review as a stage (topology)."""
    try:
        from app.services.design.runtime.agent_profile import get_active_agent_profile

        prof = get_active_agent_profile()
        enabled = {
            str(s).strip().lower()
            for s in (prof.stages_enabled or ())
            if str(s).strip()
        }
        return "review" in enabled
    except Exception:
        return True


def _review_mode(rt: Any | None = None) -> str:
    """auto | off | always — default auto (sparse Review, not every design paint)."""
    rules = getattr(rt, "rules", None) if rt is not None else None
    if isinstance(rules, dict):
        for key in ("design.review.mode", "agent.review.mode"):
            raw = str(rules.get(key) or "").strip().lower()
            if raw in ("auto", "off", "always"):
                return raw
            if raw in ("0", "false", "no"):
                return "off"
            if raw in ("1", "true", "yes", "on"):
                return "always"
    try:
        from app.services.design.runtime.agent_profile import get_active_agent_profile

        prof = get_active_agent_profile()
        raw = str(prof.runtime_flags.get("review_mode") or "").strip().lower()
        if raw in ("auto", "off", "always"):
            return raw
    except Exception:
        pass
    try:
        from app.core.config import settings

        if not bool(getattr(settings, "design_review_agent_enabled", True)):
            return "off"
        raw = str(getattr(settings, "design_review_mode", "auto") or "auto").strip().lower()
        if raw in ("auto", "off", "always"):
            return raw
    except Exception:
        pass
    return "auto"


def _user_wants_taste_review(prompt: str | None) -> bool:
    text = str(prompt or "").strip().lower()
    if not text:
        return False
    return any(h.lower() in text for h in _TASTE_REVIEW_HINTS)


def _is_paint_retry_turn(rt: Any) -> bool:
    flags = getattr(rt, "flags", None)
    if isinstance(flags, dict):
        if flags.get("critique_failed") or flags.get("op_failed") or flags.get("review_failed"):
            return True
    st = getattr(rt, "run", None)
    note = str(getattr(st, "reflect_note", "") or "").strip().upper()
    return note.startswith("CRITIQUE") or "MUST_FIX" in note or "REVIEW" in note


def _is_high_stakes_review_turn(rt: Any) -> bool:
    """Narrow high-cost creates — not every poster skill (that would ≈ always)."""
    if bool(getattr(rt, "images", None)):
        try:
            from app.services.design.runtime.models_route import normalize_user_intent

            if normalize_user_intent(getattr(rt, "classified_intent", None)) == "design":
                return True
        except Exception:
            return True
    frames = 0
    for op in list(getattr(rt, "paint_ops", None) or []):
        if not isinstance(op, dict):
            continue
        name = str(op.get("name") or op.get("op_key") or "").strip()
        if name == "create_frame":
            frames += 1
            if frames >= 2:
                return True
    return False


def _should_route_to_review(
    rt: Any,
    *,
    signals: list[str] | None = None,
) -> bool:
    """Sparse Review gate — default auto skips clean first paints.

    Modes (settings / rules / profile ``review_mode``):
    - off: never
    - always: every non-lean design paint (canvas_op / lean only on taste)
    - auto: only when structure signals, paint retry, taste complaint, or
      narrow high-stakes (ref images + design, multi-artboard)
    """
    if not _review_stage_enabled():
        return False
    mode = _review_mode(rt)
    if mode == "off":
        return False
    try:
        from app.services.design.runtime.models_route import normalize_user_intent
        from app.services.design.runtime.graph.paint_kit import _is_lean_paint_turn

        intent = normalize_user_intent(getattr(rt, "classified_intent", None))
        # canvas_op: Review only on taste complaints (structure tip is enough otherwise).
        if intent == "canvas_op":
            return _user_wants_taste_review(getattr(rt, "prompt", None))
        lean = _is_lean_paint_turn(rt)
    except Exception:
        lean = False
    if mode == "always":
        # Keep cheap short edits off Review unless the user asked for taste fix.
        if lean and not _user_wants_taste_review(getattr(rt, "prompt", None)):
            return False
        return True
    # auto — lean clean first paints fall through as False (no signals / retry / taste).
    if list(signals or []):
        return True
    if _is_paint_retry_turn(rt):
        return True
    if _user_wants_taste_review(getattr(rt, "prompt", None)):
        return True
    if _is_high_stakes_review_turn(rt):
        return True
    return False


def _create_op_xy(op: dict[str, Any]) -> tuple[float, float] | None:
    """World x/y for a create op, or None if missing / frame-scoped."""
    args = op.get("args") if isinstance(op.get("args"), dict) else op
    if not isinstance(args, dict):
        return None
    frame_id = str(args.get("frameId") or args.get("frame_id") or "").strip()
    if frame_id:
        return None
    try:
        return float(args["x"]), float(args["y"])
    except (KeyError, TypeError, ValueError):
        return None


def _spatial_grounding_issues(rt: AgentRuntime) -> list[str]:
    """Structural host checks only — not layout taste (that belongs in Skills/Review).

    Post-paint observe must NOT re-check FE viewport placement: camera / Yjs lag
    makes viewport_world stale and forces false re-paint. Viewport rejection stays
    in the pre-apply paint gate (`_placement_errors_for_free_creates`).
    """
    issues: list[str] = []
    creates = [
        op
        for op in (rt.paint_ops or [])
        if isinstance(op, dict)
        and str(op.get("name") or op.get("op_key") or "").startswith("create_")
    ]
    pts = [xy for op in creates if (xy := _create_op_xy(op)) is not None]

    if len(pts) >= 2:
        stacked = sum(
            1
            for i, (x0, y0) in enumerate(pts)
            for x1, y1 in pts[i + 1 :]
            if abs(x0 - x1) < 48 and abs(y0 - y1) < 48
        )
        if stacked:
            issues.append(
                f"creates stacked ({stacked} near-duplicate positions) — "
                "offset by varying x/y inside FOCUS_FRAME (frame-local, keep frameId)"
            )
    return issues[:6]


def _run_post_paint_critique(
    rt: AgentRuntime,
    st: AgentRunState,
    *,
    round_i: int,
    preview_image: str | None = None,
    op_results: list[dict[str, Any]] | None = None,
) -> list[str]:
    """Structural critique after FE scene lands. Craft taste → Review + Skills."""
    if not _critique_enabled(rt) or not st.painted:
        return []
    _emit(
        {
            "type": "critique_start",
            "round": round_i,
            "reason": "post_paint",
        }
    )
    issues = _structure_verify_issues(
        nodes=list(rt.scene_nodes or []),
        frames=list(rt.scene_frames or []),
        painted=bool(st.painted),
        intent=str(st.intent or ""),
        paint_ops=list(rt.paint_ops or []),
        op_results=list(op_results or []),
    )
    for issue in _spatial_grounding_issues(rt):
        if issue not in issues:
            issues.append(issue)
    issues = [str(x).strip() for x in issues if str(x).strip()][:10]
    ok = not issues
    reason = "; ".join(issues)[:400] if issues else "ok"
    _emit(
        {
            "type": "critique_done",
            "round": round_i,
            "ok": ok,
            "reason": reason,
            **({"has_preview": True} if preview_image else {}),
        }
    )
    st.push_log(
        phase="critique",
        ok=ok,
        issues=issues or None,
        has_preview=bool(preview_image) or None,
        summary=("critique ok" if ok else f"critique: {reason}")[:160],
    )
    return issues


def _format_critique_reflect_note(issues: list[str]) -> str:
    """Paint-retry brief: structural CRITIQUE only (no aesthetic coaching)."""
    lines = ["CRITIQUE (fix paint — structural host issues):"]
    for i, issue in enumerate(issues[:6], 1):
        lines.append(f"{i}. {str(issue).strip()[:200]}")
    joined = " ".join(str(x).lower() for x in issues)
    if any(
        k in joined
        for k in ("place", "viewport", "stacked", "placement", "outside")
    ):
        lines.append(
            "Placement: set frameId=FOCUS_FRAME_ID on every create_* "
            "and use frame-local x/y (0..w, 0..h from TARGET_CANVAS)."
        )
    return "\n".join(lines)[:720]


async def _retry_paint_from_critique(
    rt: AgentRuntime,
    st: AgentRunState,
    *,
    round_i: int,
    issues: list[str],
) -> Command:
    note = _format_critique_reflect_note(issues)
    st.note_error(note)
    st.push_log(
        phase="reflect",
        error=st.reflect_note,
        reason="critique_failed",
        reflect_left=st.reflect_left,
        issues=issues[:6],
        summary=f"critique failed, retry paint: {'; '.join(issues)[:120]}"[:160],
    )
    st.reflect_left -= 1
    _emit(
        {
            "type": "skill_done",
            "index": round_i,
            "skill_key": "react",
            "skill_name": "Design Agent",
            "tokens": rt.last_used,
        }
    )
    st.round = round_i + 1
    rt.flags["op_failed"] = False
    rt.flags["critique_failed"] = True
    rt.flags["retry"] = True
    rt.flags["ok"] = False
    return Command(update=_bump(rt), goto="paint_ops")


async def _node_observe(
    state: GraphState,
) -> Command:
    rt = state["rt"]
    st = rt.run
    round_i = st.round
    from app.services.design.runtime.graph.build import (
        mark_design_running,
        mark_design_waiting_client,
    )
    from app.services.design.admin.task_store import peek_run_intent

    await asyncio.to_thread(mark_design_waiting_client, st.task_id)

    # Formal HITL: pause graph until driver resumes with FE scene (or timeout).
    # Node restarts from the top on resume — mark_waiting is idempotent.
    resume_raw = interrupt(_scene_interrupt_payload(st, round_i=round_i))

    intent = await asyncio.to_thread(peek_run_intent, st.task_id)
    if intent in ("pause", "cancel"):
        raise asyncio.CancelledError()

    if intent not in ("pause", "cancel"):
        await asyncio.to_thread(mark_design_running, st.task_id)

    snap = _normalize_resume_snap(resume_raw)
    preview_image: str | None = None
    op_failures: list[dict[str, Any]] = []
    op_results: list[dict[str, Any]] = []
    if snap:
        nodes = [
            n for n in (snap.get("nodes") or []) if isinstance(n, dict) and n.get("id")
        ][:120]
        frames = [
            f for f in (snap.get("frames") or []) if isinstance(f, dict) and f.get("id")
        ][:32]
        rt.scene_nodes = nodes
        rt.scene_frames = frames
        spatial = snap.get("spatial")
        if isinstance(spatial, dict):
            rt.spatial_summary = spatial
        prev = str(snap.get("preview_image") or "").strip()
        if prev:
            preview_image = prev
            rt.flags["preview_image"] = True
        op_results = [
            r for r in (snap.get("op_results") or []) if isinstance(r, dict)
        ]
        op_failures = [r for r in op_results if not r.get("ok", True)]
        fail_bits = [
            f"{r.get('name') or 'op'}: {r.get('error') or 'failed'}"
            for r in op_failures[:8]
            if isinstance(r, dict)
        ]
        st.push_log(
            phase="observe",
            nodes=len(nodes),
            frames=len(frames),
            ok=not op_failures,
            op_failed=len(op_failures) or None,
            op_errors=fail_bits or None,
            summary=(
                f"observe nodes={len(nodes)} frames={len(frames)}"
                + (f" · failed×{len(op_failures)}" if op_failures else " · ok")
            ),
        )
    else:
        st.note_error("scene_feedback_timeout: FE did not post scene; assume ops applied")
        st.push_log(
            phase="observe",
            ok=False,
            error="timeout",
            summary="observe timeout: FE did not post scene",
        )
        # Stale inventory must NOT drive critique → paint retry (empty board /
        # placement false positives). Assume applied and settle.
        if rt.skip_loop:
            if st.reply:
                _emit({"type": "token", "text": st.reply})
        _emit_ux_tip(rt, "observe_scene_timeout", params={})
        rt.terminal = True
        rt.flags["ok"] = True
        rt.flags["scene_ready"] = False
        rt.flags["scene_timeout"] = True
        rt.flags["op_failed"] = False
        rt.flags["retry"] = False
        return Command(update=_bump(rt), goto="__settle__")

    if rt.skip_loop:
        if st.reply:
            _emit({"type": "token", "text": st.reply})
        rt.terminal = True
        rt.flags["ok"] = True
        rt.flags["scene_ready"] = bool(snap)
        rt.flags["op_failed"] = False
        return Command(update=_bump(rt), goto="__settle__")

    if op_failures:
        fail_notes = "; ".join(
            f"{r.get('name') or 'op'}: {r.get('error') or 'failed'}"
            for r in op_failures[:3]
        )
        all_failed = len(rt.paint_ops) > 0 and len(op_failures) >= len(rt.paint_ops)
        if all_failed:
            st.painted = False
        st.note_error(f"op_apply_failed: {fail_notes}")
        st.push_log(
            phase="reflect",
            error=st.reflect_note,
            reason="op_apply_failed",
            op_failed=len(op_failures),
            reflect_left=st.reflect_left,
            summary=f"ops failed×{len(op_failures)}: {fail_notes}"[:160],
        )
        _emit(
            {
                "type": "activity",
                "id": f"opfail-{round_i}",
                "kind": "skipped",
                "status": "done",
                "count": len(op_failures),
                "detail": f"ops_failed×{len(op_failures)}: {fail_notes}"[:200],
                "index": round_i,
            }
        )
        if st.reflect_left > 0 and not rt.turn.get("done"):
            st.reflect_left -= 1
            _emit(
                {
                    "type": "skill_done",
                    "index": round_i,
                    "skill_key": "react",
                    "skill_name": "Design Agent",
                    "tokens": rt.last_used,
                }
            )
            st.round = round_i + 1
            rt.flags["op_failed"] = True
            rt.flags["retry"] = True
            rt.flags["ok"] = False
            return Command(update=_bump(rt), goto="paint_ops")
        _emit_ux_tip(
            rt,
            "observe_ops_failed",
            params={"count": str(len(op_failures)), "notes": fail_notes[:80]},
        )
        _emit(
            {
                "type": "skill_done",
                "index": round_i,
                "skill_key": "react",
                "tokens": rt.last_used,
            }
        )
        rt.terminal = True
        rt.flags["ok"] = False
        return Command(update=_bump(rt), goto="__settle__")

    critique_issues = _run_post_paint_critique(
        rt,
        st,
        round_i=round_i,
        preview_image=preview_image,
        op_results=op_results,
    )
    if (
        critique_issues
        and st.reflect_left > 0
        and not rt.turn.get("done")
        and st.painted
    ):
        # Cheap structural gate before (optional) LLM Review.
        return await _retry_paint_from_critique(
            rt, st, round_i=round_i, issues=critique_issues
        )

    if _should_route_to_review(rt, signals=list(critique_issues or [])) and st.painted:
        from app.services.design.runtime.graph.nodes.review import stash_review_context

        stash_review_context(
            st.task_id,
            preview_image=preview_image,
            signals=list(critique_issues or []),
        )
        st.push_log(
            phase="observe",
            summary="observe done → Review Agent (auto gate)",
            has_preview=bool(preview_image) or None,
            critique_signals=len(critique_issues or []) or None,
            review_mode=_review_mode(rt),
        )
        rt.flags["scene_ready"] = True
        rt.flags["op_failed"] = False
        rt.flags["retry"] = False
        rt.terminal = False
        return Command(update=_bump(rt), goto="review")

    if critique_issues:
        _emit_ux_tip(
            rt,
            "observe_critique_failed",
            params={"issues": "; ".join(critique_issues[:2])},
        )

    rt.flags["scene_ready"] = True
    rt.flags["op_failed"] = False
    rt.flags["ok"] = not bool(critique_issues)
    rt.flags["retry"] = False
    rt.terminal = True
    return Command(update=_bump(rt), goto="__settle__")
