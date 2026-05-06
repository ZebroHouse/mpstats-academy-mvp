// scripts/vision-poc/config.ts
export const POC_CONFIG = {
  academy_courses_root: 'E:/Academy Courses',
  duration_buckets: {
    short: [180, 600] as [number, number],
    medium: [1200, 2400] as [number, number],
    long: [3600, 10800] as [number, number],
  },
  course_priority: ['01_analytics', '03_ai', '04_workshops'],
  frame_interval_seconds: 60,
  frames_cap_per_video: 120,
  frames_for_poc_sample: 10,
  vlm_models: [
    'google/gemini-2.5-flash-lite',
    'google/gemini-3.1-flash-lite-preview',
    'openai/gpt-4.1-mini',
  ],
  vlm_fallback_if_preview_unavailable: 'google/gemini-2.5-flash',
  rate_limit_rps: 5,
  ocr_languages: 'rus+eng',
  ocr_psm: 6,
  results_dir: 'scripts/vision-poc/results',
  frames_dir: 'scripts/vision-poc/results/frames',
} as const;
