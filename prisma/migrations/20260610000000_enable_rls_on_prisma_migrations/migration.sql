-- Lockdown follow-up: enable RLS on Prisma's own bookkeeping table.
-- Closes the Supabase linter finding:
--   "Table public._prisma_migrations is public, but RLS has not been enabled."
--
-- The prior migration (20260503120000_enable_rls_lockdown) locked all 13 modeled
-- public tables but intentionally skipped this one. It is the last public table
-- exposed to PostgREST without RLS.
--
-- Prisma's migration engine connects as the `postgres` role (the table owner) and
-- bypasses RLS, so `prisma migrate deploy` keeps reading/writing this table normally.
-- Do NOT add `force row level security` — that would block Prisma too.
-- Do NOT add policies for `anon` / `authenticated` — the empty policy set is the deny-all.

ALTER TABLE IF EXISTS "_prisma_migrations" ENABLE ROW LEVEL SECURITY;
