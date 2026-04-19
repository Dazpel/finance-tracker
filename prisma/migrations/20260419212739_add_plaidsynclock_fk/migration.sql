-- AddForeignKey
ALTER TABLE "public"."PlaidSyncLock" ADD CONSTRAINT "PlaidSyncLock_plaidAccountId_fkey" FOREIGN KEY ("plaidAccountId") REFERENCES "public"."PlaidAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
