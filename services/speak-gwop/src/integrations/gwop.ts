import { GwopCheckout } from 'gwop-checkout';
import { config } from '../config.js';

export interface GwopIntegration {
  enabled: boolean;
  client: GwopCheckout | null;
}

/**
 * Creates the raw SDK client used by our higher-level CheckoutBridge.
 *
 * Design intent:
 * - Keep "SDK boot" logic isolated in one file.
 * - Let the rest of the app consume a nullable client and make feature
 *   decisions explicitly (enabled/disabled) instead of crashing.
 */
export function createGwopIntegration(): GwopIntegration {
  if (!config.gwopCheckoutApiKey) {
    return {
      enabled: false,
      client: null,
    };
  }

  return {
    enabled: true,
    client: new GwopCheckout({
      // We keep base URL configurable for local/staging/prod.
      baseUrl: config.gwopApiBase,
      // Standard env name for checkout integrations in this repo.
      merchantApiKey: config.gwopCheckoutApiKey,
    }),
  };
}
