-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- AlterEnum
ALTER TYPE "LlmFeature" ADD VALUE 'cluster';

-- AlterTable
ALTER TABLE "Story" ADD COLUMN     "clusterId" TEXT,
ADD COLUMN     "clusterScore" DOUBLE PRECISION,
ADD COLUMN     "isPrimary" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "Cluster" (
    "id" TEXT NOT NULL,
    "representativeStoryId" TEXT NOT NULL,
    "memberCount" INTEGER NOT NULL,
    "sourceKinds" "SourceKind"[],
    "rankScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Cluster_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Cluster_representativeStoryId_key" ON "Cluster"("representativeStoryId");

-- CreateIndex
CREATE INDEX "Story_normalizedTitle_trgm_idx" ON "Story" USING GIN ("normalizedTitle" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "Story_isPrimary_rankScore_id_idx" ON "Story"("isPrimary", "rankScore" DESC, "id" DESC);

-- CreateIndex
CREATE INDEX "Story_clusterId_idx" ON "Story"("clusterId");

-- AddForeignKey
ALTER TABLE "Story" ADD CONSTRAINT "Story_clusterId_fkey" FOREIGN KEY ("clusterId") REFERENCES "Cluster"("id") ON DELETE SET NULL ON UPDATE CASCADE;
