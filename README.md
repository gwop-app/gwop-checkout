# gwop-checkout

Monorepo for two distinct artifacts:

- `packages/gwop-checkout`: the publishable checkout SDK (`npm i gwop-checkout`)
- `services/speak-gwop`: a reference self-hosted store using the SDK

This repository intentionally keeps both together for fast iteration, while preserving a strict boundary:

- SDK code must stay generic and checkout-only.
- Example service code can be product-specific (Speak/TTS).

## Repository layout

- `packages/gwop-checkout/` - SDK source, tests, package docs
- `services/speak-gwop/` - standalone API + worker reference implementation
- `apis/` - checkout profile sources used for drift checks
- `docs/checkout/` - integration and production-readiness guidance
- `scripts/check-profile-sync.sh` - guards profile-doc drift in CI

## Quick start

```bash
# SDK
npm ci --prefix packages/gwop-checkout
npm run --prefix packages/gwop-checkout test:run
npm run --prefix packages/gwop-checkout build

# Speak example service
npm ci --prefix services/speak-gwop
npm run --prefix services/speak-gwop build
npm run --prefix services/speak-gwop dev
npm run --prefix services/speak-gwop dev:worker
```

## CI

GitHub Actions runs:

1. checkout profile sync check
2. SDK typecheck + test + build
3. Speak example build

## Split guidance

If/when release cadence diverges:

1. Keep this repo as SDK-only (`packages/gwop-checkout` + docs/apis).
2. Move `services/speak-gwop` to `gwop-checkout-examples` or `speak-gwop`.
3. Pin example apps to published SDK versions.
