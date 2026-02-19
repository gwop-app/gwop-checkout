# Gwop Checkout Production Readiness

This checklist keeps the SDK and example service aligned while avoiding scope bleed.

## 1) SDK (`packages/gwop-checkout`)

- OpenAPI/profile source of truth and drift checks in CI
- Typed request/response models for every supported endpoint
- Typed error model with stable `error.code` mapping
- Idempotency support for create/init surfaces
- Webhook signature verification helper + tests
- Semver release discipline (document breaking changes)
- Publish docs with copy/paste 15-minute integration flow

## 2) Example Store (`services/speak-gwop`)

- Uses published SDK only (no private imports from SDK internals)
- Stateless API nodes
- Durable queue + worker separation
- Explicit env contract (`.env.example`)
- Build and health-check in CI
- Operator docs for deploy/runtime variables

## 3) Repo governance

- Keep SDK + examples in same repo while iterating quickly
- Split to separate repos when:
  - release cadence diverges
  - examples need independent issue triage
  - SDK stability requirements tighten

Suggested split:

1. `gwop-checkout` (SDK + checkout docs/spec)
2. `gwop-checkout-examples` (Speak and future example stores)
