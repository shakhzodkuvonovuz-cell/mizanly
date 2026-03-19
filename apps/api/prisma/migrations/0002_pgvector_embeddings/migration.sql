-- Enable pgvector extension (supported natively on Neon PostgreSQL)
CREATE EXTENSION IF NOT EXISTS vector;

-- CreateEnum
CREATE TYPE "EmbeddingContentType" AS ENUM ('POST', 'REEL', 'THREAD', 'VIDEO');

-- CreateTable
CREATE TABLE "embeddings" (
    "id" TEXT NOT NULL,
    "contentId" TEXT NOT NULL,
    "contentType" "EmbeddingContentType" NOT NULL,
    "vector" vector(768),
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "embeddings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex: unique constraint on content
CREATE UNIQUE INDEX "embeddings_contentId_contentType_key" ON "embeddings"("contentId", "contentType");

-- CreateIndex: type filter
CREATE INDEX "embeddings_contentType_idx" ON "embeddings"("contentType");

-- CreateIndex: IVFFlat vector similarity index for KNN search
-- Uses cosine distance; 100 lists is a good default for <1M rows
CREATE INDEX "embeddings_vector_idx" ON "embeddings" USING ivfflat ("vector" vector_cosine_ops) WITH (lists = 100);
