import type { ConnectionOptions } from 'bullmq';
import { config } from '../config.js';

export function createRedisConnectionOptions(kind: 'api' | 'worker'): ConnectionOptions {
  return {
    url: config.redisUrl,
    maxRetriesPerRequest: kind === 'worker' ? null : 1,
    enableReadyCheck: true,
  };
}
