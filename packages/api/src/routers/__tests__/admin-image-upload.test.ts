import { describe, it, expect, vi, beforeEach } from 'vitest';
vi.mock('server-only', () => ({}));
vi.mock('@mpstats/ai', () => ({ indexLessonText: vi.fn() }));

const createSignedUploadUrl = vi.fn().mockResolvedValue({
  data: { signedUrl: 'https://upload.example/xyz', token: 'tok' }, error: null,
});
vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({ storage: { from: vi.fn(() => ({ createSignedUploadUrl })) } })),
}));
process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co';
process.env.SUPABASE_SECRET_KEY = 'test-secret';

import { adminRouter } from '../admin';

function makeCtx() {
  const findUnique = vi.fn().mockResolvedValueOnce(null).mockResolvedValueOnce({ role: 'ADMIN' });
  return { ctx: { user: { id: 'a1' }, prisma: { userProfile: { findUnique }, userActivityDay: { upsert: vi.fn().mockResolvedValue({}) } } } };
}

describe('admin.requestLessonImageUploadUrl', () => {
  beforeEach(() => vi.clearAllMocks());
  it('returns uploadUrl + public URL for an allowed image', async () => {
    const { ctx } = makeCtx();
    const caller = adminRouter.createCaller(ctx as never);
    const res = await caller.requestLessonImageUploadUrl({ filename: 'pic.png', mimeType: 'image/png', fileSize: 1000 });
    expect(res.uploadUrl).toBe('https://upload.example/xyz');
    expect(res.publicUrl).toContain('/storage/v1/object/public/lesson-images/');
  });
  it('rejects non-image MIME', async () => {
    const { ctx } = makeCtx();
    const caller = adminRouter.createCaller(ctx as never);
    await expect(
      caller.requestLessonImageUploadUrl({ filename: 'x.pdf', mimeType: 'application/pdf' as never, fileSize: 10 }),
    ).rejects.toBeTruthy();
  });
});
