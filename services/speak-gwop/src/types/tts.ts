export type TtsJobStatus = 'queued' | 'running' | 'done' | 'failed';

export interface TtsVoiceSettings {
  stability?: number;
  similarity_boost?: number;
  style?: number;
  use_speaker_boost?: boolean;
}

export interface TtsJobRequest {
  text: string;
  voice_id?: string;
  model_id?: string;
  output_format?: string;
  voice_settings?: TtsVoiceSettings;
}

export interface TtsProviderConvertRequest {
  text: string;
  voiceId: string;
  modelId: string;
  outputFormat: string;
  voiceSettings?: TtsVoiceSettings;
}

export interface TtsProviderConvertResult {
  audioBuffer: Buffer;
  mimeType: string;
  outputFormat: string;
  providerRequestId?: string;
  providerChars?: number;
}

export interface TtsVoice {
  voice_id: string;
  name: string;
  category?: string;
  labels?: Record<string, string>;
}

export interface TtsProvider {
  readonly name: string;
  convert(input: TtsProviderConvertRequest): Promise<TtsProviderConvertResult>;
  listVoices(): Promise<TtsVoice[]>;
}

export interface TtsJobRecord {
  id: string;
  agent_id: string;
  status: TtsJobStatus;
  created_at: string;
  started_at?: string;
  completed_at?: string;
  request: {
    text: string;
    text_length: number;
    voice_id: string;
    model_id: string;
    output_format: string;
  };
  usage: {
    estimated_chars: number;
    reserved_chars: number;
    actual_chars?: number;
    refunded_chars?: number;
  };
  result?: {
    download_url: string;
    mime_type: string;
    size_bytes: number;
    sha256: string;
  };
  error?: {
    code: string;
    message: string;
  };
}
