# gwop-checkout

Standalone repository for:

- `packages/gwop-checkout`: Gwop Checkout SDK (Stripe-like primitives for self-hosted stores)
- `services/speak-gwop`: Agent-native TTS store example powered by Gwop Checkout

## Layout

- `packages/gwop-checkout/` - publishable SDK package
- `services/speak-gwop/` - standalone API + worker service
- `docs/checkout/` - integration docs
- `apis/` - checkout profile/spec references

## Quick Start

SDK:

```bash
cd packages/gwop-checkout
npm ci
npm run build
```

Speak service:

```bash
cd services/speak-gwop
npm ci
npm run build
npm run dev
```

Worker:

```bash
cd services/speak-gwop
npm run dev:worker
```

## Deploy Notes

Speak currently depends on the local SDK path (`../../packages/gwop-checkout`).
For platform deploys, ensure build context includes both `services/speak-gwop` and `packages/gwop-checkout`.

