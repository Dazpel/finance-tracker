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

-- Backfill approvedAt on legacy rows so they have a sensible approval timestamp.
-- Do NOT populate month/year here: legacy rows predate the auto-draft system,
-- may include multiple MONTHLY reports per calendar month (bi-weekly / partial
-- flows), and should not participate in the auto-draft partial unique index
-- or occupy the auto-draft slot for their calendar month.
UPDATE "Report"
SET "approvedAt" = "createdAt"
WHERE "approvedAt" IS NULL;

-- Partial unique index: one auto-maintained row per (user, year, month, reportType).
-- Scoped via WHERE so UI-created reports (autoMaintainedAt IS NULL) are unaffected
-- and can continue to allow multiple MONTHLY rows per month.
CREATE UNIQUE INDEX "Report_user_month_autoDraft_key"
    ON "Report"("userId", "year", "month", "reportType")
    WHERE "autoMaintainedAt" IS NOT NULL;

CREATE INDEX "Report_userId_status_idx"
    ON "Report"("userId", "status");
