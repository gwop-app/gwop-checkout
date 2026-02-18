import { createHash, randomBytes, randomUUID } from 'crypto';
import { db } from '../db/client.js';
import type { SpeakAgent, SpeakAgentSession } from '../types/agents.js';

interface AgentRow extends SpeakAgent {
  login_code_hash: string;
}

export class AgentStore {
  private hash(input: string): string {
    return createHash('sha256').update(input, 'utf8').digest('hex');
  }

  async createAgent(name: string): Promise<{ agent: SpeakAgent; login_code: string }> {
    const now = new Date().toISOString();
    const id = `spk_agent_${randomUUID()}`;
    const loginCode = `spk_lc_${randomBytes(12).toString('base64url')}`;
    const loginCodeHash = this.hash(loginCode);

    await db.query(
      `
        insert into speak_agents (id, name, status, login_code_hash, created_at, last_seen_at)
        values ($1, $2, 'ACTIVE', $3, $4, $4)
      `,
      [id, name, loginCodeHash, now],
    );

    return {
      agent: {
        id,
        name,
        status: 'ACTIVE',
        created_at: now,
        last_seen_at: now,
      },
      login_code: loginCode,
    };
  }

  async getAgent(agentId: string): Promise<SpeakAgent | null> {
    const rows = await db.query<SpeakAgent>(
      `
        select id, name, status, created_at, last_seen_at
        from speak_agents
        where id = $1
        limit 1
      `,
      [agentId],
    );
    return rows[0] || null;
  }

  async createSession(
    agentId: string,
    loginCode: string,
    ttlSeconds: number,
  ): Promise<SpeakAgentSession | null> {
    const incomingHash = this.hash(loginCode);
    const nowMs = Date.now();
    const expiresAt = new Date(nowMs + ttlSeconds * 1000).toISOString();
    const token = `spk_at_${randomBytes(24).toString('base64url')}`;
    const tokenHash = this.hash(token);

    const rows = await db.query<AgentRow>(
      `
        select id, name, status, created_at, last_seen_at, login_code_hash
        from speak_agents
        where id = $1
        limit 1
      `,
      [agentId],
    );
    const agent = rows[0];
    if (!agent || agent.status !== 'ACTIVE' || agent.login_code_hash !== incomingHash) {
      return null;
    }

    await db.withTransaction(async (client) => {
      const sessionCreatedAt = new Date(nowMs).toISOString();
      await client.query(
        `
          insert into speak_agent_sessions (token_hash, agent_id, expires_at, created_at)
          values ($1, $2, $3, $4)
        `,
        [tokenHash, agent.id, expiresAt, sessionCreatedAt],
      );
      await client.query(
        `
          update speak_agents
          set last_seen_at = $2
          where id = $1
        `,
        [agent.id, sessionCreatedAt],
      );
    });

    return {
      agent_id: agent.id,
      token,
      token_type: 'Bearer',
      expires_at: expiresAt,
    };
  }

  async resolveAgentFromToken(token: string): Promise<SpeakAgent | null> {
    const tokenHash = this.hash(token);

    await db.query(`
      delete from speak_agent_sessions
      where expires_at <= now()
    `);

    const rows = await db.query<SpeakAgent>(
      `
        select
          a.id,
          a.name,
          a.status,
          a.created_at,
          a.last_seen_at
        from speak_agent_sessions s
        join speak_agents a on a.id = s.agent_id
        where s.token_hash = $1
          and s.expires_at > now()
          and a.status = 'ACTIVE'
        limit 1
      `,
      [tokenHash],
    );
    const agent = rows[0];
    if (!agent) return null;

    await db.query(
      `
        update speak_agents
        set last_seen_at = $2
        where id = $1
      `,
      [agent.id, new Date().toISOString()],
    );

    return agent;
  }

  async stats(): Promise<{ total_agents: number; active_sessions: number }> {
    const [a] = await db.query<{ count: string }>(
      `select count(*)::text as count from speak_agents`,
    );
    const [s] = await db.query<{ count: string }>(
      `select count(*)::text as count from speak_agent_sessions where expires_at > now()`,
    );

    return {
      total_agents: Number.parseInt(a?.count || '0', 10),
      active_sessions: Number.parseInt(s?.count || '0', 10),
    };
  }
}
