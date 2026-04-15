-- Change SyncedTransaction and PlaidCursor to cascade-delete when a PlaidAccount is removed.
-- This ensures that removing a bank connection cleans up its live sync data automatically.
-- Report transactions (Transaction model) are unaffected — they are snapshots with no FK to PlaidAccount.

-- SyncedTransaction: drop RESTRICT, add CASCADE
ALTER TABLE "public"."SyncedTransaction" DROP CONSTRAINT "SyncedTransaction_plaidAccountId_fkey";
ALTER TABLE "public"."SyncedTransaction" ADD CONSTRAINT "SyncedTransaction_plaidAccountId_fkey"
  FOREIGN KEY ("plaidAccountId") REFERENCES "public"."PlaidAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- PlaidCursor: drop RESTRICT, add CASCADE
ALTER TABLE "public"."PlaidCursor" DROP CONSTRAINT "PlaidCursor_plaidAccountId_fkey";
ALTER TABLE "public"."PlaidCursor" ADD CONSTRAINT "PlaidCursor_plaidAccountId_fkey"
  FOREIGN KEY ("plaidAccountId") REFERENCES "public"."PlaidAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
