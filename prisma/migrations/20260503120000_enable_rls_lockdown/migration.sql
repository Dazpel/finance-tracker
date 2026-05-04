-- Lockdown: enable RLS on every public table with no policies (deny-all).
-- Prisma connects as the postgres role and bypasses RLS, so backend code is
-- unaffected. The Supabase anon key shipped in the mobile binary becomes
-- powerless against `public` data via REST/PostgREST.
--
-- Do NOT add `force row level security` here — that would block Prisma too.
-- Do NOT add policies granting access to `anon` / `authenticated` roles —
-- that would re-open the direct-Supabase data path.

ALTER TABLE "User"                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Transaction"          ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PlaidAccount"         ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PlaidCursor"          ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PlaidSyncLock"        ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PushToken"            ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ExpenseThreshold"     ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Note"                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE "NotificationLog"      ENABLE ROW LEVEL SECURITY;
ALTER TABLE "RecurringReport"      ENABLE ROW LEVEL SECURITY;
ALTER TABLE "RecurringTransaction" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Report"               ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SyncedTransaction"    ENABLE ROW LEVEL SECURITY;
