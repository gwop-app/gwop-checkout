import { config } from '../../config.js';
import { cleanupOldArtifacts, writeArtifact } from '../../core/artifacts.js';
import type { ArtifactStorage } from './types.js';

export class LocalArtifactStorage implements ArtifactStorage {
  readonly name = 'local';

  async uploadAudio(request: {
    jobId: string;
    outputFormat: string;
    audio: Buffer;
    mimeType: string;
  }): Promise<{ downloadUrl: string; sizeBytes: number; sha256: string }> {
    const artifact = await writeArtifact({
      directory: config.artifactsDir,
      jobId: request.jobId,
      outputFormat: request.outputFormat,
      audio: request.audio,
    });

    return {
      downloadUrl: `${config.publicBaseUrl}/artifacts/${artifact.fileName}`,
      sizeBytes: artifact.sizeBytes,
      sha256: artifact.sha256,
    };
  }

  async cleanupExpired(retentionHours: number): Promise<number> {
    return cleanupOldArtifacts(config.artifactsDir, retentionHours);
  }
}
