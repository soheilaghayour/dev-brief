-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "SourceKind" AS ENUM ('hn', 'devto', 'rss', 'github');

-- CreateEnum
CREATE TYPE "IngestionStatus" AS ENUM ('running', 'success', 'partial', 'failed', 'skipped');

-- CreateTable
CREATE TABLE "user" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "emailVerified" BOOLEAN NOT NULL DEFAULT false,
    "image" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "session" (
    "id" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "token" TEXT NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "account" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "accessToken" TEXT,
    "refreshToken" TEXT,
    "idToken" TEXT,
    "accessTokenExpiresAt" TIMESTAMP(3),
    "refreshTokenExpiresAt" TIMESTAMP(3),
    "scope" TEXT,
    "password" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "verification" (
    "id" TEXT NOT NULL,
    "identifier" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "verification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Source" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "kind" "SourceKind" NOT NULL,
    "name" TEXT NOT NULL,
    "siteUrl" TEXT NOT NULL,
    "feedUrl" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "baselinePercentile" DOUBLE PRECISION,
    "etag" TEXT,
    "lastModified" TEXT,
    "consecutiveFailures" INTEGER NOT NULL DEFAULT 0,
    "circuitOpenUntil" TIMESTAMP(3),
    "lastSuccessAt" TIMESTAMP(3),
    "lastErrorAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Source_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Story" (
    "id" TEXT NOT NULL,
    "canonicalUrl" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "normalizedTitle" TEXT NOT NULL,
    "excerpt" TEXT,
    "author" TEXT,
    "publishedAt" TIMESTAMP(3) NOT NULL,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "readingTimeMinutes" INTEGER,
    "tags" TEXT[],
    "taggerVersion" INTEGER NOT NULL,
    "engagementPercentile" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "rankScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "rankedAt" TIMESTAMP(3),
    "searchVector" tsvector GENERATED ALWAYS AS (
        setweight(to_tsvector('english', coalesce("title", '')), 'A') ||
        setweight(to_tsvector('english', coalesce("excerpt", '')), 'B')
    ) STORED,

    CONSTRAINT "Story_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SourceItem" (
    "id" TEXT NOT NULL,
    "storyId" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "discussionUrl" TEXT,
    "title" TEXT NOT NULL,
    "author" TEXT,
    "publishedAt" TIMESTAMP(3) NOT NULL,
    "points" INTEGER,
    "commentsCount" INTEGER,
    "reactionsCount" INTEGER,
    "stars" INTEGER,
    "engagement" INTEGER NOT NULL DEFAULT 0,
    "percentile" DOUBLE PRECISION,
    "sourceTags" TEXT[],
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SourceItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IngestionRun" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "sourceId" TEXT,
    "status" "IngestionStatus" NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "itemsFetched" INTEGER NOT NULL DEFAULT 0,
    "itemsCreated" INTEGER NOT NULL DEFAULT 0,
    "itemsUpdated" INTEGER NOT NULL DEFAULT 0,
    "durationMs" INTEGER,
    "error" TEXT,

    CONSTRAINT "IngestionRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Save" (
    "userId" TEXT NOT NULL,
    "storyId" TEXT NOT NULL,
    "savedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Save_pkey" PRIMARY KEY ("userId","storyId")
);

-- CreateTable
CREATE TABLE "TagDailyStat" (
    "day" DATE NOT NULL,
    "tag" TEXT NOT NULL,
    "storyCount" INTEGER NOT NULL,
    "engagementSum" INTEGER NOT NULL,
    "avgPercentile" DOUBLE PRECISION NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TagDailyStat_pkey" PRIMARY KEY ("day","tag")
);

-- CreateIndex
CREATE UNIQUE INDEX "user_email_key" ON "user"("email");

-- CreateIndex
CREATE UNIQUE INDEX "session_token_key" ON "session"("token");

-- CreateIndex
CREATE INDEX "session_userId_idx" ON "session"("userId");

-- CreateIndex
CREATE INDEX "account_userId_idx" ON "account"("userId");

-- CreateIndex
CREATE INDEX "verification_identifier_idx" ON "verification"("identifier");

-- CreateIndex
CREATE UNIQUE INDEX "Source_slug_key" ON "Source"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Story_canonicalUrl_key" ON "Story"("canonicalUrl");

-- CreateIndex
CREATE INDEX "Story_publishedAt_id_idx" ON "Story"("publishedAt" DESC, "id" DESC);

-- CreateIndex
CREATE INDEX "Story_rankScore_id_idx" ON "Story"("rankScore" DESC, "id" DESC);

-- CreateIndex
CREATE INDEX "Story_normalizedTitle_publishedAt_idx" ON "Story"("normalizedTitle", "publishedAt");

-- CreateIndex
CREATE INDEX "Story_tags_idx" ON "Story" USING GIN ("tags");

-- CreateIndex
CREATE INDEX "Story_searchVector_idx" ON "Story" USING GIN ("searchVector");

-- CreateIndex
CREATE INDEX "SourceItem_storyId_idx" ON "SourceItem"("storyId");

-- CreateIndex
CREATE INDEX "SourceItem_sourceId_publishedAt_idx" ON "SourceItem"("sourceId", "publishedAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "SourceItem_sourceId_externalId_key" ON "SourceItem"("sourceId", "externalId");

-- CreateIndex
CREATE INDEX "IngestionRun_runId_idx" ON "IngestionRun"("runId");

-- CreateIndex
CREATE INDEX "IngestionRun_sourceId_startedAt_idx" ON "IngestionRun"("sourceId", "startedAt" DESC);

-- CreateIndex
CREATE INDEX "IngestionRun_startedAt_idx" ON "IngestionRun"("startedAt");

-- CreateIndex
CREATE INDEX "Save_userId_savedAt_idx" ON "Save"("userId", "savedAt" DESC);

-- CreateIndex
CREATE INDEX "Save_storyId_idx" ON "Save"("storyId");

-- CreateIndex
CREATE INDEX "TagDailyStat_tag_day_idx" ON "TagDailyStat"("tag", "day");

-- AddForeignKey
ALTER TABLE "session" ADD CONSTRAINT "session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "account" ADD CONSTRAINT "account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SourceItem" ADD CONSTRAINT "SourceItem_storyId_fkey" FOREIGN KEY ("storyId") REFERENCES "Story"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SourceItem" ADD CONSTRAINT "SourceItem_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "Source"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IngestionRun" ADD CONSTRAINT "IngestionRun_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "Source"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Save" ADD CONSTRAINT "Save_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Save" ADD CONSTRAINT "Save_storyId_fkey" FOREIGN KEY ("storyId") REFERENCES "Story"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

