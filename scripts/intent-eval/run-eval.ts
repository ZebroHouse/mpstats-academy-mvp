/**
 * Intent→Jobs Evaluation Harness
 *
 * Evaluates `resolveIntent` against reference cases in cases.json.
 * Prints per-case PASS/FAIL and overall accuracy.
 * Exits with code 1 if accuracy < 85%.
 *
 * Usage:
 *   DATABASE_URL=<dev-url> OPENROUTER_API_KEY=<key> pnpm tsx scripts/intent-eval/run-eval.ts
 */

import { prisma } from '@mpstats/db/client';
import { resolveIntent } from '@mpstats/ai';
import * as fs from 'fs';
import * as path from 'path';

interface Case {
  query: string;
  expect: { mode: 'recommend' | 'clarify' | 'fallback' | 'empty'; jobSlugs?: string[] };
}

const casesPath = path.join(__dirname, 'cases.json');
const cases: Case[] = JSON.parse(fs.readFileSync(casesPath, 'utf-8'));

async function slugToId(slug: string): Promise<string | null> {
  const r = await prisma.job.findUnique({ where: { slug }, select: { id: true } });
  return r?.id ?? null;
}

async function main() {
  let pass = 0;
  const failures: Array<{ query: string; expected: string; got: string }> = [];

  for (const c of cases) {
    const res = await resolveIntent({ query: c.query, surface: 'learn' });

    let ok = res.mode === c.expect.mode;

    // For recommend mode with expected slugs: check that the top-1 job matches one of the acceptable slugs
    if (res.mode === 'recommend' && c.expect.mode === 'recommend' && c.expect.jobSlugs && c.expect.jobSlugs.length > 0) {
      const expectedIds = (
        await Promise.all(c.expect.jobSlugs.map(slugToId))
      ).filter((id): id is string => id !== null);

      const topJobId = res.jobs[0]?.jobId;
      ok = topJobId != null && expectedIds.includes(topJobId);
    }

    // For fallback mode with optional acceptable slugs: accept either fallback or recommend if job matches
    if (c.expect.mode === 'fallback' && c.expect.jobSlugs && c.expect.jobSlugs.length > 0) {
      if (res.mode === 'fallback') {
        ok = true;
      } else if (res.mode === 'recommend') {
        const expectedIds = (
          await Promise.all(c.expect.jobSlugs.map(slugToId))
        ).filter((id): id is string => id !== null);
        const topJobId = res.jobs[0]?.jobId;
        ok = topJobId != null && expectedIds.includes(topJobId);
      } else {
        ok = false;
      }
    }

    if (ok) {
      pass++;
      console.log(`PASS: "${c.query}" → mode=${res.mode}`);
    } else {
      const got = JSON.stringify(res).slice(0, 250);
      failures.push({ query: c.query, expected: JSON.stringify(c.expect), got });
      console.log(`FAIL: "${c.query}"`);
      console.log(`      expected: ${JSON.stringify(c.expect)}`);
      console.log(`      got:      ${got}`);
    }
  }

  const total = cases.length;
  const accuracy = pass / total;

  console.log('');
  console.log(`━━━ RESULT ━━━`);
  console.log(`PASS ${pass}/${total} = ${(accuracy * 100).toFixed(1)}%`);

  if (failures.length > 0) {
    console.log('');
    console.log('Failed cases:');
    for (const f of failures) {
      console.log(`  • "${f.query}"`);
    }
  }

  if (accuracy < 0.85) {
    console.error(`\nAccuracy ${(accuracy * 100).toFixed(1)}% is below the 85% gate. Exiting 1.`);
    process.exit(1);
  }

  console.log('\nAll checks passed.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
