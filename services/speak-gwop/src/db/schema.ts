import { db } from './client.js';

/**
 * Creates Speak service tables if they do not already exist.
 *
 * This keeps the demo clone-friendly: one startup command can provision schema.
 * For production, move these DDL statements into versioned SQL migrations.
 */
export async function initializeSchema(): Promise<{
  db_enabled: boolean;
  initialized: boolean;
}> {
  await db.query(`
    create table if not exists speak_agents (
      id text primary key,
      name text not null,
      status text not null,
      login_code_hash text not null,
      created_at timestamptz not null,
      last_seen_at timestamptz not null
    );
  `);

  await db.query(`
    create table if not exists speak_agent_sessions (
      token_hash text primary key,
      agent_id text not null references speak_agents(id) on delete cascade,
      expires_at timestamptz not null,
      created_at timestamptz not null
    );
  `);
  await db.query(`
    create index if not exists idx_speak_agent_sessions_agent_id
      on speak_agent_sessions (agent_id);
  `);
  await db.query(`
    create index if not exists idx_speak_agent_sessions_expires_at
      on speak_agent_sessions (expires_at);
  `);

  await db.query(`
    create table if not exists speak_credit_orders (
      id text primary key,
      agent_id text not null references speak_agents(id) on delete cascade,
      sku text not null,
      quantity integer not null,
      amount_usdc bigint not null,
      chars_to_grant bigint not null,
      invoice_id text not null unique,
      status text not null,
      created_at timestamptz not null,
      updated_at timestamptz not null,
      credited_at timestamptz null
    );
  `);
  await db.query(`
    create index if not exists idx_speak_credit_orders_agent_id
      on speak_credit_orders (agent_id);
  `);

  await db.query(`
    create table if not exists speak_credit_balances (
      agent_id text primary key references speak_agents(id) on delete cascade,
      characters_remaining bigint not null default 0,
      updated_at timestamptz not null
    );
  `);

  await db.query(`
    create table if not exists speak_credit_claims (
      order_id text primary key references speak_credit_orders(id) on delete cascade,
      agent_id text not null references speak_agents(id) on delete cascade,
      chars_credited bigint not null,
      created_at timestamptz not null
    );
  `);

  await db.query(`
    create table if not exists speak_tts_jobs (
      id text primary key,
      agent_id text not null references speak_agents(id) on delete cascade,
      status text not null,
      request_text text not null,
      request_text_length integer not null,
      request_voice_id text not null,
      request_model_id text not null,
      request_output_format text not null,
      request_voice_settings jsonb null,
      estimated_chars integer not null,
      reserved_chars integer not null,
      actual_chars integer null,
      refunded_chars integer null,
      download_url text null,
      mime_type text null,
      size_bytes integer null,
      sha256 text null,
      error_code text null,
      error_message text null,
      created_at timestamptz not null,
      started_at timestamptz null,
      completed_at timestamptz null
    );
  `);
  await db.query(`
    create index if not exists idx_speak_tts_jobs_agent_created
      on speak_tts_jobs (agent_id, created_at desc);
  `);
  await db.query(`
    create index if not exists idx_speak_tts_jobs_status_created
      on speak_tts_jobs (status, created_at);
  `);

  return { db_enabled: db.enabled, initialized: true };
}
