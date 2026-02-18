import { Queue } from 'bullmq';
import { createRedisConnectionOptions } from './connection.js';
import { TTS_QUEUE_NAME, type TtsQueuePayload } from './constants.js';

export class TtsQueue {
  private readonly queue: Queue<TtsQueuePayload, void, string>;

  constructor() {
    this.queue = new Queue<TtsQueuePayload, void, string>(TTS_QUEUE_NAME, {
      connection: createRedisConnectionOptions('api'),
      defaultJobOptions: {
        attempts: 1,
        removeOnComplete: { age: 3600, count: 2000 },
        removeOnFail: { age: 24 * 3600, count: 5000 },
      },
    });
  }

  async enqueue(jobId: string): Promise<void> {
    await this.queue.add(jobId, { jobId }, { jobId });
  }

  async ping(): Promise<string> {
    const client = await this.queue.client;
    return client.ping();
  }

  async close(): Promise<void> {
    await this.queue.close();
  }
}
