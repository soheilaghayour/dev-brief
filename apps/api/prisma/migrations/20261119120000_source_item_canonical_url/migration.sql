/*
  Warnings:

  - Added the required column `canonicalUrl` to the `SourceItem` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "SourceItem" ADD COLUMN     "canonicalUrl" TEXT NOT NULL;

-- CreateIndex
CREATE INDEX "SourceItem_canonicalUrl_idx" ON "SourceItem"("canonicalUrl");
