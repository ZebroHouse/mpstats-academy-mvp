// scripts/vision-ingest/dedup-frames.ts
import sharp from 'sharp';
import { readFileSync, writeFileSync, unlinkSync, existsSync } from 'fs';
import { join } from 'path';
import { INGEST_CONFIG } from './config';

interface FrameMeta {
  seq: number;
  timecode: string;
  pts: number;
  path: string;
}
interface VideoExtraction {
  lessonId: string;
  totalFramesExtracted: number;
  intervalSeconds: number;
  frames: FrameMeta[];
}

async function dhash(imagePath: string): Promise<bigint> {
  const buf = await sharp(imagePath)
    .greyscale()
    .resize(9, 8, { fit: 'fill' })
    .raw()
    .toBuffer();
  let hash = 0n;
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      const left = buf[row * 9 + col];
      const right = buf[row * 9 + col + 1];
      hash <<= 1n;
      if (left > right) hash |= 1n;
    }
  }
  return hash;
}

function hammingDistance(a: bigint, b: bigint): number {
  let xor = a ^ b;
  let count = 0;
  while (xor !== 0n) {
    count += Number(xor & 1n);
    xor >>= 1n;
  }
  return count;
}

async function main() {
  const SUFFIX = process.env.INGEST_SUFFIX?.trim() || '';
  const manifestFile = SUFFIX ? `frames-manifest-${SUFFIX}.json` : 'frames-manifest.json';
  const manifestPath = join(INGEST_CONFIG.results_dir, manifestFile);
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as { videos: VideoExtraction[] };

  let totalBefore = 0, totalAfter = 0;
  for (const video of manifest.videos) {
    totalBefore += video.frames.length;
    const hashes: bigint[] = [];
    for (const f of video.frames) {
      const h = await dhash(join(INGEST_CONFIG.results_dir, f.path));
      hashes.push(h);
    }
    const kept: FrameMeta[] = [];
    const keptHashes: bigint[] = [];
    for (let i = 0; i < video.frames.length; i++) {
      if (kept.length === 0) {
        kept.push(video.frames[i]);
        keptHashes.push(hashes[i]);
        continue;
      }
      const lastKept = keptHashes[keptHashes.length - 1];
      const dist = hammingDistance(hashes[i], lastKept);
      if (dist > INGEST_CONFIG.phash_hamming_threshold) {
        kept.push(video.frames[i]);
        keptHashes.push(hashes[i]);
      } else {
        const filePath = join(INGEST_CONFIG.results_dir, video.frames[i].path);
        if (existsSync(filePath)) unlinkSync(filePath);
      }
    }
    console.log(`[${video.lessonId}] ${video.frames.length} → ${kept.length} frames after dedup`);
    video.frames = kept;
    video.totalFramesExtracted = kept.length;
    totalAfter += kept.length;
  }

  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');
  console.log(`\nDedup complete: ${totalBefore} → ${totalAfter} (${((1 - totalAfter / totalBefore) * 100).toFixed(1)}% removed)`);
}

main().catch((e) => { console.error(e); process.exit(1); });
