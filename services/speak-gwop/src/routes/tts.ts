import { Router } from 'express';
import { config } from '../config.js';
import { estimateCharacters } from '../core/charCounter.js';
import { createRequireAgentAuth } from '../middleware/agentAuth.js';
import type { AppContext } from '../types/appContext.js';
import type { TtsJobRequest, TtsVoiceSettings } from '../types/tts.js';

const MAX_TEXT_LENGTH = 5000;

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function parseVoiceSettings(input: unknown): TtsVoiceSettings | undefined {
  if (!isObject(input)) return undefined;

  const settings: TtsVoiceSettings = {};

  if (typeof input.stability === 'number') settings.stability = input.stability;
  if (typeof input.similarity_boost === 'number') settings.similarity_boost = input.similarity_boost;
  if (typeof input.style === 'number') settings.style = input.style;
  if (typeof input.use_speaker_boost === 'boolean') settings.use_speaker_boost = input.use_speaker_boost;

  return settings;
}

function parseCreateJobBody(body: unknown): { ok: true; value: TtsJobRequest } | { ok: false; message: string } {
  if (!isObject(body)) {
    return { ok: false, message: 'Request body must be a JSON object' };
  }

  const text = body.text;
  if (typeof text !== 'string' || text.trim().length === 0) {
    return { ok: false, message: 'text is required and must be a non-empty string' };
  }

  if (text.length > MAX_TEXT_LENGTH) {
    return { ok: false, message: `text exceeds max length of ${MAX_TEXT_LENGTH} characters` };
  }

  const result: TtsJobRequest = { text: text.trim() };

  if (typeof body.voice_id === 'string' && body.voice_id.trim().length > 0) {
    result.voice_id = body.voice_id.trim();
  }

  if (typeof body.model_id === 'string' && body.model_id.trim().length > 0) {
    result.model_id = body.model_id.trim();
  }

  if (typeof body.output_format === 'string' && body.output_format.trim().length > 0) {
    result.output_format = body.output_format.trim();
  }

  const voiceSettings = parseVoiceSettings(body.voice_settings);
  if (voiceSettings) {
    result.voice_settings = voiceSettings;
  }

  return { ok: true, value: result };
}

export function createTtsRouter(ctx: AppContext): Router {
  const router = Router();
  const requireAgentAuth = createRequireAgentAuth(ctx.agents);

  router.use('/v1/voices', requireAgentAuth);
  router.use('/v1/tts/jobs', requireAgentAuth);

  router.get('/v1/voices', async (_req, res) => {
    try {
      const voices = await ctx.provider.listVoices();
      res.json({
        provider: ctx.provider.name,
        voices,
        count: voices.length,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to list voices';
      res.status(502).json({
        error: {
          code: 'PROVIDER_ERROR',
          message,
        },
      });
    }
  });

  router.post('/v1/tts/jobs', async (req, res) => {
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

    const parsed = parseCreateJobBody(req.body);
    if (!parsed.ok) {
      res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: parsed.message,
        },
      });
      return;
    }

    const payload = parsed.value;
    const voiceId = payload.voice_id || config.elevenlabsDefaultVoiceId;
    const modelId = payload.model_id || config.elevenlabsDefaultModelId;
    const outputFormat = payload.output_format || config.elevenlabsDefaultOutputFormat;
    const estimatedChars = estimateCharacters(payload.text);

    const reserve = await ctx.balances.reserveForTts(agentId, estimatedChars);
    if (!reserve.ok) {
      res.status(402).json({
        error: {
          code: 'INSUFFICIENT_CREDITS',
          message: 'Not enough characters remaining for this TTS request',
          details: {
            required_chars: estimatedChars,
            characters_remaining: reserve.characters_remaining,
          },
        },
      });
      return;
    }

    try {
      const { record } = await ctx.store.create({
        agentId,
        text: payload.text,
        voiceId,
        modelId,
        outputFormat,
        voiceSettings: payload.voice_settings,
        estimatedChars,
      });

      await ctx.jobQueue.enqueue(record.id);

      res.status(202).json({
        speak_agent_id: agentId,
        job_id: record.id,
        status: record.status,
        estimated_chars: estimatedChars,
        characters_remaining: reserve.characters_remaining,
        poll_url: `/v1/tts/jobs/${record.id}`,
      });
    } catch (error) {
      await ctx.balances.refundReserved(agentId, estimatedChars);
      const message = error instanceof Error ? error.message : 'Failed to queue TTS job';
      res.status(500).json({
        error: {
          code: 'TTS_JOB_QUEUE_FAILED',
          message,
        },
      });
    }
  });

  router.get('/v1/tts/jobs/:id', async (req, res) => {
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

    const job = await ctx.store.get(req.params.id);
    if (!job) {
      res.status(404).json({
        error: {
          code: 'JOB_NOT_FOUND',
          message: 'No job found for that id',
        },
      });
      return;
    }
    if (job.agent_id !== agentId) {
      res.status(403).json({
        error: {
          code: 'FORBIDDEN',
          message: 'Job does not belong to this speak agent',
        },
      });
      return;
    }

    res.json(job);
  });

  return router;
}
