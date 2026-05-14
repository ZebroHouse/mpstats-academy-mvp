import { NextResponse } from 'next/server';
import { z } from 'zod';
import { searchChunksPublic } from '@mpstats/ai';
import {
  extractBearerToken,
  validateBearerToken,
  parseAllowedTokens,
} from '@/lib/rag-auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const RequestSchema = z.object({
  query: z.string().min(1).max(2048),
  limit: z.number().int().optional(),
  threshold: z.number().min(0).max(1).optional(),
  sourceTypes: z.array(z.string()).optional(),
  trustTiers: z.array(z.number().int()).optional(),
});

const LIMIT_MIN = 1;
const LIMIT_MAX = 25;
const LIMIT_DEFAULT = 5;

export async function POST(req: Request): Promise<NextResponse> {
  // Auth
  const allowed = parseAllowedTokens(process.env.RAG_API_TOKENS);
  if (allowed.length === 0) {
    return NextResponse.json(
      { error: 'RAG endpoint disabled (no tokens configured)' },
      { status: 503 },
    );
  }
  const token = extractBearerToken(req.headers.get('authorization'));
  if (!validateBearerToken(token, allowed)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Body
  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const parsed = RequestSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid request', details: parsed.error.format() },
      { status: 400 },
    );
  }
  const { query, limit, threshold, sourceTypes, trustTiers } = parsed.data;
  const clampedLimit =
    limit === undefined ? LIMIT_DEFAULT : Math.max(LIMIT_MIN, Math.min(LIMIT_MAX, limit));

  // Search
  try {
    const result = await searchChunksPublic({
      query,
      limit: clampedLimit,
      threshold,
      sourceTypes,
      trustTiers,
    });
    return NextResponse.json(result, { status: 200 });
  } catch (err) {
    return NextResponse.json(
      { error: 'Internal error', message: String((err as Error).message ?? err).slice(0, 200) },
      { status: 500 },
    );
  }
}
