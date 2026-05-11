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
    for (const f of v.frames) {
      const localPath = join(INGEST_CONFIG.results_dir, f.path);
      if (!existsSync(localPath)) {
        console.warn(`  ⚠ missing ${localPath}`);
        failed++;
        continue;
      }
      const buf = readFileSync(localPath);
      const storagePath = `${v.lessonId}/frame_${String(f.seq).padStart(3, '0')}_${f.timecode.replace(':', '-')}.jpg`;
      const { error } = await supabase.storage
        .from(INGEST_CONFIG.storage_bucket)
        .upload(storagePath, buf, { contentType: 'image/jpeg', upsert: true });
      if (error) {
        console.warn(`  ✗ ${storagePath}: ${error.message}`);
        failed++;
      } else {
        uploaded++;
        if (uploaded % 20 === 0) console.log(`  ... ${uploaded} uploaded`);
      }
    }
  }
  console.log(`\nUploaded: ${uploaded}, skipped: ${skipped}, failed: ${failed}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
