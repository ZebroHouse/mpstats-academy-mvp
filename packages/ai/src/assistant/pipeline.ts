import { classifyDomain } from './gate';
import { retrieveForAssistant } from './retrieve';
import { synthesizeAssistantResponse } from './synthesize';
import { runConciergePipeline } from './concierge';
import type { AssistantHistoryMessage, AssistantTurnResult } from './types';

export interface AssistantPipelineArgs {
  query: string;
  history: AssistantHistoryMessage[];
}

const OFF_DOMAIN_REPLY =
  'Я помощник по обучению продажам на маркетплейсах — помогаю разобраться в WB/Ozon, рекламе, аналитике, финансах бизнеса и подобрать уроки. С этим вопросом помочь не смогу, но спроси что-нибудь про твой бизнес на маркетплейсе — с удовольствием разберу.';

export async function runAssistantPipeline(args: AssistantPipelineArgs): Promise<AssistantTurnResult> {
  const { category } = await classifyDomain(args.query);

  if (category === 'off_domain') {
    return { category, answer: OFF_DOMAIN_REPLY, lessons: [], jobs: [], navLinks: [] };
  }

  if (category === 'platform_help') {
    const r = await runConciergePipeline({ query: args.query, history: args.history });
    return { category, ...r };
  }

  // material | complaint → материальная ветка (complaint: детекция записана категорией, поведение = помочь)
  const { lessons, jobs } = await retrieveForAssistant(args.query);
  const r = await synthesizeAssistantResponse({
    query: args.query,
    history: args.history,
    lessonCandidates: lessons,
    jobCandidates: jobs,
  });
  return { category, ...r };
}
