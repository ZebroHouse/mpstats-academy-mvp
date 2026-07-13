import { embedQuery } from '../../embeddings';
import type { AssistantBranchResult, AssistantHistoryMessage } from '../types';
import { PLATFORM_MAP } from './platform-map';
import { matchTopK } from './concierge-match';
import { synthesizeConcierge, buildNavLinks } from './concierge-synthesize';
import { resolveCourseFacts, formatCourseFacts } from './course-facts';
import { MAP_EMBEDDINGS } from './platform-map.embeddings';
import type { MapEntry } from './types';

const TOP_K = 4;
const THRESHOLD = 0.4; // Task D4: откалибровано на eval-наборе (потолок промахов 0.26, пол хитов 0.51 → середина разрыва даёт макс. маржу)

const MISS: AssistantBranchResult = {
  answer: 'Точно подсказать по этому не берусь, чтобы не запутать. Если что — напиши в поддержку, там помогут.',
  lessons: [],
  jobs: [],
  navLinks: [{ label: 'Написать в поддержку', href: '/support' }],
};

const EMBEDDINGS = MAP_EMBEDDINGS;
const BY_ID = new Map<string, MapEntry>(PLATFORM_MAP.map((e) => [e.id, e]));

export interface ConciergePipelineArgs {
  query: string;
  history: AssistantHistoryMessage[];
}

export async function runConciergePipeline(args: ConciergePipelineArgs): Promise<AssistantBranchResult> {
  const qVec = await embedQuery(args.query);
  const matches = matchTopK(qVec, EMBEDDINGS, { k: TOP_K, threshold: THRESHOLD });
  if (matches.length === 0) return MISS;

  const entries = matches.map((m) => BY_ID.get(m.id)).filter((e): e is MapEntry => Boolean(e));
  if (entries.length === 0) return MISS;

  const hasDynamic = entries.some((e) => e.kind === 'dynamic');
  const courseFacts = hasDynamic ? formatCourseFacts(await resolveCourseFacts()) : undefined;

  const answer = await synthesizeConcierge({ query: args.query, history: args.history, entries, courseFacts });
  return { answer, lessons: [], jobs: [], navLinks: buildNavLinks(entries) };
}
