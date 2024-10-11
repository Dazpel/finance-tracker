/*
  Warnings:

  - You are about to drop the column `reportId` on the `RecurringTransaction` table. All the data in the column will be lost.
  - Added the required column `inflowReportId` to the `RecurringTransaction` table without a default value. This is not possible if the table is not empty.
  - Added the required column `outflowReportId` to the `RecurringTransaction` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "RecurringTransaction" DROP CONSTRAINT "RecurringTransaction_reportId_fkey";

-- AlterTable
ALTER TABLE "RecurringTransaction" DROP COLUMN "reportId",
ADD COLUMN     "inflowReportId" INTEGER NOT NULL,
ADD COLUMN     "outflowReportId" INTEGER NOT NULL;

-- AddForeignKey
ALTER TABLE "RecurringTransaction" ADD CONSTRAINT "RecurringTransaction_outflowReportId_fkey" FOREIGN KEY ("outflowReportId") REFERENCES "RecurringReport"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecurringTransaction" ADD CONSTRAINT "RecurringTransaction_inflowReportId_fkey" FOREIGN KEY ("inflowReportId") REFERENCES "RecurringReport"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
