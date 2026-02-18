import { createHash } from 'crypto';
import { mkdir, readdir, rm, stat, writeFile } from 'fs/promises';
import { join } from 'path';

export function sha256Hex(input: Buffer): string {
  return createHash('sha256').update(input).digest('hex');
}

export function extensionForFormat(format: string): string {
  if (format.startsWith('mp3')) return 'mp3';
  if (format.startsWith('wav')) return 'wav';
  if (format.startsWith('pcm')) return 'pcm';
  if (format.startsWith('wav_mock')) return 'wav';
  return 'bin';
}

export async function writeArtifact(params: {
  directory: string;
  jobId: string;
  outputFormat: string;
  audio: Buffer;
}): Promise<{ fileName: string; fullPath: string; sizeBytes: number; sha256: string }> {
  await mkdir(params.directory, { recursive: true });

  const ext = extensionForFormat(params.outputFormat);
  const fileName = `${params.jobId}.${ext}`;
  const fullPath = join(params.directory, fileName);
  await writeFile(fullPath, params.audio);

  return {
    fileName,
    fullPath,
    sizeBytes: params.audio.byteLength,
    sha256: sha256Hex(params.audio),
  };
}

export async function cleanupOldArtifacts(directory: string, retentionHours: number): Promise<number> {
  await mkdir(directory, { recursive: true });
  const files = await readdir(directory);
  const cutoffMs = Date.now() - retentionHours * 60 * 60 * 1000;
  let deleted = 0;

  for (const file of files) {
    const fullPath = join(directory, file);
    const fileStat = await stat(fullPath);
    if (fileStat.mtimeMs < cutoffMs) {
      await rm(fullPath, { force: true });
      deleted += 1;
    }
  }

  return deleted;
}
