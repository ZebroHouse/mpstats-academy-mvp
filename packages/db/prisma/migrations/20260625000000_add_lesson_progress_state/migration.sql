-- Additive: nullable JSONB holding interactive-lesson reveal state
-- ({ version, revealedGateIds[], checkpointChoices{} }). No data loss; existing
-- video/text progress rows keep progressState = NULL.
ALTER TABLE "LessonProgress" ADD COLUMN "progressState" JSONB;
