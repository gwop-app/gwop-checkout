export type Currency = 'USDC';
export type InvoiceStatus = 'OPEN' | 'PAYING' | 'PAID' | 'EXPIRED' | 'CANCELED';
export type ConsumptionType = 'redeliverable' | 'consumable';

export interface GwopCheckoutConfig {
  baseUrl?: string;
  merchantApiKey?: string;
  agentApiKey?: string;
}

export interface PublicRequestOptions {
  signal?: AbortSignal;
}

export interface AuthenticatedRequestOptions extends PublicRequestOptions {
  apiKey?: string;
}

export interface IdempotentRequestOptions extends AuthenticatedRequestOptions {
  idempotencyKey?: string;
}

export interface RequiredIdempotencyRequestOptions extends PublicRequestOptions {
  idempotencyKey: string;
}

export interface ErrorResponse {
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
    requestId?: string;
  };
}

export interface FieldRequirement {
  type: 'string' | 'email' | 'url';
  required: boolean;
  critical?: boolean;
  min_length?: number;
  max_length?: number;
  pattern?: string;
  guidance: string;
}

export interface MerchantInitPreflight {
  required_fields: {
    email: FieldRequirement;
    merchant_name: FieldRequirement;
    merchant_description: FieldRequirement;
  };
  optional_fields: {
    webhook_url: FieldRequirement;
  };
  warnings: string[];
  checklist: string[];
  example_request: {
    method: string;
    path: string;
    headers: Record<string, unknown>;
    body: Record<string, unknown>;
  };
}

export interface MerchantInitRequest {
  email: string;
  merchant_name: string;
  merchant_description: string;
  webhook_url?: string;
}

export interface MerchantCapabilities {
  create_invoices: boolean;
  receive_payments: boolean;
  create_products: boolean;
  withdraw: boolean;
}

export interface MerchantInitResponse {
  status: 'ACTIVE';
  wallet_address: string;
  api_key: string;
  claim_url: string;
  claim_expires_at: string | null;
  claim_email_sent: boolean;
  help_endpoint: string;
  capabilities: MerchantCapabilities;
  agent_guidance: {
    message?: string;
    persist?: string[];
    next_step?: string;
  };
}

export interface MerchantStatusResponse {
  status: 'ACTIVE' | 'SUSPENDED';
  claimed: boolean;
  wallet_address: string;
  merchant_name: string;
  capabilities: MerchantCapabilities;
  balance_usdc?: number;
  pending_balance_usdc?: number;
  claim_url?: string;
  owner_email_verified?: boolean;
  withdrawal_address?: string;
}

export interface MerchantSettingsUpdateRequestPublic {
  webhook_url?: string;
  business_name?: string;
  withdrawal_address?: string;
}

export interface MerchantProfilePublic {
  id: string;
  email?: string | null;
  business_name: string;
  website?: string | null;
  solana_address?: string | null;
  withdrawal_address?: string | null;
  webhook_url?: string | null;
  webhook_secret_preview?: string | null;
  status: 'PENDING_SETUP' | 'ACTIVE' | 'SUSPENDED';
  verified_at?: string | null;
  created_at: string;
}

export interface WebhookSecretResponse {
  secret: string;
  preview: string;
  note: string;
}

export interface CreateInvoiceRequest {
  amount_usdc: number;
  description?: string;
  metadata?: Record<string, unknown>;
  metadata_public?: boolean;
  expires_in_seconds?: number;
  consumption_type?: ConsumptionType;
  replay_window_seconds?: number;
  max_replays?: number;
}

export interface CreateInvoiceResponse {
  id: string;
  merchant_id: string;
  amount_usdc: number;
  currency: Currency;
  status: InvoiceStatus;
  description?: string;
  metadata?: Record<string, unknown>;
  metadata_public: boolean;
  consumption_type?: ConsumptionType;
  replay_window_seconds?: number;
  max_replays?: number;
  created_at: string;
  expires_at: string;
}

export interface ConsumptionGuidance {
  type: 'redeliverable' | 'consumable' | 'unknown';
  replay_safe: boolean;
  max_replays?: number | null;
  replay_window_expires_at?: string;
  guidance: string;
}

export interface AgentGuidancePayload {
  message: string;
  next_step?: string;
  persist: {
    action: 'create' | 'update';
    path: string;
    required_fields: string[];
    persist_full_response: boolean;
  };
}

export interface InvoicePublic {
  id: string;
  status: InvoiceStatus;
  amount_usdc: number;
  currency: Currency;
  payment_address?: string;
  solana_pay_url?: string;
  gwop_pay_url?: string;
  reference_pubkey?: string;
  verify_payment_endpoint?: string;
  description?: string;
  metadata?: Record<string, unknown>;
  expires_at: string;
  created_at: string;
  paid_at?: string;
  tx_signature?: string;
  tx_url?: string;
  merchant: {
    name: string;
    verified: boolean;
  };
  consumption: ConsumptionGuidance;
  agent_guidance?: AgentGuidancePayload;
}

export interface InvoiceListItem {
  id: string;
  status: InvoiceStatus;
  amount_usdc: number;
  currency: Currency;
  description?: string;
  metadata?: Record<string, unknown>;
  expires_at: string;
  created_at: string;
  paid_at?: string;
  tx_signature?: string;
}

export interface Pagination {
  total: number;
  limit: number;
  offset: number;
  has_more: boolean;
}

export interface InvoiceListResponse {
  invoices: InvoiceListItem[];
  pagination: Pagination;
}

export interface InvoiceListParams {
  limit?: number;
  offset?: number;
  status?: InvoiceStatus;
}

export interface InvoiceCancelResponse {
  id: string;
  status: 'CANCELED';
  canceled_at: string;
}

export interface InvoicePayRequest {
  otp_code?: string;
  otp_challenge_id?: string;
}

export interface InvoicePayResponse {
  id: string;
  status: 'PAID';
  tx_signature: string;
  tx_url: string;
  paid_at: string;
  payment_intent_id: string;
  consumption: ConsumptionGuidance;
  agent_guidance?: AgentGuidancePayload;
}

export interface VerifyPaymentRequest {
  tx_signature: string;
  payer_address?: string;
}

export interface VerifyPaymentResponse {
  id: string;
  status: 'PAID';
  tx_signature: string;
  tx_url: string;
  paid_at: string;
  payer_address: string;
  paid_amount: number;
  consumption: ConsumptionGuidance;
  agent_guidance?: AgentGuidancePayload;
}

export type CheckoutWebhookEventType =
  | 'invoice.paid'
  | 'invoice.expired'
  | 'invoice.canceled';

export interface CheckoutWebhookEventData {
  invoice_id: string;
  status: 'PAID' | 'EXPIRED' | 'CANCELED';
  amount_usdc: number | string;
  currency: Currency;
  tx_signature?: string;
  paid_at?: string;
  payer_wallet?: string;
}

export interface CheckoutWebhookEvent {
  event_id: string;
  event_type: CheckoutWebhookEventType;
  event_version: number;
  created_at: string;
  data: CheckoutWebhookEventData;
}
