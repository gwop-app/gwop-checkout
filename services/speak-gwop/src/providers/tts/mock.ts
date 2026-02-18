import { randomBytes } from 'crypto';
import type {
  TtsProvider,
  TtsProviderConvertRequest,
  TtsProviderConvertResult,
  TtsVoice,
} from '../../types/tts.js';

function buildFakeWav(text: string): Buffer {
  const seed = `${Date.now()}-${text.length}-${randomBytes(8).toString('hex')}`;
  return Buffer.from(`FAKE_WAV_DATA::${seed}::${text.slice(0, 120)}`, 'utf8');
}

const MOCK_VOICES: TtsVoice[] = [
  { voice_id: 'mock-neutral', name: 'Mock Neutral' },
  { voice_id: 'mock-energetic', name: 'Mock Energetic' },
  { voice_id: 'mock-calm', name: 'Mock Calm' },
];

export class MockTtsProvider implements TtsProvider {
  readonly name = 'mock';

  async convert(input: TtsProviderConvertRequest): Promise<TtsProviderConvertResult> {
    const simulatedLatency = Math.min(2000, 300 + input.text.length * 2);
    await new Promise((resolve) => setTimeout(resolve, simulatedLatency));

    const audioBuffer = buildFakeWav(input.text);

    return {
      audioBuffer,
      mimeType: 'audio/wav',
      outputFormat: 'wav_mock',
      providerChars: input.text.length,
    };
  }

  async listVoices(): Promise<TtsVoice[]> {
    return MOCK_VOICES;
  }
}
