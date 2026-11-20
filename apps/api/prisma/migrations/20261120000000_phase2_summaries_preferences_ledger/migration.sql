-- CreateEnum
CREATE TYPE "SummaryTrigger" AS ENUM ('auto', 'on_demand');

-- CreateEnum
CREATE TYPE "PreferenceKind" AS ENUM ('tag', 'source');

-- CreateEnum
CREATE TYPE "PreferenceMode" AS ENUM ('follow', 'mute');

-- CreateEnum
CREATE TYPE "LlmFeature" AS ENUM ('summary_auto', 'summary_on_demand', 'copilot');

-- CreateTable
CREATE TABLE "Summary" (
    "id" TEXT NOT NULL,
    "storyId" TEXT NOT NULL,
    "tldr" TEXT[],
    "consensus" JSONB,
    "suggestedTags" TEXT[],
    "basedOnComments" INTEGER NOT NULL,
    "trigger" "SummaryTrigger" NOT NULL,
    "model" TEXT NOT NULL,
    "promptVersion" INTEGER NOT NULL,
    "inputTokens" INTEGER NOT NULL,
    "outputTokens" INTEGER NOT NULL,
    "costUsd" DECIMAL(10,6) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Summary_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FeedPreference" (
    "userId" TEXT NOT NULL,
    "kind" "PreferenceKind" NOT NULL,
    "value" TEXT NOT NULL,
    "mode" "PreferenceMode" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FeedPreference_pkey" PRIMARY KEY ("userId","kind","value")
);

-- CreateTable
CREATE TABLE "LlmUsage" (
    "id" TEXT NOT NULL,
    "day" DATE NOT NULL,
    "feature" "LlmFeature" NOT NULL,
    "model" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "reservedUsd" DECIMAL(10,6) NOT NULL,
    "costUsd" DECIMAL(10,6),
    "inputTokens" INTEGER,
    "outputTokens" INTEGER,
    "userId" TEXT,
    "refId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LlmUsage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RateLimitCounter" (
    "key" TEXT NOT NULL,
    "day" DATE NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "RateLimitCounter_pkey" PRIMARY KEY ("key","day")
);

-- CreateIndex
CREATE UNIQUE INDEX "Summary_storyId_key" ON "Summary"("storyId");

-- CreateIndex
CREATE INDEX "LlmUsage_day_feature_idx" ON "LlmUsage"("day", "feature");

-- AddForeignKey
ALTER TABLE "Summary" ADD CONSTRAINT "Summary_storyId_fkey" FOREIGN KEY ("storyId") REFERENCES "Story"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeedPreference" ADD CONSTRAINT "FeedPreference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

