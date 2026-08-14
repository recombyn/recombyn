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
    from app.services.wallet.billing import resolve_task_pricing

    credits, source = resolve_capture_credits(
        mode="agent",
        actual_tokens=0,
        images_hydrated=0,
        byok=False,
    )
    assert source == "task_pricing_floor"
    # Floor is TaskPricing.base_credit; authorize high is estimate_design_hold_credits.
    assert credits == int(resolve_task_pricing("agent").base_credit or 0)
    assert credits == 20
    assert estimate_design_hold_credits("agent") == 30


def test_authorize_bands_match_task_pricing():
    assert estimate_design_hold_credits("agent") == 30
    assert estimate_design_hold_credits("single_model") == 20
    assert estimate_design_hold_credits("partial") == 10


def test_protocol_catalog_shared():
    from recombyn_protocol.billing import default_oss_task_pricing_catalog
    from app.services.wallet.billing import default_task_pricing_catalog

    a = default_oss_task_pricing_catalog()["agent"].estimate_credits_high()
    b = default_task_pricing_catalog()["agent"].estimate_credits_high()
    assert a == b == 30


def test_oss_plan_catalog_plus_sku():
    from app.services.wallet.billing import (
        _sanitize_plan_row,
        oss_plan_catalog,
        public_plan_catalog,
    )

    plus = next(p for p in oss_plan_catalog() if p["planId"] == "plus")
    assert plus["priceCny"] == 49
    assert plus["creditsIncluded"] == 340
    studio = _sanitize_plan_row(
        {"plan_id": "studio", "list_price_cny": 499, "credits_grant": 4000}
    )
    assert studio and studio["planId"] == "ultra"
    live = {p["planId"]: p for p in public_plan_catalog(force=True)}
    assert live["plus"]["priceCny"] == 49
