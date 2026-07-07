/**
 * Kinescope Bulk Upload Script
 *
 * Reads kinescope-video-map.json (from mapping script),
 * uploads videos to Kinescope API (into course folders), and updates Lesson.videoId in Supabase.
 *
 * Usage:
 *   npx tsx scripts/kinescope-upload.ts                        # Upload all
 *   npx tsx scripts/kinescope-upload.ts --course 01_analytics  # Upload one course batch
 *   npx tsx scripts/kinescope-upload.ts --dry-run              # Show what would be uploaded
 *   npx tsx scripts/kinescope-upload.ts --limit 5              # Upload only first 5
 *   npx tsx scripts/kinescope-upload.ts --status               # Show batch progress summary
 *
 * Required env vars:
 *   KINESCOPE_API_KEY       - Bearer token from Kinescope dashboard
 *   KINESCOPE_PROJECT_ID    - Project ID from Kinescope dashboard
 *   KINESCOPE_WORKSPACE_ID  - Workspace ID
 *   DATABASE_URL            - Prisma connection string (already in .env)
 *
 * Resume: Progress auto-saves to scripts/kinescope-upload-progress.json.
 *         Re-running the script automatically skips already-uploaded videos.
 */

import { config } from 'dotenv';
import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';
import { randomUUID } from 'crypto';

// Load env from apps/web/.env (scripts run from monorepo root)
config({ path: path.resolve(__dirname, '../apps/web/.env'), override: true });

// ============== CONFIG ==============

const KINESCOPE_API_KEY = process.env.KINESCOPE_API_KEY;
const KINESCOPE_PROJECT_ID = process.env.KINESCOPE_PROJECT_ID;
const KINESCOPE_WORKSPACE_ID = process.env.KINESCOPE_WORKSPACE_ID || 'fe0bcafb-8b2f-4e7d-b043-ca5afc445504';

// Kinescope TUS upload endpoint (two-step: init → upload)
const INIT_URL = 'https://eu-ams-uploader.kinescope.io/v2/init';

// Kinescope folder IDs inside "MPSTATS ACADEMY" project
// Created via API: POST /v1/projects/{project_id}/folders
const COURSE_FOLDER_IDS: Record<string, string> = {
  '01_analytics':    '71777756-e93a-4484-87eb-570c7588640f',
  '02_ads':          '97d2cadb-4e63-4eb5-9d50-195d71436f20',
  '03_ai':           '639d0266-4fa8-4e0f-93e1-4128d1ba6283',
  '04_workshops':    '97b9a298-2fd9-4730-b63a-57991dbd2d0d',
  '05_ozon':         '6d3dbe29-028c-4d13-8554-8367a91c5992',
  '06_express':      '865be5b0-c6f7-4a44-a4da-6684dd78e695',
  'skill_analytics': 'cc2bd243-b8e2-4acc-bd73-5cae517cbc1c',
  'skill_marketing': '500cc6a8-109b-445d-9a5a-4a2b46a44a5d',
  '07_instruments':  'a1c43064-e68b-41bf-93f0-65feeb87ef70',
  '08_ctr':          '5a90515d-3aef-4ba5-80a6-90273569b1ed',
};

// Retry config
const MAX_RETRIES = 3;
const RETRY_DELAYS_MS = [3000, 6000, 12000]; // Exponential backoff

// Upload timeout scales with file size: base 3min + 1.5min per 100MB
const UPLOAD_TIMEOUT_BASE_MS = 3 * 60 * 1000;
const UPLOAD_TIMEOUT_PER_100MB_MS = 90 * 1000;

// File paths (--map flag overrides default map file)
const MAP_ARG_INDEX = process.argv.indexOf('--map');
const MAP_PATH = MAP_ARG_INDEX !== -1
  ? path.resolve(process.argv[MAP_ARG_INDEX + 1])
  : path.resolve(__dirname, 'kinescope-video-map.json');
const PROGRESS_PATH = path.resolve(__dirname, 'kinescope-upload-progress.json');

// CLI flags
const DRY_RUN = process.argv.includes('--dry-run');
const STATUS_ONLY = process.argv.includes('--status');
const LIMIT_INDEX = process.argv.indexOf('--limit');
const LIMIT = LIMIT_INDEX !== -1 ? parseInt(process.argv[LIMIT_INDEX + 1], 10) : Infinity;
const COURSE_INDEX = process.argv.indexOf('--course');
const COURSE_FILTER = COURSE_INDEX !== -1 ? process.argv[COURSE_INDEX + 1] : null;

// ============== TYPES ==============

interface MatchedEntry {
  filePath: string;
  lessonId: string;
  title: string;
  courseId: string;
  fileExists: boolean;
  fileSizeMB: number | null;
  extension: string;
}

interface MappingFile {
  generated: string;
  matched: MatchedEntry[];
  stats: { total: number; matched: number };
}

interface UploadProgress {
  startedAt: string;
  lastUpdated: string;
  uploaded: Array<{
    lessonId: string;
    videoId: string;
    courseId: string;
    folderId: string;
    sizeMB: number;
    uploadedAt: string;
  }>;
  failed: Array<{
    lessonId: string;
    filePath: string;
    error: string;
    failedAt: string;
  }>;
}

// ============== HELPERS ==============

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function loadProgress(): UploadProgress {
  if (fs.existsSync(PROGRESS_PATH)) {
    const raw = JSON.parse(fs.readFileSync(PROGRESS_PATH, 'utf-8'));
    // Migrate old format entries that lack courseId/folderId/sizeMB
    if (raw.uploaded) {
      raw.uploaded = raw.uploaded.map((u: any) => ({
        courseId: u.courseId || 'unknown',
        folderId: u.folderId || '',
        sizeMB: u.sizeMB || 0,
        ...u,
      }));
    }
    return raw;
  }
  return {
    startedAt: new Date().toISOString(),
    lastUpdated: new Date().toISOString(),
    uploaded: [],
    failed: [],
  };
}

function saveProgress(progress: UploadProgress): void {
  progress.lastUpdated = new Date().toISOString();
  fs.writeFileSync(PROGRESS_PATH, JSON.stringify(progress, null, 2), 'utf-8');
}

function toBase64(str: string): string {
  return Buffer.from(str).toString('base64');
}

function getUploadTimeout(fileSizeBytes: number): number {
  const sizeMB = fileSizeBytes / (1024 * 1024);
  return UPLOAD_TIMEOUT_BASE_MS + Math.ceil(sizeMB / 100) * UPLOAD_TIMEOUT_PER_100MB_MS;
}

// ============== STATUS COMMAND ==============

function showStatus(mapping: MappingFile, progress: UploadProgress): void {
  console.log('=== Kinescope Upload Status ===\n');

  // Group by course
  const courses = new Map<string, { total: number; totalMB: number; uploaded: number; uploadedMB: number; failed: number }>();
  for (const entry of mapping.matched) {
    if (!entry.fileExists) continue;
    const c = courses.get(entry.courseId) || { total: 0, totalMB: 0, uploaded: 0, uploadedMB: 0, failed: 0 };
    c.total++;
    c.totalMB += entry.fileSizeMB || 0;
    courses.set(entry.courseId, c);
  }

  const uploadedByCourse = new Map<string, number>();
  const uploadedMBByCourse = new Map<string, number>();
  for (const u of progress.uploaded) {
    const cid = u.courseId || 'unknown';
    uploadedByCourse.set(cid, (uploadedByCourse.get(cid) || 0) + 1);
    uploadedMBByCourse.set(cid, (uploadedMBByCourse.get(cid) || 0) + (u.sizeMB || 0));
  }

  const failedSet = new Set(progress.failed.map(f => f.lessonId));

  for (const [courseId, c] of [...courses.entries()].sort()) {
    c.uploaded = uploadedByCourse.get(courseId) || 0;
    c.uploadedMB = uploadedMBByCourse.get(courseId) || 0;
    // Count failed for this course
    for (const entry of mapping.matched) {
      if (entry.courseId === courseId && failedSet.has(entry.lessonId)) c.failed++;
    }

    const remaining = c.total - c.uploaded;
    const remainingMB = c.totalMB - c.uploadedMB;
    const pct = c.total > 0 ? Math.round((c.uploaded / c.total) * 100) : 0;
    const bar = '█'.repeat(Math.round(pct / 5)) + '░'.repeat(20 - Math.round(pct / 5));
    const status = remaining === 0 ? '✅' : c.failed > 0 ? '⚠️' : '⏳';

    console.log(`${status} ${courseId}: [${bar}] ${pct}% (${c.uploaded}/${c.total} videos, ${(c.uploadedMB / 1024).toFixed(1)}/${(c.totalMB / 1024).toFixed(1)} GB)`);
    if (c.failed > 0) console.log(`   ↳ ${c.failed} failed (will retry on next run)`);
  }

  const totalUploaded = progress.uploaded.length;
  const totalFiles = [...courses.values()].reduce((a, c) => a + c.total, 0);
  const totalUploadedMB = progress.uploaded.reduce((a, u) => a + (u.sizeMB || 0), 0);
  const totalMB = [...courses.values()].reduce((a, c) => a + c.totalMB, 0);

  console.log(`\n--- Overall ---`);
  console.log(`Videos:  ${totalUploaded}/${totalFiles} (${Math.round((totalUploaded / totalFiles) * 100)}%)`);
  console.log(`Size:    ${(totalUploadedMB / 1024).toFixed(1)}/${(totalMB / 1024).toFixed(1)} GB`);
  console.log(`Failed:  ${progress.failed.length}`);
  console.log(`Updated: ${progress.lastUpdated}`);
  console.log(`\nProgress file: ${PROGRESS_PATH}`);

  if (totalUploaded < totalFiles) {
    const nextCourse = [...courses.entries()].sort().find(([, c]) => c.uploaded < c.total);
    if (nextCourse) {
      console.log(`\nNext batch command:`);
      console.log(`  npx tsx scripts/kinescope-upload.ts --course ${nextCourse[0]}`);
    }
  }
}

// ============== UPLOAD ==============

async function uploadToKinescope(
  filePath: string,
  title: string,
  folderId: string,
  initId: string,
): Promise<string> {
  if (!KINESCOPE_API_KEY || !KINESCOPE_PROJECT_ID) {
    throw new Error('KINESCOPE_API_KEY and KINESCOPE_PROJECT_ID must be set in .env');
  }

  const fileSize = fs.statSync(filePath).size;
  const fileName = path.basename(filePath);
  const titleWithoutExt = path.basename(filePath, path.extname(filePath));

  // parent_id = folder ID (to place video inside the course folder)
  // Falls back to project ID if no folder mapping found
  const parentId = folderId || KINESCOPE_PROJECT_ID;

  // Build Upload-Metadata header (TUS spec: key base64value,key base64value)
  const metadata = [
    `parent_id ${toBase64(parentId)}`,
    `init_id ${toBase64(initId)}`,
    `type ${toBase64('video')}`,
    `title ${toBase64(title || titleWithoutExt)}`,
    `filename ${toBase64(fileName)}`,
    `filesize ${toBase64(String(fileSize))}`,
  ].join(',');

  const commonHeaders: Record<string, string> = {
    'Tus-Resumable': '1.0.0',
    'X-Workspace-ID': KINESCOPE_WORKSPACE_ID,
    Authorization: `Bearer ${KINESCOPE_API_KEY}`,
  };

  // Step 1: Init upload (POST, no body)
  const initResponse = await fetch(INIT_URL, {
    method: 'POST',
    headers: {
      ...commonHeaders,
      'Upload-Length': String(fileSize),
      'Upload-Metadata': metadata,
    },
  });

  if (!initResponse.ok) {
    const errorText = await initResponse.text();
    throw new Error(`Init failed HTTP ${initResponse.status}: ${errorText}`);
  }

  const uploadUrl = initResponse.headers.get('Location');
  if (!uploadUrl) {
    throw new Error('No Location header in init response');
  }

  console.log(`  Init OK → folder: ${parentId.substring(0, 8)}...`);

  // Step 2: Upload file (PATCH with binary body)
  // Use ReadStream for large files to avoid loading entire file into memory
  const timeoutMs = getUploadTimeout(fileSize);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    // Node.js fetch supports ReadableStream from web streams
    const { Readable } = await import('stream');
    const fileStream = fs.createReadStream(filePath);
    const webStream = Readable.toWeb(fileStream) as ReadableStream;

    const uploadResponse = await fetch(uploadUrl, {
      method: 'PATCH',
      headers: {
        ...commonHeaders,
        'Upload-Offset': '0',
        'Content-Type': 'application/offset+octet-stream',
        'Content-Length': String(fileSize),
      },
      body: webStream,
      // @ts-ignore — duplex required for streaming body in Node.js fetch
      duplex: 'half',
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!uploadResponse.ok) {
      const errorText = await uploadResponse.text();
      throw new Error(`Upload failed HTTP ${uploadResponse.status}: ${errorText}`);
    }

    console.log(`  Upload complete (${(fileSize / 1024 / 1024).toFixed(1)} MB, timeout was ${Math.round(timeoutMs / 1000)}s)`);

    return initId;
  } catch (error: any) {
    clearTimeout(timeout);
    if (error.name === 'AbortError') {
      throw new Error(`Upload timed out after ${Math.round(timeoutMs / 1000)}s for ${(fileSize / 1024 / 1024).toFixed(0)} MB file`);
    }
    throw error;
  }
}

async function deleteVideo(videoId: string): Promise<void> {
  try {
    await fetch(`https://api.kinescope.io/v1/videos/${videoId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${KINESCOPE_API_KEY}` },
    });
  } catch {
    // Ignore delete errors — video may not exist
  }
}

async function uploadWithRetry(
  filePath: string,
  title: string,
  folderId: string,
): Promise<string> {
  let lastError: Error | null = null;
  // Generate initId ONCE — reuse across retries to avoid creating duplicate videos
  let initId = randomUUID();

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await uploadToKinescope(filePath, title, folderId, initId);
    } catch (error: any) {
      lastError = error;

      // "already exists" = init succeeded before but upload failed.
      // Delete the orphaned video, wait for Kinescope to process, then use a fresh initId.
      if (error.message?.includes('already exists')) {
        console.log(`  [CLEANUP] Deleting orphaned video ${initId}, waiting 5s for Kinescope to sync...`);
        await deleteVideo(initId);
        await sleep(5000);
        initId = randomUUID();
      }

      if (attempt < MAX_RETRIES) {
        const delay = RETRY_DELAYS_MS[attempt] || 12000;
        console.log(
          `  [RETRY] Attempt ${attempt + 1}/${MAX_RETRIES}. Retrying in ${delay / 1000}s...`,
        );
        await sleep(delay);
      }
    }
  }

  throw lastError || new Error('Upload failed after all retries');
}

// ============== MAIN ==============

async function main() {
  console.log('=== Kinescope Bulk Upload ===\n');

  // 1. Load mapping file
  if (!fs.existsSync(MAP_PATH)) {
    console.error('Mapping file not found:', MAP_PATH);
    console.error('Run mapping script first: npx tsx scripts/kinescope-mapping.ts');
    process.exit(1);
  }

  const mapping: MappingFile = JSON.parse(fs.readFileSync(MAP_PATH, 'utf-8'));
  const progress = loadProgress();

  // Status-only mode
  if (STATUS_ONLY) {
    showStatus(mapping, progress);
    return;
  }

  // 2. Validate environment
  if (!DRY_RUN) {
    if (!KINESCOPE_API_KEY) {
      console.error('ERROR: KINESCOPE_API_KEY not set in .env');
      process.exit(1);
    }
    if (!KINESCOPE_PROJECT_ID) {
      console.error('ERROR: KINESCOPE_PROJECT_ID not set in .env');
      process.exit(1);
    }
  }

  console.log(`Mapping loaded: ${mapping.matched.length} entries (generated ${mapping.generated})`);
  if (COURSE_FILTER) console.log(`Course filter: ${COURSE_FILTER}`);
  console.log();

  // 3. Load progress (for resume)
  const uploadedSet = new Set(progress.uploaded.map((u) => u.lessonId));
  console.log(`Previous progress: ${progress.uploaded.length} uploaded, ${progress.failed.length} failed`);

  // 4. Check DB for existing videoIds
  const prisma = new PrismaClient();
  let dbSkipped = 0;

  const lessonsWithVideo = DRY_RUN
    ? []
    : await prisma.lesson.findMany({
        where: { videoId: { not: null } },
        select: { id: true },
      });

  const hasVideoIdSet = new Set(lessonsWithVideo.map((l) => l.id));

  // 5. Build upload queue
  const queue: MatchedEntry[] = [];

  for (const entry of mapping.matched) {
    if (!entry.fileExists) continue;

    // Filter by course if specified
    if (COURSE_FILTER && entry.courseId !== COURSE_FILTER) continue;

    // Skip if already uploaded in previous run
    if (uploadedSet.has(entry.lessonId)) {
      dbSkipped++;
      continue;
    }

    // Skip if lesson already has videoId in DB
    if (hasVideoIdSet.has(entry.lessonId)) {
      dbSkipped++;
      continue;
    }

    queue.push(entry);
  }

  // Sort by file size ascending (upload small files first for faster feedback)
  queue.sort((a, b) => (a.fileSizeMB || 0) - (b.fileSizeMB || 0));

  // Apply limit
  const toUpload = queue.slice(0, LIMIT);

  const totalSizeMB = toUpload.reduce((sum, e) => sum + (e.fileSizeMB || 0), 0);
  console.log(`\nUpload queue: ${toUpload.length} videos (${(totalSizeMB / 1024).toFixed(1)} GB)`);
  console.log(`Skipped: ${dbSkipped} (already have videoId or previously uploaded)`);
  if (LIMIT < Infinity) console.log(`Limit: ${LIMIT}`);
  if (DRY_RUN) console.log('[DRY RUN] No uploads will be performed.\n');

  // 6. Process uploads
  let uploaded = 0;
  let failed = 0;

  for (let i = 0; i < toUpload.length; i++) {
    const entry = toUpload[i];
    const num = i + 1;
    const total = toUpload.length;
    const sizeMB = entry.fileSizeMB ? `${entry.fileSizeMB} MB` : 'unknown size';
    const folderId = COURSE_FOLDER_IDS[entry.courseId] || '';

    console.log(`[${num}/${total}] ${entry.lessonId} (${sizeMB})`);
    console.log(`  File: ${path.basename(entry.filePath)}`);
    console.log(`  Course: ${entry.courseId} → folder ${folderId ? folderId.substring(0, 8) + '...' : 'PROJECT ROOT'}`);

    if (DRY_RUN) {
      console.log('  [DRY RUN] Would upload to Kinescope and update DB\n');
      uploaded++;
      continue;
    }

    try {
      const videoId = await uploadWithRetry(entry.filePath, entry.title, folderId);
      console.log(`  Kinescope videoId: ${videoId}`);

      // Update Lesson in DB
      await prisma.lesson.update({
        where: { id: entry.lessonId },
        data: {
          videoId: videoId,
          videoUrl: `https://kinescope.io/embed/${videoId}`,
        },
      });

      console.log(`  DB updated ✓\n`);

      // Track progress
      progress.uploaded.push({
        lessonId: entry.lessonId,
        videoId,
        courseId: entry.courseId,
        folderId,
        sizeMB: entry.fileSizeMB || 0,
        uploadedAt: new Date().toISOString(),
      });
      saveProgress(progress);
      uploaded++;
    } catch (error: any) {
      console.error(`  [FAILED] ${error.message}\n`);

      progress.failed.push({
        lessonId: entry.lessonId,
        filePath: entry.filePath,
        error: error.message,
        failedAt: new Date().toISOString(),
      });
      saveProgress(progress);
      failed++;
    }
  }

  // 7. Summary
  console.log('\n=== UPLOAD SUMMARY ===');
  console.log(`Mode:     ${DRY_RUN ? 'DRY RUN' : 'LIVE'}${COURSE_FILTER ? ` (course: ${COURSE_FILTER})` : ''}`);
  console.log(`Uploaded: ${uploaded}`);
  console.log(`Skipped:  ${dbSkipped} (already had videoId)`);
  console.log(`Failed:   ${failed}`);

  if (failed > 0) {
    console.log(`\nFailed uploads saved to: ${PROGRESS_PATH}`);
    console.log('Re-run the script to retry failed uploads.');
  }

  if (!DRY_RUN) {
    console.log(`\nProgress file: ${PROGRESS_PATH}`);
  }

  // Show next batch suggestion
  if (!COURSE_FILTER && uploaded > 0) {
    console.log('\nTo upload by batch (recommended):');
    for (const courseId of Object.keys(COURSE_FOLDER_IDS).sort()) {
      console.log(`  npx tsx scripts/kinescope-upload.ts --course ${courseId}`);
    }
  }

  console.log('\nDone.');
  await prisma.$disconnect();
}

main().catch((error) => {
  console.error('Upload failed:', error);
  process.exit(1);
});
