"""Generic HTTP IntelligenceProvider — open adapter (no proprietary backends).

Host supplies ``apply_result`` to write usable payloads into Runtime slots.
On failure, optional ``fallback`` provider is used.
"""

from __future__ import annotations

import logging
from collections.abc import Awaitable, Callable
from typing import Any

import httpx
from recombyn_protocol import INTELLIGENCE_METHOD_ALIASES
from recombyn_runtime import build_intelligence_request, remote_result_usable

_log = logging.getLogger("recombyn_intelligence_client.remote")

ApplyResultFn = Callable[[str, Any, dict[str, Any] | None], dict[str, Any] | None]


def _wire_method(name: str) -> str:
    key = str(name or "").strip()
    return INTELLIGENCE_METHOD_ALIASES.get(key, key)


class RemoteIntelligenceProvider:
    """POST ``{base}/v1/{canonical}`` — usable results optionally applied via hook."""

    def __init__(
        self,
        *,
        base_url: str,
        api_key: str = "",
        timeout_sec: float = 30.0,
        fallback: Any | None = None,
        apply_result: ApplyResultFn | None = None,
    ) -> None:
        self._base = str(base_url or "").rstrip("/")
        self._api_key = str(api_key or "").strip()
        self._timeout = float(timeout_sec or 30.0)
        self._fallback = fallback
        self._apply = apply_result

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
                    _log.warning("intelligence remote %s status=%s", wire, res.status_code)
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

    async def _call(self, method: str, rt: Any) -> dict[str, Any] | None:
        remote = await self._post(method, rt)
        if remote_result_usable(method, remote):
            if self._apply is not None:
                return self._apply(method, rt, remote)
            return remote
        if self._fallback is not None:
            fn = getattr(self._fallback, method, None)
            if callable(fn):
                return await fn(rt)
        return None

    async def analyze_reference(self, rt: Any) -> dict[str, Any] | None:
        return await self._call("analyze_reference", rt)

    async def research(self, rt: Any) -> dict[str, Any] | None:
        return await self._call("research", rt)

    async def strategy(self, rt: Any) -> dict[str, Any] | None:
        return await self._call("strategy", rt)

    async def propose_candidates(self, rt: Any) -> dict[str, Any] | None:
        return await self._call("propose_candidates", rt)

    async def tournament(self, rt: Any) -> dict[str, Any] | None:
        return await self._call("tournament", rt)

    async def swarm_direction(self, rt: Any) -> dict[str, Any] | None:
        return await self._call("swarm_direction", rt)

    async def simulate(self, rt: Any) -> dict[str, Any] | None:
        return await self._call("simulate", rt)

    async def counterfactual(self, rt: Any) -> dict[str, Any] | None:
        return await self._call("counterfactual", rt)

    async def review(self, rt: Any) -> dict[str, Any] | None:
        return await self._call("review", rt)

    async def optimize(self, rt: Any) -> dict[str, Any] | None:
        return await self._call("optimize", rt)

    async def govern(self, rt: Any) -> dict[str, Any]:
        out = await self._call("govern", rt)
        return out if isinstance(out, dict) else {"status": "pass"}

    async def autonomous_plan(self, rt: Any) -> dict[str, Any] | None:
        return await self._call("autonomous_plan", rt)

    async def autonomous_sync(self, rt: Any) -> dict[str, Any] | None:
        return await self._call("autonomous_sync", rt)

    async def retrieve_memory(self, rt: Any) -> dict[str, Any] | None:
        return await self._call("retrieve_memory", rt)

    async def write_principle(self, rt: Any) -> dict[str, Any] | None:
        return await self._call("write_principle", rt)

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


# Satisfy type checkers that treat unused Awaitable
_ = Awaitable
