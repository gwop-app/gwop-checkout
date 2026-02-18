import { randomUUID } from 'crypto';
import { db } from '../db/client.js';
import type { CreditOrderRecord, CreditOrderStatus } from '../types/credits.js';

export interface CreateCreditOrderInput {
  orderId?: string;
  agentId: string;
  sku: string;
  quantity: number;
  amountUsdc: number;
  charsToGrant: number;
  invoiceId: string;
}

export class CreditOrderStore {
  private fromDbRow(row: CreditOrderRecord): CreditOrderRecord {
    return {
      ...row,
      quantity:
        typeof row.quantity === 'string'
          ? Number.parseInt(row.quantity, 10)
          : row.quantity,
      amount_usdc:
        typeof row.amount_usdc === 'string'
          ? Number.parseInt(row.amount_usdc, 10)
          : row.amount_usdc,
      chars_to_grant:
        typeof row.chars_to_grant === 'string'
          ? Number.parseInt(row.chars_to_grant, 10)
          : row.chars_to_grant,
    };
  }

  async create(input: CreateCreditOrderInput): Promise<CreditOrderRecord> {
    const now = new Date().toISOString();
    const id = input.orderId || randomUUID();
    const order: CreditOrderRecord = {
      id,
      agent_id: input.agentId,
      sku: input.sku,
      quantity: input.quantity,
      amount_usdc: input.amountUsdc,
      chars_to_grant: input.charsToGrant,
      invoice_id: input.invoiceId,
      status: 'OPEN',
      created_at: now,
      updated_at: now,
    };

    await db.query(
      `
        insert into speak_credit_orders (
          id, agent_id, sku, quantity, amount_usdc, chars_to_grant,
          invoice_id, status, created_at, updated_at, credited_at
        )
        values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,null)
      `,
      [
        order.id,
        order.agent_id,
        order.sku,
        order.quantity,
        order.amount_usdc,
        order.chars_to_grant,
        order.invoice_id,
        order.status,
        order.created_at,
        order.updated_at,
      ],
    );
    return order;
  }

  async get(orderId: string): Promise<CreditOrderRecord | undefined> {
    const rows = await db.query<CreditOrderRecord>(
      `
        select
          id, agent_id, sku, quantity, amount_usdc, chars_to_grant,
          invoice_id, status, created_at, updated_at, credited_at
        from speak_credit_orders
        where id = $1
        limit 1
      `,
      [orderId],
    );
    return rows[0] ? this.fromDbRow(rows[0]) : undefined;
  }

  async getByInvoiceId(invoiceId: string): Promise<CreditOrderRecord | undefined> {
    const rows = await db.query<CreditOrderRecord>(
      `
        select
          id, agent_id, sku, quantity, amount_usdc, chars_to_grant,
          invoice_id, status, created_at, updated_at, credited_at
        from speak_credit_orders
        where invoice_id = $1
        limit 1
      `,
      [invoiceId],
    );
    return rows[0] ? this.fromDbRow(rows[0]) : undefined;
  }

  async setStatus(
    orderId: string,
    status: CreditOrderStatus,
  ): Promise<CreditOrderRecord | undefined> {
    const now = new Date().toISOString();
    const rows = await db.query<CreditOrderRecord>(
      `
        update speak_credit_orders
        set
          status = $2,
          updated_at = $3,
          credited_at = case
            when $2 = 'CREDITED' and credited_at is null then $3::timestamptz
            else credited_at
          end
        where id = $1
        returning
          id, agent_id, sku, quantity, amount_usdc, chars_to_grant,
          invoice_id, status, created_at, updated_at, credited_at
      `,
      [orderId, status, now],
    );
    return rows[0] ? this.fromDbRow(rows[0]) : undefined;
  }

  async stats(): Promise<{
    total: number;
    open: number;
    paid: number;
    credited: number;
    expired: number;
    canceled: number;
  }> {
    const [row] = await db.query<{
      total: string;
      open: string;
      paid: string;
      credited: string;
      expired: string;
      canceled: string;
    }>(`
      select
        count(*)::text as total,
        count(*) filter (where status = 'OPEN')::text as open,
        count(*) filter (where status = 'PAID')::text as paid,
        count(*) filter (where status = 'CREDITED')::text as credited,
        count(*) filter (where status = 'EXPIRED')::text as expired,
        count(*) filter (where status = 'CANCELED')::text as canceled
      from speak_credit_orders
    `);

    return {
      total: Number.parseInt(row?.total || '0', 10),
      open: Number.parseInt(row?.open || '0', 10),
      paid: Number.parseInt(row?.paid || '0', 10),
      credited: Number.parseInt(row?.credited || '0', 10),
      expired: Number.parseInt(row?.expired || '0', 10),
      canceled: Number.parseInt(row?.canceled || '0', 10),
    };
  }
}
