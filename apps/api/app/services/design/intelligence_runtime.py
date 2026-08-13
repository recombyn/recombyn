"""API-side Intelligence providers + client factory.

BasicLocalProvider delegates to in-repo BasicLocal runners (open floor).
Optional remote adapter posts to a generic HTTP IntelligenceProvider endpoint;
usable results are applied onto Runtime slots; failures fall back to BasicLocal.
Do not document proprietary backends here.

Stable surface matches ``DesignIntelligenceClient`` (propose_candidates,
swarm_direction, govern, autonomous_plan, …). Legacy aliases remain on the Client.
"""
from __future__ import annotations

import logging
from typing import Any

import httpx
from recombyn_intelligence_client import DesignIntelligenceClient
from recombyn_protocol import INTELLIGENCE_METHOD_ALIASES
from recombyn_runtime import build_intelligence_request, remote_result_usable

from app.core.config import settings

_log = logging.getLogger("app.design.intelligence")

_client: DesignIntelligenceClient | None = None


def _wire_method(name: str) -> str:
    """Canonical HTTP path segment (aliases collapse to stable names)."""
    key = str(name or "").strip()
    return INTELLIGENCE_METHOD_ALIASES.get(key, key)


def apply_intelligence_result(
    method: str, rt: Any, data: dict[str, Any] | None
) -> dict[str, Any] | None:
    """Write a Provider payload into Runtime slots (Decide ignores return values).

    BasicLocal runners already apply in-place. Remote must call this after a
    usable HTTP body, or Kernel never sees Research/Strategy/….
    """
    if not isinstance(data, dict) or not data:
        return None
    name = _wire_method(method)

    if name == "analyze_reference":
        from app.services.design.runtime.graph.nodes.decide import (
            apply_reference_intelligence,
        )
        from app.services.design.runtime.graph.state import (
            compile_reference_intelligence,
        )

        if data.get("analyze") or data.get("dna") or data.get("lock"):
            apply_reference_intelligence(rt, data)
        else:
            apply_reference_intelligence(
                rt,
                compile_reference_intelligence(
                    data, data.get("visual_dna") or data.get("dna")
                ),
            )
        return data

    if name == "research":
        from app.services.design.runtime.graph.nodes.research import (
            apply_research_to_runtime,
        )

        apply_research_to_runtime(rt, data)
        return data

    if name == "strategy":
        from app.services.design.runtime.graph.nodes.strategy import (
            apply_strategy_to_runtime,
        )

        apply_strategy_to_runtime(rt, data)
        return data

    if name == "propose_candidates":
        from app.services.design.runtime.graph.nodes.candidates import (
            apply_candidates_to_runtime,
        )

        apply_candidates_to_runtime(rt, data)
        return data

    if name == "tournament":
        from app.services.design.runtime.graph.nodes.tournament import (
            apply_tournament_to_runtime,
        )

        apply_tournament_to_runtime(rt, data)
        return data

    if name == "swarm_direction":
        from app.services.design.runtime.graph.nodes.swarm import apply_swarm_to_runtime

        apply_swarm_to_runtime(rt, data)
        return data

    if name == "simulate":
        from app.services.design.runtime.graph.nodes.simulation import (
            apply_simulation_to_runtime,
        )

        apply_simulation_to_runtime(rt, data)
        return data

    if name == "counterfactual":
        from app.services.design.runtime.graph.nodes.counterfactual import (
            apply_counterfactual_to_runtime,
        )

        apply_counterfactual_to_runtime(rt, data)
        return data

    if name == "govern":
        from app.services.design.runtime.graph.nodes.governance import (
            apply_governance_to_runtime,
        )

        apply_governance_to_runtime(rt, data)
        return data

    if name in ("autonomous_plan", "autonomous_sync"):
        from app.services.design.runtime.graph.nodes.autonomous import (
            apply_autonomous_to_runtime,
        )

        apply_autonomous_to_runtime(rt, data)
        return data

    # review / optimize / memory / principle — optional Remote enrichment slots
    if name == "review":
        if isinstance(getattr(rt, "flags", None), dict):
            rt.flags["intelligence_review"] = data
        if data.get("score") is not None or data.get("status"):
            prior = getattr(rt, "judge_verdict", None)
            if not isinstance(prior, dict):
                prior = {}
            merged = dict(prior)
            merged.update(
                {
                    "status": data.get("status"),
                    "score": data.get("score"),
                    "issues": data.get("issues"),
                    "summary": data.get("summary"),
                    "provider": data.get("provider"),
                }
            )
            rt.judge_verdict = merged
            if isinstance(rt.flags, dict):
                rt.flags["judge_verdict"] = merged
        return data

    if name == "optimize":
        if isinstance(getattr(rt, "flags", None), dict):
            rt.flags["intelligence_optimize"] = data
            rt.flags["optimization"] = data
        return data

    if name == "retrieve_memory":
        if isinstance(getattr(rt, "flags", None), dict):
            rt.flags["intelligence_memory"] = data
            notes = data.get("notes")
            if isinstance(notes, list):
                rt.flags["memory_notes"] = [str(x) for x in notes if str(x).strip()][:16]
            if data.get("category"):
                rt.flags["taste_category"] = str(data.get("category"))
            if isinstance(data.get("preferences"), dict):
                rt.flags["taste_preferences"] = data["preferences"]
            if isinstance(data.get("principles"), list):
                rt.flags["taste_principles"] = [
                    str(x) for x in data["principles"] if str(x).strip()
                ][:12]
            if data.get("retrieval"):
                rt.flags["taste_retrieval"] = str(data.get("retrieval"))
            if data.get("embed_backend"):
                rt.flags["taste_embed_backend"] = str(data.get("embed_backend"))
            if data.get("embed_model"):
                rt.flags["taste_embed_model"] = str(data.get("embed_model"))
            if isinstance(data.get("scores"), list):
                rt.flags["taste_scores"] = list(data.get("scores") or [])[:12]
            if isinstance(data.get("related_triples"), list):
                rt.flags["taste_related_triples"] = list(
                    data.get("related_triples") or []
                )[:8]
        return data

    if name == "write_principle":
        if isinstance(getattr(rt, "flags", None), dict):
            rt.flags["intelligence_principle_write"] = data
            if data.get("written"):
                rt.flags["knowledge_written"] = True
            if data.get("ids"):
                rt.flags["taste_principle_ids"] = list(data.get("ids") or [])[:12]
        return data

    # review / optimize / retrieve_memory / write_principle — optional; no slot yet.
    return data


class BasicLocalProvider:
    """Default open provider — BasicLocal P32–P42 floors (no private data)."""

    async def analyze_reference(self, rt: Any) -> dict[str, Any] | None:
        from app.services.design.runtime.graph.nodes.decide import (
            run_reference_intelligence,
        )

        return await run_reference_intelligence(rt)

    async def research(self, rt: Any) -> dict[str, Any] | None:
        from app.services.design.runtime.graph.nodes.research import run_design_research

        return await run_design_research(rt)

    async def strategy(self, rt: Any) -> dict[str, Any] | None:
        from app.services.design.runtime.graph.nodes.strategy import run_design_strategy

        return await run_design_strategy(rt)

    async def propose_candidates(self, rt: Any) -> dict[str, Any] | None:
        from app.services.design.runtime.graph.nodes.candidates import run_multi_candidate

        return await run_multi_candidate(rt)

    async def tournament(self, rt: Any) -> dict[str, Any] | None:
        from app.services.design.runtime.graph.nodes.tournament import (
            run_design_tournament,
        )

        return await run_design_tournament(rt)

    async def swarm_direction(self, rt: Any) -> dict[str, Any] | None:
        from app.services.design.runtime.graph.nodes.swarm import run_design_swarm

        return await run_design_swarm(rt)

    async def simulate(self, rt: Any) -> dict[str, Any] | None:
        from app.services.design.runtime.graph.nodes.simulation import (
            run_design_simulation,
        )

        return await run_design_simulation(rt)

    async def counterfactual(self, rt: Any) -> dict[str, Any] | None:
        from app.services.design.runtime.graph.nodes.counterfactual import (
            run_design_counterfactual,
        )

        return await run_design_counterfactual(rt)

    async def review(self, rt: Any) -> dict[str, Any] | None:
        """Advanced review/judge hook. Kernel Review node remains authoritative.

        BasicLocal is a no-op so Host merge / seven-lane Review stay in Kernel.
        Cloud providers may return production judge payloads here.
        """
        return None

    async def optimize(self, rt: Any) -> dict[str, Any] | None:
        """Advanced optimization hook. BasicLocal leaves Kernel Opt controller."""
        return None

    async def govern(self, rt: Any) -> dict[str, Any]:
        from app.services.design.runtime.graph.nodes.governance import (
            gate_governance_before_settle,
        )

        return await gate_governance_before_settle(rt)

    async def autonomous_plan(self, rt: Any) -> dict[str, Any] | None:
        from app.services.design.runtime.graph.nodes.autonomous import (
            run_autonomous_controller,
        )

        return await run_autonomous_controller(rt, phase="plan")

    async def autonomous_sync(self, rt: Any) -> dict[str, Any] | None:
        from app.services.design.runtime.graph.nodes.autonomous import (
            run_autonomous_controller,
        )

        return await run_autonomous_controller(rt, phase="sync")

    async def retrieve_memory(self, rt: Any) -> dict[str, Any] | None:
        """Taste / preference retrieval. BasicLocal has no private embeddings."""
        return None

    async def write_principle(self, rt: Any) -> dict[str, Any] | None:
        """Principle / knowledge write-back. BasicLocal has no private KG writer."""
        return None

    # Legacy aliases for callers that still talk to the Provider directly.
    async def candidates(self, rt: Any) -> dict[str, Any] | None:
        return await self.propose_candidates(rt)

    async def swarm(self, rt: Any) -> dict[str, Any] | None:
        return await self.swarm_direction(rt)

    async def gate_governance(self, rt: Any) -> dict[str, Any]:
        return await self.govern(rt)

    async def plan_autonomous(self, rt: Any) -> dict[str, Any] | None:
        return await self.autonomous_plan(rt)

    async def sync_autonomous(self, rt: Any) -> dict[str, Any] | None:
        return await self.autonomous_sync(rt)


class RemoteIntelligenceProvider:
    """Generic HTTP adapter. Method name → POST {base}/v1/{canonical}.

    On transport/protocol failure, falls back to BasicLocalProvider so the
    Kernel never hard-depends on a remote.
    """

    def __init__(
        self,
        *,
        base_url: str,
        api_key: str = "",
        timeout_sec: float = 30.0,
        fallback: BasicLocalProvider | None = None,
    ) -> None:
        self._base = str(base_url or "").rstrip("/")
        self._api_key = str(api_key or "").strip()
        self._timeout = float(timeout_sec or 30.0)
        self._fallback = fallback or BasicLocalProvider()

    def _headers(self) -> dict[str, str]:
        headers = {"Content-Type": "application/json", "Accept": "application/json"}
        if self._api_key:
            headers["Authorization"] = f"Bearer {self._api_key}"
        return headers

    async def _post(self, method: str, rt: Any) -> dict[str, Any] | None:
        if not self._base:
            return None
        wire = _wire_method(method)
        url = f"{self._base}/v1/{wire}"
        payload = build_intelligence_request(wire, rt)
        try:
            async with httpx.AsyncClient(timeout=self._timeout) as client:
                res = await client.post(url, json=payload, headers=self._headers())
                if res.status_code >= 400:
                    _log.warning(
                        "intelligence remote %s status=%s", wire, res.status_code
                    )
                    return None
                data = res.json()
                if not isinstance(data, dict):
                    return None
                if not remote_result_usable(wire, data):
                    return None
                return data
        except Exception:
            _log.warning("intelligence remote %s failed", wire, exc_info=True)
            return None

    async def analyze_reference(self, rt: Any) -> dict[str, Any] | None:
        remote = await self._post("analyze_reference", rt)
        if remote_result_usable("analyze_reference", remote):
            return apply_intelligence_result("analyze_reference", rt, remote)
        return await self._fallback.analyze_reference(rt)

    async def research(self, rt: Any) -> dict[str, Any] | None:
        remote = await self._post("research", rt)
        if remote_result_usable("research", remote):
            return apply_intelligence_result("research", rt, remote)
        return await self._fallback.research(rt)

    async def strategy(self, rt: Any) -> dict[str, Any] | None:
        remote = await self._post("strategy", rt)
        if remote_result_usable("strategy", remote):
            return apply_intelligence_result("strategy", rt, remote)
        return await self._fallback.strategy(rt)

    async def propose_candidates(self, rt: Any) -> dict[str, Any] | None:
        remote = await self._post("propose_candidates", rt)
        if remote_result_usable("propose_candidates", remote):
            return apply_intelligence_result("propose_candidates", rt, remote)
        return await self._fallback.propose_candidates(rt)

    async def tournament(self, rt: Any) -> dict[str, Any] | None:
        remote = await self._post("tournament", rt)
        if remote_result_usable("tournament", remote):
            return apply_intelligence_result("tournament", rt, remote)
        return await self._fallback.tournament(rt)

    async def swarm_direction(self, rt: Any) -> dict[str, Any] | None:
        remote = await self._post("swarm_direction", rt)
        if remote_result_usable("swarm_direction", remote):
            return apply_intelligence_result("swarm_direction", rt, remote)
        return await self._fallback.swarm_direction(rt)

    async def simulate(self, rt: Any) -> dict[str, Any] | None:
        remote = await self._post("simulate", rt)
        if remote_result_usable("simulate", remote):
            return apply_intelligence_result("simulate", rt, remote)
        return await self._fallback.simulate(rt)

    async def counterfactual(self, rt: Any) -> dict[str, Any] | None:
        remote = await self._post("counterfactual", rt)
        if remote_result_usable("counterfactual", remote):
            return apply_intelligence_result("counterfactual", rt, remote)
        return await self._fallback.counterfactual(rt)

    async def review(self, rt: Any) -> dict[str, Any] | None:
        remote = await self._post("review", rt)
        if remote_result_usable("review", remote):
            return apply_intelligence_result("review", rt, remote)
        return await self._fallback.review(rt)

    async def optimize(self, rt: Any) -> dict[str, Any] | None:
        remote = await self._post("optimize", rt)
        if remote_result_usable("optimize", remote):
            return apply_intelligence_result("optimize", rt, remote)
        return await self._fallback.optimize(rt)

    async def govern(self, rt: Any) -> dict[str, Any]:
        remote = await self._post("govern", rt)
        if remote_result_usable("govern", remote) and isinstance(remote, dict):
            applied = apply_intelligence_result("govern", rt, remote)
            return applied if isinstance(applied, dict) else remote
        return await self._fallback.govern(rt)

    async def autonomous_plan(self, rt: Any) -> dict[str, Any] | None:
        remote = await self._post("autonomous_plan", rt)
        if remote_result_usable("autonomous_plan", remote):
            return apply_intelligence_result("autonomous_plan", rt, remote)
        return await self._fallback.autonomous_plan(rt)

    async def autonomous_sync(self, rt: Any) -> dict[str, Any] | None:
        remote = await self._post("autonomous_sync", rt)
        if remote_result_usable("autonomous_sync", remote):
            return apply_intelligence_result("autonomous_sync", rt, remote)
        return await self._fallback.autonomous_sync(rt)

    async def retrieve_memory(self, rt: Any) -> dict[str, Any] | None:
        remote = await self._post("retrieve_memory", rt)
        if remote_result_usable("retrieve_memory", remote):
            return apply_intelligence_result("retrieve_memory", rt, remote)
        return await self._fallback.retrieve_memory(rt)

    async def write_principle(self, rt: Any) -> dict[str, Any] | None:
        remote = await self._post("write_principle", rt)
        if remote_result_usable("write_principle", remote):
            return apply_intelligence_result("write_principle", rt, remote)
        return await self._fallback.write_principle(rt)

    async def candidates(self, rt: Any) -> dict[str, Any] | None:
        return await self.propose_candidates(rt)

    async def swarm(self, rt: Any) -> dict[str, Any] | None:
        return await self.swarm_direction(rt)

    async def gate_governance(self, rt: Any) -> dict[str, Any]:
        return await self.govern(rt)

    async def plan_autonomous(self, rt: Any) -> dict[str, Any] | None:
        return await self.autonomous_plan(rt)

    async def sync_autonomous(self, rt: Any) -> dict[str, Any] | None:
        return await self.autonomous_sync(rt)


def build_design_intelligence_client() -> DesignIntelligenceClient:
    """Resolve provider from settings. Default is local/basic."""
    mode = str(getattr(settings, "intelligence_provider", "local") or "local").strip().lower()
    local = BasicLocalProvider()
    if mode in ("remote", "http", "cloud"):
        base = str(getattr(settings, "intelligence_remote_url", "") or "").strip()
        if base:
            key = str(getattr(settings, "intelligence_remote_api_key", "") or "")
            timeout = float(
                getattr(settings, "intelligence_remote_timeout_sec", 30.0) or 30.0
            )
            # cloud is an alias of remote (same HTTP IntelligenceProvider contract).
            return DesignIntelligenceClient(
                RemoteIntelligenceProvider(
                    base_url=base,
                    api_key=key,
                    timeout_sec=timeout,
                    fallback=local,
                )
            )
        _log.info("intelligence_provider=remote but URL empty; using BasicLocal")
    return DesignIntelligenceClient(local)


def get_design_intelligence_client() -> DesignIntelligenceClient:
    """Process-wide client (settings-stable)."""
    global _client
    if _client is None:
        _client = build_design_intelligence_client()
    return _client


def reset_design_intelligence_client() -> None:
    """Test helper — drop cached client."""
    global _client
    _client = None
