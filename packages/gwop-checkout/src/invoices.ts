import type { CheckoutHttpClient } from './client.js';
import type {
  AuthenticatedRequestOptions,
  CreateInvoiceRequest,
  CreateInvoiceResponse,
  IdempotentRequestOptions,
  InvoiceCancelResponse,
  InvoiceListParams,
  InvoiceListResponse,
  InvoicePayRequest,
  InvoicePayResponse,
  InvoicePublic,
  PublicRequestOptions,
  VerifyPaymentRequest,
  VerifyPaymentResponse,
} from './types.js';

export class InvoicesResource {
  constructor(private readonly client: CheckoutHttpClient) {}

  create(
    body: CreateInvoiceRequest,
    options?: IdempotentRequestOptions,
  ): Promise<CreateInvoiceResponse> {
    return this.client.request<CreateInvoiceResponse>({
      method: 'POST',
      path: '/v1/invoices',
      auth: 'merchant',
      body,
      options,
    });
  }

  list(
    params?: InvoiceListParams,
    options?: AuthenticatedRequestOptions,
  ): Promise<InvoiceListResponse> {
    const query = params
      ? {
          limit: params.limit,
          offset: params.offset,
          status: params.status,
        }
      : undefined;

    return this.client.request<InvoiceListResponse>({
      method: 'GET',
      path: '/v1/invoices',
      auth: 'merchant',
      query,
      options,
    });
  }

  retrieve(
    invoiceId: string,
    options?: PublicRequestOptions,
  ): Promise<InvoicePublic> {
    return this.client.request<InvoicePublic>({
      method: 'GET',
      path: `/v1/invoices/${encodeURIComponent(invoiceId)}`,
      auth: 'public',
      options,
    });
  }

  cancel(
    invoiceId: string,
    options?: AuthenticatedRequestOptions,
  ): Promise<InvoiceCancelResponse> {
    return this.client.request<InvoiceCancelResponse>({
      method: 'POST',
      path: `/v1/invoices/${encodeURIComponent(invoiceId)}/cancel`,
      auth: 'merchant',
      options,
    });
  }

  pay(
    invoiceId: string,
    body?: InvoicePayRequest,
    options?: AuthenticatedRequestOptions,
  ): Promise<InvoicePayResponse> {
    return this.client.request<InvoicePayResponse>({
      method: 'POST',
      path: `/v1/invoices/${encodeURIComponent(invoiceId)}/pay`,
      auth: 'agent',
      body,
      options,
    });
  }

  verifyExternalPayment(
    invoiceId: string,
    body: VerifyPaymentRequest,
    options?: PublicRequestOptions,
  ): Promise<VerifyPaymentResponse> {
    return this.client.request<VerifyPaymentResponse>({
      method: 'POST',
      path: `/v1/invoices/${encodeURIComponent(invoiceId)}/verify-payment`,
      auth: 'public',
      body,
      options,
    });
  }
}
