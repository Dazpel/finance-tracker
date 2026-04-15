-- CreateTable
CREATE TABLE "public"."SyncedTransaction" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "plaidAccountId" INTEGER NOT NULL,
    "transaction_id" TEXT NOT NULL,
    "account_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "date" TEXT NOT NULL,
    "category" TEXT[],
    "original_description" TEXT,
    "merchant_name" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SyncedTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."PlaidCursor" (
    "id" TEXT NOT NULL,
    "plaidAccountId" INTEGER NOT NULL,
    "cursor" TEXT NOT NULL,
    "lastSyncAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlaidCursor_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SyncedTransaction_userId_date_idx" ON "public"."SyncedTransaction"("userId", "date");

-- CreateIndex
CREATE INDEX "SyncedTransaction_plaidAccountId_idx" ON "public"."SyncedTransaction"("plaidAccountId");

-- CreateIndex
CREATE INDEX "SyncedTransaction_transaction_id_idx" ON "public"."SyncedTransaction"("transaction_id");

-- CreateIndex
CREATE UNIQUE INDEX "SyncedTransaction_transaction_id_plaidAccountId_key" ON "public"."SyncedTransaction"("transaction_id", "plaidAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "PlaidCursor_plaidAccountId_key" ON "public"."PlaidCursor"("plaidAccountId");

-- AddForeignKey
ALTER TABLE "public"."SyncedTransaction" ADD CONSTRAINT "SyncedTransaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."SyncedTransaction" ADD CONSTRAINT "SyncedTransaction_plaidAccountId_fkey" FOREIGN KEY ("plaidAccountId") REFERENCES "public"."PlaidAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."PlaidCursor" ADD CONSTRAINT "PlaidCursor_plaidAccountId_fkey" FOREIGN KEY ("plaidAccountId") REFERENCES "public"."PlaidAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
