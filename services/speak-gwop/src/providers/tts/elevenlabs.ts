import { ElevenLabsClient } from '@elevenlabs/elevenlabs-js';
import type {
  TtsProvider,
  TtsProviderConvertRequest,
  TtsProviderConvertResult,
  TtsVoice,
} from '../../types/tts.js';
import { audioLikeToBuffer } from '../../core/buffer.js';

function mimeFromFormat(format: string): string {
  if (format.startsWith('mp3')) return 'audio/mpeg';
  if (format.startsWith('wav')) return 'audio/wav';
  if (format.startsWith('pcm')) return 'audio/L16';
  return 'application/octet-stream';
}

function toSdkVoiceSettings(input?: TtsProviderConvertRequest['voiceSettings']): Record<string, unknown> | undefined {
  if (!input) return undefined;
  return {
    stability: input.stability,
    similarity_boost: input.similarity_boost,
    style: input.style,
    use_speaker_boost: input.use_speaker_boost,
  };
}

export class ElevenLabsTtsProvider implements TtsProvider {
  readonly name = 'elevenlabs';
  private readonly client: ElevenLabsClient;

  constructor(apiKey: string) {
    this.client = new ElevenLabsClient({ apiKey });
  }

  async convert(input: TtsProviderConvertRequest): Promise<TtsProviderConvertResult> {
    const audioLike = await (this.client as any).textToSpeech.convert(input.voiceId, {
      text: input.text,
      model_id: input.modelId,
      output_format: input.outputFormat,
      voice_settings: toSdkVoiceSettings(input.voiceSettings),
    });

    const audioBuffer = await audioLikeToBuffer(audioLike);

    return {
      audioBuffer,
      mimeType: mimeFromFormat(input.outputFormat),
      outputFormat: input.outputFormat,
      providerChars: input.text.length,
    };
  }

  async listVoices(): Promise<TtsVoice[]> {
    const response = await (this.client as any).voices.search();
    const voices = Array.isArray(response?.voices) ? response.voices : [];

    return voices.map((voice: any) => ({
      voice_id: String(voice.voice_id ?? voice.voiceId ?? ''),
      name: String(voice.name ?? 'unknown'),
      category: voice.category ? String(voice.category) : undefined,
      labels: voice.labels && typeof voice.labels === 'object' ? voice.labels : undefined,
    })).filter((voice: TtsVoice) => voice.voice_id.length > 0);
  }
}
