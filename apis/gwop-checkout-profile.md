# Gwop Checkout Profile (v1)

This profile is the strict contract for the **self-hosted** product surface (`gwop-checkout`).

Use this as the source of truth for new checkout SDK work.

## Product Boundary

`gwop-checkout` includes payment primitives only:
- merchant provisioning for API-driven setup
- invoice lifecycle
- payment confirmation (Gwop account flow and external-wallet verify flow)
- webhook secret management

`gwop-checkout` excludes hosted-storefront behavior:
- all `/v1/merchants/store/*`
- all `/store/*`
- `/v1/invoices/{id}/delivery` (storefront delivery recovery)

## Required Endpoints

| Method | Path | Operation ID | Auth |
|---|---|---|---|
| `GET` | `/v1/merchants/init/preflight` | `getMerchantInitPreflight` | Public |
| `POST` | `/v1/merchants/init` | `initMerchant` | Public (`Idempotency-Key` required) |
| `GET` | `/v1/merchants/status` | `getMerchantStatus` | `MerchantApiKey` |
| `POST` | `/v1/merchants/settings` | `updateMerchantSettingsApiKey` | `MerchantApiKey` |
| `POST` | `/v1/merchants/webhook-secret` | `generateWebhookSecretApiKey` | `MerchantApiKey` |
| `POST` | `/v1/invoices` | `createInvoice` | `MerchantApiKey` |
| `GET` | `/v1/invoices` | `listInvoices` | `MerchantApiKey` |
| `GET` | `/v1/invoices/{id}` | `getInvoice` | Public |
| `POST` | `/v1/invoices/{id}/cancel` | `cancelInvoice` | `MerchantApiKey` |
| `POST` | `/v1/invoices/{id}/pay` | `payInvoice` | `AgentApiKey` |
| `POST` | `/v1/invoices/{id}/verify-payment` | `verifyExternalPayment` | Public |

## Explicitly Out Of Scope

- `/v1/merchants/help`
- `/v1/merchants/claim/{token}/preview`
- `/v1/merchants/claim/complete`
- `/v1/merchants/store/*`
- `/store/*`
- `/v1/invoices/{id}/delivery`

## Why `/v1/invoices/{id}/delivery` Is Excluded

That endpoint is bound to hosted storefront order state (`store_orders`) and token recovery semantics.  
Self-hosted checkout stores should keep fulfillment and artifact delivery in their own infrastructure.

## SDK Contract Rules

1. Checkout SDK must only generate clients for operations listed in `packages/gwop-checkout/docs/gwop-checkout-profile.yaml`.
2. Checkout SDK must not expose any methods that call `/v1/merchants/store/*` or `/store/*`.
3. Checkout SDK must model invoice/webhook setup only; no hosted catalog or hosted delivery abstractions.
4. Webhook event signing/verification behavior is documented in `packages/gwop-checkout/src/webhooks.ts`.
