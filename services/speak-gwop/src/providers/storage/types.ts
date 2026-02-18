export interface UploadArtifactRequest {
  jobId: string;
  outputFormat: string;
  audio: Buffer;
  mimeType: string;
}

export interface UploadArtifactResult {
  downloadUrl: string;
  sizeBytes: number;
  sha256: string;
}

export interface ArtifactStorage {
  readonly name: string;
  uploadAudio(request: UploadArtifactRequest): Promise<UploadArtifactResult>;
  cleanupExpired(retentionHours: number): Promise<number>;
}
