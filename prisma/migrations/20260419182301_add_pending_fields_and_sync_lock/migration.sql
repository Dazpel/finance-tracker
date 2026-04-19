-- AlterTable
ALTER TABLE "public"."SyncedTransaction" ADD COLUMN     "pending" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "pending_transaction_id" TEXT;

-- CreateTable
CREATE TABLE "public"."PlaidSyncLock" (
    "plaidAccountId" INTEGER NOT NULL,
    "acquiredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlaidSyncLock_pkey" PRIMARY KEY ("plaidAccountId")
);

-- CreateIndex
CREATE INDEX "SyncedTransaction_pending_transaction_id_idx" ON "public"."SyncedTransaction"("pending_transaction_id");
