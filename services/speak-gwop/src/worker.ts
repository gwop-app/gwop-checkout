import { Worker } from 'bullmq';
import { config } from './config.js';
import { CreditBalanceStore } from './core/creditBalanceStore.js';
import { JobStore } from './core/jobStore.js';
import { processTtsJobById, startArtifactCleanupLoop } from './core/jobProcessor.js';
import { db } from './db/client.js';
import { initializeSchema } from './db/schema.js';
import { createArtifactStorage } from './providers/storage/index.js';
import { createTtsProvider } from './providers/tts/index.js';
import { createRedisConnectionOptions } from './queue/connection.js';
import { TTS_QUEUE_NAME, type TtsQueuePayload } from './queue/constants.js';

async function main() {
  await initializeSchema();

  const provider = createTtsProvider();
  const storage = createArtifactStorage();
  const balances = new CreditBalanceStore();
  const store = new JobStore();
  const cleanup = startArtifactCleanupLoop(storage);

  const worker = new Worker<TtsQueuePayload>(
    TTS_QUEUE_NAME,
    async (job) => {
      await processTtsJobById(job.data.jobId, {
        store,
        balances,
        provider,
        storage,
      });
    },
    {
      connection: createRedisConnectionOptions('worker'),
      concurrency: config.maxConcurrentJobs,
    },
  );

  worker.on('ready', () => {
    console.log(
      `[speak-gwop-worker] ready queue=${TTS_QUEUE_NAME} provider=${provider.name} concurrency=${config.maxConcurrentJobs}`,
    );
  });
  worker.on('failed', (job, error) => {
    console.error(
      `[speak-gwop-worker] failed job_id=${job?.data?.jobId || 'unknown'} error=${error.message}`,
    );
  });

  const shutdown = async () => {
    cleanup.stop();
    await worker.close();
    await db.close();
    process.exit(0);
  };

  process.on('SIGINT', () => {
    void shutdown();
  });
  process.on('SIGTERM', () => {
    void shutdown();
  });
}

main().catch((error) => {
  console.error('[speak-gwop-worker] fatal startup error', error);
  process.exit(1);
});
