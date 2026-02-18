export const TTS_QUEUE_NAME = 'speak-tts-jobs';

export interface TtsQueuePayload {
  jobId: string;
}
