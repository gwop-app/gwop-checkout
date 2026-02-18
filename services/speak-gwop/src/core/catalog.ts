import type { CreditSku } from '../types/credits.js';

/**
 * Static SKU catalog for Speak credit packs.
 *
 * Why static for now:
 * - Keeps checkout integration deterministic and easy to clone.
 * - Avoids DB dependencies while we are still proving the API flow.
 * - Matches the "agent can fetch catalog.json then buy by sku" UX.
 */
export const CREDIT_SKUS: CreditSku[] = [
  {
    id: 'tts-1k',
    label: 'TTS 1K Characters',
    amount_usdc: 10_000, // $0.01 (USDC has 6 decimals)
    characters: 1000,
    currency: 'USDC',
  },
  {
    id: 'tts-2k',
    label: 'TTS 2K Characters',
    amount_usdc: 20_000, // $0.02
    characters: 2000,
    currency: 'USDC',
  },
  {
    id: 'tts-5k',
    label: 'TTS 5K Characters',
    amount_usdc: 45_000, // $0.045
    characters: 5000,
    currency: 'USDC',
  },
];

const SKU_LOOKUP = new Map(CREDIT_SKUS.map((sku) => [sku.id, sku]));

/**
 * Resolve a SKU id to a concrete config record.
 */
export function getCreditSku(skuId: string): CreditSku | null {
  return SKU_LOOKUP.get(skuId) || null;
}

/**
 * Export a catalog payload shape that agents can consume directly.
 */
export function getCatalogPayload() {
  return {
    version: '1.0',
    product: 'speak-credits',
    currency: 'USDC',
    items: CREDIT_SKUS,
  };
}
