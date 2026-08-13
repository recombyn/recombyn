"""Billing lifecycle constants — estimate → reserve → execute → settle."""

from __future__ import annotations

# Open state machine for task billing (wallet side).
BILLING_LIFECYCLE_STAGES: tuple[str, ...] = (
    "estimate",
    "reserve",
    "execute",
    "settle",
)

# Terminal settle actions (after ACTUAL USAGE).
BILLING_SETTLE_ACTIONS: tuple[str, ...] = (
    "charge",
    "release",
    "refund",
)

BILLING_LIFECYCLE_DOC = """
ESTIMATE
   ↓
RESERVE          (hold estimate_high credits)
   ↓
EXECUTE          (Agent Runtime emits UsageEvents)
   ↓
ACTUAL USAGE     (Cost Engine → TaskCost.actual)
   ↓
SETTLE
   ├── CHARGE    (credits_charged = actual)
   └── RELEASE   (credits_reserved - credits_charged)
""".strip()
