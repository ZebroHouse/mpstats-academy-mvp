-- additive: add embedding column for intent->jobs retrieval
ALTER TABLE "Job" ADD COLUMN IF NOT EXISTS "embedding" vector(1536);
-- HNSW index decided after eval; placeholder ivfflat index for now
CREATE INDEX IF NOT EXISTS "Job_embedding_idx" ON "Job" USING ivfflat ("embedding" vector_cosine_ops) WITH (lists = 50);
