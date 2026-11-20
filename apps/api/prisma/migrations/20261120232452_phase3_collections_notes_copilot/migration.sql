-- CreateEnum
CREATE TYPE "CopilotStatus" AS ENUM ('streaming', 'complete', 'failed', 'fallback', 'no_coverage');

-- AlterTable
ALTER TABLE "Save" ADD COLUMN     "note" TEXT,
ADD COLUMN     "noteUpdatedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "Collection" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "position" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Collection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CollectionItem" (
    "collectionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "storyId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CollectionItem_pkey" PRIMARY KEY ("collectionId","storyId")
);

-- CreateTable
CREATE TABLE "CopilotQuery" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "guestKey" TEXT,
    "question" TEXT NOT NULL,
    "questionHash" TEXT NOT NULL,
    "status" "CopilotStatus" NOT NULL,
    "messages" JSONB NOT NULL,
    "storyIds" TEXT[],
    "inputTokens" INTEGER,
    "outputTokens" INTEGER,
    "costUsd" DECIMAL(10,6),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CopilotQuery_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExampleBriefing" (
    "slug" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "messages" JSONB NOT NULL,
    "position" INTEGER NOT NULL,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExampleBriefing_pkey" PRIMARY KEY ("slug")
);

-- CreateIndex
CREATE INDEX "Collection_userId_position_idx" ON "Collection"("userId", "position");

-- CreateIndex
CREATE UNIQUE INDEX "Collection_userId_slug_key" ON "Collection"("userId", "slug");

-- CreateIndex
CREATE INDEX "CollectionItem_userId_storyId_idx" ON "CollectionItem"("userId", "storyId");

-- CreateIndex
CREATE INDEX "CopilotQuery_questionHash_createdAt_idx" ON "CopilotQuery"("questionHash", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "CopilotQuery_createdAt_idx" ON "CopilotQuery"("createdAt");

-- AddForeignKey
ALTER TABLE "Collection" ADD CONSTRAINT "Collection_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CollectionItem" ADD CONSTRAINT "CollectionItem_collectionId_fkey" FOREIGN KEY ("collectionId") REFERENCES "Collection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CollectionItem" ADD CONSTRAINT "CollectionItem_userId_storyId_fkey" FOREIGN KEY ("userId", "storyId") REFERENCES "Save"("userId", "storyId") ON DELETE CASCADE ON UPDATE CASCADE;
