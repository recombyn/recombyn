"""Autonomous Art Director (P42) — BasicLocal open floor.

Kernel path: Decide → IntelligenceClient.autonomous_plan/sync → BasicLocal → here.

Community floor: goal vs micro-edit classify + hop plan/sync over Kernel slots.
Full AD orchestration density lives behind Remote → private Intelligence.

Never emits canvas tool_ops. Execution/Observe/Review remain Kernel-owned.
"""
from __future__ import annotations

import re
from typing import Any

from langgraph.types import Command

from app.services.design.runtime.graph.state import (
    AUTONOMOUS_HOPS,
    AgentRuntime,
    GraphState,
    parse_autonomous_art_director,
)
from app.services.design.runtime.graph.support import _bump, _emit

# Spec micro-edit: 「帮我调整标题。」 — not autonomous.
_MICRO_EDIT_RX = re.compile(
    r"(调整标题|改一下标题|帮我调|挪一下|改成|字号|换色|改色|"
    r"resize\s+(the\s+)?title|move\s+(the\s+)?title|change\s+the\s+(title|color|font)|"
    r"make\s+(it|the\s+title)\s+(bigger|smaller)|nudge\b)",
    re.I,
)
# Spec goal: 「我要一个能让产品显得更贵、更专业、更有科技感的官网。」
_GOAL_RX = re.compile(
    r"(我要一个|做一个|官网|landing\s*page|显得更|更贵|更专业|科技感|"
    r"premium|professional|tech(?:nical|nology)?\s*feel|brand\s*site|"
    r"campaign|视觉方向|设计策略|art\s*direction)",
    re.I,
)

_HOP_SLOT: dict[str, str] = {
    "research": "design_research",
    "strategy": "design_strategy",
    "reference": "reference_dna",
    "candidates": "design_candidates",
    "tournament": "design_tournament",
    "swarm": "design_swarm",
    "simulation": "design_simulation",
    "counterfactual": "design_counterfactual",
    "governance": "design_governance",
    "optimization": "optimization",
    "review": "judge_verdict",
}


def classify_autonomous_mode(prompt: str) -> str:
    """Return goal | micro_edit | idle from user text."""
    text = str(prompt or "").strip()
    if not text:
        return "idle"
    if _MICRO_EDIT_RX.search(text) and not _GOAL_RX.search(text):
        return "micro_edit"
    if _GOAL_RX.search(text):
        return "goal"
    # Long aspirational briefs without micro verbs still count as goals.
    if len(text) >= 40 and not _MICRO_EDIT_RX.search(text):
        return "goal"
    return "idle"


def is_goal_only_prompt(prompt: str) -> bool:
    return classify_autonomous_mode(prompt) == "goal"


def _hop_row(hop_id: str, status: str = "pending", note: str = "") -> dict[str, Any]:
    return {"id": hop_id, "status": status, "note": note}


def build_autonomous_plan(
    *,
    prompt: str = "",
    intent: str = "",
    force: bool | None = None,
) -> dict[str, Any]:
    """Build host-owned hop plan. Never includes tool_ops."""
    mode = classify_autonomous_mode(prompt)
    if force is True:
        mode = "goal"
    elif force is False:
        mode = "micro_edit" if mode == "goal" else mode
    active = mode == "goal"
    goal = str(prompt or "").strip()[:800]
    hops: list[dict[str, Any]] = []
    for hid in AUTONOMOUS_HOPS:
        if not active:
            hops.append(_hop_row(hid, "skipped", "not autonomous"))
            continue
        if hid == "intent":
            note = f"intent={intent or 'design'}" if intent else "goal intake"
            hops.append(_hop_row(hid, "done" if intent else "pending", note))
        elif hid in (
            "execution",
            "observe",
            "review",
            "optimization",
            "governance",
            "knowledge",
        ):
            # Kernel / settle / memory own these; plan marks deferred until later.
            hops.append(_hop_row(hid, "deferred", "kernel or later stage"))
        else:
            hops.append(_hop_row(hid, "pending", ""))
    summary = (
        "Autonomous Art Director: goal → Research → Strategy → Tournament → Governance → Final"
        if active
        else (
            "micro-edit path (no full OS orchestration)"
            if mode == "micro_edit"
            else "autonomous idle"
        )
    )
    return parse_autonomous_art_director(
        {
            "active": active,
            "goal": goal,
            "mode": mode,
            "hops": hops,
            "summary": summary,
            "provider": "basic-local",
        }
    )


def sync_autonomous_hops(
    plan: dict[str, Any] | None,
    *,
    rt: AgentRuntime | None = None,
    painted: bool = False,
    observe: dict[str, Any] | None = None,
    governance: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Refresh hop statuses from Runtime slots. Never mutates canvas."""
    base = parse_autonomous_art_director(plan or {})
    if not base.get("active"):
        return base
    slots: dict[str, Any] = {}
    if rt is not None:
        for hop_id, attr in _HOP_SLOT.items():
            val = getattr(rt, attr, None)
            if val is None and isinstance(rt.flags, dict):
                val = rt.flags.get(attr)
            slots[hop_id] = val
        if not observe:
            observe = getattr(rt, "observe_facts", None)
        if not governance:
            governance = getattr(rt, "design_governance", None)
        brief = str(getattr(rt, "design_brief", "") or "").strip()
        if brief:
            slots["brief"] = brief
        intent = str(
            getattr(rt, "classified_intent", "") or getattr(rt.run, "intent", "") or ""
        ).strip()
        if intent:
            slots["intent"] = intent
        painted = painted or bool(getattr(rt.run, "painted", False))

    if observe:
        slots["observe"] = observe
    if governance:
        slots["governance"] = governance
    if painted:
        slots["execution"] = True

    hops_out: list[dict[str, Any]] = []
    for row in list(base.get("hops") or []):
        if not isinstance(row, dict):
            continue
        hid = str(row.get("id") or "")
        status = str(row.get("status") or "pending")
        note = str(row.get("note") or "")
        if hid == "intent" and slots.get("intent"):
            status, note = "done", f"intent={slots['intent']}"
        elif hid == "brief" and slots.get("brief"):
            status, note = "done", "brief locked"
        elif hid == "reference" and (
            slots.get("reference")
            or (rt is not None and getattr(rt, "reference_analyze", None))
        ):
            status, note = "done", "reference DNA"
        elif hid == "execution" and slots.get("execution"):
            status, note = "done", "paint applied (kernel)"
        elif hid == "observe" and slots.get("observe"):
            status, note = "done", "observe facts"
        elif hid == "governance" and isinstance(slots.get("governance"), dict):
            gstat = str(slots["governance"].get("status") or "")
            status = "done"
            note = f"governance={gstat or 'checked'}"
        elif hid in _HOP_SLOT and slots.get(hid):
            status, note = "done", f"{hid} ready"
        elif hid == "final":
            ready = all(
                slots.get(k)
                for k in ("research", "strategy", "candidates", "tournament")
            )
            if ready:
                status, note = "done", "pre-paint OS chain complete"
            else:
                status, note = "pending", "awaiting intelligence chain"
        elif hid == "knowledge":
            if (
                rt is not None
                and isinstance(rt.flags, dict)
                and rt.flags.get("knowledge_written")
            ):
                status, note = "done", "KG / memory writeback"
            else:
                status = "deferred"
        hops_out.append(_hop_row(hid, status, note))

    base["hops"] = hops_out
    done_n = sum(1 for h in hops_out if h.get("status") == "done")
    base["summary"] = (
        f"Autonomous Art Director: {done_n}/{len(hops_out)} hops done · "
        f"goal={str(base.get('goal') or '')[:80]}"
    )[:240]
    return parse_autonomous_art_director(base)


def apply_autonomous_to_runtime(rt: AgentRuntime, plan: dict[str, Any]) -> None:
    """Stash plan only. Never writes scene / apply_ops."""
    clean = parse_autonomous_art_director(plan)
    if "tool_ops" in clean:
        clean.pop("tool_ops", None)
    rt.autonomous_art_director = clean
    if isinstance(rt.flags, dict):
        rt.flags["autonomous_art_director"] = clean
        rt.flags["autonomous_mode"] = bool(clean.get("active"))


def format_autonomous_for_decide(plan: dict[str, Any] | None) -> str:
    src = plan if isinstance(plan, dict) else {}
    if not src.get("active"):
        return ""
    lines = [
        "AUTONOMOUS_ART_DIRECTOR (host-owned). Goal-only OS orchestration; never paints here.",
        f"goal: {str(src.get('goal') or '')[:200]}",
    ]
    for hop in list(src.get("hops") or [])[:20]:
        if not isinstance(hop, dict):
            continue
        lines.append(
            f"- {hop.get('id')}: {hop.get('status')}"
            + (f" ({hop.get('note')})" if hop.get("note") else "")
        )
    if src.get("summary"):
        lines.append(str(src["summary"])[:200])
    return "\n".join(lines)[:2000]


async def run_autonomous_controller(
    rt: AgentRuntime,
    *,
    phase: str = "plan",
) -> dict[str, Any] | None:
    """Plan (decide start) or sync (after intelligence hops). Fail-open."""
    st = rt.run
    flags = rt.flags if isinstance(rt.flags, dict) else {}
    force = flags.get("force_autonomous")
    force_b = bool(force) if force is not None else None
    prompt = str(getattr(rt, "prompt", "") or "")
    intent = str(
        getattr(rt, "classified_intent", "") or getattr(st, "intent", "") or ""
    ).strip()

    if phase == "plan":
        # Chat/ask never enter autonomous OS.
        if intent in ("chat", "ask") and force_b is not True:
            plan = build_autonomous_plan(prompt=prompt, intent=intent, force=False)
            plan["active"] = False
            plan["mode"] = "idle"
            for hop in list(plan.get("hops") or []):
                if isinstance(hop, dict):
                    hop["status"] = "skipped"
                    hop["note"] = "chat/ask"
            apply_autonomous_to_runtime(rt, plan)
            return plan
        plan = build_autonomous_plan(prompt=prompt, intent=intent, force=force_b)
        apply_autonomous_to_runtime(rt, plan)
        if plan.get("active"):
            _emit(
                {
                    "type": "activity",
                    "id": "autonomous-art-director",
                    "kind": "explored",
                    "status": "running",
                    "summary": "AUTONOMOUS_AD: goal → Research → Strategy → Tournament → …",
                }
            )
            st.push_log(
                phase="autonomous_art_director",
                summary=str(plan.get("summary") or "")[:160],
                mode=plan.get("mode"),
                hops=len(plan.get("hops") or []) or None,
            )
        return plan

    # sync
    prior = getattr(rt, "autonomous_art_director", None)
    if not isinstance(prior, dict):
        prior = flags.get("autonomous_art_director")
    if not isinstance(prior, dict) or not prior.get("active"):
        return prior if isinstance(prior, dict) else None
    synced = sync_autonomous_hops(prior, rt=rt)
    apply_autonomous_to_runtime(rt, synced)
    st.push_log(
        phase="autonomous_art_director",
        summary=str(synced.get("summary") or "")[:160],
        mode=synced.get("mode"),
        hops_done=sum(
            1
            for h in list(synced.get("hops") or [])
            if isinstance(h, dict) and h.get("status") == "done"
        )
        or None,
    )
    _emit(
        {
            "type": "autonomous_art_director",
            "active": True,
            "summary": synced.get("summary"),
            "hops": [
                {"id": h.get("id"), "status": h.get("status")}
                for h in list(synced.get("hops") or [])
                if isinstance(h, dict)
            ][:20],
        }
    )
    return synced


async def node_autonomous(state: GraphState) -> Command:
    """Optional graph node — plan then leave Decide to run intelligence hops."""
    rt = state["rt"]
    await run_autonomous_controller(rt, phase="plan")
    return _bump(state, "decide")
