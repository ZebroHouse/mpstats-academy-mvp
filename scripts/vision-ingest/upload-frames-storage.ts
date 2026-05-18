// scripts/vision-ingest/upload-frames-storage.ts
import { createClient } from '@supabase/supabase-js';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { INGEST_CONFIG } from './config';

interface FrameMeta { seq: number; timecode: string; pts: number; path: string; }
interface VideoExtraction { lessonId: string; frames: FrameMeta[]; }

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://saecuecevicwjkpmaoot.supabase.co';
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) throw new Error('SUPABASE_SERVICE_ROLE_KEY required');
  const supabase = createClient(url, serviceKey, { auth: { persistSession: false } });

  const SUFFIX = process.env.INGEST_SUFFIX?.trim() || '';
  const manifestFile = SUFFIX ? `frames-manifest-${SUFFIX}.json` : 'frames-manifest.json';
  const manifest = JSON.parse(readFileSync(join(INGEST_CONFIG.results_dir, manifestFile), 'utf8')) as { videos: VideoExtraction[] };
  let uploaded = 0, skipped = 0, failed = 0;

  for (const v of manifest.videos) {
    // Resume-safe: list what's already in storage for this lesson, skip those.
    const existing = new Set<string>();
    try {
      const { data } = await supabase.storage
        .from(INGEST_CONFIG.storage_bucket)
        .list(v.lessonId, { limit: 1000 });
      for (const o of data ?? []) existing.add(o.name);
    } catch { /* list failed — treat as none-existing, will re-upload */ }

    for (const f of v.frames) {
      const localPath = join(INGEST_CONFIG.results_dir, f.path);
      if (!existsSync(localPath)) {
        console.warn(`  ⚠ missing ${localPath}`);
        failed++;
        continue;
      }
      const fileName = `frame_${String(f.seq).padStart(3, '0')}_${f.timecode.replace(':', '-')}.jpg`;
      const storagePath = `${v.lessonId}/${fileName}`;
      if (existing.has(fileName)) {
        skipped++;
        continue;
      }
      const buf = readFileSync(localPath);
      let ok = false;
      let lastErr = '';
      for (let attempt = 1; attempt <= 4 && !ok; attempt++) {
        const { error } = await supabase.storage
          .from(INGEST_CONFIG.storage_bucket)
          .upload(storagePath, buf, { contentType: 'image/jpeg', upsert: true });
        if (!error) { ok = true; break; }
        lastErr = error.message;
        if (attempt < 4) await new Promise((r) => setTimeout(r, 2000 * attempt));
      }
      if (ok) {
        uploaded++;
        if (uploaded % 20 === 0) console.log(`  ... ${uploaded} uploaded (${skipped} skipped)`);
      } else {
        console.warn(`  ✗ ${storagePath}: ${lastErr}`);
        failed++;
      }
    }
  }
  console.log(`\nUploaded: ${uploaded}, skipped: ${skipped}, failed: ${failed}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
