-- CreateEnum
CREATE TYPE "CategorySource" AS ENUM ('user', 'lookup', 'signal', 'ai');

-- AlterTable
ALTER TABLE "SyncedTransaction" ADD COLUMN "categorySource" "CategorySource";

-- Existing rows are intentionally left NULL: the legacy userCategoryOverride
-- column mixes AI-assigned and user-corrected categories with no reliable way
-- to split them retroactively. Provenance accrues from new writes onward.
