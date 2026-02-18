import { CheckoutHttpClient } from './client.js';
import { InvoicesResource } from './invoices.js';
import { MerchantsResource } from './merchants.js';
import { Webhooks } from './webhooks.js';
import type { GwopCheckoutConfig } from './types.js';

export class GwopCheckout {
  public readonly merchants: MerchantsResource;
  public readonly invoices: InvoicesResource;
  public readonly webhooks: Webhooks;
  private readonly client: CheckoutHttpClient;

  constructor(config: GwopCheckoutConfig = {}) {
    this.client = new CheckoutHttpClient(config);
    this.merchants = new MerchantsResource(this.client);
    this.invoices = new InvoicesResource(this.client);
    this.webhooks = new Webhooks();
  }

  setMerchantApiKey(apiKey: string): void {
    this.client.setMerchantApiKey(apiKey);
  }

  setAgentApiKey(apiKey: string): void {
    this.client.setAgentApiKey(apiKey);
  }
}

export * from './types.js';
export * from './errors.js';
