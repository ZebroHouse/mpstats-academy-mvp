// scripts/vision-ingest/select-sprint2c-lessons.ts
// Selects ALL remaining visible 03_ai lessons (no count cap), skipping those that already
// have frame chunks in DB (source_type='academy_video_frame'). Writes
// `results/selected-sprint2c-lessons.json`. Reuses transliteration / video walking /
// lesson resolution from select-pilot-lessons.ts verbatim (copied, not refactored, to keep
// the pilot selector untouched for historical reference).
import { execSync } from 'child_process';
import { readdirSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, relative } from 'path';
import { INGEST_CONFIG } from './config';

interface VideoCandidate {
  localPath: string;
  filename: string;
  durationSeconds: number;
  durationFormatted: string;
  bucketSize: 'short' | 'medium' | 'long';
  module: string;
}

interface SelectedLesson extends VideoCandidate {
  lessonId: string;
  lessonTitle: string;
  platformUrl: string;
  category: 'theory' | 'ui_demo' | 'mpstats_cabinet';
}

const VIDEO_EXT = ['.mp4', '.mov', '.mkv'];

// Latin → Cyrillic transliteration (BGN/PCGN-ish). Multi-letter sequences first.
const TRANSLIT_MULTI: Array<[string, string]> = [
  ['shch', 'щ'], ['sch', 'щ'],
  ['sh', 'ш'], ['ch', 'ч'], ['zh', 'ж'], ['ts', 'ц'],
  ['ya', 'я'], ['yu', 'ю'], ['yo', 'ё'],
  ['kh', 'х'],
];
const VOWELS_LAT = new Set(['a', 'e', 'i', 'o', 'u']);
const TRANSLIT_SINGLE: Record<string, string> = {
  a: 'а', b: 'б', v: 'в', g: 'г', d: 'д', e: 'е', z: 'з', i: 'и',
  k: 'к', l: 'л', m: 'м', n: 'н', o: 'о', p: 'п', r: 'р',
  s: 'с', t: 'т', u: 'у', f: 'ф', h: 'х', c: 'ц', j: 'ж', w: 'в',
  x: 'кс', q: 'к',
  "'": 'ь', '"': 'ъ',
};

function translitToCyrillic(latin: string): string {
  const s = latin.toLowerCase().replace(/_/g, ' ');
  let out = '';
  let i = 0;
  while (i < s.length) {
    let matched = false;
    for (const [pat, rep] of TRANSLIT_MULTI) {
      if (s.startsWith(pat, i)) {
        out += rep;
        i += pat.length;
        matched = true;
        break;
      }
    }
    if (matched) continue;
    const ch = s[i];
    if (ch === 'y') {
      const prev = i > 0 ? s[i - 1] : ' ';
      out += VOWELS_LAT.has(prev) || prev === ' ' ? 'й' : 'ы';
      i++;
      continue;
    }
    out += TRANSLIT_SINGLE[ch] !== undefined ? TRANSLIT_SINGLE[ch] : ch;
    i++;
  }
  return out;
}

function listVideos(courseRoot: string): VideoCandidate[] {
  const out: VideoCandidate[] = [];
  function walk(dir: string) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (VIDEO_EXT.some((e) => entry.name.toLowerCase().endsWith(e))) {
        try {
          const out2 = execSync(
            `ffprobe -v error -show_entries format=duration -of csv=p=0 "${full}"`,
            { encoding: 'utf8' },
          ).trim();
          const seconds = Math.round(parseFloat(out2));
          const rel = relative(courseRoot, full).replace(/\\/g, '/');
          const moduleMatch = rel.match(/^(m\d+_[^/]+)/);
          const module = moduleMatch ? moduleMatch[1] : 'unknown';
          let bucket: 'short' | 'medium' | 'long';
          if (seconds < 900) bucket = 'short';
          else if (seconds < 2400) bucket = 'medium';
          else bucket = 'long';
          out.push({
            localPath: full.replace(/\\/g, '/'),
            filename: entry.name,
            durationSeconds: seconds,
            durationFormatted: `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`,
            bucketSize: bucket,
            module,
          });
        } catch {
          // skip
        }
      }
    }
  }
  walk(join(courseRoot));
  return out;
}

async function supabaseQuery(sql: string): Promise<any[]> {
  const token = process.env.SUPABASE_MGMT_TOKEN;
  const ref = process.env.SUPABASE_PROJECT_REF || 'saecuecevicwjkpmaoot';
  if (!token) throw new Error('SUPABASE_MGMT_TOKEN required');
  const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: sql }),
  });
  if (!res.ok) throw new Error(`Supabase ${res.status}: ${await res.text()}`);
  return res.json();
}

async function resolveLessonId(
  filename: string,
  module: string,
): Promise<{ id: string; title: string } | null> {
  let stem = filename.replace(/\.[^.]+$/, '');
  stem = stem.replace(/^\d+(?:_\d+)?_/, '');
  const cyrillic = translitToCyrillic(stem);
  const words = cyrillic.split(/\s+/).filter((w) => /^[а-яё]+$/i.test(w) && w.length >= 4);
  words.sort((a, b) => b.length - a.length);
  if (words.length === 0) return null;

  const modulePrefix = `03_ai_${module.replace(/'/g, "''")}_%`;

  const attempts: string[][] = [];
  if (words.length >= 2) {
    for (let j = 1; j < Math.min(words.length, 5); j++) {
      attempts.push([words[0], words[j]]);
    }
  }
  for (let k = 0; k < Math.min(words.length, 3); k++) {
    if (words[k].length >= 8) attempts.push([words[k]]);
  }

  for (const picks of attempts) {
    const escaped = picks.map((w) => w.replace(/'/g, "''"));
    const ilikeClauses = escaped.map((w) => `title ILIKE '%${w}%'`).join(' AND ');
    const sql = `
      SELECT id, title FROM "Lesson"
      WHERE id LIKE '${modulePrefix}' AND "isHidden" = false AND ${ilikeClauses}
      ORDER BY "order"
      LIMIT 2;
    `;
    const rows = await supabaseQuery(sql);
    if (rows.length === 1) return { id: rows[0].id, title: rows[0].title };
  }
  return null;
}

async function main() {
  const courseRoot = join(INGEST_CONFIG.academy_courses_root, INGEST_CONFIG.pilot_target_course);
  console.log(`Сканирую видео в ${courseRoot}...`);
  const all = listVideos(courseRoot);
  console.log(`Найдено ${all.length} видео в 03_ai`);

  // Exclusion set: lessons that already have frame chunks in DB
  console.log('Fetching already-ingested lessons from DB...');
  const alreadyIngestedRows = await supabaseQuery(
    `SELECT DISTINCT lesson_id FROM content_chunk WHERE source_type='academy_video_frame';`,
  );
  const excluded = new Set<string>(alreadyIngestedRows.map((r) => r.lesson_id));
  console.log(`Already-ingested lessons: ${excluded.size}`);

  // Module-sorted, then duration-sorted iteration (no round-robin — process all)
  const byModule = new Map<string, VideoCandidate[]>();
  for (const v of all) {
    if (!byModule.has(v.module)) byModule.set(v.module, []);
    byModule.get(v.module)!.push(v);
  }
  const modulesSorted = [...byModule.keys()].sort();
  for (const m of modulesSorted) {
    byModule.get(m)!.sort((a, b) => {
      const rank = (v: VideoCandidate) =>
        v.bucketSize === 'medium' ? 0 : v.bucketSize === 'short' ? 1 : 2;
      return rank(a) - rank(b) || a.durationSeconds - b.durationSeconds;
    });
  }

  const selected: SelectedLesson[] = [];
  const failed: string[] = [];
  let skipped = 0;

  for (const m of modulesSorted) {
    for (const v of byModule.get(m)!) {
      const lesson = await resolveLessonId(v.filename, v.module);
      if (!lesson) {
        failed.push(v.filename);
        console.warn(`  ⚠ ${v.module}/${v.filename} — no match`);
        continue;
      }
      if (excluded.has(lesson.id)) {
        skipped++;
        console.log(`  ⏭ ${v.module}/${v.filename} → ${lesson.id} (already-ingested)`);
        continue;
      }
      const category =
        v.bucketSize === 'short' ? 'theory' :
        v.bucketSize === 'medium' ? 'ui_demo' : 'mpstats_cabinet';
      const resolved: SelectedLesson = {
        ...v,
        category,
        lessonId: lesson.id,
        lessonTitle: lesson.title,
        platformUrl: `https://platform.mpstats.academy/learn/${lesson.id}`,
      };
      selected.push(resolved);
      console.log(`  [${resolved.category}/${resolved.bucketSize}] ${resolved.module}/${resolved.filename} → ${resolved.lessonTitle}`);
    }
  }

  if (!existsSync(INGEST_CONFIG.results_dir)) {
    mkdirSync(INGEST_CONFIG.results_dir, { recursive: true });
  }
  const outPath = join(INGEST_CONFIG.results_dir, 'selected-sprint2c-lessons.json');
  writeFileSync(outPath, JSON.stringify(selected, null, 2), 'utf8');

  console.log(`\nГотово: ${outPath}`);
  console.log(`Selected: ${selected.length}, Skipped (already-ingested): ${skipped}, Failed-to-resolve: ${failed.length}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
