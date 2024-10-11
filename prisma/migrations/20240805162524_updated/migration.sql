-- DropForeignKey
ALTER TABLE "RecurringTransaction" DROP CONSTRAINT "RecurringTransaction_inflowReportId_fkey";

-- DropForeignKey
ALTER TABLE "RecurringTransaction" DROP CONSTRAINT "RecurringTransaction_outflowReportId_fkey";

-- AlterTable
ALTER TABLE "RecurringTransaction" ALTER COLUMN "inflowReportId" DROP NOT NULL,
ALTER COLUMN "outflowReportId" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "RecurringTransaction" ADD CONSTRAINT "RecurringTransaction_outflowReportId_fkey" FOREIGN KEY ("outflowReportId") REFERENCES "RecurringReport"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecurringTransaction" ADD CONSTRAINT "RecurringTransaction_inflowReportId_fkey" FOREIGN KEY ("inflowReportId") REFERENCES "RecurringReport"("id") ON DELETE SET NULL ON UPDATE CASCADE;
