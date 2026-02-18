import {
  AuthenticationError,
  GwopCheckoutError,
  InvalidRequestError,
  NotFoundError,
  RateLimitError,
} from './errors.js';
import type {
  AuthenticatedRequestOptions,
  ErrorResponse,
  GwopCheckoutConfig,
  IdempotentRequestOptions,
  PublicRequestOptions,
} from './types.js';

const DEFAULT_BASE_URL = 'https://api.gwop.io';
const USER_AGENT = 'gwop-checkout/0.1.0';

type AuthMode = 'public' | 'merchant' | 'agent';

interface RequestConfig {
  auth: AuthMode;
  path: string;
  method: 'GET' | 'POST';
  query?: Record<string, string | number | boolean | undefined>;
  body?: unknown;
  options?: PublicRequestOptions | AuthenticatedRequestOptions | IdempotentRequestOptions;
}

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, '');
}

function buildPath(path: string): string {
  return path.startsWith('/') ? path : `/${path}`;
}

function parseResponseBody(raw: string): unknown {
  if (!raw) return {};
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return { message: raw };
  }
}

function isErrorResponse(input: unknown): input is ErrorResponse {
  if (!input || typeof input !== 'object') return false;
  const value = input as Record<string, unknown>;
  const err = value.error;
  if (!err || typeof err !== 'object') return false;
  const code = (err as Record<string, unknown>).code;
  const message = (err as Record<string, unknown>).message;
  return typeof code === 'string' && typeof message === 'string';
}

export class CheckoutHttpClient {
  private readonly baseUrl: string;
  private merchantApiKey?: string;
  private agentApiKey?: string;

  constructor(config: GwopCheckoutConfig = {}) {
    this.baseUrl = normalizeBaseUrl(config.baseUrl ?? DEFAULT_BASE_URL);
    this.merchantApiKey = config.merchantApiKey;
    this.agentApiKey = config.agentApiKey;
  }

  setMerchantApiKey(apiKey: string): void {
    this.merchantApiKey = apiKey;
  }

  setAgentApiKey(apiKey: string): void {
    this.agentApiKey = apiKey;
  }

  async request<T>(config: RequestConfig): Promise<T> {
    const url = new URL(`${this.baseUrl}${buildPath(config.path)}`);
    if (config.query) {
      for (const [key, value] of Object.entries(config.query)) {
        if (value === undefined) continue;
        url.searchParams.set(key, String(value));
      }
    }

    const headers: Record<string, string> = {
      Accept: 'application/json',
      'User-Agent': USER_AGENT,
    };

    const authOptions = config.options as AuthenticatedRequestOptions | undefined;
    const authKey = this.resolveAuthKey(config.auth, authOptions?.apiKey);
    if (authKey) {
      headers.Authorization = `Bearer ${authKey}`;
    }

    const idempotencyOptions = config.options as IdempotentRequestOptions | undefined;
    if (idempotencyOptions?.idempotencyKey) {
      headers['Idempotency-Key'] = idempotencyOptions.idempotencyKey;
    }

    let body: string | undefined;
    if (config.body !== undefined) {
      headers['Content-Type'] = 'application/json';
      body = JSON.stringify(config.body);
    }

    const response = await fetch(url.toString(), {
      method: config.method,
      headers,
      body,
      signal: config.options?.signal,
    });

    const rawText = await response.text();
    const parsedBody = parseResponseBody(rawText);

    if (!response.ok) {
      throw this.toApiError(response.status, parsedBody, response.headers);
    }

    return parsedBody as T;
  }

  private resolveAuthKey(auth: AuthMode, overrideKey?: string): string | undefined {
    if (auth === 'public') return undefined;

    const key = overrideKey ?? (auth === 'merchant' ? this.merchantApiKey : this.agentApiKey);
    if (!key) {
      throw new AuthenticationError(
        auth === 'merchant'
          ? 'Missing merchant API key (expected sk_m_*)'
          : 'Missing agent API key (expected sk_*)',
      );
    }

    if (auth === 'merchant' && !key.startsWith('sk_m_')) {
      throw new AuthenticationError('Invalid merchant API key format (expected sk_m_*)');
    }

    const isAgentKey = key.startsWith('sk_') && !key.startsWith('sk_m_');
    if (auth === 'agent' && !isAgentKey) {
      throw new AuthenticationError('Invalid agent API key format (expected sk_*)');
    }

    return key;
  }

  private toApiError(status: number, payload: unknown, headers: Headers): GwopCheckoutError {
    const fallbackMessage = `Gwop API request failed with status ${status}`;
    const fallbackCode = 'UNKNOWN';

    let code = fallbackCode;
    let message = fallbackMessage;
    let details: Record<string, unknown> | undefined;
    let requestId = headers.get('x-request-id') ?? undefined;

    if (isErrorResponse(payload)) {
      code = payload.error.code;
      message = payload.error.message;
      details = payload.error.details;
      requestId = payload.error.requestId ?? requestId;
    } else if (payload && typeof payload === 'object') {
      const value = payload as Record<string, unknown>;
      if (typeof value.code === 'string') code = value.code;
      if (typeof value.message === 'string') message = value.message;
      if (value.details && typeof value.details === 'object') {
        details = value.details as Record<string, unknown>;
      }
    }

    if (status === 401) {
      return new AuthenticationError(message, requestId, payload);
    }
    if (status === 400 || status === 422) {
      return new InvalidRequestError(message, code, details, requestId, payload);
    }
    if (status === 404) {
      return new NotFoundError(message, code, requestId, payload);
    }
    if (status === 429) {
      const retryFromBody =
        details && typeof details.retry_after_seconds === 'number'
          ? details.retry_after_seconds
          : undefined;
      const retryFromHeader = headers.get('retry-after');
      const retryAfterSeconds =
        retryFromBody
        ?? (retryFromHeader ? Number.parseInt(retryFromHeader, 10) : undefined);
      return new RateLimitError(message, retryAfterSeconds, requestId, payload);
    }

    return new GwopCheckoutError(message, code, status, details, requestId, payload);
  }
}
