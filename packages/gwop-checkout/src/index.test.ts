import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthenticationError, GwopCheckout, InvalidRequestError } from './index.js';

describe('GwopCheckout', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('requires idempotency key for merchants.init', async () => {
    const sdk = new GwopCheckout();

    expect(() =>
      sdk.merchants.init({
        email: 'owner@example.com',
        merchant_name: 'my-store',
        merchant_description: 'My self hosted store',
      }, {} as any),
    ).toThrow(InvalidRequestError);
  });

  it('enforces merchant key for merchant-auth endpoints', async () => {
    const sdk = new GwopCheckout();

    await expect(
      sdk.invoices.create({ amount_usdc: 1_000_000 }),
    ).rejects.toBeInstanceOf(AuthenticationError);
  });

  it('allows public endpoints without auth', async () => {
    const sdk = new GwopCheckout({ baseUrl: 'https://api.gwop.io' });

    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          id: 'inv_123',
          status: 'OPEN',
          amount_usdc: 1000000,
          currency: 'USDC',
          expires_at: '2026-02-17T00:00:00.000Z',
          created_at: '2026-02-17T00:00:00.000Z',
          merchant: { name: 'demo', verified: true },
          consumption: {
            type: 'redeliverable',
            replay_safe: true,
            guidance: 'Safe to retry',
          },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );

    const invoice = await sdk.invoices.retrieve('inv_123');

    expect(invoice.id).toBe('inv_123');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('enforces agent key format for pay endpoint', async () => {
    const sdk = new GwopCheckout({ merchantApiKey: 'sk_m_demo' });

    await expect(
      sdk.invoices.pay('inv_123'),
    ).rejects.toBeInstanceOf(AuthenticationError);
  });
});
