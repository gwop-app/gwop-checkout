import { Router } from 'express';
import { config } from '../config.js';
import { getCatalogPayload } from '../core/catalog.js';
import { checkoutBridgeInfo } from '../integrations/checkoutBridge.js';
import type { AppContext } from '../types/appContext.js';

export function createHelpRouter(ctx: AppContext): Router {
  const router = Router();

  router.get('/help', (_req, res) => {
    const gatewayKeyRequired = Boolean(config.masterApiKey);
    res.json({
      service: 'speak-gwop',
      mode: 'metered-v1',
      version: '0.1.0',
      summary: 'Buy character credits via Gwop Checkout, then convert text to speech asynchronously.',
      base_url: config.publicBaseUrl,
      quickstart: [
        '1) POST /v1/agents/init -> get { agent_id, login_code }',
        '2) POST /v1/agents/login -> get Bearer token',
        '3) GET /catalog.json -> choose SKU',
        '4) POST /v1/credits/invoices -> get pay_url',
        '5) Pay invoice on Gwop and POST /v1/credits/claim',
        '6) POST /v1/tts/jobs and poll GET /v1/tts/jobs/{job_id}',
        '7) Download from result.download_url when status=done',
      ],
      auth: {
        session_headers: [
          'Authorization: Bearer <speak_access_token>',
          'x-speak-access-token: <speak_access_token>',
        ],
        ...(gatewayKeyRequired
          ? {
              gateway_header: 'x-api-key: <MASTER_API_KEY>',
              gateway_note: 'Operator-level gate enabled in this deployment.',
            }
          : {}),
        note: 'Do not send Gwop keys to Speak endpoints.',
      },
      identity: {
        register: 'POST /v1/agents/init',
        login: 'POST /v1/agents/login',
        session_ttl_seconds: config.agentSessionTtlSeconds,
        note: 'login_code is returned once and is required to create session tokens.',
      },
      checkout: {
        ...checkoutBridgeInfo(ctx.checkoutBridge),
        role: 'Used server-side by Speak to create Gwop invoices.',
      },
      catalog: getCatalogPayload(),
      billing: {
        credits_unit: 'characters',
        credit_grant: 'Only after invoice is paid and claimed',
        tts_metering: 'reserve before queue, reconcile after provider response',
        insufficient_credits_http_status: 402,
      },
      delivery: {
        job_states: ['queued', 'running', 'done', 'failed'],
        retrieval: 'Poll GET /v1/tts/jobs/{job_id}',
        artifact_field: 'result.download_url',
        artifact_type: config.storageBackend === 'local' ? 'local URL' : 'signed object-storage URL',
        signed_url_ttl_seconds: config.storageBackend === 's3' ? config.s3SignedUrlTtlSeconds : null,
      },
      infrastructure: {
        api_state: 'stateless',
        persistence: 'postgres',
        queue_backend: 'redis',
        worker_model: 'external worker process',
      },
      endpoints: {
        public: [
          'GET /help',
          'GET /skill.md',
          'GET /health',
          'GET /speak-openapi.yaml',
          'GET /v1/agents/init/preflight',
          'POST /v1/agents/init',
          'POST /v1/agents/login',
          'GET /catalog.json',
        ],
        session_required: [
          'GET /v1/agents/status',
          'POST /v1/credits/invoices',
          'POST /v1/credits/claim',
          'GET /v1/orders/{order_id}',
          'GET /v1/voices',
          'POST /v1/tts/jobs',
          'GET /v1/tts/jobs/{job_id}',
        ],
        infra: ['POST /webhooks/gwop'],
      },
      request_examples: {
        create_invoice: {
          method: 'POST',
          path: '/v1/credits/invoices',
          headers: ['Authorization: Bearer <token>'],
          body: {
            sku: 'tts-5k',
            quantity: 1,
          },
        },
        create_tts_job: {
          method: 'POST',
          path: '/v1/tts/jobs',
          headers: ['Authorization: Bearer <token>'],
          body: {
            text: 'Hello from Gwop.',
            voice_id: config.elevenlabsDefaultVoiceId,
            model_id: config.elevenlabsDefaultModelId,
            output_format: config.elevenlabsDefaultOutputFormat,
          },
        },
      },
      notes: [
        'Persist agent_id and login_code immediately after init.',
        'Use /v1/orders/{order_id} to inspect invoice/order state.',
      ],
    });
  });
  return router;
}
