from app.api.routes.design import _PipelineSseState


def test_pipeline_heartbeat_remains_visible_after_canvas_paint() -> None:
    """Long paint/refine phases must remain visible rather than degrading to SSE comments."""
    state = _PipelineSseState()
    state.arm("ops")
    state.saw_paint = True

    event = state.heartbeat_stage_event()

    assert event is not None
    assert event["type"] == "activity"
    assert event["stage"] == "ops"


def test_worker_sse_attaches_outbox_sequence_to_canvas_command(monkeypatch) -> None:
    import asyncio
    import json

    from app.api.routes.design import _worker_run_sse
    from app.services.design.admin import task_store

    monkeypatch.setattr(task_store, "get_task_events", lambda *_args, **_kwargs: {"items": []})
    monkeypatch.setattr(
        task_store,
        "get_canvas_commands",
        lambda *_args, **_kwargs: {
            "items": [{"seq": 42, "event": {"type": "tool_ops", "ops": []}}]
        },
    )
    monkeypatch.setattr(task_store, "get_design_task", lambda *_args, **_kwargs: {"status": "success"})

    async def frames():
        stream = _worker_run_sse("task-1")
        return [await stream.__anext__(), await stream.__anext__(), await stream.__anext__()]

    _, _, command = asyncio.run(frames())
    payload = json.loads(command.removeprefix("data: ").strip())
    assert payload["type"] == "tool_ops"
    assert payload["command_seq"] == 42
