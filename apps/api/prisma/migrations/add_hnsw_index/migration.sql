-- CreateIndex: HNSW index for fast approximate nearest neighbor search on embeddings.
-- Replaces sequential scan with HNSW graph traversal for cosine similarity queries.
-- Parameters: m=16 (max connections per node), ef_construction=64 (build-time search width).
-- Used by PersonalizedFeedService.findSimilarByVector() for pgvector KNN feed ranking.

CREATE INDEX IF NOT EXISTS embeddings_vector_hnsw_idx
ON "embeddings" USING hnsw (vector vector_cosine_ops)
WITH (m = 16, ef_construction = 64);
