"""Generic HTTP IntelligenceProvider — open adapter (no proprietary backends).

Host supplies ``apply_result`` to write usable payloads into Runtime slots.
On failure, optional ``fallback`` provider is used.
"""

from __future__ import annotations

import logging
import asyncio
import time
from collections.abc import Awaitable, Callable
from typing import Any

import httpx
from recombyn_protocol.intelligence import remote_result_usable
from recombyn_runtime import build_intelligence_request

_log = logging.getLogger("recombyn_intelligence_client.remote")

ApplyResultFn = Callable[[str, Any, dict[str, Any] | None], dict[str, Any] | None]


def _wire_method(name: str) -> str:
    return str(name or "").strip()


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
        self._client: httpx.AsyncClient | None = None
        self._client_lock = asyncio.Lock()
        self._circuit_open_until = 0.0
        self._failure_count = 0
        self._dedupe: dict[tuple[str, str, str], dict[str, Any]] = {}

    async def _http_client(self) -> httpx.AsyncClient:
        if self._client is None or self._client.is_closed:
            async with self._client_lock:
                if self._client is None or self._client.is_closed:
                    self._client = httpx.AsyncClient(timeout=self._timeout)
        return self._client

    def _circuit_open(self) -> bool:
        return time.monotonic() < self._circuit_open_until

    def _mark_failure(self) -> None:
        self._failure_count += 1
        if self._failure_count >= 1:
            self._circuit_open_until = time.monotonic() + min(30.0, self._timeout)

    def _mark_success(self) -> None:
        self._failure_count = 0
        self._circuit_open_until = 0.0

    def _headers(self) -> dict[str, str]:
        headers = {"Content-Type": "application/json", "Accept": "application/json"}
        if self._api_key:
            headers["Authorization"] = f"Bearer {self._api_key}"
        return headers

    async def _post(self, method: str, rt: Any) -> dict[str, Any] | None:
        if not self._base:
            return None
        if self._circuit_open():
            return None
        wire = _wire_method(method)
        url = f"{self._base}/v1/{wire}"
        payload = build_intelligence_request(wire, rt)
        try:
            client = await self._http_client()
            res = await client.post(url, json=payload, headers=self._headers())
            if res.status_code >= 400:
                self._mark_failure()
                _log.warning("intelligence remote %s status=%s", wire, res.status_code)
                return None
            data = res.json()
            if not isinstance(data, dict) or not remote_result_usable(wire, data):
                self._mark_failure()
                return None
            self._mark_success()
            return data
        except Exception:
            self._mark_failure()
            _log.warning("intelligence remote %s failed", wire, exc_info=True)
            return None

    async def _call(self, method: str, rt: Any) -> dict[str, Any] | None:
        request = build_intelligence_request(_wire_method(method), rt)
        key = (
            str(request.get("run_id") or ""),
            _wire_method(method),
            str(request.get("input_hash") or ""),
        )
        if key[0] and key in self._dedupe:
            return self._dedupe[key]
        remote = await self._post(method, rt)
        if remote_result_usable(method, remote):
            if self._apply is not None:
                result = self._apply(method, rt, remote)
            else:
                result = remote
            if key[0] and isinstance(result, dict):
                self._dedupe[key] = result
                if len(self._dedupe) > 128:
                    self._dedupe.pop(next(iter(self._dedupe)))
            return result
        if self._fallback is not None:
            fn = getattr(self._fallback, method, None)
            if callable(fn):
                result = await fn(rt)
                if key[0] and isinstance(result, dict):
                    self._dedupe[key] = result
                return result
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

# Satisfy type checkers that treat unused Awaitable
_ = Awaitable
