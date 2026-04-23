-- CreateEnum
CREATE TYPE "ReportStatus" AS ENUM ('DRAFT', 'PENDING_APPROVAL', 'APPROVED');

-- AlterTable: Report lifecycle fields
ALTER TABLE "Report"
    ADD COLUMN "status"           "ReportStatus" NOT NULL DEFAULT 'APPROVED',
    ADD COLUMN "month"            INTEGER,
    ADD COLUMN "year"             INTEGER,
    ADD COLUMN "autoMaintainedAt" TIMESTAMP(3),
    ADD COLUMN "approvedAt"       TIMESTAMP(3);

-- AlterTable: SyncedTransaction user-intent fields
ALTER TABLE "SyncedTransaction"
    ADD COLUMN "userCategoryOverride" TEXT,
    ADD COLUMN "userSoftDeleted"      BOOLEAN NOT NULL DEFAULT false;

-- Backfill existing reports so they are treated as historical/approved
-- and have month/year populated for the unique constraint.
UPDATE "Report"
SET
    "status"     = 'APPROVED',
    "approvedAt" = "createdAt",
    "year"       = EXTRACT(YEAR  FROM "createdAt")::int,
    "month"      = EXTRACT(MONTH FROM "createdAt")::int
WHERE "month" IS NULL;

-- Unique + supporting indexes
CREATE UNIQUE INDEX "Report_userId_year_month_reportType_key"
    ON "Report"("userId", "year", "month", "reportType");

CREATE INDEX "Report_userId_status_idx"
    ON "Report"("userId", "status");
