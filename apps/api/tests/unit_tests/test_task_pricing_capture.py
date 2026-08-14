"""Unit tests for task-centric capture credit resolution."""

from __future__ import annotations

from app.services.wallet.billing import (
    byok_agent_fee_credits,
    estimate_design_hold_credits,
    resolve_capture_credits,
)


def test_byok_capture_is_agent_fee_only():
    credits, source = resolve_capture_credits(
        mode="agent",
        actual_tokens=50_000,
        images_hydrated=0,
        byok=True,
    )
    assert source == "byok_agent_fee"
    assert credits == byok_agent_fee_credits()


def test_oss_floor_when_no_usage():
    credits, source = resolve_capture_credits(
        mode="agent",
        actual_tokens=0,
        images_hydrated=0,
        byok=False,
    )
    assert source == "task_pricing_floor"
    assert credits == estimate_design_hold_credits("agent")


def test_authorize_bands_match_task_pricing():
    assert estimate_design_hold_credits("agent") == 30
    assert estimate_design_hold_credits("single_model") == 20
    assert estimate_design_hold_credits("partial") == 10
