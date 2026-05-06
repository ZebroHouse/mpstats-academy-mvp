// scripts/vision-poc/extract-frames.ts
import { spawnSync } from 'child_process';
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, unlinkSync, renameSync } from 'fs';
import { join } from 'path';
import { POC_CONFIG } from './config';

interface SelectedVideo {
  localPath: string;
  bucket: 'short' | 'medium' | 'long';
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
  selectedForPoC: number;
  frames: FrameMeta[];
}

function ptsToTimecode(pts: number): string {
  const total = Math.round(pts);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, '0')}-${String(s).padStart(2, '0')}`;
}

function runFfmpeg(video: string, outDir: string, intervalSeconds: number): { count: number; ptsList: number[] } {
  const filter = `fps=1/${intervalSeconds},showinfo`;
  // Очистить директорию от предыдущих попыток
  if (existsSync(outDir)) {
    for (const f of readdirSync(outDir)) {
      if (f.endsWith('.jpg')) unlinkSync(join(outDir, f));
    }
  } else {
    mkdirSync(outDir, { recursive: true });
  }
  const result = spawnSync(
    'ffmpeg',
    [
      '-y',
      '-i', video,
      '-vf', filter,
      '-fps_mode', 'vfr',
      '-pix_fmt', 'yuvj420p',
      '-q:v', '3',
      join(outDir, 'tmp_%04d.jpg'),
    ],
    { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 },
  );
  if (result.status !== 0) {
    throw new Error(`ffmpeg failed: ${result.stderr.slice(-500)}`);
  }
  // Парсим pts_time из stderr — строки вида "showinfo @ ... pts_time:NN.NNN"
  const ptsList: number[] = [];
  const re = /pts_time:([\d.]+)/g;
  let m;
  while ((m = re.exec(result.stderr)) !== null) {
    ptsList.push(parseFloat(m[1]));
  }
  const count = readdirSync(outDir).filter((f) => f.startsWith('tmp_') && f.endsWith('.jpg')).length;
  return { count, ptsList };
}

function pickEvenly<T>(arr: T[], n: number): T[] {
  if (arr.length <= n) return arr;
  const step = arr.length / n;
  const result: T[] = [];
  for (let i = 0; i < n; i++) {
    result.push(arr[Math.floor(i * step)]);
  }
  return result;
}

async function processVideo(v: SelectedVideo): Promise<VideoExtraction> {
  const outDir = join(POC_CONFIG.frames_dir, v.lessonId);
  const intervalSeconds = POC_CONFIG.frame_interval_seconds;
  const { ptsList } = runFfmpeg(v.localPath, outDir, intervalSeconds);

  let allFiles = readdirSync(outDir).filter((f) => f.startsWith('tmp_') && f.endsWith('.jpg')).sort();
  let allPts = ptsList.slice(0, allFiles.length);

  // Force-subsample to cap if needed (safety net for very long videos)
  if (allFiles.length > POC_CONFIG.frames_cap_per_video) {
    console.log(`  > cap (${allFiles.length}), force sub-sample до ${POC_CONFIG.frames_cap_per_video}`);
    const keepIdx = new Set(
      pickEvenly(
        Array.from({ length: allFiles.length }, (_, i) => i),
        POC_CONFIG.frames_cap_per_video,
      ),
    );
    for (let i = 0; i < allFiles.length; i++) {
      if (!keepIdx.has(i)) unlinkSync(join(outDir, allFiles[i]));
    }
    allFiles = allFiles.filter((_, i) => keepIdx.has(i));
    allPts = allPts.filter((_, i) => keepIdx.has(i));
  }

  const totalFramesExtracted = allFiles.length;

  // Из всего набора — равномерно min(N, available) для PoC
  const indices = Array.from({ length: allFiles.length }, (_, i) => i);
  const sampledIndices = pickEvenly(
    indices,
    Math.min(POC_CONFIG.frames_for_poc_sample, indices.length),
  );

  // Переименовать выбранные в финальный формат, удалить остальные
  const frames: FrameMeta[] = [];
  const sampledSet = new Set(sampledIndices);
  for (let i = 0; i < allFiles.length; i++) {
    const tmp = allFiles[i];
    const tmpPath = join(outDir, tmp);
    if (sampledSet.has(i)) {
      const seq = frames.length + 1;
      const pts = allPts[i] ?? 0;
      const tc = ptsToTimecode(pts);
      const finalName = `frame_${String(seq).padStart(3, '0')}_${tc}.jpg`;
      const finalPath = join(outDir, finalName);
      renameSync(tmpPath, finalPath);
      frames.push({
        seq,
        timecode: tc.replace('-', ':'),
        pts,
        path: `frames/${v.lessonId}/${finalName}`,
      });
    } else {
      unlinkSync(tmpPath);
    }
  }

  return {
    lessonId: v.lessonId,
    totalFramesExtracted,
    intervalSeconds,
    selectedForPoC: frames.length,
    frames,
  };
}

async function main() {
  const selectedPath = join(POC_CONFIG.results_dir, 'selected-videos.json');
  if (!existsSync(selectedPath)) {
    console.error(`Не найден ${selectedPath}. Сначала запусти select-videos.ts`);
    process.exit(1);
  }
  const videos: SelectedVideo[] = JSON.parse(readFileSync(selectedPath, 'utf8'));
  if (!existsSync(POC_CONFIG.frames_dir)) mkdirSync(POC_CONFIG.frames_dir, { recursive: true });

  const extractions: VideoExtraction[] = [];
  for (const v of videos) {
    if (v.lessonId === 'MANUAL_RESOLVE_REQUIRED') {
      console.warn(`Пропуск ${v.localPath} — lessonId не зарезолвен`);
      continue;
    }
    console.log(`[${v.bucket}] ${v.localPath}`);
    const ext = await processVideo(v);
    console.log(`  итог: ${ext.totalFramesExtracted} extracted, ${ext.selectedForPoC} в выборке, interval=${ext.intervalSeconds}s`);
    extractions.push(ext);
  }

  const manifestPath = join(POC_CONFIG.results_dir, 'frames-manifest.json');
  writeFileSync(manifestPath, JSON.stringify({ videos: extractions }, null, 2), 'utf8');
  console.log(`Готово: ${manifestPath}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
