// scripts/vision-ingest/extract-frames-prod.ts
import { execSync, spawnSync } from 'child_process';
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, unlinkSync, renameSync } from 'fs';
import { join } from 'path';
import { INGEST_CONFIG } from './config';

interface SelectedLesson {
  localPath: string;
  lessonId: string;
  durationSeconds: number;
}

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

function ptsToTimecode(pts: number): string {
  const total = Math.round(pts);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, '0')}-${String(s).padStart(2, '0')}`;
}

function pickEvenly<T>(arr: T[], n: number): T[] {
  if (arr.length <= n) return arr;
  const step = arr.length / n;
  const result: T[] = [];
  for (let i = 0; i < n; i++) result.push(arr[Math.floor(i * step)]);
  return result;
}

function extractForVideo(v: SelectedLesson): VideoExtraction {
  const outDir = join(INGEST_CONFIG.frames_dir, v.lessonId);
  if (existsSync(outDir)) {
    for (const f of readdirSync(outDir)) {
      if (f.endsWith('.jpg')) unlinkSync(join(outDir, f));
    }
  } else {
    mkdirSync(outDir, { recursive: true });
  }

  const interval = INGEST_CONFIG.frame_interval_seconds;
  const filter = `fps=1/${interval},showinfo`;
  const result = spawnSync('ffmpeg', [
    '-y', '-i', v.localPath,
    '-vf', filter,
    '-fps_mode', 'vfr',
    '-pix_fmt', 'yuvj420p',
    '-q:v', '3',
    join(outDir, 'tmp_%04d.jpg'),
  ], { encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`ffmpeg failed: ${result.stderr.slice(-300)}`);

  const ptsList: number[] = [];
  const re = /pts_time:([\d.]+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(result.stderr)) !== null) ptsList.push(parseFloat(m[1]));

  let allFiles = readdirSync(outDir).filter((f) => f.startsWith('tmp_')).sort();
  let allPts = ptsList.slice(0, allFiles.length);

  if (allFiles.length > INGEST_CONFIG.frames_cap_per_video) {
    console.log(`  cap превышен (${allFiles.length}), force sub-sample до ${INGEST_CONFIG.frames_cap_per_video}`);
    const keepIdx = new Set(pickEvenly(Array.from({ length: allFiles.length }, (_, i) => i), INGEST_CONFIG.frames_cap_per_video));
    for (let i = 0; i < allFiles.length; i++) {
      if (!keepIdx.has(i)) unlinkSync(join(outDir, allFiles[i]));
    }
    allFiles = allFiles.filter((_, i) => keepIdx.has(i));
    allPts = allPts.filter((_, i) => keepIdx.has(i));
  }

  const frames: FrameMeta[] = [];
  for (let i = 0; i < allFiles.length; i++) {
    const seq = i + 1;
    const pts = allPts[i] ?? 0;
    const tc = ptsToTimecode(pts);
    const finalName = `frame_${String(seq).padStart(3, '0')}_${tc}.jpg`;
    renameSync(join(outDir, allFiles[i]), join(outDir, finalName));
    frames.push({
      seq, timecode: tc.replace('-', ':'), pts,
      path: `frames/${v.lessonId}/${finalName}`,
    });
  }

  return {
    lessonId: v.lessonId,
    totalFramesExtracted: frames.length,
    intervalSeconds: interval,
    frames,
  };
}

async function main() {
  const SUFFIX = process.env.INGEST_SUFFIX?.trim() || '';
  const selectedFile = SUFFIX ? `selected-${SUFFIX}-lessons.json` : 'selected-pilot-lessons.json';
  const manifestFile = SUFFIX ? `frames-manifest-${SUFFIX}.json` : 'frames-manifest.json';

  const selectedPath = join(INGEST_CONFIG.results_dir, selectedFile);
  if (!existsSync(selectedPath)) {
    console.error(`Run selector first (missing ${selectedFile})`);
    process.exit(1);
  }
  const lessons: SelectedLesson[] = JSON.parse(readFileSync(selectedPath, 'utf8'));
  if (!existsSync(INGEST_CONFIG.frames_dir)) mkdirSync(INGEST_CONFIG.frames_dir, { recursive: true });

  const extractions: VideoExtraction[] = [];
  for (const v of lessons) {
    console.log(`[${v.lessonId}] ${v.localPath}`);
    const ext = extractForVideo(v);
    console.log(`  → ${ext.totalFramesExtracted} frames extracted at ${ext.intervalSeconds}s interval`);
    extractions.push(ext);
  }

  writeFileSync(
    join(INGEST_CONFIG.results_dir, manifestFile),
    JSON.stringify({ videos: extractions }, null, 2),
    'utf8',
  );
  console.log(`\nГотово: ${manifestFile} (${extractions.length} videos, ${extractions.reduce((a, b) => a + b.totalFramesExtracted, 0)} total frames)`);
}

main().catch((e) => { console.error(e); process.exit(1); });
