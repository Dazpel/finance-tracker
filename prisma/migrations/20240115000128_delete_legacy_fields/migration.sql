/*
  Warnings:

  - You are about to drop the column `plaidAccessToken` on the `User` table. All the data in the column will be lost.
  - You are about to drop the column `plaidItemId` on the `User` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "User" DROP COLUMN "plaidAccessToken",
DROP COLUMN "plaidItemId";
