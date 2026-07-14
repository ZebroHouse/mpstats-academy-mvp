import { PLATFORM_MAP } from './platform-map';

export interface FaqItem {
  question: string; // первый триггер записи
  answer: string;
}

// FAQ = static-записи карты с showInFaq. Один источник правды с концьержем.
export function getFaqItems(): FaqItem[] {
  return PLATFORM_MAP.filter(
    (e): e is Extract<typeof e, { kind: 'static' }> => e.kind === 'static' && e.showInFaq === true,
  ).map((e) => ({ question: e.triggers[0] ?? e.id, answer: e.answer }));
}
