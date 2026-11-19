-- AlterTable
ALTER TABLE "SourceItem" ADD COLUMN "canonicalUrl" TEXT;

-- Existing items take their Story's URL; ingestion's update path rewrites each item's own on its next fetch.
UPDATE "SourceItem" si SET "canonicalUrl" = s."canonicalUrl" FROM "Story" s WHERE s."id" = si."storyId";

ALTER TABLE "SourceItem" ALTER COLUMN "canonicalUrl" SET NOT NULL;

-- CreateIndex
CREATE INDEX "SourceItem_canonicalUrl_idx" ON "SourceItem"("canonicalUrl");
