import { randomUUID } from 'crypto';
import { db } from '../db/client.js';
import type { TtsJobRecord, TtsVoiceSettings } from '../types/tts.js';

export interface QueueJobInput {
  agentId: string;
  text: string;
  voiceId: string;
  modelId: string;
  outputFormat: string;
  voiceSettings?: TtsVoiceSettings;
  estimatedChars: number;
}

interface JobRow {
  id: string;
  agent_id: string;
  status: string;
  request_text: string;
  request_text_length: number;
  request_voice_id: string;
  request_model_id: string;
  request_output_format: string;
  request_voice_settings: TtsVoiceSettings | null;
  estimated_chars: number;
  reserved_chars: number;
  actual_chars: number | null;
  refunded_chars: number | null;
  download_url: string | null;
  mime_type: string | null;
  size_bytes: number | null;
  sha256: string | null;
  error_code: string | null;
  error_message: string | null;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
}

export interface JobExecutionInput {
  id: string;
  agentId: string;
  text: string;
  voiceId: string;
  modelId: string;
  outputFormat: string;
  voiceSettings?: TtsVoiceSettings;
  estimatedChars: number;
  reservedChars: number;
}

function toInt(value: unknown): number | undefined {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

export class JobStore {
  private toRecord(row: JobRow): TtsJobRecord {
    return {
      id: row.id,
      agent_id: row.agent_id,
      status: row.status as TtsJobRecord['status'],
      created_at: row.created_at,
      started_at: row.started_at || undefined,
      completed_at: row.completed_at || undefined,
      request: {
        text: row.request_text,
        text_length: row.request_text_length,
        voice_id: row.request_voice_id,
        model_id: row.request_model_id,
        output_format: row.request_output_format,
      },
      usage: {
        estimated_chars: row.estimated_chars,
        reserved_chars: row.reserved_chars,
        actual_chars: row.actual_chars ?? undefined,
        refunded_chars: row.refunded_chars ?? undefined,
      },
      result:
        row.download_url && row.mime_type && row.size_bytes !== null && row.sha256
          ? {
              download_url: row.download_url,
              mime_type: row.mime_type,
              size_bytes: row.size_bytes,
              sha256: row.sha256,
            }
          : undefined,
      error:
        row.error_code && row.error_message
          ? {
              code: row.error_code,
              message: row.error_message,
            }
          : undefined,
    };
  }

  async create(input: QueueJobInput): Promise<{ record: TtsJobRecord }> {
    const id = randomUUID();
    const now = new Date().toISOString();

    const rows = await db.query<JobRow>(
      `
        insert into speak_tts_jobs (
          id, agent_id, status,
          request_text, request_text_length, request_voice_id, request_model_id, request_output_format, request_voice_settings,
          estimated_chars, reserved_chars,
          actual_chars, refunded_chars,
          download_url, mime_type, size_bytes, sha256,
          error_code, error_message,
          created_at, started_at, completed_at
        )
        values (
          $1, $2, 'queued',
          $3, $4, $5, $6, $7, $8::jsonb,
          $9, $9,
          null, null,
          null, null, null, null,
          null, null,
          $10, null, null
        )
        returning *
      `,
      [
        id,
        input.agentId,
        input.text,
        input.text.length,
        input.voiceId,
        input.modelId,
        input.outputFormat,
        JSON.stringify(input.voiceSettings || null),
        input.estimatedChars,
        now,
      ],
    );

    return { record: this.toRecord(rows[0]) };
  }

  async get(id: string): Promise<TtsJobRecord | undefined> {
    const rows = await db.query<JobRow>(
      `
        select *
        from speak_tts_jobs
        where id = $1
        limit 1
      `,
      [id],
    );
    return rows[0] ? this.toRecord(rows[0]) : undefined;
  }

  async getExecutionInput(id: string): Promise<JobExecutionInput | null> {
    const rows = await db.query<JobRow>(
      `
        select *
        from speak_tts_jobs
        where id = $1
        limit 1
      `,
      [id],
    );
    const row = rows[0];
    if (!row) return null;

    return {
      id: row.id,
      agentId: row.agent_id,
      text: row.request_text,
      voiceId: row.request_voice_id,
      modelId: row.request_model_id,
      outputFormat: row.request_output_format,
      voiceSettings: row.request_voice_settings || undefined,
      estimatedChars: toInt(row.estimated_chars) || 0,
      reservedChars: toInt(row.reserved_chars) || 0,
    };
  }

  async setRunning(id: string): Promise<boolean> {
    const now = new Date().toISOString();
    const rows = await db.query<{ id: string }>(
      `
        update speak_tts_jobs
        set status = 'running', started_at = $2
        where id = $1 and status = 'queued'
        returning id
      `,
      [id, now],
    );
    return Boolean(rows[0]);
  }

  async setDone(
    id: string,
    done: {
      downloadUrl: string;
      mimeType: string;
      sizeBytes: number;
      sha256: string;
      actualChars: number;
      refundedChars: number;
    },
  ): Promise<void> {
    const now = new Date().toISOString();
    await db.query(
      `
        update speak_tts_jobs
        set
          status = 'done',
          completed_at = $2,
          actual_chars = $3,
          refunded_chars = $4,
          download_url = $5,
          mime_type = $6,
          size_bytes = $7,
          sha256 = $8,
          error_code = null,
          error_message = null
        where id = $1
          and status in ('queued', 'running')
      `,
      [
        id,
        now,
        done.actualChars,
        done.refundedChars,
        done.downloadUrl,
        done.mimeType,
        done.sizeBytes,
        done.sha256,
      ],
    );
  }

  async setFailed(id: string, code: string, message: string): Promise<void> {
    const now = new Date().toISOString();
    await db.query(
      `
        update speak_tts_jobs
        set
          status = 'failed',
          completed_at = $2,
          error_code = $3,
          error_message = $4
        where id = $1
          and status in ('queued', 'running')
      `,
      [id, now, code, message],
    );
  }

  async stats(): Promise<{
    total: number;
    queued: number;
    running: number;
    done: number;
    failed: number;
  }> {
    const [row] = await db.query<{
      total: string;
      queued: string;
      running: string;
      done: string;
      failed: string;
    }>(`
      select
        count(*)::text as total,
        count(*) filter (where status = 'queued')::text as queued,
        count(*) filter (where status = 'running')::text as running,
        count(*) filter (where status = 'done')::text as done,
        count(*) filter (where status = 'failed')::text as failed
      from speak_tts_jobs
    `);

    return {
      total: Number.parseInt(row?.total || '0', 10),
      queued: Number.parseInt(row?.queued || '0', 10),
      running: Number.parseInt(row?.running || '0', 10),
      done: Number.parseInt(row?.done || '0', 10),
      failed: Number.parseInt(row?.failed || '0', 10),
    };
  }
}
