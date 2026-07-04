import { describe, it, expect } from 'vitest';
import { parseFromParam, resolveContextNav, flattenPlanLessonIds } from '../lesson-context';

describe('parseFromParam', () => {
  it('парсит job:<slug>', () => {
    expect(parseFromParam('job:autobidder')).toEqual({ kind: 'job', jobSlug: 'autobidder' });
  });
  it('парсит plan/favorites/storefront/course', () => {
    expect(parseFromParam('plan')).toEqual({ kind: 'plan' });
    expect(parseFromParam('favorites')).toEqual({ kind: 'favorites' });
    expect(parseFromParam('storefront')).toEqual({ kind: 'storefront' });
    expect(parseFromParam('course')).toEqual({ kind: 'course' });
  });
  it('unknown / undefined → course (fallback)', () => {
    expect(parseFromParam(undefined)).toEqual({ kind: 'course' });
    expect(parseFromParam('garbage')).toEqual({ kind: 'course' });
    expect(parseFromParam('job:')).toEqual({ kind: 'course' });
  });
});

describe('resolveContextNav', () => {
  const ids = ['a', 'b', 'c'];
  it('середина → next+prev, не последний', () => {
    expect(resolveContextNav(ids, 'b')).toEqual({ index: 1, nextId: 'c', prevId: 'a', isLast: false });
  });
  it('первый → prev null', () => {
    expect(resolveContextNav(ids, 'a')).toEqual({ index: 0, nextId: 'b', prevId: null, isLast: false });
  });
  it('последний → next null, isLast', () => {
    expect(resolveContextNav(ids, 'c')).toEqual({ index: 2, nextId: null, prevId: 'b', isLast: true });
  });
  it('одиночный → isLast', () => {
    expect(resolveContextNav(['x'], 'x')).toEqual({ index: 0, nextId: null, prevId: null, isLast: true });
  });
  it('не найден в контексте → терминально (safe)', () => {
    expect(resolveContextNav(ids, 'z')).toEqual({ index: -1, nextId: null, prevId: null, isLast: true });
  });
  it('пустой список → терминально', () => {
    expect(resolveContextNav([], 'a')).toEqual({ index: -1, nextId: null, prevId: null, isLast: true });
  });
});

describe('flattenPlanLessonIds', () => {
  it('v1 (массив строк) → как есть', () => {
    expect(flattenPlanLessonIds(['a', 'b', 'c'])).toEqual(['a', 'b', 'c']);
  });
  it('v2/v3 (секции) → errorLessonIds, затем lessonIds, по порядку секций, без дублей', () => {
    const path = {
      version: 3,
      sections: [
        { axis: 'ANALYTICS', lessonIds: ['a', 'b'], errorLessonIds: ['e1'] },
        { axis: 'MARKETING', lessonIds: ['b', 'c'], errorLessonIds: [] },
      ],
    };
    expect(flattenPlanLessonIds(path)).toEqual(['e1', 'a', 'b', 'c']);
  });
  it('пусто/мусор → []', () => {
    expect(flattenPlanLessonIds(null)).toEqual([]);
    expect(flattenPlanLessonIds({})).toEqual([]);
  });
});
