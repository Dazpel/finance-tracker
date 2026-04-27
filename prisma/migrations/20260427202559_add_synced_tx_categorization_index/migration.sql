-- CreateIndex
CREATE INDEX "SyncedTransaction_userCategoryOverride_userSoftDeleted_crea_idx" ON "public"."SyncedTransaction"("userCategoryOverride", "userSoftDeleted", "createdAt");
