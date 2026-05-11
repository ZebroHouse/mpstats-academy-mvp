# MAAL Project Memory Index

Entries referenced by CLAUDE.md and Phase plans.

## Session & Sprint
- [Session History](session-history.md) — Detailed notes for all dev sessions (phases 1-53)
- [Sprint Progress](sprint-progress.md) — Completed sprints 0-5 with task IDs (all done)

## Infra & Platform
- [Supabase Details](supabase-details.md) — RLS strategy, keep-alive, test users, auth gotchas
- [Deploy Details](deploy-details.md) — VPS 89.208.106.208, Docker, Nginx, domain migration
- [Staging Workflow](staging-workflow.md) — Полный staging deploy + добавление feature flags + known limitations (quick-ref в CLAUDE.md)
- [CQ Integration](cq-integration.md) — CarrotQuest API gotchas, events, email automation
- [Design Backups](design-backups.md) — Figma sources, v1 backup location, architecture HTML

## Staging Environment — Phase 48 (2026-04-23 … 2026-04-24)
- [project_staging_environment.md](project_staging_environment.md) — второй Docker-стенд `staging.platform.mpstats.academy`, basic auth `team`, порт 3001, shared Supabase DB, feature flags `NEXT_PUBLIC_STAGING` + `NEXT_PUBLIC_SHOW_LIBRARY`. Deploy: `docker compose -p maal-staging -f docker-compose.staging.yml up -d --build`.
- [project_phase48_debug_postmortem.md](project_phase48_debug_postmortem.md) — 5-layer debug инцидент при запуске Library feature-flag: Turbo strict env / compose `${VAR}` / `process is not defined` / API filter vs Phase 46 data drift / UI placement. Чеклист перед каждым новым staging-флагом.

## Phase 49 — Lesson Materials (shipped 2026-04-27)
- [project_lesson_materials.md](project_lesson_materials.md) — schema (Material/LessonMaterial/MaterialType), Storage bucket `lesson-materials` (private, 25 MB, MIME whitelist), 9-procedure tRPC router с XOR source validation и ACL через прикреплённые уроки, ingest скрипт залил 62 материала + 97 привязок из Google Sheet методологов, UI секция «Материалы к уроку» на `/learn/[id]` (5 type configs, locked-lesson защита через empty array), админка `/admin/content/materials` с drag-n-drop upload через signed PUT URL, daily cron на orphan-файлы. Methodologist guide — `docs/admin-guides/lesson-materials.md`.

## Phase 55 — Vision RAG (Sprint 2 + 2C shipped, Sprint 3 prep in progress)
- [vision-ingest-safety.md](vision-ingest-safety.md) — 7 codified safety rules (timeout / resumable JSONL / pre-flight validation / small-batch dry-run / hidden-lesson aware / idempotent selector / cost logging). Each rule traces to a real Sprint 2/2C incident. Authoritative for all future ingest sprints. Cross-AI.
- **Pipeline location:** `scripts/vision-ingest/` — selector(s), extract-frames-prod, dedup-frames, vlm-describe (concurrency=5, AbortController, JSONL resume), upload-frames-storage, embed-and-insert. Parametrized via `INGEST_SUFFIX` env var.
- **Operational guide:** `scripts/vision-ingest/PLAYBOOK.md` — 3-gate procedure (select → validate → ingest → smoke → decision). Cost projection table. Rollback playbook.
- **Architecture:** `scripts/vision-ingest/ARCHITECTURE.md` — data flow, schema (`content_chunk.source_type` + `trust_tier`), retrieval profiles (`packages/ai/src/profiles.ts`), generation context labelling `[АУДИО]` vs `[ЭКРАН]`, VLM prompt design.
- **Sprint state:** 89/440 lessons (10 pilot Sprint 2 + 79 Sprint 2C of `03_ai`). Sprint 2C smoke 88.9% accuracy with `openai/gpt-4.1-mini`. Sprint 3 prep: selector v4 + DB-persisted mappings via `Lesson.metadata.videoSource`.
- **Cost anchor:** $0.94 for 79 lessons (mini VLM + embeddings). Sprint 3 projected ~$4-5 for 351 remaining.
