import { randomUUID } from 'crypto';
import { Router } from 'express';
import type { InvoicePublic } from 'gwop-checkout';
import { getCatalogPayload, getCreditSku } from '../core/catalog.js';
import { config } from '../config.js';
import { createRequireAgentAuth } from '../middleware/agentAuth.js';
import type { AppContext } from '../types/appContext.js';
import type { CreditOrderStatus } from '../types/credits.js';

interface CreateInvoiceBody {
  sku?: unknown;
  quantity?: unknown;
}

function asCreateInvoiceBody(input: unknown): CreateInvoiceBody {
  if (!input || typeof input !== 'object') return {};
  return input as CreateInvoiceBody;
}

function toQuantity(raw: unknown): number {
  if (raw === undefined) return 1;
  if (typeof raw !== 'number' || !Number.isInteger(raw) || raw <= 0) return -1;
  if (raw > 100) return -1;
  return raw;
}

/**
 * Translate Gwop invoice lifecycle -> local order lifecycle.
 *
 * We keep mapping explicit here so later DB migrations and webhook handlers
 * can share the same semantics.
 */
function toOrderStatus(invoiceStatus: string): CreditOrderStatus {
  if (invoiceStatus === 'PAID') return 'PAID';
  if (invoiceStatus === 'EXPIRED') return 'EXPIRED';
  if (invoiceStatus === 'CANCELED') return 'CANCELED';
  return 'OPEN';
}

export function createCreditsRouter(ctx: AppContext): Router {
  const router = Router();
  const requireAgentAuth = createRequireAgentAuth(ctx.agents);

  /**
   * Agent-discoverable catalog endpoint.
   * Intentionally static in this phase so agents can plan purchases deterministically.
   */
  router.get('/catalog.json', (_req, res) => {
    res.json(getCatalogPayload());
  });

  // Keep catalog public for discovery, but protect account-bound operations.
  router.use('/v1/credits/invoices', requireAgentAuth);
  router.use('/v1/orders', requireAgentAuth);
  router.use('/v1/credits/claim', requireAgentAuth);

  /**
   * Bridge endpoint: store purchase intent -> gwop-checkout invoice.
   *
   * This is where Speak "becomes a checkout merchant":
   * 1) validate SKU in store catalog
   * 2) ask gwop-checkout SDK to create invoice
   * 3) fetch invoice public details (pay URL, payment address, expiry)
   * 4) persist an order record with invoice link for later claim/reconciliation
   */
  router.post('/v1/credits/invoices', async (req, res) => {
    try {
    if (!ctx.checkoutBridge.isEnabled()) {
      res.status(503).json({
        error: {
          code: 'CHECKOUT_NOT_CONFIGURED',
          message: ctx.checkoutBridge.disabledReason(),
        },
      });
      return;
    }

    const agentId = res.locals.speakAgentId as string | undefined;
    if (!agentId) {
      res.status(401).json({
        error: {
          code: 'UNAUTHORIZED',
          message: 'Missing authenticated speak agent',
        },
      });
      return;
    }

    const body = asCreateInvoiceBody(req.body);
    if (typeof body.sku !== 'string' || body.sku.trim().length === 0) {
      res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'sku is required',
        },
      });
      return;
    }

    const quantity = toQuantity(body.quantity);
    if (quantity < 1) {
      res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'quantity must be an integer between 1 and 100',
        },
      });
      return;
    }

    const sku = getCreditSku(body.sku);
    if (!sku) {
      res.status(404).json({
        error: {
          code: 'SKU_NOT_FOUND',
          message: `Unknown sku: ${body.sku}`,
        },
      });
      return;
    }

    const amountUsdc = sku.amount_usdc * quantity;
    const charsToGrant = sku.characters * quantity;
    const orderId = randomUUID();

    try {
      const created = await ctx.checkoutBridge.createCreditInvoice({
        amountUsdc,
        description: `${sku.label} x${quantity}`,
        metadata: {
          product: 'speak-credits',
          speak_agent_id: agentId,
          speak_order_id: orderId,
          sku: sku.id,
          quantity,
          chars_to_grant: charsToGrant,
        },
      });

      // Create returns merchant-side fields; retrieve gives agent payment URLs.
      const invoice = await ctx.checkoutBridge.getInvoice(created.id);
      const order = await ctx.creditOrders.create({
        orderId,
        agentId,
        sku: sku.id,
        quantity,
        amountUsdc,
        charsToGrant,
        invoiceId: created.id,
      });

      res.status(201).json({
        order_id: order.id,
        speak_agent_id: order.agent_id,
        invoice_id: created.id,
        status: order.status,
        sku: order.sku,
        quantity: order.quantity,
        chars_to_grant: order.chars_to_grant,
        amount_usdc: order.amount_usdc,
        pay_url: invoice.gwop_pay_url || null,
        payment_address: invoice.payment_address || null,
        payment_details_url: `${config.gwopApiBase}/v1/invoices/${created.id}`,
        expires_at: created.expires_at,
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Failed to create invoice';
      res.status(502).json({
        error: {
          code: 'CHECKOUT_ERROR',
          message,
        },
      });
    }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unexpected credits invoice error';
      res.status(500).json({
        error: {
          code: 'CREDITS_INVOICE_FAILED',
          message,
        },
      });
    }
  });

  /**
   * Return order + current invoice state.
   *
   * This endpoint is the operational "source of context" for agents:
   * - order lifecycle inside Speak
   * - invoice lifecycle from Gwop
   * Agents can poll this while waiting to claim credits.
   */
  router.get('/v1/orders/:id', async (req, res) => {
    try {
    const agentId = res.locals.speakAgentId as string | undefined;
    if (!agentId) {
      res.status(401).json({
        error: {
          code: 'UNAUTHORIZED',
          message: 'Missing authenticated speak agent',
        },
      });
      return;
    }

    const order = await ctx.creditOrders.get(req.params.id);
    if (!order) {
      res.status(404).json({
        error: {
          code: 'ORDER_NOT_FOUND',
          message: 'No order found for that id',
        },
      });
      return;
    }
    if (order.agent_id !== agentId) {
      res.status(403).json({
        error: {
          code: 'FORBIDDEN',
          message: 'Order does not belong to this speak agent',
        },
      });
      return;
    }

    let invoice: InvoicePublic | null = null;
    let invoiceError: string | null = null;

    if (ctx.checkoutBridge.isEnabled()) {
      try {
        invoice = await ctx.checkoutBridge.getInvoice(order.invoice_id);
        const mapped = toOrderStatus(invoice.status);
        // Only advance OPEN orders from pull-based invoice checks.
        if (order.status === 'OPEN' && mapped !== 'OPEN') {
          await ctx.creditOrders.setStatus(order.id, mapped);
        }
      } catch (error) {
        invoiceError = error instanceof Error ? error.message : 'Invoice lookup failed';
      }
    }

    const freshOrder = (await ctx.creditOrders.get(order.id)) || order;
    res.json({
      order: freshOrder,
      invoice: invoice
        ? {
            id: invoice.id,
            status: invoice.status,
            gwop_pay_url: invoice.gwop_pay_url || null,
            payment_address: invoice.payment_address || null,
            expires_at: invoice.expires_at,
            paid_at: invoice.paid_at || null,
            tx_signature: invoice.tx_signature || null,
          }
        : null,
      warnings: invoiceError ? [{ code: 'INVOICE_LOOKUP_FAILED', message: invoiceError }] : [],
    });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to fetch order';
      res.status(500).json({
        error: {
          code: 'ORDER_FETCH_FAILED',
          message,
        },
      });
    }
  });

  /**
   * Claim endpoint bound to (speak_agent_id + invoice_id).
   *
   * Behavior:
   * - if invoice is paid and order not credited -> credit characters once
   * - if already credited -> idempotent success response
   * - if invoice not paid -> deterministic error
   */
  router.post('/v1/credits/claim', async (req, res) => {
    try {
    const agentId = res.locals.speakAgentId as string | undefined;
    if (!agentId) {
      res.status(401).json({
        error: {
          code: 'UNAUTHORIZED',
          message: 'Missing authenticated speak agent',
        },
      });
      return;
    }
    if (!req.body || typeof req.body !== 'object') {
      res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Request body must be an object',
        },
      });
      return;
    }

    const invoiceIdRaw = (req.body as Record<string, unknown>).invoice_id;
    if (typeof invoiceIdRaw !== 'string' || invoiceIdRaw.trim().length === 0) {
      res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'invoice_id is required',
        },
      });
      return;
    }
    const invoiceId = invoiceIdRaw.trim();

    const order = await ctx.creditOrders.getByInvoiceId(invoiceId);
    if (!order) {
      res.status(404).json({
        error: {
          code: 'INVOICE_NOT_FOUND',
          message: 'No local credit order found for invoice_id',
        },
      });
      return;
    }
    if (order.agent_id !== agentId) {
      res.status(403).json({
        error: {
          code: 'FORBIDDEN',
          message: 'Invoice does not belong to this speak agent',
        },
      });
      return;
    }

    let invoice: InvoicePublic;
    try {
      invoice = await ctx.checkoutBridge.getInvoice(invoiceId);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Invoice lookup failed';
      res.status(502).json({
        error: {
          code: 'INVOICE_LOOKUP_FAILED',
          message,
        },
      });
      return;
    }

    const mapped = toOrderStatus(invoice.status);
    // Claim path also only advances OPEN -> terminal states from invoice lookup.
    if (order.status === 'OPEN' && mapped !== 'OPEN') {
      await ctx.creditOrders.setStatus(order.id, mapped);
    }

    const refreshed = (await ctx.creditOrders.get(order.id)) || order;
    const looksPaid =
      invoice.status === 'PAID' ||
      refreshed.status === 'PAID' ||
      refreshed.status === 'CREDITED';

    if (!looksPaid) {
      res.status(409).json({
        error: {
          code: 'INVOICE_NOT_PAID',
          message: `Invoice status is ${invoice.status}`,
          details: {
            order_id: refreshed.id,
            invoice_id: invoice.id,
          },
        },
      });
      return;
    }

    if (refreshed.status !== 'CREDITED') {
      await ctx.creditOrders.setStatus(refreshed.id, 'CREDITED');
    }

    const credit = await ctx.balances.creditForOrder(
      agentId,
      refreshed.id,
      refreshed.chars_to_grant
    );
    const finalOrder = (await ctx.creditOrders.get(refreshed.id)) || refreshed;

    res.json({
      speak_agent_id: agentId,
      invoice_id: invoice.id,
      order_id: finalOrder.id,
      order_status: finalOrder.status,
      credited_chars: finalOrder.chars_to_grant,
      already_credited: credit.already_credited,
      characters_remaining: credit.characters_remaining,
    });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Credits claim failed';
      res.status(500).json({
        error: {
          code: 'CREDITS_CLAIM_FAILED',
          message,
        },
      });
    }
  });

  return router;
}
