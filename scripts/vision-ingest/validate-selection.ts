// scripts/vision-ingest/validate-selection.ts
// Pre-flight validator for vision-RAG selection JSON.
// Usage:
//   INGEST_SUFFIX=sprint2c SUPABASE_MGMT_TOKEN=... pnpm tsx scripts/vision-ingest/validate-selection.ts [--no-strict]
import { readFileSync, statSync } from 'fs';

interface Selected {
  localPath: string;
  filename: string;
  durationSeconds: number;
  durationFormatted: string;
  bucketSize: string;
  module: string;
  category: string;
  lessonId: string;
  lessonTitle: string;
  platformUrl: string;
}

interface Issue {
  check: number;
  severity: 'FAIL' | 'WARN';
  message: string;
  details?: string[];
}

const REQUIRED_KEYS: Array<keyof Selected> = [
  'localPath', 'filename', 'durationSeconds', 'durationFormatted', 'bucketSize',
  'module', 'category', 'lessonId', 'lessonTitle', 'platformUrl',
];

// LessonId format: <course>_<module>_<NNN>, e.g. 03_ai_m01_intro_003 or 04_workshops_w01_feb_ads_001.
// Course prefix can contain digits+underscore (e.g. "03_ai"). Module is `<letter>\d+_<slug>`
// where letter ∈ {m, w, c, ...} — m=module, w=workshop, c=express-course-block.
const LESSON_ID_RE = /^(.+?)_([a-z]\d+_[a-z0-9_]+?)_\d+$/;

const issues: Issue[] = [];
function add(check: number, severity: 'FAIL' | 'WARN', message: string, details?: string[]) {
  issues.push({ check, severity, message, details });
}

// ---------- Supabase helper (copied from select-sprint2c-lessons.ts) ----------
async function supabaseQuery(sql: string, attempt = 1): Promise<any[]> {
  const token = process.env.SUPABASE_MGMT_TOKEN;
  const ref = process.env.SUPABASE_PROJECT_REF || 'saecuecevicwjkpmaoot';
  if (!token) throw new Error('SUPABASE_MGMT_TOKEN required');
  try {
    const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: sql }),
    });
    if (!res.ok) {
      const body = await res.text();
      if ((res.status === 429 || res.status >= 500) && attempt < 5) {
        await new Promise((r) => setTimeout(r, 500 * 2 ** (attempt - 1)));
        return supabaseQuery(sql, attempt + 1);
      }
      throw new Error(`Supabase ${res.status}: ${body}`);
    }
    return res.json();
  } catch (e: any) {
    const transient = /fetch failed|socket|ECONN|UND_ERR/i.test(String(e?.message) + String(e?.cause?.code));
    if (transient && attempt < 5) {
      await new Promise((r) => setTimeout(r, 500 * 2 ** (attempt - 1)));
      return supabaseQuery(sql, attempt + 1);
    }
    throw e;
  }
}

// ---------- Translit (copied from select-sprint2c-lessons.ts) ----------
const TRANSLIT_MULTI: Array<[string, string]> = [
  ['shch', 'щ'], ['sch', 'щ'], ['sh', 'ш'], ['ch', 'ч'], ['zh', 'ж'],
  ['ts', 'ц'], ['ya', 'я'], ['yu', 'ю'], ['yo', 'ё'], ['kh', 'х'],
];
const VOWELS_LAT = new Set(['a', 'e', 'i', 'o', 'u']);
const TRANSLIT_SINGLE: Record<string, string> = {
  a: 'а', b: 'б', v: 'в', g: 'г', d: 'д', e: 'е', z: 'з', i: 'и',
  k: 'к', l: 'л', m: 'м', n: 'н', o: 'о', p: 'п', r: 'р',
  s: 'с', t: 'т', u: 'у', f: 'ф', h: 'х', c: 'ц', j: 'ж', w: 'в',
  x: 'кс', q: 'к', "'": 'ь', '"': 'ъ',
};
function translitToCyrillic(latin: string): string {
  const s = latin.toLowerCase().replace(/_/g, ' ');
  let out = '';
  let i = 0;
  while (i < s.length) {
    let matched = false;
    for (const [pat, rep] of TRANSLIT_MULTI) {
      if (s.startsWith(pat, i)) { out += rep; i += pat.length; matched = true; break; }
    }
    if (matched) continue;
    const ch = s[i];
    if (ch === 'y') {
      const prev = i > 0 ? s[i - 1] : ' ';
      out += VOWELS_LAT.has(prev) || prev === ' ' ? 'й' : 'ы';
      i++; continue;
    }
    out += TRANSLIT_SINGLE[ch] !== undefined ? TRANSLIT_SINGLE[ch] : ch;
    i++;
  }
  return out;
}

// ---------- Pretty progress ----------
function logCheck(n: number, name: string, status: 'OK' | 'FAIL' | 'WARN', extra?: string) {
  const icon = status === 'OK' ? '✓' : status === 'FAIL' ? '✗' : '⚠';
  const tail = extra ? ` — ${extra}` : '';
  console.log(`[${n}/9] ${name} ... ${icon} ${status}${tail}`);
}

// ---------- Helpers ----------
function inferCoursePrefix(lessonId: string): string | null {
  const m = lessonId.match(LESSON_ID_RE);
  return m ? m[1] : null;
}
function inferModuleSlug(lessonId: string): string | null {
  // Return the INNERMOST module — matches selector's `module` field convention.
  // Nested ids (06_express_c01_ai_content_m01_content_001) have an outer
  // c-block + inner m-block; selector writes only the inner one.
  const m = lessonId.match(/^(.+)_\d+$/);
  if (!m) return null;
  const body = m[1];
  const tokens = [...body.matchAll(/[a-z]\d+_/g)];
  if (tokens.length === 0) return null;
  const last = tokens[tokens.length - 1];
  return body.slice(last.index);
}

// ---------- Checks ----------
function check1Schema(sel: Selected[]) {
  const bad: string[] = [];
  sel.forEach((entry, idx) => {
    for (const k of REQUIRED_KEYS) {
      if (!(k in entry) || (entry as any)[k] === undefined || (entry as any)[k] === null) {
        bad.push(`entry[${idx}] (${(entry as any).filename ?? '?'}) missing key: ${k}`);
      }
    }
  });
  if (bad.length) {
    add(1, 'FAIL', `Schema: ${bad.length} missing-key issues`, bad);
    logCheck(1, 'Schema', 'FAIL', `${bad.length} issues`);
  } else {
    logCheck(1, 'Schema', 'OK');
  }
}

function check2Dupes(sel: Selected[]) {
  const seen = new Map<string, number>();
  for (const e of sel) seen.set(e.lessonId, (seen.get(e.lessonId) ?? 0) + 1);
  const dupes = [...seen.entries()].filter(([, c]) => c > 1).map(([id, c]) => `${id} (x${c})`);
  if (dupes.length) {
    add(2, 'FAIL', `Duplicate lessonIds: ${dupes.length}`, dupes);
    logCheck(2, 'Duplicates', 'FAIL', `${dupes.length} dupes`);
  } else {
    logCheck(2, 'Duplicates', 'OK');
  }
}

async function check3ScopeMatch(sel: Selected[]) {
  // Infer course prefixes
  const coursePrefixes = new Set<string>();
  for (const e of sel) {
    const p = inferCoursePrefix(e.lessonId);
    if (p) coursePrefixes.add(p);
  }
  if (coursePrefixes.size === 0) {
    add(3, 'FAIL', 'Scope: could not infer any course prefix from selection');
    logCheck(3, 'Scope match', 'FAIL', 'no course prefix');
    return;
  }
  const dbIds = new Set<string>();
  for (const course of coursePrefixes) {
    const safe = course.replace(/'/g, "''");
    const sql = `
      SELECT id FROM "Lesson" l
      WHERE id LIKE '${safe}_%' AND l."isHidden" = false
      AND NOT EXISTS (
        SELECT 1 FROM content_chunk c
        WHERE c.lesson_id = l.id AND c.source_type='academy_video_frame'
      );`;
    const rows = await supabaseQuery(sql);
    for (const r of rows) dbIds.add(r.id);
  }
  const selIds = new Set(sel.map((e) => e.lessonId));
  const extras = [...selIds].filter((id) => !dbIds.has(id));
  const missing = [...dbIds].filter((id) => !selIds.has(id));
  if (extras.length || missing.length) {
    const details: string[] = [];
    if (extras.length) details.push(`extras (in selection, not DB) [${extras.length}]: ${extras.join(', ')}`);
    if (missing.length) details.push(`missing (in DB, not selection) [${missing.length}]: ${missing.join(', ')}`);
    add(3, 'FAIL', `Scope mismatch (selected=${selIds.size}, db=${dbIds.size})`, details);
    logCheck(3, 'Scope match', 'FAIL', `extras=${extras.length} missing=${missing.length}`);
  } else {
    logCheck(3, 'Scope match', 'OK', `${selIds.size} == ${dbIds.size}`);
  }
}

function check4LocalFiles(sel: Selected[]) {
  const missing: string[] = [];
  for (const e of sel) {
    try {
      statSync(e.localPath);
    } catch {
      missing.push(`${e.lessonId}: ${e.localPath}`);
    }
  }
  if (missing.length) {
    add(4, 'FAIL', `Missing local files: ${missing.length}`, missing);
    logCheck(4, 'Local file existence', 'FAIL', `${missing.length} missing`);
  } else {
    logCheck(4, 'Local file existence', 'OK');
  }
}

function check5ModuleConsistency(sel: Selected[]) {
  const bad: string[] = [];
  for (const e of sel) {
    const parsed = inferModuleSlug(e.lessonId);
    if (!parsed) {
      bad.push(`${e.lessonId}: cannot parse module from lessonId`);
      continue;
    }
    if (parsed !== e.module) {
      bad.push(`${e.lessonId}: module field='${e.module}' but lessonId implies '${parsed}'`);
    }
  }
  if (bad.length) {
    add(5, 'FAIL', `Module-name inconsistency: ${bad.length}`, bad);
    logCheck(5, 'Module consistency', 'FAIL', `${bad.length} mismatches`);
  } else {
    logCheck(5, 'Module consistency', 'OK');
  }
}

async function check6AlreadyIngested(sel: Selected[]) {
  const rows = await supabaseQuery(
    `SELECT DISTINCT lesson_id FROM content_chunk WHERE source_type='academy_video_frame';`,
  );
  const ingested = new Set<string>(rows.map((r) => r.lesson_id));
  const overlap = sel.filter((e) => ingested.has(e.lessonId)).map((e) => e.lessonId);
  if (overlap.length) {
    add(6, 'FAIL', `Already-ingested lessons in selection: ${overlap.length}`, overlap);
    logCheck(6, 'Already-ingested guard', 'FAIL', `${overlap.length} overlap`);
  } else {
    logCheck(6, 'Already-ingested guard', 'OK');
  }
}

function check7Duration(sel: Selected[]) {
  const out = sel.filter((e) => e.durationSeconds < 30 || e.durationSeconds > 7200);
  if (out.length) {
    add(7, 'WARN', `Duration out of [30, 7200]s: ${out.length}`,
      out.map((e) => `${e.lessonId} ${e.durationSeconds}s (${e.durationFormatted})`));
    logCheck(7, 'Duration sanity', 'WARN', `${out.length} outliers`);
  } else {
    logCheck(7, 'Duration sanity', 'OK');
  }
}

async function check8PerModule(sel: Selected[]) {
  const selByMod = new Map<string, number>();
  const courseByMod = new Map<string, string>();
  for (const e of sel) {
    selByMod.set(e.module, (selByMod.get(e.module) ?? 0) + 1);
    const c = inferCoursePrefix(e.lessonId);
    if (c) courseByMod.set(e.module, c);
  }
  const deltas: string[] = [];
  for (const [mod, selCount] of selByMod) {
    const course = courseByMod.get(mod);
    if (!course) {
      deltas.push(`${mod}: no course prefix`);
      continue;
    }
    const safeCourse = course.replace(/'/g, "''");
    const safeMod = mod.replace(/'/g, "''");
    // `%` between course and module absorbs any outer block (nested ids like
    // 06_express_c01_ai_content_m01_content_*); matches empty for flat ids.
    const sql = `
      SELECT COUNT(*)::int AS n FROM "Lesson" l
      WHERE id LIKE '${safeCourse}_%${safeMod}_%' AND l."isHidden" = false
      AND NOT EXISTS (
        SELECT 1 FROM content_chunk c
        WHERE c.lesson_id = l.id AND c.source_type='academy_video_frame'
      );`;
    const rows = await supabaseQuery(sql);
    const dbCount = rows[0]?.n ?? 0;
    if (dbCount !== selCount) {
      deltas.push(`${mod}: selected=${selCount} db=${dbCount} delta=${selCount - dbCount}`);
    }
  }
  if (deltas.length) {
    add(8, 'WARN', `Per-module count mismatch: ${deltas.length}`, deltas);
    logCheck(8, 'Per-module counts', 'WARN', `${deltas.length} deltas`);
  } else {
    logCheck(8, 'Per-module counts', 'OK');
  }
}

function tokenize(s: string): string[] {
  return s.split(/[\s_\-.,|()«»"'!?]+/u)
    .filter((w) => w.length >= 3)
    .map((w) => w.toLowerCase());
}

function check9SpotCheck(sel: Selected[]) {
  const byMod = new Map<string, Selected[]>();
  for (const e of sel) {
    if (!byMod.has(e.module)) byMod.set(e.module, []);
    byMod.get(e.module)!.push(e);
  }
  const flagged: string[] = [];
  let total = 0;
  for (const [mod, entries] of byMod) {
    const pool = [...entries];
    const picks: Selected[] = [];
    const k = Math.min(3, pool.length);
    for (let i = 0; i < k; i++) {
      const idx = Math.floor(Math.random() * pool.length);
      picks.push(pool.splice(idx, 1)[0]);
    }
    for (const e of picks) {
      total++;
      const stem = e.filename.replace(/\.[^.]+$/, '').replace(/^\d+(?:_\d+)?_/, '');
      const filenameLatin = new Set(tokenize(stem));
      const filenameCyr = new Set(tokenize(translitToCyrillic(stem)));
      const titleTokens = tokenize(e.lessonTitle);
      let overlap = 0;
      for (const t of titleTokens) {
        if (filenameLatin.has(t) || filenameCyr.has(t)) overlap++;
      }
      if (overlap === 0) {
        flagged.push(`${mod}/${e.filename} → ${e.lessonId} "${e.lessonTitle}"`);
      }
    }
  }
  if (total === 0) {
    logCheck(9, 'Spot-check overlap', 'OK', 'no entries');
    return;
  }
  const ratio = flagged.length / total;
  if (ratio > 0.1) {
    add(9, 'WARN', `Spot-check: ${flagged.length}/${total} zero-overlap (${(ratio * 100).toFixed(1)}%)`, flagged);
    logCheck(9, 'Spot-check overlap', 'WARN', `${flagged.length}/${total} flagged`);
  } else {
    logCheck(9, 'Spot-check overlap', 'OK', `${flagged.length}/${total} flagged`);
  }
}

// ---------- Main ----------
async function main() {
  const suffix = process.env.INGEST_SUFFIX;
  if (!suffix) {
    console.error('INGEST_SUFFIX required');
    process.exit(1);
  }
  const strict = !process.argv.includes('--no-strict');
  const selPath = `scripts/vision-ingest/results/selected-${suffix}-lessons.json`;

  console.log(`=== Vision Ingest Pre-Flight Validator ===`);
  console.log(`Suffix: ${suffix}`);
  console.log(`Selection: ${selPath}`);
  console.log(`Strict: ${strict}`);

  let sel: Selected[];
  try {
    sel = JSON.parse(readFileSync(selPath, 'utf8')) as Selected[];
  } catch (e: any) {
    console.error(`Cannot read/parse ${selPath}: ${e?.message}`);
    process.exit(1);
  }
  if (!Array.isArray(sel)) {
    console.error('Selection file must be a JSON array');
    process.exit(1);
  }
  console.log(`Loaded: ${sel.length} lessons\n`);

  check1Schema(sel);
  check2Dupes(sel);
  await check3ScopeMatch(sel);
  check4LocalFiles(sel);
  check5ModuleConsistency(sel);
  await check6AlreadyIngested(sel);
  check7Duration(sel);
  await check8PerModule(sel);
  check9SpotCheck(sel);

  // Detailed dump
  console.log('\n=== Details ===');
  for (const i of issues) {
    console.log(`\n[${i.check}] ${i.severity}: ${i.message}`);
    if (i.details) {
      for (const d of i.details.slice(0, 50)) console.log(`  - ${d}`);
      if (i.details.length > 50) console.log(`  ... (${i.details.length - 50} more)`);
    }
  }

  const fails = issues.filter((i) => i.severity === 'FAIL');
  const warns = issues.filter((i) => i.severity === 'WARN');
  const failNums = [...new Set(fails.map((i) => i.check))].sort((a, b) => a - b);
  const warnNums = [...new Set(warns.map((i) => i.check))].sort((a, b) => a - b);

  let exitCode = 0;
  if (fails.length) exitCode = 1;
  else if (warns.length) exitCode = strict ? 1 : 2;

  console.log('\n=== Summary ===');
  console.log(`FAIL: ${fails.length}${failNums.length ? ` (Check ${failNums.join(', ')})` : ''}`);
  console.log(`WARN: ${warns.length}${warnNums.length ? ` (Check ${warnNums.join(', ')})` : ''}`);
  console.log(`Strict mode: ${strict ? 'on' : 'off'}, exit ${exitCode}`);

  process.exit(exitCode);
}

main().catch((e) => { console.error('FATAL:', e); process.exit(1); });
