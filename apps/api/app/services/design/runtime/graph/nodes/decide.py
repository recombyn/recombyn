from __future__ import annotations

import asyncio
import json
import time
from typing import Any

from langgraph.types import Command

from app.services.design.runtime.graph.state import (
    AgentRuntime,
    GraphState,
    _DEFAULT_MAX_ROUNDS,
    ReferenceIntelligenceTurnSchema,
    compile_reference_intelligence,
    design_brief_p0_missing,
    format_design_brief_for_paint,
    format_design_brief_for_prompt,
    format_reference_intel_for_decide,
    merge_reference_into_brief,
    parse_design_brief,
)
from app.services.design.runtime.graph.support import (
    _absorb_ask_choices,
    _append_prompt_pack,
    _bump,
    _chat_fallback_text,
    _clip_llm_raw,
    _commit,
    _emit,
    _emit_ux_tip,
    _flush_host_events,
    _format_thought_messages,
    _goto_cmd,
    _interaction_mode_rules_pack,
    _llm_io_fields,
    _parse_agent_turn,
    _persist_progress,
    _resolve_and_log_model,
    _resolve_paint_want,
    _should_route_to_paint,
    _stream_llm_text,
    _thinking_field,
    _turn_from_structured,
    _turn_has_clarify,
    _ui_thought_text,
)
from app.services.design.runtime.host import assemble_stage_system
from app.services.design.runtime.host.resources import load_deferred_resources
from app.services.design.runtime.agent_profile import resolve_contract_schema


_REFERENCE_INTEL_SYSTEM = (
    "You read a design reference image. Return structured visual laws, not taste words. "
    "Do not say premium / 高级 / 好看. Fill composition, hierarchy, density in [0,1], "
    "palette hex, typography, imagery. Optionally fill visual_dna axes in [0,1]: "
    "minimalism, editorial, contrast, density, asymmetry, texture, decoration. "
    "Never emit canvas ops."
)
_REFERENCE_INTEL_USER = (
    "Analyze this reference. Extract composition / hierarchy / density / palette / "
    "typography / imagery laws, then optional visual_dna axes."
)
_BRIEF_P1_KEYS = (
    "visual_focus",
    "palette",
    "typography",
    "tokens",
    "reference_lock",
    "style_dna",
    "reference_dna",
    "design_strategy",
)


def ingest_reference_images(rt: AgentRuntime) -> list[str]:
    """reference_ingest — user attachments only; empty means skip the pipeline."""
    return [str(x).strip() for x in (getattr(rt, "images", None) or []) if str(x).strip()][:4]


def should_run_reference_intelligence(rt: AgentRuntime) -> bool:
    if getattr(rt, "reference_dna", None):
        return False
    if not ingest_reference_images(rt):
        return False
    intent = str(getattr(rt, "classified_intent", "") or "").strip().lower()
    if intent in ("chat", "ask", "done"):
        return False
    return True


def apply_reference_intelligence(rt: AgentRuntime, compiled: dict[str, Any]) -> None:
    """Stash DNA/lock on Runtime. Never writes SceneDocument."""
    if not isinstance(compiled, dict):
        return
    analyze = compiled.get("analyze") if isinstance(compiled.get("analyze"), dict) else None
    dna = compiled.get("dna") if isinstance(compiled.get("dna"), dict) else None
    lock = compiled.get("lock") if isinstance(compiled.get("lock"), dict) else None
    if analyze:
        rt.reference_analyze = analyze
    if dna:
        rt.reference_dna = dna
    if lock:
        rt.reference_lock = lock
        if isinstance(rt.flags, dict):
            rt.flags["reference_lock"] = lock
            rt.flags["reference_dna"] = dna


def _structured_as_dict(raw: Any) -> dict[str, Any]:
    if raw is None:
        return {}
    if hasattr(raw, "model_dump"):
        try:
            dumped = raw.model_dump()
            return dumped if isinstance(dumped, dict) else {}
        except Exception:
            return {}
    return dict(raw) if isinstance(raw, dict) else {}


async def run_reference_intelligence(rt: AgentRuntime) -> dict[str, Any] | None:
    """analyze → segment → extract → dna → lock. Fail-open: missing DNA never blocks Decide."""
    if not should_run_reference_intelligence(rt):
        return None
    images = ingest_reference_images(rt)
    st = rt.run
    _emit(
        {
            "type": "activity",
            "id": "reference-intel",
            "kind": "explored",
            "status": "running",
            "summary": "REFERENCE_INTEL: analyzing composition / color / type / imagery",
        }
    )
    t0 = time.perf_counter()
    try:
        from app.services.llm import build_user_message_content
        from app.services.llm.agent import ainvoke_structured

        user_content = build_user_message_content(_REFERENCE_INTEL_USER, images)
        structured_out = await ainvoke_structured(
            schema=ReferenceIntelligenceTurnSchema,
            messages=[{"role": "user", "content": user_content}],
            model=st.family,
            system=_REFERENCE_INTEL_SYSTEM,
            source="design",
            run_name=f"design_reference:{st.task_id[:8]}",
            metadata={
                "task_id": st.task_id,
                "trace_id": st.trace_id,
                "user_id": rt.user_id,
                "stage": "reference_intel",
            },
            tags=["design", "lc_design", "reference_intel"],
        )
        payload = _structured_as_dict(structured_out.get("structured"))
        compiled = compile_reference_intelligence(payload, payload.get("visual_dna"))
    except Exception as err:  # noqa: BLE001
        st.note_error(f"reference_intel_failed: {err}"[:240])
        st.push_log(
            phase="reference_intel",
            error=str(err)[:200],
            summary="reference intelligence failed (Decide continues)",
            duration_ms=max(0, int((time.perf_counter() - t0) * 1000)),
        )
        _emit(
            {
                "type": "activity",
                "id": "reference-intel",
                "kind": "explored",
                "status": "done",
                "summary": "REFERENCE_INTEL: skipped (analyze failed)",
            }
        )
        return None
    apply_reference_intelligence(rt, compiled)
    ctype = ""
    analyze = compiled.get("analyze") if isinstance(compiled.get("analyze"), dict) else {}
    comp = analyze.get("composition") if isinstance(analyze.get("composition"), dict) else {}
    ctype = str(comp.get("type") or "").strip()
    st.push_log(
        phase="reference_intel",
        summary=(ctype or "reference dna locked")[:160],
        duration_ms=max(0, int((time.perf_counter() - t0) * 1000)),
        composition=ctype or None,
    )
    dna = compiled.get("dna") if isinstance(compiled.get("dna"), dict) else {}
    visual_dna = (
        dna.get("visual_dna") if isinstance(dna.get("visual_dna"), dict) else {}
    )
    thesis = ""
    brief = rt.flags.get("design_brief") if isinstance(rt.flags, dict) else None
    if isinstance(brief, dict):
        thesis = str(brief.get("visual_thesis") or "").strip()
    if not thesis:
        imagery = analyze.get("imagery") if isinstance(analyze.get("imagery"), dict) else {}
        thesis = str(imagery.get("style") or ctype or "").strip()
    _emit(
        {
            "type": "activity",
            "id": "reference-intel",
            "kind": "explored",
            "status": "done",
            "summary": ("REFERENCE_DNA: " + (ctype or "locked"))[:200],
        }
    )
    _emit(
        {
            "type": "reference_intel",
            "composition": ctype,
            "thesis": thesis[:240],
            "visual_dna": {
                str(k): float(v)
                for k, v in visual_dna.items()
                if isinstance(v, (int, float))
            },
            "stages": [
                "composition",
                "color",
                "typography",
                "whitespace",
                "imagery",
                "density",
            ],
        }
    )
    _emit(
        {
            "type": "analysis_delta",
            "text": format_reference_intel_for_decide(
                analyze=compiled.get("analyze"),
                dna=compiled.get("dna"),
                lock=compiled.get("lock"),
            )[:1200],
        }
    )
    return compiled


def _extract_design_brief(turn: dict[str, Any] | None, rt: AgentRuntime) -> str:
    """Return prompt-ready brief string; empty when missing/invalid for gate."""
    t = turn if isinstance(turn, dict) else {}
    raw = t.get("design_brief")
    if raw is None:
        raw = t.get("designBrief")
    if raw is None or raw == "":
        raw = getattr(rt, "design_brief", "") or ""
    parsed = parse_design_brief(raw)
    if not parsed:
        return ""
    return format_design_brief_for_prompt(parsed)


def _requires_design_brief(rt: AgentRuntime, intent: str) -> bool:
    """Create / design always; complex edit when scout/skills/refs informed the turn."""
    intent_l = str(intent or "").strip().lower()
    if intent_l in ("chat", "ask", "done", ""):
        return False
    if intent_l in ("create", "design"):
        return True
    if intent_l != "edit":
        return False
    try:
        from app.services.design.runtime.graph.paint_kit import _is_lean_paint_turn

        if _is_lean_paint_turn(rt):
            return False
    except Exception:
        pass
    if str(getattr(rt, "pending_subagent_details", "") or "").strip():
        return True
    if str(getattr(rt, "pending_skill_details", "") or "").strip():
        return True
    return bool(getattr(rt, "images", None))


def _stash_design_brief(rt: AgentRuntime, turn: dict[str, Any], *, round_i: int) -> str:
    """Validate + stash brief. Returns paint-facing text, or '' when missing/incomplete."""
    t = turn if isinstance(turn, dict) else {}
    raw = t.get("design_brief")
    if raw is None:
        raw = t.get("designBrief")
    if raw is None or raw == "":
        flagged = rt.flags.get("design_brief") if isinstance(rt.flags, dict) else None
        raw = flagged if flagged else (getattr(rt, "design_brief", "") or "")
    parsed = parse_design_brief(raw)
    if not parsed:
        return ""

    turn_analyze = t.get("reference_analyze") or t.get("referenceAnalyze")
    turn_dna = t.get("reference_dna") or t.get("referenceDna")
    if turn_analyze and not getattr(rt, "reference_analyze", None):
        apply_reference_intelligence(
            rt, compile_reference_intelligence(turn_analyze, turn_dna)
        )

    parsed = merge_reference_into_brief(
        parsed,
        analyze=getattr(rt, "reference_analyze", None),
        dna=getattr(rt, "reference_dna", None),
        lock=getattr(rt, "reference_lock", None),
    )

    missing = design_brief_p0_missing(parsed)
    if missing:
        # Incomplete structured brief — do not stash; Decide retries with note.
        rt.flags["design_brief_missing"] = missing
        return ""

    review_text = format_design_brief_for_prompt(parsed)
    paint_text = format_design_brief_for_paint(parsed)
    if not paint_text:
        return ""
    rt.design_brief = paint_text
    rt.flags["design_brief"] = parsed
    rt.flags.pop("design_brief_missing", None)
    st = rt.run
    thesis = str(parsed.get("visual_thesis") or "").strip()
    st.push_log(
        phase="design_brief",
        summary=(thesis[:160] or paint_text[:160])
        + ("…" if len(thesis or paint_text) > 160 else ""),
        chars=len(paint_text),
        missing_p1=[k for k in _BRIEF_P1_KEYS if not parsed.get(k)] or None,
    )
    _emit(
        {
            "type": "activity",
            "id": f"design-brief-{round_i}",
            "kind": "explored",
            "status": "done",
            "summary": ("DESIGN_BRIEF: " + (thesis or paint_text)[:120])[:200],
            "index": round_i,
        }
    )
    _emit({"type": "analysis_delta", "text": ("DESIGN_BRIEF\n" + review_text)[:1200]})
    return paint_text


async def _node_resource(state: GraphState) -> Command:
    rt = state["rt"]
    await load_deferred_resources(rt, rt.turn)
    return Command(update=_bump(rt))



async def _node_design_agent(state: GraphState) -> Command:
    """Decision stage: chat / clarify / need_* only. Canvas ops → paint_ops."""
    rt = state["rt"]
    st = rt.run
    ask_mode = str(rt.flags.get("mode") or "") == "ask"
    max_rounds = max(1, int(rt.max_rounds or _DEFAULT_MAX_ROUNDS))

    st.family, reason = _resolve_and_log_model(
        st,
        skill={
            "category": "agent",
            "default_model": "doubao",
            "name": "react",
            "skill_key": "react"
        },
        user_selected_model=rt.user_selected_model,
        run_mode=rt.mode,
        prompt=rt.prompt,
        rules=rt.rules,
        scene=rt.scene_key,
        attempt=st.round,
        has_images=bool(rt.images),
    )
    rt.last_reason = reason
    from app.services.design.intelligence_runtime import get_design_intelligence_client
    from app.services.design.runtime.graph.nodes.autonomous import (
        format_autonomous_for_decide,
    )

    intel = get_design_intelligence_client()
    await intel.analyze_reference(rt)
    await intel.retrieve_memory(rt)
    await intel.autonomous_plan(rt)
    await intel.research(rt)
    await intel.strategy(rt)
    await intel.propose_candidates(rt)
    await intel.tournament(rt)
    await intel.swarm_direction(rt)
    await intel.simulate(rt)
    await intel.counterfactual(rt)
    await intel.review(rt)
    await intel.optimize(rt)
    await intel.autonomous_sync(rt)
    await intel.write_principle(rt)

    for _round in range(max_rounds):
        round_i = st.round
        _emit(
            {
                "type": "skill_start",
                "index": round_i,
                "skill_id": None,
                "skill_key": "react",
                "skill_name": "Design Agent",
                "category": "agent",
                "model": st.family,
                "model_reason": rt.last_reason,
                "trace_id": st.trace_id
            }
        )
        lc_system, user_msg = _format_thought_messages(rt)
        ref_block = format_reference_intel_for_decide(
            analyze=getattr(rt, "reference_analyze", None),
            dna=getattr(rt, "reference_dna", None),
            lock=getattr(rt, "reference_lock", None),
        )
        if ref_block:
            user_msg = (user_msg + "\n\n" + ref_block).strip()
        mem = getattr(rt, "flags", None) if isinstance(getattr(rt, "flags", None), dict) else {}
        mem_notes = list(mem.get("memory_notes") or []) if isinstance(mem, dict) else []
        if mem_notes:
            mem_lines = ["TASTE_MEMORY (host-owned). Prefer these principles."]
            mem_lines.extend(f"- {str(x)[:120]}" for x in mem_notes[:10] if str(x).strip())
            user_msg = (user_msg + "\n\n" + "\n".join(mem_lines)[:1200]).strip()
        from app.services.design.runtime.graph.nodes.research import (
            format_research_for_decide,
        )

        research_block = format_research_for_decide(
            getattr(rt, "design_research", None)
        )
        if research_block:
            user_msg = (user_msg + "\n\n" + research_block).strip()
        from app.services.design.runtime.graph.nodes.strategy import (
            format_strategy_for_decide,
        )

        strategy_block = format_strategy_for_decide(
            getattr(rt, "design_strategy", None)
        )
        if strategy_block:
            user_msg = (user_msg + "\n\n" + strategy_block).strip()
        from app.services.design.runtime.graph.nodes.candidates import (
            format_candidates_for_decide,
        )

        candidates_block = format_candidates_for_decide(
            getattr(rt, "design_candidates", None)
        )
        if candidates_block:
            user_msg = (user_msg + "\n\n" + candidates_block).strip()
        from app.services.design.runtime.graph.nodes.tournament import (
            format_tournament_for_decide,
        )

        tournament_block = format_tournament_for_decide(
            getattr(rt, "design_tournament", None)
        )
        if tournament_block:
            user_msg = (user_msg + "\n\n" + tournament_block).strip()
        from app.services.design.runtime.graph.nodes.swarm import format_swarm_for_decide

        swarm_block = format_swarm_for_decide(getattr(rt, "design_swarm", None))
        if swarm_block:
            user_msg = (user_msg + "\n\n" + swarm_block).strip()
        from app.services.design.runtime.graph.nodes.simulation import (
            format_simulation_for_decide,
        )

        simulation_block = format_simulation_for_decide(
            getattr(rt, "design_simulation", None)
        )
        if simulation_block:
            user_msg = (user_msg + "\n\n" + simulation_block).strip()
        from app.services.design.runtime.graph.nodes.counterfactual import (
            format_counterfactual_for_decide,
        )

        counterfactual_block = format_counterfactual_for_decide(
            getattr(rt, "design_counterfactual", None)
        )
        if counterfactual_block:
            user_msg = (user_msg + "\n\n" + counterfactual_block).strip()
        autonomous_block = format_autonomous_for_decide(
            getattr(rt, "autonomous_art_director", None)
        )
        if autonomous_block:
            user_msg = (user_msg + "\n\n" + autonomous_block).strip()
        if not str(lc_system or "").strip():
            # Decide stage prompt assembly — single entry (no A/B/C fallback chain).
            lc_system = assemble_stage_system(
                rt.rules,
                stage="decide",
                ask_mode=ask_mode,
                persona=str(rt.persona or ""),
            )
        else:
            lc_system = _append_prompt_pack(
                lc_system,
                _interaction_mode_rules_pack(rt.rules, ask_mode=ask_mode),
            )
            if rt.persona and "IDENTITY:" not in lc_system:
                lc_system = f"IDENTITY: {rt.persona}\n\n{lc_system}"
        turn_images = list(rt.images or [])[:4] if rt.images else None
        if turn_images:
            st.vision_used = True
            rt.last_images = turn_images

        content = ""
        used_hint = 0
        llm_think = ""
        turn: dict[str, Any] = {}
        t_decide = time.perf_counter()
        try:
            st.family, content, used_hint, llm_ev, llm_think = await _stream_llm_text(
                model_family=st.family,
                system=lc_system,
                user=user_msg,
                rules=rt.rules,
                images=turn_images,
                max_tokens=2048,
                enable_thinking=True,
                live_emit=True,
            )
            _flush_host_events(st, llm_ev)
            st.total_tokens += used_hint
            turn = _parse_agent_turn(content)
            # Ignore any accidental tool_ops from decision text — paint stage owns ops.
            turn["tool_ops_raw"] = None
            if (
                not turn.get("intent")
                and not turn.get("reply")
                and not turn.get("need_tools")
                and not turn.get("need_skills")
                and not turn.get("need_subagents")
            ):
                from app.services.llm import build_user_message_content
                from app.services.llm.agent import ainvoke_structured

                user_content = build_user_message_content(user_msg, turn_images)
                structured_out = await ainvoke_structured(
                    schema=resolve_contract_schema("decide"),
                    messages=[{"role": "user", "content": user_content}],
                    model=st.family,
                    system=lc_system,
                    source="design",
                    run_name=f"design_decide:{st.task_id[:8]}",
                    metadata={
                        "task_id": st.task_id,
                        "trace_id": st.trace_id,
                        "user_id": rt.user_id,
                        "scene": rt.scene_key or "",
                        "intent": str(rt.classified_intent or st.intent or ""),
                        "round": round_i,
                        "has_images": bool(turn_images),
                        "stage": "decide"
                    },
                    tags=["design", "lc_design", "design_agent", "decide"],
                )
                turn = _turn_from_structured(structured_out.get("structured"))
                turn["tool_ops_raw"] = None
        except Exception as err:  # noqa: BLE001
            st.note_error(f"design_agent_llm_failed: {err}"[:240])
            st.push_log(
                phase="design_agent",
                error=str(err)[:200],
                summary="decide turn failed",
                duration_ms=max(0, int((time.perf_counter() - t_decide) * 1000)),
            )
            _emit(
                {
                    "type": "skill_done",
                    "index": round_i,
                    "skill_key": "react",
                    "skill_name": "Design Agent",
                    "tokens": 0
                }
            )
            _emit_ux_tip(rt, "decide_failed")
            rt.terminal = True
            return Command(update=_bump(rt), goto="__settle__")

        rt.turn = turn
        rt.last_content = content or str(turn.get("reply") or turn.get("thought") or "")
        rt.last_user_msg = user_msg
        rt.last_used = used_hint
        if llm_think:
            rt.last_think = llm_think
        intent = str(turn.get("intent") or "chat").strip().lower()
        reply = str(turn.get("reply") or "").strip()
        thought = str(turn.get("thought") or "").strip()
        has_clarify = _turn_has_clarify(turn)
        st.intent = intent

        # Chat fold: readable thought (not protocol dump). Keep off the black reply stream.
        ui_thought = _ui_thought_text(thought, limit=280)
        if ui_thought:
            _emit({"type": "thinking", "text": ui_thought, "replace": True})

        st.push_log(
            phase="design_agent",
            intent=intent,
            summary=(thought or intent or "decide")[:120],
            model=st.family,
            reply=(reply[:500] if reply else None),
            has_images=bool(turn_images) or None,
            # llm_image_urls comes only from _llm_io_fields (avoid duplicate kw).
            tokens=used_hint or None,
            duration_ms=max(0, int((time.perf_counter() - t_decide) * 1000)),
            llm_raw=_clip_llm_raw(content, limit=4000),
            **_thinking_field(llm_think),
            **_llm_io_fields(
                system=lc_system, user=user_msg, images=turn_images, max_tokens=2048
            ),
            stage="decide",
            **({"ask_mode": True} if ask_mode else {}),
        )
        _emit(
            {
                "type": "skill_done",
                "index": round_i,
                "skill_key": "react",
                "skill_name": "Design Agent",
                "tokens": used_hint
            }
        )

        need_any = bool(
            turn.get("need_tools")
            or turn.get("need_skills")
            or turn.get("need_subagents")
        )
        if need_any:
            skills_before = set(st.skills_loaded or [])
            tools_before = set(st.tools_loaded or [])
            subs_before = set(getattr(st, "subagents_loaded", None) or [])
            had_skill_details = bool(
                str(getattr(rt, "pending_skill_details", "") or "").strip()
            )
            await _node_resource(state)
            gained = bool(
                set(st.skills_loaded or []) - skills_before
                or set(st.tools_loaded or []) - tools_before
                or set(getattr(st, "subagents_loaded", None) or []) - subs_before
                or (
                    not had_skill_details
                    and bool(str(getattr(rt, "pending_skill_details", "") or "").strip())
                )
            )
            # Ask: after tools/skills land, decide again (clarify or paint).
            # Agent: only re-decide when something new was actually injected —
            # otherwise need_* echoes cause an empty design-pipeline spin (landing).
            if gained or ask_mode:
                st.round = round_i + 1
                continue
            turn["need_tools"] = []
            turn["need_skills"] = []
            turn["need_subagents"] = []
            # Fall through to brief / paint on this same decide turn.

        # Ask mode only: intent=ask → wait on user (chips and/or open reply).
        if ask_mode and intent == "ask" and reply:
            st.reply = reply
            _emit({"type": "token", "text": reply})
            _absorb_ask_choices(st, turn)
            rt.flags["await_user"] = True
            rt.terminal = True
            return Command(update=_bump(rt), goto="__settle__")

        brief = _stash_design_brief(rt, turn, round_i=round_i)
        if (
            _should_route_to_paint(
                classified=str(rt.classified_intent or ""),
                turn_intent=intent,
                has_clarify=has_clarify,
                ask_mode=ask_mode,
            )
            and _requires_design_brief(rt, intent)
            and not brief
        ):
            missing = list(rt.flags.get("design_brief_missing") or [])
            if missing:
                st.note_error(
                    "INCOMPLETE_DESIGN_BRIEF: fill P0 fields "
                    + ",".join(missing)
                    + " (purpose,audience,emotion,visual_thesis,visual_hero,"
                    "composition,avoid). P1 optional — do not invent junk. "
                    "tool_ops stay empty here."
                )
            else:
                st.note_error(
                    "MISSING_DESIGN_BRIEF: emit non-empty design_brief "
                    "(paint/review contract) then paint. tool_ops stay empty here."
                )
            st.round = round_i + 1
            continue

        if _should_route_to_paint(
            classified=str(rt.classified_intent or ""),
            turn_intent=intent,
            has_clarify=has_clarify,
            ask_mode=ask_mode,
        ):
            st.intent = _resolve_paint_want(rt, intent)
            # Stash only — stream after paint sends ops (or Ask propose rewrite).
            if reply and len(reply) <= 80:
                st.reply = reply
            return Command(update=_bump(rt), goto="paint_ops")

        text = reply or _chat_fallback_text(rt)
        if text:
            st.reply = text
            _emit({"type": "token", "text": text})
        rt.terminal = True
        return Command(update=_bump(rt), goto="__settle__")

    # Rounds exhausted on decide — if classified canvas work, still try paint.
    if _should_route_to_paint(
        classified=str(rt.classified_intent or ""),
        turn_intent=str(st.intent or ""),
        has_clarify=False,
        ask_mode=False,
    ):
        st.intent = _resolve_paint_want(rt, st.intent)
        return Command(update=_bump(rt), goto="paint_ops")

    rt.terminal = True
    if not st.reply:
        st.reply = _chat_fallback_text(rt)
        _emit({"type": "token", "text": st.reply})
    return Command(update=_bump(rt), goto="__settle__")

