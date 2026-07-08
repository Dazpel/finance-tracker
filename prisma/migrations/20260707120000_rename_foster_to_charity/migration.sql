-- Session-scoped overrides for this migration only: the backfill UPDATEs seq-scan
-- Transaction/SyncedTransaction and exceed Supabase's default statement_timeout,
-- while lock_timeout keeps a blocked ALTER from queueing behind live traffic.
SET statement_timeout = 0;
SET lock_timeout = '10s';

-- Rename foster -> charity, preserving data
ALTER TABLE "Report" RENAME COLUMN "foster" TO "charity";
ALTER TABLE "ExpenseThreshold" RENAME COLUMN "foster" TO "charity";

-- Backfill stored category labels on transactions (category is text[])
UPDATE "Transaction"
  SET category = array_replace(category, 'Foster', 'Charity')
  WHERE 'Foster' = ANY(category);

UPDATE "SyncedTransaction"
  SET category = array_replace(category, 'Foster', 'Charity')
  WHERE 'Foster' = ANY(category);

UPDATE "SyncedTransaction"
  SET "userCategoryOverride" = 'Charity'
  WHERE "userCategoryOverride" = 'Foster';

-- Backfill NotificationLog: category stores the display label ("Foster"),
-- confirmed via src/lib/notifications/expenseKeys.ts EXPENSE_KEY_TO_DISPLAY.
UPDATE "NotificationLog"
  SET category = 'Charity'
  WHERE category = 'Foster';
