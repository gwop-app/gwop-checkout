import {
  Pool,
  type PoolClient,
  type PoolConfig,
  type QueryResultRow,
} from 'pg';
import { config } from '../config.js';

function buildPoolConfig(): PoolConfig {
  if (config.databaseUrl) {
    return {
      connectionString: config.databaseUrl,
      ssl: config.dbSsl ? { rejectUnauthorized: false } : undefined,
    };
  }

  if (config.dbHost && config.dbUser && config.dbName) {
    return {
      host: config.dbHost,
      port: config.dbPort,
      user: config.dbUser,
      password: config.dbPassword || undefined,
      database: config.dbName,
      ssl: config.dbSsl ? { rejectUnauthorized: false } : undefined,
    };
  }

  throw new Error('DATABASE_NOT_CONFIGURED');
}

const poolConfig = buildPoolConfig();
const pool = new Pool(poolConfig);

export const db = {
  enabled: true,

  async query<T extends QueryResultRow>(
    text: string,
    params: unknown[] = []
  ): Promise<T[]> {
    const result = await pool.query<T>(text, params);
    return result.rows;
  },

  async withTransaction<T>(
    handler: (client: PoolClient) => Promise<T>
  ): Promise<T> {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const result = await handler(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  },

  async close(): Promise<void> {
    await pool.end();
  },
} as const;
