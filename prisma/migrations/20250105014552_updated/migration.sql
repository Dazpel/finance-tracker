-- CreateEnum
CREATE TYPE "ReportType" AS ENUM ('MONTHLY', 'ANNUAL');

-- AlterTable
ALTER TABLE "Report" ADD COLUMN     "parentReportId" INTEGER,
ADD COLUMN     "reportType" "ReportType" NOT NULL DEFAULT 'MONTHLY';

-- AddForeignKey
ALTER TABLE "Report" ADD CONSTRAINT "Report_parentReportId_fkey" FOREIGN KEY ("parentReportId") REFERENCES "Report"("id") ON DELETE SET NULL ON UPDATE CASCADE;
