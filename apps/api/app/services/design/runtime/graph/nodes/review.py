"""Review Agent — optional post-paint craft gate (sparse by default; see review_mode)."""
from __future__ import annotations

import json
import logging
import threading
import time
from typing import Any

from langgraph.types import Command

from app.services.design.runtime.graph.state import (
    AgentRunState,
    AgentRuntime,
    GraphState,
    ReviewIssueSchema,
    ReviewTurnSchema,
)
from app.services.design.runtime.graph.support import (
    _bump,
    _emit,
    _emit_ux_tip,
)
from app.services.design.runtime.host import assemble_stage_system
from app.services.design.runtime.agent_profile import resolve_contract_schema


_log = logging.getLogger(__name__)

# Preview data URLs must not enter durable checkpoints — stash by task_id.
_REVIEW_CTX_LOCK = threading.Lock()
_REVIEW_CTX: dict[str, dict[str, Any]] = {}


def stash_review_context(
    task_id: str,
    *,
    preview_image: str | None,
    signals: list[str],
) -> None:
    tid = str(task_id or "").strip()
    if not tid:
        return
    with _REVIEW_CTX_LOCK:
        _REVIEW_CTX[tid] = {
            "preview_image": str(preview_image or "").strip() or None,
            "signals": [str(x).strip() for x in (signals or []) if str(x).strip()][:12],
        }


def pop_review_context(task_id: str) -> dict[str, Any]:
    tid = str(task_id or "").strip()
    if not tid:
        return {}
    with _REVIEW_CTX_LOCK:
        return dict(_REVIEW_CTX.pop(tid, {}) or {})


def _review_enabled() -> bool:
    try:
        from app.core.config import settings

        return bool(getattr(settings, "design_review_agent_enabled", True))
    except Exception:
        return True


def _format_review_reflect_note(
    *,
    summary: str,
    fix_brief: str,
    issues: list[dict[str, Any]],
    market_gap: str = "",
    weaknesses: list[str] | None = None,
) -> str:
    lines = ["REVIEW (fix paint — address before settling):"]
    brief = str(fix_brief or "").strip()
    if brief:
        lines.append(brief[:480])
    elif summary:
        lines.append(str(summary).strip()[:240])
    gap = str(market_gap or "").strip()
    if gap:
        lines.append(f"MARKET_GAP: {gap[:320]}")
    for w in list(weaknesses or [])[:4]:
        bit = str(w or "").strip()
        if bit:
            lines.append(f"WEAK: {bit[:180]}")
    for i, row in enumerate(issues[:6], 1):
        sev = str(row.get("severity") or "major").strip()
        issue = str(row.get("issue") or "").strip()
        hint = str(row.get("fix_hint") or "").strip()
        bit = f"{i}. [{sev}] {issue}"
        if hint:
            bit = f"{bit} → {hint}"
        lines.append(bit[:220])
    return "\n".join(lines)[:1100]


def _str_list(raw: Any, *, limit: int = 6) -> list[str]:
    out: list[str] = []
    for item in list(raw or []):
        s = str(item or "").strip()
        if s and s not in out:
            out.append(s[:220])
        if len(out) >= limit:
            break
    return out


def _issues_as_dicts(raw: Any) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    for item in list(raw or []):
        if isinstance(item, ReviewIssueSchema):
            out.append(item.model_dump())
            continue
        if isinstance(item, dict):
            out.append(
                {
                    "severity": str(item.get("severity") or "major").strip() or "major",
                    "area": str(item.get("area") or "layout").strip() or "layout",
                    "issue": str(item.get("issue") or "").strip(),
                    "fix_hint": str(item.get("fix_hint") or "").strip(),
                }
            )
    return [x for x in out if x.get("issue")][:8]


def _parse_review_structured(raw: Any) -> dict[str, Any]:
    if isinstance(raw, ReviewTurnSchema):
        data = raw.model_dump(by_alias=True)
    elif isinstance(raw, dict):
        data = dict(raw)
    else:
        data = {}
    passed = bool(data.get("pass") if "pass" in data else data.get("pass_"))
    issues = _issues_as_dicts(data.get("issues"))
    must_fix = bool(data.get("must_fix"))
    if passed:
        must_fix = False
    elif not must_fix and any(
        str(x.get("severity") or "") in ("blocker", "major") for x in issues
    ):
        must_fix = True
    return {
        "pass": passed,
        "summary": str(data.get("summary") or "").strip(),
        "strengths": _str_list(data.get("strengths")),
        "weaknesses": _str_list(data.get("weaknesses")),
        "market_gap": str(data.get("market_gap") or "").strip()[:600],
        "must_fix": must_fix,
        "fix_brief": str(data.get("fix_brief") or "").strip(),
        "issues": issues,
    }


def _scene_digest(rt: AgentRuntime) -> str:
    """Compact scene for Review — reuse paint digest (fills included)."""
    from app.services.design.runtime.graph.scene_log import (
        _scene_digest as _paint_scene_digest,
    )

    try:
        fw = int(rt.w or 0)
        fh = int(rt.h or 0)
    except (TypeError, ValueError):
        fw, fh = 0, 0
    body = _paint_scene_digest(
        list(rt.scene_nodes or []),
        list(rt.scene_frames or []),
        focus_id=str(rt.focus_id or ""),
        focus_w=fw,
        focus_h=fh,
        limit=24,
    )
    ops = list(rt.paint_ops or [])[:8]
    if not ops:
        return body[:2400]
    lines = [body[:2200], "RECENT_PAINT_OPS:"]
    for op in ops:
        if isinstance(op, dict):
            lines.append(f"- {str(op.get('name') or op.get('tool') or '')[:40]}")
    return "\n".join(lines)[:2800]



def _build_review_user_msg(
    rt: AgentRuntime,
    *,
    signals: list[str],
    has_preview: bool,
) -> str:
    brief = str(getattr(rt, "design_brief", "") or "").strip()
    parts = [
        f"USER_GOAL:\n{str(rt.prompt or rt.run.goal or '').strip()[:2000]}",
    ]
    if brief:
        parts.append(
            "DESIGN_BRIEF (execution contract — paint must match this):\n"
            + brief[:4000]
        )
    else:
        parts.append(
            "DESIGN_BRIEF: missing.\n"
            "Judge USER_GOAL + SCENE; be stricter — prefer must_fix if the board "
            "looks improvised without a brief."
        )
    # Craft criteria come from Skills (not kernel Python / stage packs).
    skill_craft = str(getattr(rt, "pending_skill_details", "") or "").strip()
    if skill_craft:
        parts.append(
            "SKILL_CRAFT (business playbooks for this run — judge against these):\n"
            + skill_craft[:4000]
        )
    elif list(getattr(rt.run, "skills_loaded", None) or []):
        keys = ", ".join(str(k) for k in rt.run.skills_loaded[:12])
        parts.append(
            f"SKILL_CRAFT: playbook bodies not in context; loaded keys: {keys}. "
            "Gate on DESIGN_BRIEF fidelity + SCENE; do not invent extra aesthetic curricula."
        )
    parts.append(f"SCENE:\n{_scene_digest(rt)}")
    if has_preview:
        parts.append(
            "PREVIEW_IMAGE: attached below.\n"
            "Look at the screenshot vs DESIGN_BRIEF (+ SKILL_CRAFT when present). "
            "SCENE JSON is supporting evidence."
        )
    else:
        parts.append(
            "PREVIEW_IMAGE: not attached (unavailable or model is non-vision).\n"
            "Judge from DESIGN_BRIEF + SCENE + SIGNALS (+ SKILL_CRAFT) only; "
            "say text-only in summary. Still gate brief fidelity; be conservative on pass."
        )
    if signals:
        parts.append(
            "HEURISTIC_SIGNALS (host/structure hints only — confirm or dismiss):\n"
            + "\n".join(f"- {s}" for s in signals[:12])
        )
    else:
        parts.append("HEURISTIC_SIGNALS:\n(none)")
    spat = rt.spatial_summary if isinstance(rt.spatial_summary, dict) else None
    if spat and not has_preview:
        try:
            safe_spat = {
                k: v
                for k, v in spat.items()
                if k in ("focused", "peripheral", "overlaps", "viewport")
            }
            parts.append("SPATIAL:\n" + json.dumps(safe_spat, ensure_ascii=False)[:800])
        except Exception:
            pass
    parts.append(
        "Return pass / must_fix / issues / strengths / weaknesses / market_gap. "
        "Do not emit tool_ops. Prioritize DESIGN_BRIEF fidelity, then SKILL_CRAFT."
    )
    return "\n\n".join(parts)


async def _invoke_review_llm(
    rt: AgentRuntime,
    *,
    preview_image: str | None,
    signals: list[str],
) -> dict[str, Any]:
    st = rt.run
    ask_mode = str(rt.flags.get("mode") or "") == "ask"
    # Craft bar = DESIGN_BRIEF + SKILL_CRAFT in user msg; kernel stays thin.
    images: list[str] = []
    prev = str(preview_image or "").strip()
    if prev.startswith("data:image/") or prev.startswith("http"):
        images.append(prev)
    has_preview = bool(images)
    user_msg = _build_review_user_msg(
        rt,
        signals=signals,
        has_preview=has_preview,
    )

    # Fork when Profile declares review as forked subagent.
    from app.services.design.runtime.agent_profile import get_active_agent_profile
    from app.services.design.runtime.models_route import resolve_review_model
    from app.services.design.runtime.subagent import run_subagent

    prof = get_active_agent_profile()
    sub = prof.subagent_for_stage("review") or prof.get_subagent("review")
    if sub is not None and sub.isolation == "forked_context":
        if images:
            st.vision_used = True
            rt.last_images = list(images)[:2]
        model_id, _lane = resolve_review_model(
            rt.rules,
            user_selected_model=rt.user_selected_model,
            design_model=st.family,
        )
        result = await run_subagent(
            agent_id=sub.id,
            task=user_msg,
            rules=rt.rules,
            profile=prof,
            images=images[:2] or None,
            catalog_blocks=None,
            schema=resolve_contract_schema("review"),
            model=model_id or st.family,
            metadata={
                "task_id": st.task_id,
                "trace_id": st.trace_id,
                "user_id": rt.user_id,
                "scene": rt.scene_key or "",
                "round": st.round,
                "mode": "ask" if ask_mode else "agent",
                "persona": str(rt.persona or ""),
                "parent_task_id": st.task_id,
            },
            timeout=90.0,
        )
        if not result.ok:
            raise RuntimeError(result.error or "review_subagent_failed")
        parsed = _parse_review_structured(result.payload)
        st.push_log(
            phase="review_agent",
            ok=bool(parsed.get("pass")),
            must_fix=bool(parsed.get("must_fix")) or None,
            issues=[
                x.get("issue")
                for x in (parsed.get("issues") or [])[:6]
                if x.get("issue")
            ],
            strengths=list(parsed.get("strengths") or [])[:6] or None,
            weaknesses=list(parsed.get("weaknesses") or [])[:6] or None,
            market_gap=(str(parsed.get("market_gap") or "").strip()[:320] or None),
            summary=(
                parsed.get("summary")
                or result.summary
                or ("review pass" if parsed.get("pass") else "review must_fix")
            )[:160],
            duration_ms=result.duration_ms,
            model=result.model or st.family,
            has_preview=has_preview or None,
            subagent=sub.id,
            isolation="forked_context",
        )
        return parsed

    # Fallback: shared-state review (legacy) — still a fresh messages list.
    system = assemble_stage_system(
        rt.rules,
        stage="review",
        ask_mode=ask_mode,
        persona=str(rt.persona or ""),
        catalog_blocks=None,
    )
    if images:
        st.vision_used = True
        rt.last_images = list(images)[:2]

    from app.services.llm import build_user_message_content
    from app.services.llm.agent import ainvoke_structured

    user_content = build_user_message_content(user_msg, images[:2] or None)
    t0 = time.perf_counter()
    structured_out = await ainvoke_structured(
        schema=resolve_contract_schema("review"),
        messages=[{"role": "user", "content": user_content}],
        model=st.family,
        system=system,
        source="design",
        run_name=f"design_review:{st.task_id[:8]}",
        metadata={
            "task_id": st.task_id,
            "trace_id": st.trace_id,
            "user_id": rt.user_id,
            "scene": rt.scene_key or "",
            "round": st.round,
            "has_preview": has_preview,
            "stage": "review",
            "agent": "review",
        },
        tags=["design", "lc_design", "review_agent", "review", "vision"],
        timeout=90.0,
        stream_chunk_timeout=45.0,
    )
    parsed = _parse_review_structured(structured_out.get("structured"))
    duration_ms = max(0, int((time.perf_counter() - t0) * 1000))
    st.push_log(
        phase="review_agent",
        ok=bool(parsed.get("pass")),
        must_fix=bool(parsed.get("must_fix")) or None,
        issues=[
            x.get("issue") for x in (parsed.get("issues") or [])[:6] if x.get("issue")
        ],
        strengths=list(parsed.get("strengths") or [])[:6] or None,
        weaknesses=list(parsed.get("weaknesses") or [])[:6] or None,
        market_gap=(str(parsed.get("market_gap") or "").strip()[:320] or None),
        summary=(
            parsed.get("summary")
            or ("review pass" if parsed.get("pass") else "review must_fix")
            )[:160],
        duration_ms=duration_ms,
        model=st.family,
        has_preview=has_preview or None,
    )
    return parsed


def _fallback_from_signals(signals: list[str]) -> dict[str, Any]:
    issues = [
        {
            "severity": "major",
            "area": "ops",
            "issue": s,
            "fix_hint": "Fix this host/structure signal on the next paint pass.",
        }
        for s in signals[:6]
    ]
    must = bool(issues)
    weak = [str(s).strip() for s in signals[:4] if str(s).strip()]
    return {
        "pass": not must,
        "summary": ("heuristic signals clear" if not must else f"heuristic×{len(issues)}"),
        "strengths": [],
        "weaknesses": weak,
        "market_gap": "",
        "must_fix": must,
        "fix_brief": (
            ""
            if not must
            else "Address the listed host/structure issues; keep the user goal intact."
        ),
        "issues": issues,
    }



async def _retry_paint_from_review(
    rt: AgentRuntime,
    st: AgentRunState,
    *,
    round_i: int,
    verdict: dict[str, Any],
) -> Command:
    note = _format_review_reflect_note(
        summary=str(verdict.get("summary") or ""),
        fix_brief=str(verdict.get("fix_brief") or ""),
        issues=list(verdict.get("issues") or []),
        market_gap=str(verdict.get("market_gap") or ""),
        weaknesses=list(verdict.get("weaknesses") or []),
    )
    st.note_error(note)
    issue_labels = [
        str(x.get("issue") or "").strip()
        for x in (verdict.get("issues") or [])
        if str(x.get("issue") or "").strip()
    ]
    st.push_log(
        phase="reflect",
        error=st.reflect_note,
        reason="review_failed",
        reflect_left=st.reflect_left,
        issues=issue_labels[:6],
        summary=f"review must_fix, retry paint: {'; '.join(issue_labels)[:120]}"[:160],
    )
    st.reflect_left -= 1
    _emit(
        {
            "type": "skill_done",
            "index": round_i,
            "skill_key": "review",
            "skill_name": "Review Agent",
            "tokens": rt.last_used,
        }
    )
    st.round = round_i + 1
    rt.flags["op_failed"] = False
    rt.flags["critique_failed"] = True
    rt.flags["review_failed"] = True
    rt.flags["retry"] = True
    rt.flags["ok"] = False
    rt.terminal = False
    return Command(update=_bump(rt), goto="paint_ops")


async def _node_review_agent(state: GraphState) -> Command:
    """Review Agent: optional craft gate after observe; may force paint retry."""
    rt = state["rt"]
    st = rt.run
    round_i = st.round
    ctx = pop_review_context(st.task_id)
    preview_image = ctx.get("preview_image")
    signals = list(ctx.get("signals") or [])
    if not isinstance(signals, list):
        signals = []

    if not st.painted:
        rt.flags["scene_ready"] = True
        rt.flags["ok"] = True
        rt.flags["retry"] = False
        rt.terminal = True
        return Command(update=_bump(rt), goto="__settle__")

    # Review Agent: user lock → Admin pin → follow design model → vision.
    from app.services.design.runtime.models_route import resolve_review_model

    family, reason = resolve_review_model(
        rt.rules,
        user_selected_model=rt.user_selected_model,
        design_model=st.family,
    )
    st.family = family
    rt.last_reason = reason
    if "vision" in reason or bool(preview_image):
        st.vision_used = True
    st.push_log(
        phase="model_route",
        skill_key="review",
        model=family,
        model_reason=reason,
        has_images=bool(preview_image) or None,
        vision=True if preview_image else None,
        run_mode=rt.mode or None,
        attempt=int(st.round),
        summary=f"Review pinned model {family}",
    )

    _emit(
        {
            "type": "skill_start",
            "index": round_i,
            "skill_id": None,
            "skill_key": "review",
            "skill_name": "Review Agent",
            "category": "review",
            "model": st.family,
            "model_reason": rt.last_reason,
            "trace_id": st.trace_id,
            "agent": "review",
        }
    )
    _emit(
        {
            "type": "critique_start",
            "round": round_i,
            "reason": "review_agent",
            "source": "review_agent",
            "agent": "review",
        }
    )

    verdict: dict[str, Any]
    if not _review_enabled():
        verdict = _fallback_from_signals(signals)
    else:
        try:
            from app.core.config import settings
            from app.services.design.runtime.graph.nodes.paint import _await_or_abandon

            review_budget = float(
                getattr(settings, "design_review_llm_timeout_sec", 100.0) or 100.0
            )
            verdict = await _await_or_abandon(
                _invoke_review_llm(
                    rt, preview_image=preview_image, signals=signals
                ),
                timeout_sec=max(15.0, review_budget),
                label=f"review:{st.task_id[:8]}",
            )
        except Exception as err:  # noqa: BLE001
            _log.exception("review_agent_llm_failed task=%s", st.task_id[:8])
            st.note_error(f"review_agent_llm_failed: {err}"[:240])
            verdict = _fallback_from_signals(signals)
            if not signals:
                verdict = {
                    "pass": True,
                    "summary": "review unavailable; fail-open",
                    "strengths": [],
                    "weaknesses": [],
                    "market_gap": "",
                    "must_fix": False,
                    "fix_brief": "",
                    "issues": [],
                }

    issues = list(verdict.get("issues") or [])
    issue_text = [
        str(x.get("issue") or "").strip()
        for x in issues
        if str(x.get("issue") or "").strip()
    ]
    strengths = [
        str(x).strip()
        for x in list(verdict.get("strengths") or [])
        if str(x).strip()
    ][:6]
    weaknesses = [
        str(x).strip()
        for x in list(verdict.get("weaknesses") or [])
        if str(x).strip()
    ][:6]
    market_gap = str(verdict.get("market_gap") or "").strip()[:600]
    ok = bool(verdict.get("pass")) and not bool(verdict.get("must_fix"))
    reason_txt = str(verdict.get("summary") or "").strip()
    if not reason_txt:
        reason_txt = "; ".join(issue_text)[:400] if issue_text else "ok"
    _emit(
        {
            "type": "critique_done",
            "round": round_i,
            "ok": ok,
            "reason": reason_txt[:400],
            "source": "review_agent",
            "agent": "review",
            "must_fix": bool(verdict.get("must_fix")),
            "issues": issue_text[:8],
            "strengths": strengths,
            "weaknesses": weaknesses,
            "market_gap": market_gap,
            **({"has_preview": True} if preview_image else {}),
        }
    )
    taste_bits: list[str] = []
    if strengths:
        taste_bits.append("Strengths: " + "; ".join(strengths[:3]))
    if weaknesses:
        taste_bits.append("Weaknesses: " + "; ".join(weaknesses[:3]))
    if market_gap:
        taste_bits.append(f"Market gap: {market_gap[:280]}")
    if taste_bits:
        _emit({"type": "analysis_delta", "text": "\n".join(taste_bits)[:900]})

    must_fix = bool(verdict.get("must_fix")) and not ok
    review_left = st.reflect_left
    if "review_left" in rt.flags:
        try:
            review_left = int(rt.flags.get("review_left"))
        except (TypeError, ValueError):
            review_left = st.reflect_left
    if (
        must_fix
        and review_left > 0
        and not rt.turn.get("done")
        and st.painted
    ):
        rt.flags["review_left"] = max(0, review_left - 1)
        return await _retry_paint_from_review(
            rt, st, round_i=round_i, verdict=verdict
        )

    if must_fix:
        _emit_ux_tip(
            rt,
            "review_must_fix",
            params={"issues": "; ".join(issue_text[:2]) or "adjust per DESIGN_BRIEF"},
        )

    _emit(
        {
            "type": "skill_done",
            "index": round_i,
            "skill_key": "review",
            "skill_name": "Review Agent",
            "tokens": rt.last_used,
        }
    )

    rt.flags["scene_ready"] = True
    rt.flags["op_failed"] = False
    rt.flags["critique_failed"] = bool(must_fix)
    rt.flags["review_failed"] = bool(must_fix)
    rt.flags["ok"] = not bool(must_fix)
    rt.flags["retry"] = False
    rt.terminal = True
    return Command(update=_bump(rt), goto="__settle__")
