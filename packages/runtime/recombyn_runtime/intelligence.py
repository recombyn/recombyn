"""Intelligence remote request / usability helpers (open).

``remote_result_usable`` lives in ``recombyn_protocol`` (shared contract).
This module keeps ``build_intelligence_request`` (needs Runtime-shaped objects)
and re-exports usability for existing ``recombyn_runtime`` imports.
"""

from __future__ import annotations

from typing import Any

from recombyn_protocol.intelligence import remote_result_usable

__all__ = [
    "build_intelligence_request",
    "remote_result_usable",
]


def _as_dict(val: Any) -> dict[str, Any] | None:
    return val if isinstance(val, dict) else None


def _flag(rt: Any, *keys: str) -> Any:
    flags = getattr(rt, "flags", None)
    if not isinstance(flags, dict):
        return None
    for key in keys:
        if key in flags and flags[key] is not None:
            return flags[key]
    return None


def _images(rt: Any) -> list[str]:
    raw = getattr(rt, "images", None)
    if not isinstance(raw, list):
        raw = _flag(rt, "images")
    if not isinstance(raw, list):
        return []
    return [str(x).strip() for x in raw if str(x).strip()][:4]


def _painted(rt: Any) -> bool:
    run = getattr(rt, "run", None)
    if run is not None and bool(getattr(run, "painted", False)):
        return True
    flag = _flag(rt, "painted")
    return bool(flag) if flag is not None else False


def build_intelligence_request(method: str, rt: Any) -> dict[str, Any]:
    """JSON body for ``POST {base}/v1/{method}`` (RemoteIntelligenceProvider)."""
    flags = getattr(rt, "flags", None)
    flag_map = dict(flags) if isinstance(flags, dict) else {}
    brief = _as_dict(getattr(rt, "design_brief", None)) or _as_dict(
        _flag(rt, "design_brief")
    )
    # design_brief may be a string on Runtime — keep structured flag only.
    if not isinstance(brief, dict):
        brief = _as_dict(_flag(rt, "design_brief"))

    ops = getattr(rt, "apply_ops", None)
    apply_ops = list(ops) if isinstance(ops, list) else []

    return {
        "method": str(method or "").strip(),
        "prompt": str(getattr(rt, "prompt", "") or ""),
        "scene_key": str(getattr(rt, "scene_key", "") or ""),
        "intent": str(getattr(rt, "classified_intent", "") or ""),
        "flags": flag_map,
        "images": _images(rt),
        "painted": _painted(rt),
        "knowledge_written": bool(_flag(rt, "knowledge_written")),
        "design_brief": brief,
        "design_research": _as_dict(getattr(rt, "design_research", None))
        or _as_dict(_flag(rt, "design_research")),
        "design_strategy": _as_dict(getattr(rt, "design_strategy", None))
        or _as_dict(_flag(rt, "design_strategy")),
        "design_candidates": _as_dict(getattr(rt, "design_candidates", None))
        or _as_dict(_flag(rt, "design_candidates")),
        "design_tournament": _as_dict(getattr(rt, "design_tournament", None))
        or _as_dict(_flag(rt, "design_tournament")),
        "design_swarm": _as_dict(getattr(rt, "design_swarm", None))
        or _as_dict(_flag(rt, "design_swarm")),
        "design_simulation": _as_dict(getattr(rt, "design_simulation", None))
        or _as_dict(_flag(rt, "design_simulation")),
        "design_counterfactual": _as_dict(getattr(rt, "design_counterfactual", None))
        or _as_dict(_flag(rt, "design_counterfactual")),
        "design_governance": _as_dict(getattr(rt, "design_governance", None))
        or _as_dict(_flag(rt, "design_governance")),
        "autonomous_art_director": _as_dict(
            getattr(rt, "autonomous_art_director", None)
        )
        or _as_dict(_flag(rt, "autonomous_art_director")),
        "reference_dna": _as_dict(getattr(rt, "reference_dna", None))
        or _as_dict(_flag(rt, "reference_dna")),
        "reference_analyze": _as_dict(getattr(rt, "reference_analyze", None))
        or _as_dict(_flag(rt, "reference_analyze")),
        "reference_lock": _as_dict(getattr(rt, "reference_lock", None))
        or _as_dict(_flag(rt, "reference_lock")),
        "observe_facts": _as_dict(getattr(rt, "observe_facts", None))
        or _as_dict(_flag(rt, "observe_facts")),
        "visual_diff": _as_dict(_flag(rt, "visual_diff")),
        "judge_verdict": _as_dict(getattr(rt, "judge_verdict", None))
        or _as_dict(_flag(rt, "judge_verdict")),
        "eval_patterns": list(_flag(rt, "eval_failure_patterns", "skill_failures") or [])
        if isinstance(_flag(rt, "eval_failure_patterns", "skill_failures"), list)
        else [],
        "memory_notes": list(_flag(rt, "memory_notes") or [])
        if isinstance(_flag(rt, "memory_notes"), list)
        else [],
        "apply_ops": apply_ops[:80],
    }
