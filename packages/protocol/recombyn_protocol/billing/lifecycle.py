"""Billing lifecycle — estimate → authorize → execute → capture/release.

Stripe-shaped aliases (authorize/capture/refund) map onto wallet
reserve/charge/release. Prefer the Stripe names in new product code.
"""

from __future__ import annotations

# Open state machine for task billing (wallet side).
BILLING_LIFECYCLE_STAGES: tuple[str, ...] = (
    "estimate",
    "authorize",  # == reserve
    "execute",
    "settle",
)

# Legacy aliases still accepted by Runtime / wallets.
BILLING_LIFECYCLE_ALIASES: dict[str, str] = {
    "reserve": "authorize",
    "charge": "capture",
}

# Terminal settle actions (after ACTUAL USAGE).
BILLING_SETTLE_ACTIONS: tuple[str, ...] = (
    "capture",  # == charge
    "release",
    "refund",
)

BILLING_LIFECYCLE_DOC = """
ESTIMATE          (TaskPricing + meters → credit band)
   ↓
AUTHORIZE         (hold estimate_high credits; alias: reserve)
   ↓
EXECUTE           (Agent Runtime emits UsageEvents / meters)
   ↓
ACTUAL USAGE      (host accounting → credits_to_charge)
   ↓
SETTLE
   ├── CAPTURE    (credits_captured = actual; alias: charge)
   ├── RELEASE    (authorized - captured)
   └── REFUND     (post-settle clawback)
""".strip()
