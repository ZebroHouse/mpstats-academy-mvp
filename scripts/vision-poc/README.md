# scripts/vision-poc/

Phase 55 Sprint 1 — Vision Chunking RAG PoC.
**Throwaway**, удаляется/архивируется после Sprint 3.

См. `docs/superpowers/specs/2026-05-06-phase-55-sprint-1-poc-design.md`.

## Запуск (порядок)

```bash
# 0. Setup env
export OPENROUTER_POC_KEY=$(cat "E:/Academy Courses/OpenRouter_Api_key.txt")
export SUPABASE_MGMT_TOKEN=...     # из .claude/memory/reference_supabase_mgmt.md
export SUPABASE_PROJECT_REF=saecuecevicwjkpmaoot

# 1. Выбор 3 видео
npx tsx scripts/vision-poc/select-videos.ts

# 2. Извлечение кадров
npx tsx scripts/vision-poc/extract-frames.ts

# 3. VLM прогон (90 запросов)
npx tsx scripts/vision-poc/run-vlm.ts

# 4. OCR baseline
npx tsx scripts/vision-poc/run-ocr.ts

# 5. (опц.) Сводка
npx tsx scripts/vision-poc/analyze.ts
```

## Результаты

- `results/selected-videos.json` — 3 видео + lessonId + URL
- `results/frames/{lessonId}/*.jpg` — извлечённые кадры
- `results/vlm-runs.json` — 90 VLM-ответов
- `results/ocr-runs.json` — 30 OCR-выводов
- `results/comparison.md` — ручной анализ (commit)
- `results/decision.md` — gate-решение (commit)
- `results/mila-package/` — пакет для тестера (commit)

## Зависимости

- ffmpeg + ffprobe в PATH (`ffmpeg -version`)
- tesseract + rus+eng traineddata (`tesseract --list-langs`)
- Node.js 20+, tsx (уже в devDependencies)
