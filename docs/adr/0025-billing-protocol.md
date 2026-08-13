# ADR 0025: Billing Protocol (open) + commercial strategy (private)

- **Status:** Accepted
- **Date:** 2026-08-14

## Context

Three-repo freeze. Billing must be auditable while margin / packs / fraud stay
private. This ADR freezes the **Billing Protocol** (contracts + open cost floor),
not the full Billing System (wallet DB, Admin Pricing Control).

Design Brief stays in `recombyn_protocol.brief` — **never** under `billing/`.

## Decision

### Layout (`packages/protocol/recombyn_protocol/billing/`)

```text
billing/
├── model.py      # ModelIdentitySchema, ModelCapabilitySchema (+ pricing_id)
├── pricing.py    # PricingSchema / Version / Rate + resolve_pricing()
├── usage.py      # ProviderUsageSchema, UsageEventSchema
├── cost.py       # CostBreakdownSchema (micros), TaskCostSchema
├── events.py     # BillingEvent + CreditTransaction + CreditLedger
├── lifecycle.py  # estimate → reserve → execute → settle (charge/release)
├── budget.py     # BudgetSchema, BudgetPolicySchema, BudgetCheckSchema
├── money.py      # MoneySchema, CurrencySchema, micros helpers
└── provider.py   # ProviderSchema, ProviderBillingAdapter
```

Helpers: `packages/billing-sdk` (builders + `estimate_provider_cost`).

### Three price layers (do not collapse)

```text
Provider Price (PricingVersion / rates)
      ↓
Internal Cost (CostBreakdown.internal_cost_micros)
      ↓
Private Commercial Policy   ← NOT in Public protocol
      ↓
User Credits / Ledger
```

Public must **not** put `user_price` / `credits_per_token` on Model.

### Invariants

1. Settled usage carries `pricing_version_id` (history never rewritten).
2. Task sell unit is `TaskCostSchema` (many UsageEvents).
3. Lifecycle: estimate → reserve → charge + release.
4. Money ledger truth = integer **micros**; Credits = `int`.
5. Protocol pin: `recombyn-protocol` **0.1.2+**.

### Wave B / C landing (API + Admin)

- Alembic `0015_pricing_versions`: `pricing_versions` table, `llm_models.pricing_id`,
  `model_usage.pricing_version_id`
- `app/services/llm/pricing_registry.py` + Admin `/admin/pricing-versions*` +
  `/admin/margin/summary`
- `usage_log.record_model_usage` resolves and stores `pricing_version_id`
- `wallet/lifecycle.py` estimate / reserve / settle credit helpers
- Admin UI: Pipeline → Pricing Versions; Insights → Margin Monitor
- `RemoteIntelligenceProvider` ships in `packages/intelligence-client` (BasicLocal
  stays API-coupled to Kernel runners)

## Consequences

- Ecosystem adapters can meter providers without knowing Recombyn margin.
- Wave B: API migrates `LlmModel.price` → versioned registry + usage pin.
- Private Intelligence / Admin own margin, packs, fraud, dynamic user pricing.

## Alternatives considered

- Mutable `model.price` — cannot audit history.
- Billing only in Admin — blocks open adapters.
- Fourth billing repo — violates three-repo freeze.
- Float currency as ledger truth — prefer micros.

## References

- `packages/protocol/recombyn_protocol/billing/`
- `packages/billing-sdk`
- [ADR 0001](./0001-monorepo-boundaries.md)
- [ADR 0017](./0017-intelligence-provider-boundary.md)
- [ADR 0024](./0024-protocol-version-cross-repo-ci.md)
