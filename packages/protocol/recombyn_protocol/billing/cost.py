"""Cost breakdown + task-level rollup.

Three cost layers (Public protocols only layers 1–2)::

    Provider Cost  →  Internal Cost  →  (Private) User Credits
"""

from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field, model_validator


class CostBreakdownSchema(BaseModel):
    """Auditable cost components — amounts in currency **micros**.

    - ``provider_cost_micros``: vendor meter × PricingVersion rates
    - infra/storage/network/risk: Recombyn internal additives
    - ``internal_cost_micros``: sum of the above (what commercial policy prices against)
    - ``total_cost_micros``: alias of internal when set (kept for rollups)
    """

    provider_cost_micros: int | None = None
    infrastructure_cost_micros: int | None = None
    storage_cost_micros: int | None = None
    network_cost_micros: int | None = None
    risk_reserve_micros: int | None = None
    internal_cost_micros: int | None = Field(
        default=None,
        description="Provider + infrastructure + storage + network + risk",
    )
    total_cost_micros: int | None = Field(
        default=None,
        description="Usually equals internal_cost_micros for a settled call",
    )
    currency: str = "USD"
    components_micros: dict[str, int] = Field(
        default_factory=dict,
        description="metric → micros contribution (provider line items)",
    )

    model_config = {"extra": "allow"}

    @model_validator(mode="after")
    def _fill_internal_total(self) -> CostBreakdownSchema:
        parts = [
            int(self.provider_cost_micros or 0),
            int(self.infrastructure_cost_micros or 0),
            int(self.storage_cost_micros or 0),
            int(self.network_cost_micros or 0),
            int(self.risk_reserve_micros or 0),
        ]
        if self.internal_cost_micros is None and any(parts):
            self.internal_cost_micros = sum(parts)
        if self.total_cost_micros is None and self.internal_cost_micros is not None:
            self.total_cost_micros = int(self.internal_cost_micros)
        return self


class TaskCostSchema(BaseModel):
    """One design task rollup — product unit users buy (not a single model call).

    Credits fields are wallet amounts; mapping internal_cost → credits is private.
    """

    task_id: str = ""
    user_id: str = ""
    usage_event_ids: list[str] = Field(default_factory=list)
    estimated_cost_micros: int | None = None
    actual_cost_micros: int | None = None
    currency: str = "USD"
    credits_estimated_low: int | None = None
    credits_estimated_high: int | None = None
    credits_reserved: int = 0
    credits_charged: int = 0
    credits_refunded: int = 0
    credits_released: int = 0
    pricing_version_ids: list[str] = Field(default_factory=list)
    breakdown: CostBreakdownSchema = Field(default_factory=CostBreakdownSchema)
    status: str = Field(
        default="open",
        description="open | reserved | settling | settled | cancelled",
    )
    meta: dict[str, Any] = Field(default_factory=dict)

    model_config = {"extra": "allow"}
