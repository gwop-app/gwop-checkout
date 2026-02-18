import { Router } from 'express';
import { config } from '../config.js';
import { createRequireAgentAuth } from '../middleware/agentAuth.js';
import type { AppContext } from '../types/appContext.js';

interface InitBody {
  agent_name?: unknown;
}

interface LoginBody {
  agent_id?: unknown;
  login_code?: unknown;
}

function asInitBody(input: unknown): InitBody {
  if (!input || typeof input !== 'object') return {};
  return input as InitBody;
}

function asLoginBody(input: unknown): LoginBody {
  if (!input || typeof input !== 'object') return {};
  return input as LoginBody;
}

export function createAgentsRouter(ctx: AppContext): Router {
  const router = Router();
  const requireAgentAuth = createRequireAgentAuth(ctx.agents);

  router.get('/v1/agents/init/preflight', (_req, res) => {
    const gatewayKeyRequired = Boolean(config.masterApiKey);
    res.json({
      version: '1.2.0',
      service: 'speak-gwop',
      purpose: 'Register and authenticate a Speak agent before buying credits or creating TTS jobs.',
      required_fields: {
        agent_name: {
          type: 'string',
          required: false,
          min_length: 2,
          max_length: 80,
          guidance:
            'Optional display label for this agent identity inside Speak.',
        },
      },
      identity: {
        account_id: 'speak_agent_id',
        init_returns: ['agent_id', 'login_code (shown once)'],
        login_returns: ['token', 'expires_at'],
        session_ttl_seconds: config.agentSessionTtlSeconds,
      },
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
      },
      flow: [
        '1) POST /v1/agents/init',
        '2) Save agent_id + login_code',
        '3) POST /v1/agents/login',
        '4) Use Bearer token for credits and TTS endpoints',
      ],
      session_required_endpoints: [
        'GET /v1/agents/status',
        'POST /v1/credits/invoices',
        'GET /v1/orders/{order_id}',
        'POST /v1/credits/claim',
        'GET /v1/voices',
        'POST /v1/tts/jobs',
        'GET /v1/tts/jobs/{job_id}',
      ],
      notes: [
        'login_code is not recoverable after init response',
        'Speak auth is separate from Gwop wallet identity',
      ],
    });
  });

  router.post('/v1/agents/init', async (req, res) => {
    try {
    const body = asInitBody(req.body);
    const agentName =
      typeof body.agent_name === 'string' && body.agent_name.trim().length > 0
        ? body.agent_name.trim()
        : 'speak-agent';

    if (agentName.length < 2 || agentName.length > 80) {
      res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'agent_name must be between 2 and 80 characters',
        },
      });
      return;
    }

    const { agent, login_code } = await ctx.agents.createAgent(agentName);
    res.status(201).json({
      agent_id: agent.id,
      agent_name: agent.name,
      status: agent.status,
      created_at: agent.created_at,
      login_code,
      note: 'login_code is shown once; store it securely',
      next_step: 'POST /v1/agents/login',
    });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to initialize agent';
      res.status(500).json({
        error: {
          code: 'AGENT_INIT_FAILED',
          message,
        },
      });
    }
  });

  router.post('/v1/agents/login', async (req, res) => {
    try {
    const body = asLoginBody(req.body);
    if (typeof body.agent_id !== 'string' || body.agent_id.trim().length === 0) {
      res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'agent_id is required',
        },
      });
      return;
    }
    if (
      typeof body.login_code !== 'string' ||
      body.login_code.trim().length === 0
    ) {
      res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'login_code is required',
        },
      });
      return;
    }

    const session = await ctx.agents.createSession(
      body.agent_id.trim(),
      body.login_code.trim(),
      config.agentSessionTtlSeconds
    );

    if (!session) {
      res.status(401).json({
        error: {
          code: 'INVALID_CREDENTIALS',
          message: 'Invalid agent_id or login_code',
        },
      });
      return;
    }

    const agent = await ctx.agents.getAgent(session.agent_id);
    res.json({
      ...session,
      agent_name: agent?.name || null,
      expires_in_seconds: config.agentSessionTtlSeconds,
    });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to create session';
      res.status(500).json({
        error: {
          code: 'AGENT_LOGIN_FAILED',
          message,
        },
      });
    }
  });

  router.get('/v1/agents/status', requireAgentAuth, async (req, res) => {
    try {
    const agentId = res.locals.speakAgentId as string | undefined;
    if (!agentId) {
      res.status(401).json({
        error: {
          code: 'UNAUTHORIZED',
          message: 'Missing authenticated speak agent',
        },
      });
      return;
    }

    const agent = await ctx.agents.getAgent(agentId);
    if (!agent) {
      res.status(404).json({
        error: {
          code: 'AGENT_NOT_FOUND',
          message: 'Speak agent not found',
        },
      });
      return;
    }

    res.json({
      agent_id: agent.id,
      agent_name: agent.name,
      status: agent.status,
      created_at: agent.created_at,
      last_seen_at: agent.last_seen_at,
      characters_remaining: await ctx.balances.get(agent.id),
      capabilities: {
        create_credit_invoice: true,
        claim_credits: true,
        create_tts_jobs: true,
      },
    });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to fetch status';
      res.status(500).json({
        error: {
          code: 'AGENT_STATUS_FAILED',
          message,
        },
      });
    }
  });

  return router;
}
