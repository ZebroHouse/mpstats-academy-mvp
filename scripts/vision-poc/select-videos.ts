// scripts/vision-poc/select-videos.ts
import { execSync } from 'child_process';
import { readdirSync, statSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, relative } from 'path';
import { POC_CONFIG } from './config';

interface VideoFile {
  localPath: string;
  courseDir: string;
  filename: string;
  durationSeconds: number;
  durationFormatted: string;
}

interface SelectedVideo extends VideoFile {
  bucket: 'short' | 'medium' | 'long';
  courseSlug: string;
  courseTitle: string;
  lessonId: string;
  lessonTitle: string;
  platformUrl: string;
}

const VIDEO_EXT = ['.mp4', '.mov', '.mkv', '.webm'];

function findVideos(root: string): VideoFile[] {
  const result: VideoFile[] = [];
  function walk(dir: string) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (VIDEO_EXT.some((ext) => entry.name.toLowerCase().endsWith(ext))) {
        try {
          const out = execSync(
            `ffprobe -v error -show_entries format=duration -of csv=p=0 "${full}"`,
            { encoding: 'utf8' },
          ).trim();
          const seconds = Math.round(parseFloat(out));
          if (!isNaN(seconds) && seconds > 0) {
            const courseDir = relative(root, full).split(/[/\\]/)[0];
            result.push({
              localPath: full.replace(/\\/g, '/'),
              courseDir,
              filename: entry.name,
              durationSeconds: seconds,
              durationFormatted: `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`,
            });
          }
        } catch {
          // skip unreadable
        }
      }
    }
  }
  walk(root);
  return result;
}

function bucketize(v: VideoFile): 'short' | 'medium' | 'long' | null {
  const s = v.durationSeconds;
  const b = POC_CONFIG.duration_buckets;
  if (s >= b.short[0] && s <= b.short[1]) return 'short';
  if (s >= b.medium[0] && s <= b.medium[1]) return 'medium';
  if (s >= b.long[0] && s <= b.long[1]) return 'long';
  return null;
}

async function supabaseQuery(sql: string): Promise<any[]> {
  const token = process.env.SUPABASE_MGMT_TOKEN;
  const ref = process.env.SUPABASE_PROJECT_REF;
  if (!token || !ref) throw new Error('SUPABASE_MGMT_TOKEN and SUPABASE_PROJECT_REF required');
  const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: sql }),
  });
  if (!res.ok) throw new Error(`Supabase ${res.status}: ${await res.text()}`);
  return res.json();
}

function escapeSqlLike(s: string): string {
  return s.replace(/'/g, "''").replace(/[%_]/g, (m) => `\\${m}`);
}

async function resolveLessonId(v: VideoFile): Promise<{ lessonId: string; lessonTitle: string; courseSlug: string; courseTitle: string } | null> {
  // Берём первые 4 значащих слова из имени файла как fuzzy fragment
  const base = v.filename.replace(/\.[^.]+$/, '');
  const words = base
    .replace(/[_\-\d]+/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 4)
    .slice(0, 3);
  if (words.length === 0) return null;
  const fragment = escapeSqlLike(words.join(' '));
  const sql = `SELECT l.id, l.title, c.slug as course_slug, c.title as course_title
               FROM "Lesson" l
               JOIN "Course" c ON c.id = l."courseId"
               WHERE l.title ILIKE '%${fragment}%'
               LIMIT 1;`;
  const rows = await supabaseQuery(sql);
  if (rows.length === 0) return null;
  return {
    lessonId: rows[0].id,
    lessonTitle: rows[0].title,
    courseSlug: rows[0].course_slug,
    courseTitle: rows[0].course_title,
  };
}

async function main() {
  console.log('[1/4] Сканирую E:/Academy Courses на видео...');
  const all = findVideos(POC_CONFIG.academy_courses_root);
  console.log(`Найдено ${all.length} видео.`);

  const buckets: Record<'short' | 'medium' | 'long', VideoFile[]> = { short: [], medium: [], long: [] };
  for (const v of all) {
    const b = bucketize(v);
    if (b) buckets[b].push(v);
  }
  console.log(`Распределение: short=${buckets.short.length} / medium=${buckets.medium.length} / long=${buckets.long.length}`);

  console.log('[2/4] Выбираю по одному из каждого бакета (приоритет курсов)...');
  const selected: SelectedVideo[] = [];
  for (const bucket of ['short', 'medium', 'long'] as const) {
    let pick: VideoFile | undefined;
    for (const courseDir of POC_CONFIG.course_priority) {
      pick = buckets[bucket].find((v) => v.courseDir === courseDir);
      if (pick) break;
    }
    if (!pick) pick = buckets[bucket][0];
    if (!pick) {
      console.warn(`Нет видео в бакете ${bucket} — пропускаю.`);
      continue;
    }
    console.log(`[${bucket}] ${pick.courseDir}/${pick.filename} (${pick.durationFormatted})`);

    console.log(`  Резолвлю lessonId...`);
    const lesson = await resolveLessonId(pick);
    if (!lesson) {
      console.warn(`  fuzzy match не сработал — заполни lessonId вручную в JSON после прогона`);
      selected.push({
        ...pick,
        bucket,
        courseSlug: 'UNKNOWN',
        courseTitle: 'UNKNOWN',
        lessonId: 'MANUAL_RESOLVE_REQUIRED',
        lessonTitle: 'MANUAL_RESOLVE_REQUIRED',
        platformUrl: 'MANUAL_RESOLVE_REQUIRED',
      });
      continue;
    }
    selected.push({
      ...pick,
      bucket,
      courseSlug: lesson.courseSlug,
      courseTitle: lesson.courseTitle,
      lessonId: lesson.lessonId,
      lessonTitle: lesson.lessonTitle,
      platformUrl: `https://platform.mpstats.academy/learn/${lesson.courseSlug}/${lesson.lessonId}`,
    });
    console.log(`  → ${lesson.lessonTitle}`);
  }

  console.log('[3/4] Сохраняю результат...');
  if (!existsSync(POC_CONFIG.results_dir)) mkdirSync(POC_CONFIG.results_dir, { recursive: true });
  const outPath = join(POC_CONFIG.results_dir, 'selected-videos.json');
  writeFileSync(outPath, JSON.stringify(selected, null, 2), 'utf8');
  console.log(`[4/4] Готово: ${outPath}`);
  console.log(`Видео выбрано: ${selected.length}/3`);
  if (selected.some((s) => s.lessonId === 'MANUAL_RESOLVE_REQUIRED')) {
    console.warn('⚠ Требуется ручной резолв lessonId для записей помеченных MANUAL_RESOLVE_REQUIRED');
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
