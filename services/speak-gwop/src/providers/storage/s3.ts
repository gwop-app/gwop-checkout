import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { config } from '../../config.js';
import { extensionForFormat, sha256Hex } from '../../core/artifacts.js';
import type { ArtifactStorage } from './types.js';

function normalizePrefix(prefix: string): string {
  return prefix.replace(/^\/+|\/+$/g, '');
}

function buildObjectKey(jobId: string, outputFormat: string): string {
  const ext = extensionForFormat(outputFormat);
  const dateFolder = new Date().toISOString().slice(0, 10);
  const prefix = normalizePrefix(config.s3KeyPrefix);
  return prefix ? `${prefix}/${dateFolder}/${jobId}.${ext}` : `${dateFolder}/${jobId}.${ext}`;
}

export class S3ArtifactStorage implements ArtifactStorage {
  readonly name = 's3';
  private readonly client: S3Client;

  constructor() {
    this.client = new S3Client({
      endpoint: config.s3Endpoint,
      region: config.s3Region,
      forcePathStyle: config.s3ForcePathStyle,
      credentials: {
        accessKeyId: config.s3AccessKeyId,
        secretAccessKey: config.s3SecretAccessKey,
      },
    });
  }

  async uploadAudio(request: {
    jobId: string;
    outputFormat: string;
    audio: Buffer;
    mimeType: string;
  }): Promise<{ downloadUrl: string; sizeBytes: number; sha256: string }> {
    const key = buildObjectKey(request.jobId, request.outputFormat);
    const sha256 = sha256Hex(request.audio);

    await this.client.send(
      new PutObjectCommand({
        Bucket: config.s3Bucket,
        Key: key,
        Body: request.audio,
        ContentType: request.mimeType,
        Metadata: { sha256 },
      }),
    );

    const downloadUrl = await getSignedUrl(
      this.client,
      new GetObjectCommand({
        Bucket: config.s3Bucket,
        Key: key,
      }),
      { expiresIn: config.s3SignedUrlTtlSeconds },
    );

    return {
      downloadUrl,
      sizeBytes: request.audio.byteLength,
      sha256,
    };
  }

  async cleanupExpired(_retentionHours: number): Promise<number> {
    // Lifecycle cleanup should be managed by bucket lifecycle rules in S3-compatible storage.
    return 0;
  }
}
