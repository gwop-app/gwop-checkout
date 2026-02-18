import { createHmac, timingSafeEqual } from 'crypto';
import { Router, type Request } from 'express';
import { config } from '../config.js';
import type { AppContext } from '../types/appContext.js';

function parseSignatureHeader(header: string): { timestamp: string; signature: string } | null {
  const parts = header.split(',').map((s) => s.trim());
  const ts = parts.find((p) => p.startsWith('t='));
  const sig = parts.find((p) => p.startsWith('v1='));
  if (!ts || !sig) return null;
  return {
    timestamp: ts.slice(2),
    signature: sig.slice(3),
  };
}

function rawBody(req: Request): string {
  return typeof req.body === 'string' ? req.body : JSON.stringify(req.body || {});
}

function verifyGwopWebhook(req: Request): boolean {
  if (!config.gwopWebhookSecret) return true;

  const header = req.header('x-gwop-signature');
  if (!header) return false;

  const parsed = parseSignatureHeader(header);
  if (!parsed) return false;

  const payload = `${parsed.timestamp}.${rawBody(req)}`;
  const computed = createHmac('sha256', config.gwopWebhookSecret).update(payload).digest('hex');

  const expectedBuffer = Buffer.from(computed, 'utf8');
  const incomingBuffer = Buffer.from(parsed.signature, 'utf8');
  if (expectedBuffer.length !== incomingBuffer.length) return false;

  return timingSafeEqual(expectedBuffer, incomingBuffer);
}

interface GwopWebhookEventLike {
  event_type?: unknown;
  data?: {
    invoice_id?: unknown;
    status?: unknown;
  };
}

function parseEvent(req: Request): GwopWebhookEventLike | null {
  if (typeof req.body === 'string') {
    try {
      return JSON.parse(req.body) as GwopWebhookEventLike;
    } catch {
      return null;
    }
  }
  if (req.body && typeof req.body === 'object') {
    return req.body as GwopWebhookEventLike;
  }
  return null;
}

function toStatusFromEvent(eventType: string, invoiceStatus?: string): 'PAID' | 'EXPIRED' | 'CANCELED' | null {
  if (eventType === 'invoice.paid') return 'PAID';
  if (eventType === 'invoice.expired') return 'EXPIRED';
  if (eventType === 'invoice.canceled') return 'CANCELED';

  if (invoiceStatus === 'PAID') return 'PAID';
  if (invoiceStatus === 'EXPIRED') return 'EXPIRED';
  if (invoiceStatus === 'CANCELED') return 'CANCELED';

  return null;
}

export function createWebhookRouter(ctx: AppContext): Router {
  const router = Router();

  router.post('/webhooks/gwop', async (req, res) => {
    if (!verifyGwopWebhook(req)) {
      res.status(401).json({
        error: {
          code: 'UNAUTHORIZED',
          message: 'Invalid webhook signature',
        },
      });
      return;
    }

    const event = parseEvent(req);
    if (!event) {
      res.status(400).json({
        error: {
          code: 'INVALID_WEBHOOK_PAYLOAD',
          message: 'Webhook body must be valid JSON',
        },
      });
      return;
    }

    const eventType = typeof event.event_type === 'string' ? event.event_type : 'unknown';
    const invoiceId =
      typeof event.data?.invoice_id === 'string' ? event.data.invoice_id : null;
    const invoiceStatus =
      typeof event.data?.status === 'string' ? event.data.status : undefined;

    if (!invoiceId) {
      res.status(400).json({
        error: {
          code: 'INVALID_WEBHOOK_PAYLOAD',
          message: 'data.invoice_id is required',
        },
      });
      return;
    }

    const mapped = toStatusFromEvent(eventType, invoiceStatus);
    if (!mapped) {
      res.json({
        received: true,
        event_type: eventType,
        invoice_id: invoiceId,
        matched_order: false,
        note: 'Event type not mapped to local order transition',
      });
      return;
    }

    try {
      const order = await ctx.creditOrders.getByInvoiceId(invoiceId);
      if (!order) {
        res.json({
          received: true,
          event_type: eventType,
          invoice_id: invoiceId,
          matched_order: false,
          note: 'No local order for invoice_id',
        });
        return;
      }

      // Never downgrade a credited order.
      if (order.status !== 'CREDITED' && order.status !== mapped) {
        await ctx.creditOrders.setStatus(order.id, mapped);
      }

      res.json({
        received: true,
        event_type: eventType,
        invoice_id: invoiceId,
        matched_order: true,
        order_id: order.id,
        previous_status: order.status,
        mapped_status: mapped,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Webhook processing failed';
      res.status(500).json({
        error: {
          code: 'WEBHOOK_PROCESSING_FAILED',
          message,
        },
      });
    }
  });

  return router;
}
