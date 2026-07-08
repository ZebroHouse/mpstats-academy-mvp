import { classifyDomain } from './gate';
import { retrieveForAssistant } from './retrieve';
import { synthesizeAssistantResponse } from './synthesize';
import type { AssistantHistoryMessage, AssistantTurnResult } from './types';

export interface AssistantPipelineArgs {
  query: string;
  history: AssistantHistoryMessage[];
}

const OFF_DOMAIN_REPLY =
  'Я помощник по обучению продажам на маркетплейсах — помогаю разобраться в WB/Ozon, рекламе, аналитике, финансах бизнеса и подобрать уроки. С этим вопросом помочь не смогу, но спроси что-нибудь про твой бизнес на маркетплейсе — с удовольствием разберу.';

export async function runAssistantPipeline(args: AssistantPipelineArgs): Promise<AssistantTurnResult> {
  const gate = await classifyDomain(args.query);
  if (!gate.inDomain) {
    return { inDomain: false, answer: OFF_DOMAIN_REPLY, lessons: [], jobs: [] };
  }

  const { lessons, jobs } = await retrieveForAssistant(args.query);
  return synthesizeAssistantResponse({
    query: args.query,
    history: args.history,
    lessonCandidates: lessons,
    jobCandidates: jobs,
  });
}
