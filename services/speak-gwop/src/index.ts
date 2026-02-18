import express from 'express';
import { mkdir } from 'fs/promises';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import { config } from './config.js';
import { AgentStore } from './core/agentStore.js';
import { CreditBalanceStore } from './core/creditBalanceStore.js';
import { CreditOrderStore } from './core/creditOrderStore.js';
import { JobStore } from './core/jobStore.js';
import { db } from './db/client.js';
import { initializeSchema } from './db/schema.js';
import { createCheckoutBridge } from './integrations/checkoutBridge.js';
import { createGwopIntegration } from './integrations/gwop.js';
import { createMasterApiKeyMiddleware } from './middleware/masterApiKey.js';
import { createTtsProvider } from './providers/tts/index.js';
import { TtsQueue } from './queue/ttsQueue.js';
import { createAgentsRouter } from './routes/agents.js';
import { createCreditsRouter } from './routes/credits.js';
import { createHelpRouter } from './routes/help.js';
import { createHealthRouter } from './routes/health.js';
import { createTtsRouter } from './routes/tts.js';
import { createWebhookRouter } from './routes/webhooks.js';

async function main() {
  const serviceRootDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const speakOpenApiPath = resolve(serviceRootDir, 'speak-openapi.yaml');
  const skillDocPath = resolve(serviceRootDir, 'skill.md');

  if (config.storageBackend === 'local') {
    await mkdir(config.artifactsDir, { recursive: true });
  }
  await initializeSchema();

  const provider = createTtsProvider();
  const store = new JobStore();
  const agents = new AgentStore();
  const balances = new CreditBalanceStore();
  const creditOrders = new CreditOrderStore();
  const queue = new TtsQueue();
  const gwop = createGwopIntegration();
  const checkoutBridge = createCheckoutBridge(gwop.client);
  const appCtx = {
    provider,
    store,
    agents,
    balances,
    creditOrders,
    jobQueue: queue,
    gwop,
    checkoutBridge,
  };

  const app = express();

  app.use('/webhooks', express.text({ type: 'application/json' }));
  app.use(express.json({ limit: '2mb' }));

  app.use(createHelpRouter(appCtx));
  app.use(createHealthRouter(appCtx));
  app.get('/speak-openapi.yaml', (_req, res) => {
    res.sendFile(speakOpenApiPath, (error) => {
      if (!error) return;
      res.status(500).json({
        error: {
          code: 'SPEC_READ_FAILED',
          message: 'Failed to read speak-openapi.yaml',
        },
      });
    });
  });
  app.get('/skill.md', (_req, res) => {
    res.type('text/markdown');
    res.sendFile(skillDocPath, (error) => {
      if (!error) return;
      res.status(500).json({
        error: {
          code: 'SKILL_READ_FAILED',
          message: 'Failed to read skill.md',
        },
      });
    });
  });
  app.use(createAgentsRouter(appCtx));
  app.use(createMasterApiKeyMiddleware(config.masterApiKey), createCreditsRouter(appCtx));
  app.use(
    createMasterApiKeyMiddleware(config.masterApiKey),
    createTtsRouter(appCtx)
  );
  app.use(createWebhookRouter(appCtx));
  if (config.storageBackend === 'local') {
    app.use('/artifacts', express.static(config.artifactsDir));
  }

  app.use((req, res) => {
    res.status(404).json({
      error: {
        code: 'NOT_FOUND',
        message: `Route ${req.method} ${req.path} not found`,
      },
    });
  });

  const server = app.listen(config.port, () => {
    console.log(`[speak-gwop] listening on ${config.publicBaseUrl}`);
    console.log(`[speak-gwop] provider=${provider.name} metered_api=true queue=redis`);
    console.log('[speak-gwop] persistence=postgres');
    console.log(
      `[speak-gwop] gwop_checkout_sdk=${gwop.enabled ? 'enabled' : 'disabled'} api_base=${config.gwopApiBase}`
    );
    console.log('[speak-gwop] worker_mode=external');
    if (config.storageBackend === 'local') {
      console.log(`[speak-gwop] artifacts_dir=${config.artifactsDir}`);
    } else {
      console.log(`[speak-gwop] artifacts_bucket=${config.s3Bucket} endpoint=${config.s3Endpoint}`);
    }
  });

  const shutdown = () => {
    server.close(async () => {
      await queue.close();
      await db.close();
      process.exit(0);
    });
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((error) => {
  console.error('[speak-gwop] fatal startup error', error);
  process.exit(1);
});
