"""Intelligence client boundary — protocol + BasicLocal factory (no proprietary docs)."""
from __future__ import annotations

from recombyn_intelligence_client import DesignIntelligenceClient, IntelligenceProvider

from app.services.design.intelligence_runtime import (
    BasicLocalProvider,
)
from app.services.design.runtime.decision_log import DesignRunDecision
from app.services.design.runtime.graph.state import AgentRunState, AgentRuntime


def _rt() -> AgentRuntime:
    run = AgentRunState(trace_id="tr", task_id="task_intel", goal="poster")
    return AgentRuntime(
        user_id="u",
        mode="agent",
        prompt="我要一个能让产品显得更贵、更专业、更有科技感的官网。",
        rules={},
        user_selected_model="auto",
        canvas_id=None,
        canvas_size="1080x1920",
        scene_key="landing",
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


def test_basic_local_is_intelligence_provider():
    assert isinstance(BasicLocalProvider(), IntelligenceProvider)


def test_factory_local_uses_basic_local(monkeypatch):
    from app.services.design import intelligence_runtime as ir

    monkeypatch.setattr(ir.settings, "intelligence_provider", "local")
    ir.reset_design_intelligence_client()
    client = ir.build_design_intelligence_client()
    assert isinstance(client, DesignIntelligenceClient)
    assert isinstance(client.provider, BasicLocalProvider)


def test_client_research_via_basic_local(monkeypatch):
    import asyncio

    from app.services.design import intelligence_runtime as ir

    monkeypatch.setattr(ir.settings, "intelligence_provider", "local")
    ir.reset_design_intelligence_client()
    client = ir.build_design_intelligence_client()
    rt = _rt()

    async def _run():
        return await client.research(rt)

    result = asyncio.run(_run())
    assert result is not None or getattr(rt, "design_research", None) is not None
    assert rt.apply_ops == []


def test_build_intelligence_request_shape():
    from recombyn_runtime import build_intelligence_request

    body = build_intelligence_request("research", _rt())
    assert body["method"] == "research"
    assert "prompt" in body and "flags" in body
    assert "design_research" in body and "apply_ops" in body


def test_remote_empty_dict_not_usable():
    from recombyn_runtime import remote_result_usable

    assert not remote_result_usable("research", {})
    assert not remote_result_usable("research", None)
    assert not remote_result_usable("govern", {"summary": "x"})
    assert remote_result_usable("govern", {"status": "pass"})
    assert remote_result_usable("gate_governance", {"status": "pass"})
    assert remote_result_usable("research", {"summary": "ok", "provider": "x"})


def test_stable_client_surface_uses_canonical_methods(monkeypatch):
    import asyncio

    from app.services.design import intelligence_runtime as ir

    monkeypatch.setattr(ir.settings, "intelligence_provider", "local")
    ir.reset_design_intelligence_client()
    client = ir.build_design_intelligence_client()
    rt = _rt()

    async def _run():
        proposed = await client.propose_candidates(rt)
        gov = await client.govern(rt)
        return proposed, gov

    proposed, gov = asyncio.run(_run())
    assert rt.apply_ops == []
    assert isinstance(gov, dict)
    assert gov.get("status") in ("pass", "fail")
    _ = proposed


def test_remote_provider_falls_back_on_empty_post(monkeypatch):
    import asyncio

    from app.services.design.intelligence_runtime import (
        BasicLocalProvider,
        RemoteIntelligenceProvider,
    )

    remote = RemoteIntelligenceProvider(base_url="http://example.invalid", fallback=BasicLocalProvider())

    async def _empty(_method: str, _rt: object):
        return {}

    monkeypatch.setattr(remote, "_post", _empty)
    rt = _rt()

    async def _run():
        return await remote.research(rt)

    result = asyncio.run(_run())
    assert result is not None or getattr(rt, "design_research", None) is not None


def test_remote_provider_applies_usable_research(monkeypatch):
    import asyncio

    from app.services.design.intelligence_runtime import (
        BasicLocalProvider,
        RemoteIntelligenceProvider,
        apply_intelligence_result,
    )

    remote = RemoteIntelligenceProvider(
        base_url="http://example.invalid",
        fallback=BasicLocalProvider(),
        apply_result=apply_intelligence_result,
    )
    payload = {
        "category": "ai_landing",
        "common_patterns": ["purple-blue gradient"],
        "avoid": ["purple gradient"],
        "anti_category_strategy": [
            "avoid: purple gradient",
            "adopt: editorial typography",
        ],
        "why_effective": ["Category clichés erase differentiation."],
        "summary": "category=ai_landing",
        "provider": "private-research",
    }

    async def _ok(_method: str, _rt: object):
        return payload

    monkeypatch.setattr(remote, "_post", _ok)
    rt = _rt()

    async def _run():
        return await remote.research(rt)

    result = asyncio.run(_run())
    assert result is not None
    assert rt.design_research is not None
    assert rt.design_research.get("category") == "ai_landing"
    assert rt.flags.get("design_research", {}).get("provider") == "private-research"
    assert "tool_ops" not in (rt.design_research or {})


def test_remote_applies_advanced_hooks(monkeypatch):
    import asyncio

    from app.services.design.intelligence_runtime import (
        BasicLocalProvider,
        RemoteIntelligenceProvider,
        apply_intelligence_result,
    )

    remote = RemoteIntelligenceProvider(
        base_url="http://example.invalid",
        fallback=BasicLocalProvider(),
        apply_result=apply_intelligence_result,
    )

    async def _post(method: str, _rt: object):
        if method == "retrieve_memory":
            return {
                "notes": ["preference:premium_restraint"],
                "summary": "memory",
                "provider": "private-memory",
            }
        if method == "review":
            return {
                "status": "pass",
                "score": 90,
                "issues": [],
                "summary": "ok",
                "provider": "private-review",
            }
        if method == "optimize":
            return {
                "actions": ["raise CTA"],
                "applied": False,
                "summary": "opt",
                "provider": "private-optimize",
            }
        if method == "write_principle":
            return {
                "principles": ["thesis:x"],
                "written": True,
                "summary": "wrote",
                "provider": "private-principle",
            }
        return {}

    monkeypatch.setattr(remote, "_post", _post)
    rt = _rt()

    async def _run():
        await remote.retrieve_memory(rt)
        await remote.review(rt)
        await remote.optimize(rt)
        await remote.write_principle(rt)

    asyncio.run(_run())
    assert "preference:premium_restraint" in (rt.flags.get("memory_notes") or [])
    assert (rt.judge_verdict or {}).get("score") == 90
    assert (rt.flags.get("intelligence_optimize") or {}).get("actions")
    assert rt.flags.get("knowledge_written") is True
