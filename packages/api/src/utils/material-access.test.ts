import { describe, it, expect } from 'vitest';
import { applyMaterialAccess } from './material-access';
import type { AssistantMaterialRef } from '@mpstats/ai';

const mk = (id: string, ext: string | null): AssistantMaterialRef => ({
  materialId: id, type: 'CHECKLIST', title: id, ctaText: 'x', isAccessible: true, externalUrl: ext, hasFile: false,
});

describe('applyMaterialAccess', () => {
  it('залоченный → isAccessible=false, externalUrl=null', () => {
    const out = applyMaterialAccess([mk('m1', 'https://x'), mk('m2', 'https://y')], new Set(['m1']));
    expect(out.find((m) => m.materialId === 'm1')).toMatchObject({ isAccessible: true, externalUrl: 'https://x' });
    expect(out.find((m) => m.materialId === 'm2')).toMatchObject({ isAccessible: false, externalUrl: null });
  });
});
