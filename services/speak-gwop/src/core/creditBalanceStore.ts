import { db } from '../db/client.js';

export class CreditBalanceStore {
  private async incrementBalance(agentId: string, chars: number): Promise<number> {
    const now = new Date().toISOString();
    await db.query(
      `
        insert into speak_credit_balances (agent_id, characters_remaining, updated_at)
        values ($1, $2, $3)
        on conflict (agent_id) do update
        set
          characters_remaining = speak_credit_balances.characters_remaining + excluded.characters_remaining,
          updated_at = excluded.updated_at
      `,
      [agentId, chars, now],
    );

    const rows = await db.query<{ characters_remaining: string }>(
      `
        select characters_remaining::text as characters_remaining
        from speak_credit_balances
        where agent_id = $1
        limit 1
      `,
      [agentId],
    );

    return rows[0] ? Number.parseInt(rows[0].characters_remaining, 10) : 0;
  }

  async get(agentId: string): Promise<number> {
    const rows = await db.query<{ characters_remaining: string }>(
      `
        select characters_remaining::text as characters_remaining
        from speak_credit_balances
        where agent_id = $1
        limit 1
      `,
      [agentId],
    );
    if (!rows[0]) return 0;
    return Number.parseInt(rows[0].characters_remaining, 10);
  }

  async creditForOrder(
    agentId: string,
    orderId: string,
    chars: number,
  ): Promise<{
    already_credited: boolean;
    characters_remaining: number;
  }> {
    return db.withTransaction(async (client) => {
      const now = new Date().toISOString();

      const inserted = await client.query(
        `
          insert into speak_credit_claims (order_id, agent_id, chars_credited, created_at)
          values ($1, $2, $3, $4)
          on conflict (order_id) do nothing
          returning order_id
        `,
        [orderId, agentId, chars, now],
      );

      const alreadyCredited = inserted.rowCount === 0;

      if (!alreadyCredited) {
        await client.query(
          `
            insert into speak_credit_balances (agent_id, characters_remaining, updated_at)
            values ($1, $2, $3)
            on conflict (agent_id) do update
            set
              characters_remaining = speak_credit_balances.characters_remaining + excluded.characters_remaining,
              updated_at = excluded.updated_at
          `,
          [agentId, chars, now],
        );
      }

      const balanceRow = await client.query<{ characters_remaining: string }>(
        `
          select characters_remaining::text as characters_remaining
          from speak_credit_balances
          where agent_id = $1
          limit 1
        `,
        [agentId],
      );

      const balance = balanceRow.rows[0]
        ? Number.parseInt(balanceRow.rows[0].characters_remaining, 10)
        : 0;

      return {
        already_credited: alreadyCredited,
        characters_remaining: balance,
      };
    });
  }

  async reserveForTts(
    agentId: string,
    reservedChars: number,
  ): Promise<{
    ok: boolean;
    characters_remaining: number;
  }> {
    if (reservedChars <= 0) {
      return {
        ok: true,
        characters_remaining: await this.get(agentId),
      };
    }

    const now = new Date().toISOString();
    const updated = await db.query<{ characters_remaining: string }>(
      `
        update speak_credit_balances
        set
          characters_remaining = characters_remaining - $2,
          updated_at = $3
        where agent_id = $1
          and characters_remaining >= $2
        returning characters_remaining::text as characters_remaining
      `,
      [agentId, reservedChars, now],
    );

    if (updated[0]) {
      return {
        ok: true,
        characters_remaining: Number.parseInt(updated[0].characters_remaining, 10),
      };
    }

    return {
      ok: false,
      characters_remaining: await this.get(agentId),
    };
  }

  async refundReserved(agentId: string, reservedChars: number): Promise<number> {
    if (reservedChars <= 0) {
      return this.get(agentId);
    }
    return this.incrementBalance(agentId, reservedChars);
  }

  async reconcileReserved(
    agentId: string,
    reservedChars: number,
    actualChars: number,
  ): Promise<{ refunded_chars: number; characters_remaining: number }> {
    const refund = Math.max(reservedChars - actualChars, 0);
    if (refund <= 0) {
      return {
        refunded_chars: 0,
        characters_remaining: await this.get(agentId),
      };
    }

    const remaining = await this.incrementBalance(agentId, refund);
    return {
      refunded_chars: refund,
      characters_remaining: remaining,
    };
  }

  async stats(): Promise<{ accounts_with_balance: number; total_characters_issued: number }> {
    const [row] = await db.query<{ accounts: string; total: string }>(`
      select
        count(*)::text as accounts,
        coalesce(sum(characters_remaining), 0)::text as total
      from speak_credit_balances
    `);

    return {
      accounts_with_balance: Number.parseInt(row?.accounts || '0', 10),
      total_characters_issued: Number.parseInt(row?.total || '0', 10),
    };
  }
}
