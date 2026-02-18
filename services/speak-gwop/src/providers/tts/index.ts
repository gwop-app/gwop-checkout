import { config } from '../../config.js';
import type { TtsProvider } from '../../types/tts.js';
import { ElevenLabsTtsProvider } from './elevenlabs.js';
import { MockTtsProvider } from './mock.js';

export function createTtsProvider(): TtsProvider {
  if (config.provider === 'elevenlabs') {
    return new ElevenLabsTtsProvider(config.elevenlabsApiKey);
  }

  return new MockTtsProvider();
}
