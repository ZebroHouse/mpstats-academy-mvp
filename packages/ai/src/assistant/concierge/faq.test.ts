import { describe, it, expect } from 'vitest';
import { getFaqItems } from './faq';

describe('getFaqItems', () => {
  it('отдаёт только static-записи с showInFaq', () => {
    const items = getFaqItems();
    expect(items.length).toBeGreaterThan(0);
    for (const it of items) {
      expect(it.question).toBeTruthy();
      expect(it.answer).toBeTruthy();
    }
  });
});
