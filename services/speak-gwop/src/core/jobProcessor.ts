import { config } from '../config.js';
import type { ArtifactStorage } from '../providers/storage/types.js';
import type { TtsProvider } from '../types/tts.js';
import { estimateCharacters } from './charCounter.js';
import type { CreditBalanceStore } from './creditBalanceStore.js';
import type { JobStore } from './jobStore.js';

interface JobProcessorDeps {
  store: JobStore;
  balances: CreditBalanceStore;
  provider: TtsProvider;
  storage: ArtifactStorage;
}

export async function processTtsJobById(
  jobId: string,
  deps: JobProcessorDeps,
): Promise<void> {
  const queuedJob = await deps.store.getExecutionInput(jobId);
  if (!queuedJob) return;

  const acquired = await deps.store.setRunning(jobId);
  if (!acquired) {
    return;
  }

  try {
    const converted = await deps.provider.convert({
      text: queuedJob.text,
      voiceId: queuedJob.voiceId,
      modelId: queuedJob.modelId,
      outputFormat: queuedJob.outputFormat,
      voiceSettings: queuedJob.voiceSettings,
    });

    const artifact = await deps.storage.uploadAudio({
      jobId: queuedJob.id,
      outputFormat: converted.outputFormat,
      audio: converted.audioBuffer,
      mimeType: converted.mimeType,
    });

    const actualChars = converted.providerChars ?? estimateCharacters(queuedJob.text);
    const settlement = await deps.balances.reconcileReserved(
      queuedJob.agentId,
      queuedJob.reservedChars,
      actualChars,
    );

    await deps.store.setDone(jobId, {
      downloadUrl: artifact.downloadUrl,
      mimeType: converted.mimeType,
      sizeBytes: artifact.sizeBytes,
      sha256: artifact.sha256,
      actualChars,
      refundedChars: settlement.refunded_chars,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown provider error';
    try {
      await deps.balances.refundReserved(queuedJob.agentId, queuedJob.reservedChars);
    } catch (refundError) {
      // eslint-disable-next-line no-console
      console.error('[speak-gwop] failed to refund reserved chars', refundError);
    }
    await deps.store.setFailed(jobId, 'PROVIDER_ERROR', message);
  }
}

export function startArtifactCleanupLoop(storage: ArtifactStorage): { stop: () => void } {
  const timer = setInterval(async () => {
    try {
      const deleted = await storage.cleanupExpired(config.audioRetentionHours);
      if (deleted > 0) {
        // eslint-disable-next-line no-console
        console.log(`[speak-gwop] cleaned ${deleted} expired artifacts`);
      }
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('[speak-gwop] artifact cleanup failed', error);
    }
  }, config.artifactCleanupIntervalMs);

  return {
    stop: () => clearInterval(timer),
  };
}
