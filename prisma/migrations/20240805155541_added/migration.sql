/*
  Warnings:

  - Added the required column `frequency` to the `RecurringTransaction` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "RecurringReport" ADD COLUMN     "inflow" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "outflow" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "total" DOUBLE PRECISION NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "RecurringTransaction" ADD COLUMN     "frequency" TEXT NOT NULL;
