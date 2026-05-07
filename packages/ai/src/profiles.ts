// packages/ai/src/profiles.ts
import 'server-only';
import { searchChunks, type ChunkSearchResult } from './retrieval';

export interface RetrievalProfile {
  name: string;
  sourceTypes: string[];
  trustTiers: number[];
  maxResults: number;
  threshold: number;
}

export const PROFILES = {
  'academy-lesson': {
    name: 'academy-lesson',
    sourceTypes: ['academy_audio', 'academy_video_frame'],
    trustTiers: [1],
    maxResults: 8,
    threshold: 0.5,
  },
} as const satisfies Record<string, RetrievalProfile>;

export type ProfileName = keyof typeof PROFILES;

export interface RetrieveOptions {
  query: string;
  lessonId?: string;
  limit?: number;
  threshold?: number;
  includeHidden?: boolean;
}

export async function retrieve(
  profileName: ProfileName,
  options: RetrieveOptions,
): Promise<ChunkSearchResult[]> {
  const profile = (PROFILES as Record<string, RetrievalProfile>)[profileName];
  if (!profile) throw new Error(`Unknown profile: ${profileName}`);

  return searchChunks({
    query: options.query,
    lessonId: options.lessonId,
    limit: options.limit ?? profile.maxResults,
    threshold: options.threshold ?? profile.threshold,
    sourceTypes: profile.sourceTypes,
    trustTiers: profile.trustTiers,
    includeHidden: options.includeHidden,
  });
}
