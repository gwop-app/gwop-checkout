import { InvalidRequestError } from './errors.js';
import type { CheckoutHttpClient } from './client.js';
import type {
  MerchantInitPreflight,
  MerchantInitRequest,
  MerchantInitResponse,
  MerchantProfilePublic,
  MerchantSettingsUpdateRequestPublic,
  MerchantStatusResponse,
  RequiredIdempotencyRequestOptions,
  WebhookSecretResponse,
  AuthenticatedRequestOptions,
  PublicRequestOptions,
} from './types.js';

export class MerchantsResource {
  constructor(private readonly client: CheckoutHttpClient) {}

  getInitPreflight(options?: PublicRequestOptions): Promise<MerchantInitPreflight> {
    return this.client.request<MerchantInitPreflight>({
      method: 'GET',
      path: '/v1/merchants/init/preflight',
      auth: 'public',
      options,
    });
  }

  init(
    body: MerchantInitRequest,
    options: RequiredIdempotencyRequestOptions,
  ): Promise<MerchantInitResponse> {
    if (!options?.idempotencyKey) {
      throw new InvalidRequestError(
        'Idempotency-Key is required for merchants.init',
        'IDEMPOTENCY_KEY_REQUIRED',
      );
    }

    return this.client.request<MerchantInitResponse>({
      method: 'POST',
      path: '/v1/merchants/init',
      auth: 'public',
      body,
      options,
    });
  }

  getStatus(options?: AuthenticatedRequestOptions): Promise<MerchantStatusResponse> {
    return this.client.request<MerchantStatusResponse>({
      method: 'GET',
      path: '/v1/merchants/status',
      auth: 'merchant',
      options,
    });
  }

  updateSettings(
    body: MerchantSettingsUpdateRequestPublic,
    options?: AuthenticatedRequestOptions,
  ): Promise<MerchantProfilePublic> {
    return this.client.request<MerchantProfilePublic>({
      method: 'POST',
      path: '/v1/merchants/settings',
      auth: 'merchant',
      body,
      options,
    });
  }

  generateWebhookSecret(options?: AuthenticatedRequestOptions): Promise<WebhookSecretResponse> {
    return this.client.request<WebhookSecretResponse>({
      method: 'POST',
      path: '/v1/merchants/webhook-secret',
      auth: 'merchant',
      options,
    });
  }
}
