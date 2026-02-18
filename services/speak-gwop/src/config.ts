import 'dotenv/config';
import { resolve } from 'path';

const DEFAULT_PORT = 3020;

type ProviderName = 'mock' | 'elevenlabs';
type StorageBackend = 'local' | 's3';

function intFromEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function boolFromEnv(name: string, fallback: boolean): boolean {
  const raw = process.env[name];
  if (!raw) return fallback;
  const value = raw.toLowerCase().trim();
  if (value === '1' || value === 'true' || value === 'yes') return true;
  if (value === '0' || value === 'false' || value === 'no') return false;
  return fallback;
}

export const config = {
  port: Number.parseInt(process.env.PORT || `${DEFAULT_PORT}`, 10) || DEFAULT_PORT,
  publicBaseUrl: process.env.PUBLIC_BASE_URL || `http://localhost:${Number.parseInt(process.env.PORT || `${DEFAULT_PORT}`, 10) || DEFAULT_PORT}`,
  masterApiKey: process.env.MASTER_API_KEY || '',
  gwopApiBase: process.env.GWOP_API_BASE || 'https://api.gwop.io',
  gwopCheckoutApiKey: process.env.GWOP_CHECKOUT_API_KEY || '',
  gwopWebhookSecret: process.env.GWOP_WEBHOOK_SECRET || '',
  databaseUrl: process.env.DATABASE_URL || '',
  dbHost: process.env.PGHOST || '',
  dbPort: Number.parseInt(process.env.PGPORT || '5432', 10) || 5432,
  dbUser: process.env.PGUSER || '',
  dbPassword: process.env.PGPASSWORD || '',
  dbName: process.env.PGDATABASE || '',
  dbSsl: boolFromEnv('DB_SSL', true),
  redisUrl: process.env.REDIS_URL || '',
  provider: (process.env.TTS_PROVIDER || 'mock') as ProviderName,
  elevenlabsApiKey: process.env.ELEVENLABS_API_KEY || '',
  elevenlabsDefaultVoiceId: process.env.ELEVENLABS_DEFAULT_VOICE_ID || 'JBFqnCBsd6RMkjVDRZzb',
  elevenlabsDefaultModelId: process.env.ELEVENLABS_DEFAULT_MODEL_ID || 'eleven_multilingual_v2',
  elevenlabsDefaultOutputFormat: process.env.ELEVENLABS_DEFAULT_OUTPUT_FORMAT || 'mp3_44100_128',
  maxConcurrentJobs: intFromEnv('MAX_CONCURRENT_JOBS', 2),
  audioRetentionHours: intFromEnv('AUDIO_RETENTION_HOURS', 168),
  artifactCleanupIntervalMs: intFromEnv('ARTIFACT_CLEANUP_INTERVAL_MS', 30 * 60 * 1000),
  agentSessionTtlSeconds: intFromEnv('AGENT_SESSION_TTL_SECONDS', 86400),
  storageBackend: (process.env.STORAGE_BACKEND || 'local') as StorageBackend,
  artifactsDir: resolve(process.cwd(), 'data/audio'),
  s3Endpoint: process.env.S3_ENDPOINT || '',
  s3Bucket: process.env.S3_BUCKET || '',
  s3Region: process.env.S3_REGION || 'auto',
  s3AccessKeyId: process.env.S3_ACCESS_KEY_ID || '',
  s3SecretAccessKey: process.env.S3_SECRET_ACCESS_KEY || '',
  s3ForcePathStyle: boolFromEnv('S3_FORCE_PATH_STYLE', true),
  s3SignedUrlTtlSeconds: intFromEnv('S3_SIGNED_URL_TTL_SECONDS', 3600),
  s3KeyPrefix: process.env.S3_KEY_PREFIX || 'artifacts',
} as const;

if (config.provider === 'elevenlabs' && !config.elevenlabsApiKey) {
  throw new Error('ELEVENLABS_API_KEY is required when TTS_PROVIDER=elevenlabs');
}

if (!config.databaseUrl && !(config.dbHost && config.dbUser && config.dbName)) {
  throw new Error('DATABASE_URL or PGHOST/PGUSER/PGDATABASE is required');
}

if (!config.redisUrl) {
  throw new Error('REDIS_URL is required');
}

if (config.storageBackend === 's3') {
  if (!config.s3Endpoint) {
    throw new Error('S3_ENDPOINT is required when STORAGE_BACKEND=s3');
  }
  if (!config.s3Bucket) {
    throw new Error('S3_BUCKET is required when STORAGE_BACKEND=s3');
  }
  if (!config.s3AccessKeyId || !config.s3SecretAccessKey) {
    throw new Error('S3_ACCESS_KEY_ID and S3_SECRET_ACCESS_KEY are required when STORAGE_BACKEND=s3');
  }
}
