import { randomUUID } from 'crypto';
import type { CreateInvoiceResponse, GwopCheckout } from 'gwop-checkout';
import { config } from '../config.js';

/**
 * Small, explicit boundary between Speak store logic and the gwop-checkout SDK.
 *
 * Why this file exists:
 * - Keeps "store code" independent from SDK-specific call shapes.
 * - Makes it easy for developers to swap SDK version / provider code in one place.
 * - Documents the intended checkout flow (create invoice -> pay -> webhook/claim).
 *
 * Current phase note:
 * - speak-gwop is metered for TTS requests via prepaid character credits.
 * - This bridge keeps payment wiring isolated from store business logic.
 */
export class CheckoutBridge {
  private readonly sdk: GwopCheckout | null;
  private readonly enabled: boolean;

  constructor(sdk: GwopCheckout | null) {
    this.sdk = sdk;
    this.enabled = Boolean(sdk);
  }

  /**
   * Indicates whether checkout operations are possible in this runtime.
   *
   * Bridge is considered enabled only when:
   * - sdk client exists
   * - GWOP_CHECKOUT_API_KEY has been configured
   */
  isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * Gives operators a clear reason when checkout is disabled.
   */
  disabledReason(): string | null {
    if (this.enabled) return null;
    return 'GWOP_CHECKOUT_API_KEY is not configured';
  }

  /**
   * Create a Gwop invoice for a Speak credit purchase.
   *
   * This is the exact "store -> checkout" handoff:
   * 1) Store decides product/SKU and amount for credits.
   * 2) Bridge translates that into a gwop-checkout invoice request.
   * 3) SDK returns invoice object containing payment URLs and lifecycle state.
   *
   * The caller is expected to:
   * - persist invoice + order references
   * - wait for webhook OR call claim/reconcile endpoints
   * - mint credits only once (idempotent credit ledger write)
   */
  async createCreditInvoice(input: {
    amountUsdc: number;
    description: string;
    metadata?: Record<string, unknown>;
    idempotencyKey?: string;
  }): Promise<CreateInvoiceResponse> {
    if (!this.sdk) {
      throw new Error(this.disabledReason() || 'Checkout is not enabled');
    }

    return this.sdk.invoices.create(
      {
        amount_usdc: input.amountUsdc,
        description: input.description,
        metadata: input.metadata,
        // Credit purchases are consumable by design.
        consumption_type: 'consumable',
      },
      {
        // Store controls idempotency; we generate one as safe default.
        idempotencyKey: input.idempotencyKey || randomUUID(),
      }
    );
  }

  /**
   * Thin passthrough for invoice retrieval.
   *
   * Useful for claim/recovery paths where webhook delivery is delayed:
   * - Store can fetch invoice status directly from Gwop
   * - Then decide if credits should be granted
   */
  async getInvoice(invoiceId: string) {
    if (!this.sdk) {
      throw new Error(this.disabledReason() || 'Checkout is not enabled');
    }
    return this.sdk.invoices.retrieve(invoiceId);
  }

  /**
   * Thin passthrough for explicit payment verification.
   *
   * This aligns with a robust claim flow:
   * - webhook marks order paid when possible
   * - claim endpoint can still verify payment source-of-truth on demand
   */
  async verifyInvoicePayment(invoiceId: string, txSignature: string) {
    if (!this.sdk) {
      throw new Error(this.disabledReason() || 'Checkout is not enabled');
    }
    return this.sdk.invoices.verifyExternalPayment(invoiceId, {
      tx_signature: txSignature,
    });
  }
}

/**
 * Factory kept separate from class to make wiring in index.ts obvious.
 */
export function createCheckoutBridge(sdk: GwopCheckout | null): CheckoutBridge {
  return new CheckoutBridge(sdk);
}

/**
 * Exposed for route diagnostics (help/health) so agents can see config shape.
 */
export function checkoutBridgeInfo(bridge: CheckoutBridge) {
  return {
    enabled: bridge.isEnabled(),
    key_env: 'GWOP_CHECKOUT_API_KEY',
    api_base: config.gwopApiBase,
    disabled_reason: bridge.disabledReason(),
  };
}
