"""Durable Worker-to-browser SSE transport for design runs."""
from __future__ import annotations

import asyncio
import json
from collections.abc import AsyncIterator, Callable
from typing import Any


def sse_data(payload: dict[str, Any]) -> str:
    return f"data: {json.dumps(payload, ensure_ascii=False)}\n\n"


async def worker_run_sse(task_id: str) -> AsyncIterator[str]:
    from app.services.design.admin.task_store import TERMINAL_STATUSES, get_canvas_commands, get_design_task, get_task_events

    event_seq = command_seq = 0
    yield ": connected\n\n"
    yield sse_data({"type": "status", "task_id": task_id, "status": "queued"})
    while True:
        for item in (await asyncio.to_thread(get_task_events, task_id, after_seq=event_seq)).get("items") or []:
            event_seq = max(event_seq, int(item.get("seq") or 0))
            if isinstance(event := item.get("event"), dict):
                yield sse_data(event)
        for item in (await asyncio.to_thread(get_canvas_commands, task_id, after_seq=command_seq)).get("items") or []:
            command_seq = max(command_seq, int(item.get("seq") or 0))
            if isinstance(event := item.get("event"), dict):
                yield sse_data({**event, "command_seq": command_seq})
        row = await asyncio.to_thread(get_design_task, task_id)
        if row and str(row.get("status") or "") in (*TERMINAL_STATUSES, "error"):
            yield "data: [DONE]\n\n"
            return
        await asyncio.sleep(0.25)


async def local_run_sse(
    source: Callable[[], AsyncIterator[dict[str, Any]]],
    *,
    emit: Callable[[dict[str, Any]], list[dict[str, Any]]],
    persist: Callable[[dict[str, Any]], None],
    heartbeat: Callable[[], dict[str, Any] | None],
    terminal: Callable[[], dict[str, Any] | None],
    error_code: Callable[[Exception], str],
) -> AsyncIterator[str]:
    """Transport loop shared by local API execution and checkpoint resume."""
    yield ": connected\n\n"
    queue: asyncio.Queue[tuple[str, Any]] = asyncio.Queue(maxsize=256)
    closed = asyncio.Event()

    async def deliver(item: tuple[str, Any]) -> None:
        while not closed.is_set():
            try:
                queue.put_nowait(item)
                return
            except asyncio.QueueFull:
                await asyncio.sleep(0.05)

    async def produce() -> None:
        try:
            async for event in source():
                frames = emit(event)
                for frame in [*frames, event]:
                    persist(frame)
                for frame in frames:
                    await deliver(("event", frame))
                await deliver(("event", event))
        except Exception as error:  # noqa: BLE001
            payload = {"type": "error", "code": error_code(error), "message": str(error)[:800]}
            persist(payload)
            await deliver(("event", payload))
        finally:
            if frame := terminal():
                persist(frame)
                await deliver(("event", frame))
            await deliver(("done", None))

    asyncio.create_task(produce())
    try:
        while True:
            try:
                kind, payload = await asyncio.wait_for(queue.get(), timeout=8.0)
            except asyncio.TimeoutError:
                if frame := heartbeat():
                    yield sse_data(frame)
                yield ": ping\n\n"
                continue
            if kind == "done":
                yield "data: [DONE]\n\n"
                return
            if isinstance(payload, dict):
                yield sse_data(payload)
    finally:
        closed.set()
