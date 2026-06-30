import { searchJobsByEmbedding, aggregateChunksToJobs, mergeJobCandidates } from './retrieval';
import { synthesizeIntentResponse } from './synthesize';
import { expandSellerQuery } from '../seller-lexicon';
import type { IntentResult } from './types';

export interface ResolveArgs {
  query: string;
  surface: 'learn' | 'welcome' | 'diagnostic';
  conversationState?: string;
}

export async function resolveIntent(args: ResolveArgs): Promise<IntentResult> {
  // Expand seller shorthand for retrieval only; the LLM synthesis below keeps the
  // user's original wording.
  const retrievalQuery = expandSellerQuery(args.query);
  const [embHits, chunkHits] = await Promise.all([
    searchJobsByEmbedding(retrievalQuery, { limit: 10, threshold: 0.2 }),
    aggregateChunksToJobs(retrievalQuery, { chunkLimit: 30 }),
  ]);
  const merged = (await mergeJobCandidates(embHits, chunkHits)).slice(0, 8);
  return synthesizeIntentResponse({ query: args.query, candidates: merged, conversationState: args.conversationState });
}
