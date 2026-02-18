# gwop-checkout

Stripe-like Gwop payment primitives for **self-hosted** stores.

Use this SDK when your catalog, fulfillment, and user model live in your own service, and you only want Gwop for checkout and settlement.

## Product boundary

Included:
- Merchant provisioning (`/v1/merchants/*`)
- Invoice lifecycle (`/v1/invoices*`)
- Webhook signature verification helper

Not included:
- Hosted storefront (`/store/*`, `/v1/merchants/store/*`)
- Hosted delivery recovery (`/v1/invoices/{id}/delivery`)

## Install

```bash
npm install gwop-checkout
```

## Configuration

```bash
# Store backend env
GWOP_CHECKOUT_API_KEY=sk_m_xxx
GWOP_API_BASE=https://api.gwop.io
GWOP_WEBHOOK_SECRET=whsec_xxx
```

## Quick start

```ts
import { randomUUID } from 'node:crypto';
import { GwopCheckout } from 'gwop-checkout';

const gwop = new GwopCheckout({
  merchantApiKey: process.env.GWOP_CHECKOUT_API_KEY,
  baseUrl: process.env.GWOP_API_BASE || 'https://api.gwop.io',
});

const created = await gwop.invoices.create(
  {
    amount_usdc: 10_000,
    description: 'Speak credits: tts-5k',
    metadata: { order_id: 'ord_123', sku: 'tts-5k' },
    consumption_type: 'consumable',
  },
  { idempotencyKey: randomUUID() },
);

// Retrieve public payment fields for your client.
const invoice = await gwop.invoices.retrieve(created.id);
console.log(invoice.gwop_pay_url, invoice.payment_address);
```

## Store integration pattern (recommended)

1. Store receives `POST /buy` with `{ sku, quantity }`.
2. Store calculates amount and creates a Gwop invoice with `gwop.invoices.create(...)`.
3. Store retrieves invoice public fields with `gwop.invoices.retrieve(id)`.
4. Store returns `pay_url` + `invoice_id` + local `order_id` to the client/agent.
5. Gwop sends webhook (`invoice.paid|invoice.expired|invoice.canceled`) to store.
6. Store verifies signature with `Webhooks.constructEvent(...)` and updates local order state.
7. Store fulfills product in its own infrastructure.

This keeps checkout state in Gwop and business/fulfillment state in your store.

## Webhook verification

```ts
import { Webhooks } from 'gwop-checkout';

const webhooks = new Webhooks();
const event = webhooks.constructEvent(
  rawBody, // exact raw request body string
  req.headers['x-gwop-signature'] as string | undefined,
  process.env.GWOP_WEBHOOK_SECRET!,
);

if (event.event_type === 'invoice.paid') {
  // mark order paid, allow fulfillment/claim
}
```

## SDK methods

Merchants:
- `merchants.getInitPreflight()`
- `merchants.init(body, { idempotencyKey })`
- `merchants.getStatus()`
- `merchants.updateSettings(body)`
- `merchants.generateWebhookSecret()`

Invoices:
- `invoices.create(body, { idempotencyKey? })`
- `invoices.list(params?)`
- `invoices.retrieve(invoiceId)`
- `invoices.cancel(invoiceId)`
- `invoices.pay(invoiceId, body?)` (requires agent key)
- `invoices.verifyExternalPayment(invoiceId, { tx_signature })`

Client key setters:
- `setMerchantApiKey(sk_m_...)`
- `setAgentApiKey(sk_...)`

## Notes

- Recommended env var name: `GWOP_CHECKOUT_API_KEY`.
- Merchant-auth endpoints require `sk_m_*` keys.
- `invoices.pay` requires an `sk_*` agent key.
- `invoices.retrieve` and `invoices.verifyExternalPayment` are public endpoints.

## Package docs

- Contract (YAML): `packages/gwop-checkout/docs/gwop-checkout-profile.yaml`
- Contract summary (MD): `packages/gwop-checkout/docs/gwop-checkout-profile.md`
