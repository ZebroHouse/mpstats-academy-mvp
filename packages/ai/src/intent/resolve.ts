import { searchJobsByEmbedding, aggregateChunksToJobs, mergeJobCandidates } from './retrieval';
import { synthesizeIntentResponse } from './synthesize';
import type { IntentResult } from './types';

export interface ResolveArgs {
  query: string;
  surface: 'learn' | 'welcome' | 'diagnostic';
  conversationState?: string;
}

export async function resolveIntent(args: ResolveArgs): Promise<IntentResult> {
  const [embHits, chunkHits] = await Promise.all([
    searchJobsByEmbedding(args.query, { limit: 10, threshold: 0.2 }),
    aggregateChunksToJobs(args.query, { chunkLimit: 30 }),
  ]);
  const merged = (await mergeJobCandidates(embHits, chunkHits)).slice(0, 8);
  return synthesizeIntentResponse({ query: args.query, candidates: merged, conversationState: args.conversationState });
}
