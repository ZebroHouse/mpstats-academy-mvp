const fs = require('fs'), cp = require('child_process'), path = require('path');
const WT = 'D:/GpT_docs/MPSTATS ACADEMY ADAPTIVE LEARNING/MAAL/.claude/worktrees/ozon-course';
const map = require(WT + '/scripts/kinescope-video-map-instruments.json');
const entries = map.matched || map;
function probe(fp) {
  try { return Math.round(parseFloat(cp.execSync(`ffprobe -v error -show_entries format=duration -of default=nk=1:nw=1 "${fp}"`, { encoding: 'utf8' }).trim())); }
  catch (e) { return null; }
}
function fmt(s) { const m = Math.floor(s / 60), ss = s % 60; return `${m}:${String(ss).padStart(2, '0')}`; }
function bucket(s) { return s < 600 ? 'small' : s <= 1800 ? 'medium' : 'large'; }
const out = [];
for (const e of entries) {
  const fp = e.filePath.split('\\').join('/');
  if (!fs.existsSync(fp)) { console.error('MISSING', fp); continue; }
  const dur = probe(fp);
  const mod = (e.lessonId.match(/07_instruments_(m\d+_[a-z_]+?)_\d+$/) || [])[1] || 'unknown';
  out.push({
    localPath: fp, filename: path.basename(fp), durationSeconds: dur, durationFormatted: dur ? fmt(dur) : null,
    bucketSize: dur ? bucket(dur) : 'medium', module: mod, category: 'ui_demo',
    lessonId: e.lessonId, lessonTitle: e.title,
    platformUrl: `https://platform.mpstats.academy/learn/${e.lessonId}`,
  });
}
fs.writeFileSync(WT + '/scripts/vision-ingest/results/selected-instruments-vision-lessons.json', JSON.stringify(out, null, 2));
console.log('wrote', out.length, 'lessons; null-dur:', out.filter(o => !o.durationSeconds).length);
const mods = {}; out.forEach(o => mods[o.module] = (mods[o.module] || 0) + 1); console.log('modules:', JSON.stringify(mods));
