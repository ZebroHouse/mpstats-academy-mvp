import { describe, it, expect } from 'vitest';
import { resolveFirstLesson, FIRST_LESSON_FALLBACK_ID } from '../first-lesson';

describe('resolveFirstLesson', () => {
  it('ANALYTICS × WB → sales forecast', () => {
    expect(resolveFirstLesson(['ANALYTICS'], ['WB'])).toBe('skill_analytics_sales_forecast_001');
  });
  it('ANALYTICS × OZON-only → seller rating', () => {
    expect(resolveFirstLesson(['ANALYTICS'], ['OZON'])).toBe('05_ozon_m03_promotion_003');
  });
  it('both marketplaces → WB wins', () => {
    expect(resolveFirstLesson(['ADS'], ['WB', 'OZON'])).toBe('skill_marketing_seo_optimization_001');
  });
  it('ADS × OZON reuses the same SEO lesson', () => {
    expect(resolveFirstLesson(['ADS'], ['OZON'])).toBe('skill_marketing_seo_optimization_001');
  });
  it('SALES × OZON → Ozon SEO principles', () => {
    expect(resolveFirstLesson(['SALES'], ['OZON'])).toBe('05_ozon_m02_product_card_004');
  });
  it('multi-goal picks highest priority (ANALYTICS over OPERATIONS)', () => {
    expect(resolveFirstLesson(['OPERATIONS', 'ANALYTICS'], ['WB'])).toBe('skill_analytics_sales_forecast_001');
  });
  it('NEW_MARKETPLACE loses to any concrete goal', () => {
    expect(resolveFirstLesson(['NEW_MARKETPLACE', 'CONTENT'], ['WB'])).toBe('03_ai_m03_visual_009');
  });
  it('NEW_MARKETPLACE alone → beginner analytics intro', () => {
    expect(resolveFirstLesson(['NEW_MARKETPLACE'], ['WB'])).toBe('01_analytics_m01_start_002');
  });
  it('no goals / free-text only → ANALYTICS fallback (WB)', () => {
    expect(resolveFirstLesson([], ['WB'])).toBe(FIRST_LESSON_FALLBACK_ID);
  });
  it('no marketplace → defaults to WB', () => {
    expect(resolveFirstLesson(['FINANCE'], [])).toBe('01_analytics_m02_economics_001');
  });
  it('Stepanova case: all 7 goals + [OZON,WB] → analytics sales forecast (WB)', () => {
    expect(
      resolveFirstLesson(
        ['ADS', 'SALES', 'CONTENT', 'ANALYTICS', 'OPERATIONS', 'FINANCE', 'NEW_MARKETPLACE'],
        ['OZON', 'WB'],
      ),
    ).toBe('skill_analytics_sales_forecast_001');
  });
});
