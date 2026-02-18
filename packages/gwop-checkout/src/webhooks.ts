import { createHmac, timingSafeEqual } from 'node:crypto';
import { InvalidRequestError } from './errors.js';
import type { CheckoutWebhookEvent } from './types.js';

const DEFAULT_TOLERANCE_SECONDS = 300;

export interface ConstructEventOptions {
  tolerance?: number;
}

export class Webhooks {
  constructEvent(
    payload: string | Buffer,
    signature: string | undefined,
    secret: string,
    options: ConstructEventOptions = {},
  ): CheckoutWebhookEvent {
    const tolerance = options.tolerance ?? DEFAULT_TOLERANCE_SECONDS;

    if (!signature) {
      throw new InvalidRequestError('Missing X-Gwop-Signature header', 'WEBHOOK_SIGNATURE_ERROR');
    }
    if (!secret || !secret.startsWith('whsec_')) {
      throw new InvalidRequestError(
        'Invalid webhook secret format (expected whsec_...)',
        'WEBHOOK_SIGNATURE_ERROR',
      );
    }

    const payloadString = typeof payload === 'string' ? payload : payload.toString('utf8');
    const { timestamp, signatures } = this.parseSignatureHeader(signature);

    const now = Math.floor(Date.now() / 1000);
    if (Math.abs(now - timestamp) > tolerance) {
      throw new InvalidRequestError(
        `Webhook timestamp outside tolerance window (${tolerance}s)`,
        'WEBHOOK_SIGNATURE_ERROR',
      );
    }

    const expectedSignature = createHmac('sha256', secret)
      .update(`${timestamp}.${payloadString}`)
      .digest('hex');

    const valid = signatures.some((candidate) => this.secureCompare(candidate, expectedSignature));
    if (!valid) {
      throw new InvalidRequestError('Invalid webhook signature', 'WEBHOOK_SIGNATURE_ERROR');
    }

    try {
      return JSON.parse(payloadString) as CheckoutWebhookEvent;
    } catch {
      throw new InvalidRequestError('Invalid webhook payload JSON', 'WEBHOOK_SIGNATURE_ERROR');
    }
  }

  generateTestSignature(payload: string, secret: string, timestamp?: number): string {
    const ts = timestamp ?? Math.floor(Date.now() / 1000);
    const digest = createHmac('sha256', secret)
      .update(`${ts}.${payload}`)
      .digest('hex');
    return `t=${ts},v1=${digest}`;
  }

  private parseSignatureHeader(header: string): { timestamp: number; signatures: string[] } {
    const parts = header.split(',');
    const timestampPart = parts.find((part) => part.startsWith('t='));
    const signatureParts = parts.filter((part) => part.startsWith('v1='));

    if (!timestampPart || signatureParts.length === 0) {
      throw new InvalidRequestError('Malformed X-Gwop-Signature header', 'WEBHOOK_SIGNATURE_ERROR');
    }

    const timestamp = Number.parseInt(timestampPart.slice(2), 10);
    if (!Number.isFinite(timestamp)) {
      throw new InvalidRequestError('Invalid webhook timestamp', 'WEBHOOK_SIGNATURE_ERROR');
    }

    return {
      timestamp,
      signatures: signatureParts.map((part) => part.slice(3)),
    };
  }

  private secureCompare(a: string, b: string): boolean {
    if (a.length !== b.length) return false;
    return timingSafeEqual(Buffer.from(a, 'utf8'), Buffer.from(b, 'utf8'));
  }
}
