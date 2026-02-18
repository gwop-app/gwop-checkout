import { config } from '../../config.js';
import { LocalArtifactStorage } from './local.js';
import { S3ArtifactStorage } from './s3.js';
import type { ArtifactStorage } from './types.js';

export function createArtifactStorage(): ArtifactStorage {
  if (config.storageBackend === 's3') {
    return new S3ArtifactStorage();
  }
  return new LocalArtifactStorage();
}
