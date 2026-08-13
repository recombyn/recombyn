# Recombyn Protocol (Apache-2.0)

Stable **open** contracts for Design Runtime and `intelligence-client`.

**Current pin:** `0.1.2` (Private may keep `>=0.1.1`; prefer `>=0.1.2` for billing).

- Intelligence method names / aliases / request field keys
- `remote_result_usable` / `normalize_intelligence_method` / `intelligence_wire_methods`
- Design Brief (P0/P1)
- Reference / Research / Strategy / Candidates / Tournament / Swarm /
  Simulation / Counterfactual / Governance / Autonomous
- Observe / Review scores & caps / Judge / Visual Diff / Preference
- Paint tool_ops / DecideTurn / PaintOps envelopes
- VisionScout turn / DesignTransaction (+ phase helpers)
- **Billing Protocol** (`recombyn_protocol.billing`): Model registry identity,
  versioned `PricingRate` sheets, Usage / TaskCost, Budget Guard,
  BillingEvent / Credit ledger, micros money helpers
  — see [ADR 0025](../../docs/adr/0025-billing-protocol.md)

This package describes **interfaces**. It does not document proprietary
provider implementations, private datasets, closed prompts, margin policy,
or provider API keys.

Private providers must depend on this package (not hand-copy method lists).

## Versioning

Bump `packages/protocol/pyproject.toml` `version` on contract changes.

| Change | Bump |
|--------|------|
| New optional field / method alias | patch (`0.1.x`) |
| New required method or request key | minor (`0.x.0`) |
| Breaking rename / remove | major (`x.0.0`) |

## Install

```bash
pip install -e ./packages/protocol
# or (after PyPI publish)
pip install "recombyn-protocol>=0.1.2"
```

## CI / publish

- Smoke: `.github/workflows/protocol-contract-smoke.yml`
- Cross-repo: smoke on `main` can `repository_dispatch` Private
  (`protocol-changed`) when `INTELLIGENCE_REPO_DISPATCH_TOKEN` is set
- Build / PyPI: `.github/workflows/publish-protocol.yml`
  - tag `protocol-v0.1.1` or manual `publish=true` + secret `PYPI_TOKEN`

See [ADR 0024](../../docs/adr/0024-protocol-version-cross-repo-ci.md).
