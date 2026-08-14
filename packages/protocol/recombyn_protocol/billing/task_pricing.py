"""Task Pricing — users buy completed design work, not raw tokens.

Model PricingVersion remains the provider cost floor. TaskPricing maps a
product pipeline (design_agent / image / …) onto credit estimates and step
meters. Hosts may further map usage to credits via CreditPolicy / quote.
"""

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field

TaskType = Literal[
    "design_agent",
    "image",
    "chat",
    "import",
    "review_only",
    "other",
]


class TaskStepPricingSchema(BaseModel):
    """One billable step inside a product task (research / paint / review / …)."""

    name: str = Field(description="Stable step id: research | strategy | image | review | …")
    credits: int = Field(default=0, ge=0, description="Nominal credit weight for this step")
    optional: bool = False
    meter_keys: list[str] = Field(
        default_factory=list,
        description="BillingMeterSchema.meter_key values this step may emit",
    )
    meta: dict[str, Any] = Field(default_factory=dict)

    model_config = {"extra": "allow"}


class TaskPricingSchema(BaseModel):
    """Product-facing price sheet for a task type / pipeline.

    ``base_credit`` is the list estimate floor (not provider token math).
    Actual capture still follows estimate → authorize → capture/release.
    """

    task_pricing_id: str = ""
    task_type: TaskType | str = "design_agent"
    pipeline: str = Field(
        default="",
        description="e.g. poster_v2 | landing_page | dashboard_ui",
    )
    base_credit: int = Field(default=0, ge=0)
    steps: list[TaskStepPricingSchema] = Field(default_factory=list)
    currency: str = "CNY"
    status: str = Field(default="active", description="draft | active | retired")
    notes: str = ""
    meta: dict[str, Any] = Field(default_factory=dict)

    model_config = {"extra": "allow"}

    def estimate_credits_high(self) -> int:
        """Sum of base + all step credits (authorization ceiling helper)."""
        step_sum = sum(max(0, int(s.credits or 0)) for s in self.steps)
        return max(0, int(self.base_credit or 0)) + step_sum
