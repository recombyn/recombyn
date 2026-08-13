"""P41 — Design Governance: settle hard gate; FAIL → Explain → Repair."""
from __future__ import annotations

from app.services.design.runtime.decision_log import DesignRunDecision
from app.services.design.runtime.graph.nodes.governance import (
    apply_governance_to_runtime,
    check_accessibility_lane,
    check_brand_lane,
    contrast_ratio,
    format_governance_for_settle,
    run_design_governance_pipeline,
)
from app.services.design.runtime.graph.state import (
    GOVERNANCE_LANES,
    AgentRunState,
    AgentRuntime,
)


def _rt() -> AgentRuntime:
    run = AgentRunState(trace_id="tr", task_id="task_gov", goal="poster")
    return AgentRuntime(
        user_id="u",
        mode="agent",
        prompt="poster",
        rules={},
        user_selected_model="auto",
        canvas_id=None,
        canvas_size="1080x1920",
        scene_key="poster",
        scene_nodes=[],
        scene_frames=[],
        focus_id="",
        images=[],
        memory_in={},
        session_id="s",
        project_id="p",
        hold=0,
        free_daily=False,
        t0=0.0,
        settle_hold_fn=None,
        refund_hold_fn=None,
        apply_ops=[],
        w=1080,
        h=1920,
        run=run,
        decision=DesignRunDecision(),
        flags={},
        classified_intent="design",
    )


def test_governance_lanes_cover_spec():
    assert GOVERNANCE_LANES == (
        "brand",
        "accessibility",
        "copyright",
        "reference_similarity",
        "design_system",
        "content",
        "tool_permission",
    )


def test_brand_unauthorized_color_fails():
    lane = check_brand_lane(
        brief={"palette": {"allowed": ["#111111", "#eeeeee"]}},
        observe_facts={},
        force_unauthorized=["#ff00aa"],
    )
    assert lane["status"] == "fail"
    assert "unauthorized color" in lane["message"]


def test_accessibility_contrast_28_fails():
    """Spec example: contrast 2.8:1 fails."""
    assert contrast_ratio("#777777", "#666666") is not None
    lane = check_accessibility_lane(
        brief={"accessibility": {"contrast_ratio": 2.8}},
    )
    assert lane["status"] == "fail"
    assert "2.8" in lane["message"]


def test_reference_similarity_too_high_fails():
    from app.services.design.runtime.graph.nodes.governance import (
        check_reference_similarity_lane,
    )

    lane = check_reference_similarity_lane(flags={"reference_similarity": 0.97})
    assert lane["status"] == "fail"
    assert "similarity too high" in lane["message"]


def test_spacing_token_violation_fails():
    from app.services.design.runtime.graph.nodes.governance import (
        check_design_system_lane,
    )

    lane = check_design_system_lane(brief={"tokens": {"spacing_violation": True}})
    assert lane["status"] == "fail"
    assert "spacing token" in lane["message"]


def test_pass_clean_brief():
    result = run_design_governance_pipeline(
        brief={
            "purpose": "poster",
            "palette": {"allowed": ["#111111", "#f5f5f5", "#d84a32"]},
            "accessibility": {"fg": "#111111", "bg": "#f5f5f5"},
        },
        prompt="editorial poster",
        apply_ops=[{"op": "create_node"}],
    )
    assert result["status"] == "pass"
    assert result["repair_plan"] is None
    assert len(result["lanes"]) == 7


def test_fail_explain_repair_draft_not_ops():
    rt = _rt()
    result = run_design_governance_pipeline(
        brief={
            "palette": {"allowed": ["#000000"]},
            "accessibility": {"contrast_ratio": 2.8},
            "tokens": {"spacing_violation": True},
        },
        prompt="use shutterstock hero",
        flags={"unauthorized_colors": ["#ff00aa"], "reference_similarity": 0.97},
        apply_ops=[{"op": "delete_database"}],
    )
    assert result["status"] == "fail"
    assert result["explain"]
    assert result["repair_plan"] is not None
    assert result["repair_plan"]["applied"] is False
    apply_governance_to_runtime(rt, result)
    assert rt.flags.get("governance_fail") is True
    assert rt.apply_ops == []
    assert rt.scene_nodes == []
    block = format_governance_for_settle(result)
    assert "EXPLAIN:" in block
    assert "REPAIR:" in block
    fails = {l["lane"] for l in result["lanes"] if l["status"] == "fail"}
    assert "brand" in fails
    assert "accessibility" in fails
    assert "copyright" in fails
    assert "design_system" in fails
    assert "tool_permission" in fails
