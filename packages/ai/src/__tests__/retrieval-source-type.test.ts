import { describe, it, expect, vi } from 'vitest';

// profiles.ts imports 'server-only' (transitively) — neutralize for unit test.
vi.mock('server-only', () => ({}));

import { PROFILES } from '../profiles';

describe('academy-lesson retrieval profile', () => {
  it('includes academy_text so text lessons surface in the lesson AI chat', () => {
    expect(PROFILES['academy-lesson'].sourceTypes).toContain('academy_text');
  });

  it('keeps audio + video frame sources (does not drop existing)', () => {
    expect(PROFILES['academy-lesson'].sourceTypes).toContain('academy_audio');
    expect(PROFILES['academy-lesson'].sourceTypes).toContain('academy_video_frame');
  });
});
