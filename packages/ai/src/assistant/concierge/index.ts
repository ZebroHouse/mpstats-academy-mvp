import type { AssistantBranchResult, AssistantHistoryMessage } from '../types';

export interface ConciergePipelineArgs {
  query: string;
  history: AssistantHistoryMessage[];
}

// Стаб — реальная реализация в Phase B (concierge-pipeline.ts).
export async function runConciergePipeline(_args: ConciergePipelineArgs): Promise<AssistantBranchResult> {
  return {
    answer: 'Точно подсказать по этому не берусь, чтобы не запутать. Если что — напиши в поддержку, там помогут.',
    lessons: [],
    jobs: [],
    navLinks: [{ label: 'Написать в поддержку', href: '/support' }],
  };
}
