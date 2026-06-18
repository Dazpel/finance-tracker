# Int → UUID Primary Key Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace sequential integer primary keys with UUIDs on the six remaining tables (`PlaidAccount`, `Report`, `RecurringReport`, `RecurringTransaction`, `Transaction`, `Note`) so resource URLs are no longer enumerable, without breaking any web/mobile endpoint during rollout.

**Architecture:** Mobile app first — it is changed to treat IDs as opaque strings, which works against BOTH the current integer backend and the future UUID backend (integers serialize identically in URLs and template strings). Then backend code + a single hand-written, data-preserving SQL migration ship together in one deploy. Old integer PKs are kept as nullable `legacyId` audit columns for a stability window, then dropped.

**Tech Stack:** Next.js 16 (App Router) + Prisma 6.16.2 + Supabase Postgres (RLS enabled, deny-all) + NextAuth; mobile is Expo 55 / React Native with EAS OTA updates (`runtimeVersion: { policy: "appVersion" }` — all changes here are JS-only, so OTA reaches existing binaries).

---

## Design Decisions (already made — do not relitigate)

1. **UUID v4 via `@default(uuid())`, stored as `TEXT`.** This matches the existing UUID models (`User`, `SyncedTransaction`, `PlaidCursor`, `ExpenseThreshold`, `NotificationLog`, `PushToken`), which are Prisma `String @default(uuid())` → Postgres `text`. UUIDv7 (`uuid(7)`) was considered and rejected: its embedded timestamp leaks creation time, and B-tree index locality is irrelevant at this dataset size. Backfill of existing rows uses Postgres `gen_random_uuid()::text` (native in PG13+/Supabase).
2. **Single-migration cutover, not expand/contract dual-write.** This is a small-scale app with manually-applied migrations (no `migrate deploy` in CI) and low traffic (GitHub cron jobs hit it hourly/6-hourly). A multi-week dual-column dance is not justified. Safety comes from: mobile-first rollout, a rehearsal run against a restored backup, integrity assertions inside the migration transaction (Prisma wraps each migration in one transaction on Postgres), a fresh `pg_dump` immediately before cutover, and keeping `legacyId` columns.
3. **Old integer PKs survive as `legacyId Int?` columns** (no default, no constraints) on the six tables. Relationships are fully re-encoded by the new UUID FKs, so old FK columns are dropped. `legacyId` gives an audit trail / old-URL mapping and is removed in a follow-up migration (Task 18).
4. **Rollout order is mandatory:** Part 1 (mobile, backward compatible) → EAS OTA adoption window → Part 2 (backend code, reviewed & built) → Part 3 (cutover: `prisma migrate deploy` then immediately promote the Vercel deploy). Old mobile JS bundles that never took the OTA update will break on report-detail/approve/category screens after cutover — the adoption window in Task 15 mitigates this.
5. **Commits:** Per the repo owner's standing instruction, NO commit is made without their explicit approval. Every "Commit" step below means "stage and present the diff; commit only on approval."

## Out of scope

- `User`, `SyncedTransaction`, `PlaidCursor`, `ExpenseThreshold`, `NotificationLog`, `PushToken` — already UUID.
- Plaid-protocol identifiers (`transaction_id`, `account_id`, `stream_id`, `itemId`) — external strings, not ours.
- RLS policies — the existing deny-all RLS (migration `20260503120000_enable_rls_lockdown`) attaches to tables, not columns; column swaps don't disturb it. No policy references id columns.

---

# PART 1 — Mobile app (`finance-tracker-mobile` repo, separate git repo)

These changes are **backward compatible with the current integer backend**: route params arrive as strings already, `String(123)` interpolation is unchanged, and the backend's `Number("123")` parsing still succeeds. Ship this part days before cutover.

Work on a new branch in the mobile repo: `git checkout -b feat/opaque-string-ids`.

### Task 1: Mobile type definitions — report IDs become strings

**Files:**
- Modify: `types/index.ts` (lines ~41, ~62, ~217, ~242)

- [ ] **Step 1: Change the four `id: number` declarations to `id: string`**

In `types/index.ts`:

```typescript
export interface Report {
  id: string;            // was: number
  reportName: string;
  // ... rest unchanged
}

export type ReportRow = {
  id: string;            // was: number
  reportName: string;
  // ... rest unchanged
};

export type ReportListItem = {
  id: string;            // was: number
  reportName: string;
  // ... rest unchanged
};

export type ApproveReportResponse = {
  id: string;            // was: number
  status: "APPROVED";
  approvedAt: string;
};
```

Leave `CategoryTransactionSynced.id` / `CategoryTransactionFrozen.id` alone — already `string`.

> Runtime note (add as a comment next to `Report.id`): until the backend migrates, the server still sends JSON numbers in these fields. All consumers must treat the id as opaque — interpolate or pass through only, never call string methods on it. The changes in Tasks 2–4 enforce exactly that.

- [ ] **Step 2: Typecheck — collect the fallout list**

Run: `npx tsc --noEmit`
Expected: errors precisely at the sites fixed in Tasks 2–4 (`services/api.ts`, the three `[id].tsx` screens, `lib/routes.ts`, `lib/categoryScope.ts`). No other files should appear; if one does, apply the same number→string treatment there.

### Task 2: Mobile API client signatures

**Files:**
- Modify: `services/api.ts` (lines ~125, ~192, ~202)

- [ ] **Step 1: Change the three signatures**

```typescript
export const fetchCategoryTransactions = (params: {
  key: CategoryKey;
  monthKey?: string;
  reportId?: string;     // was: number
}) => {
  const qs = new URLSearchParams({ key: params.key });
  if (params.reportId != null) qs.set("reportId", String(params.reportId));
  if (params.monthKey) qs.set("monthKey", params.monthKey);
  return authenticatedFetch<CategoryTransactionsResponse>(
    `/api/mobile/category-transactions?${qs.toString()}`
  );
};

export const fetchReportDetail = (id: string) =>     // was: (id: number)
  authenticatedFetch<ReportDetailResponse>(
    `/api/mobile/reports/${encodeURIComponent(id)}`
  );

export const approveReport = (id: string) =>         // was: (id: number)
  authenticatedFetch<ApproveReportResponse>(
    `/api/mobile/reports/${encodeURIComponent(id)}/approve`,
    { method: "POST" }
  );
```

(Adding `encodeURIComponent` matches the existing `patchSyncedTransaction` pattern; harmless for both ints and UUIDs.)

### Task 3: Mobile route-param parsing — drop `Number()` coercion

**Files:**
- Modify: `app/(app)/report/[id].tsx` (lines ~44, ~54, ~129)
- Modify: `app/(app)/category/[id].tsx` (line ~32)
- Modify: `app/(app)/transaction/[id].tsx` (line ~69)

- [ ] **Step 1: `report/[id].tsx` — keep the param as a string**

```typescript
const { id: rawId } = useLocalSearchParams<{ id: string }>();
const id = typeof rawId === "string" ? rawId : undefined;   // was: const id = Number(rawId);
```

Update the query (both `Number.isFinite(id)` guards become string guards):

```typescript
const { data, isPending, isError, error, refetch } =
  useQuery<ReportDetailResponse>({
    queryKey: ["reports", "detail", user?.email, id],
    queryFn: () => fetchReportDetail(id as string),
    enabled: !!user?.email && !!id,                  // was: Number.isFinite(id)
  });
```

```typescript
if (!id) {                                           // was: if (!Number.isFinite(id))
  return <Redirect href={"/reports" as Href} />;
}
```

- [ ] **Step 2: `category/[id].tsx` — pass the param through**

```typescript
const reportId = reportIdParam ?? undefined;   // was: reportIdParam != null ? Number(reportIdParam) : undefined
```

- [ ] **Step 3: `transaction/[id].tsx` — pass the param through**

```typescript
const reportId = reportIdParam ?? undefined;   // was: reportIdParam != null ? Number(reportIdParam) : undefined
```

(The `reportId == null` fallbacks to `currentMonthKey()` keep working — `undefined == null` is true.)

### Task 4: Mobile scope type, route builders, sort comment

**Files:**
- Modify: `lib/categoryScope.ts` (line 3)
- Modify: `lib/routes.ts` (lines ~50, ~67, ~77)
- Modify: `lib/transactionEdit.ts` (comment at lines ~131-134)

- [ ] **Step 1: `lib/categoryScope.ts`**

```typescript
export type TxScope = { reportId?: string; monthKey?: string };  // was: reportId?: number
```

(`scopeToken` needs no change — the template literal already produces `report:<value>` for either type.)

- [ ] **Step 2: `lib/routes.ts` — three signature changes**

```typescript
export function getCategoryRoute(
  categoryId: string,
  scope?: { monthKey?: string; reportId?: string }   // was: reportId?: number
): Href { /* body unchanged */ }

export function getTransactionRoute(
  transactionId: string,
  scope?: { monthKey?: string; reportId?: string }   // was: reportId?: number
): Href { /* body unchanged */ }

export function getReportRoute(id: string): Href {   // was: (id: number)
  return {
    pathname: APP_ROUTES.REPORT,
    params: { id },
  };
}
```

- [ ] **Step 3: `lib/transactionEdit.ts` — fix the stale comment on the id tiebreaker**

The `t.id < tx.id` comparison stays (lexicographic compare matches the server's `orderBy id desc` on text columns post-migration). Replace the comment:

```typescript
// Insertion-sort a tx into a list sorted by:
// (date desc, then by id desc as a tiebreaker — server orders synced by
// [date desc, createdAt desc] and frozen by [date desc, id desc]; ids are
// UUID strings, so this is a lexicographic tiebreaker matching the server's
// text-column ordering — arbitrary but stable and consistent).
```

- [ ] **Step 4: Verify the whole mobile changeset**

Run: `npx tsc --noEmit` — Expected: clean.
Run: `grep -rn "Number(" app lib services hooks components --include="*.ts*" | grep -iv "amount\|total\|month\|year\|price"` — Expected: no remaining `Number()` on any id/reportId param.

- [ ] **Step 5: Smoke test against the CURRENT production backend** (proves backward compatibility)

Launch with `npx expo start`, then: Reports tab → open a report (int id rides as `"123"`) → open a category from that report → open/edit a transaction → approve a DRAFT report if one exists. All must work before cutover.

- [ ] **Step 6: Commit (with user approval) and publish OTA**

```bash
git add -A
git commit -m "feat: treat report ids as opaque strings (UUID migration prep)"
eas update --branch production --message "opaque string ids"
```

Then monitor adoption in the Expo dashboard (Task 15 gates cutover on this).

---

# PART 2 — Backend (`finance-tracker` repo)

Work on a new branch: `git checkout -b feat/uuid-primary-keys` (branched from `main` after `feat/fix-db-access` merges, or from the current branch if directed).

### Task 5: Prisma schema — six models to UUID

**Files:**
- Modify: `prisma/schema.prisma`

- [ ] **Step 1: Apply these exact model changes**

```prisma
model PlaidAccount {
  id                 String              @id @default(uuid())
  legacyId           Int?
  userId             String
  user               User                @relation(fields: [userId], references: [id])
  institutionName    String
  accessToken        String
  itemId             String              @unique
  syncedTransactions SyncedTransaction[]
  cursor             PlaidCursor?
  syncLock           PlaidSyncLock?
  createdAt          DateTime            @default(now())
  updatedAt          DateTime            @updatedAt

  @@index([userId])
}
```

`Report`: `id String @id @default(uuid())`, add `legacyId Int?`, and `parentReportId String?` (relation block unchanged). All other fields/indexes unchanged.

`RecurringReport`: `id String @id @default(uuid())`, add `legacyId Int?`.

`RecurringTransaction`: `id String @id @default(uuid())`, add `legacyId Int?`, `outflowReportId String?`, `inflowReportId String?`.

`Transaction`: `id String @id @default(uuid())`, add `legacyId Int?`, `reportId String`.

`Note`: `id String @id @default(uuid())`, add `legacyId Int?`.

`SyncedTransaction`: `plaidAccountId String` (id already UUID).

`PlaidCursor`: `plaidAccountId String @unique`.

`PlaidSyncLock`: `plaidAccountId String @id`.

- [ ] **Step 2: Validate the schema**

Run: `npx prisma validate` — Expected: "The schema is valid".

### Task 6: The migration — hand-written, data-preserving SQL

**Files:**
- Create: `prisma/migrations/<timestamp>_int_to_uuid_primary_keys/migration.sql`

- [ ] **Step 1: Generate the migration shell without applying it**

Run: `npx prisma migrate dev --create-only --name int_to_uuid_primary_keys`

⚠️ Prisma's auto-generated SQL DROPs and re-ADDs the id columns — it destroys data. **Read it before replacing it**: copy its exact `ADD CONSTRAINT ... FOREIGN KEY ... ON DELETE ... ON UPDATE ...` clauses into section 7 below if they differ (this guarantees zero drift; in particular confirm the `ON DELETE` action Prisma expects for `Report_parentReportId_fkey` and the two `RecurringTransaction` FKs).

- [ ] **Step 2: Replace the generated file's contents with this SQL**

```sql
-- Int → UUID(text) PK migration for PlaidAccount, Report, RecurringReport,
-- RecurringTransaction, Transaction, Note, plus all dependent FK columns.
-- Old integer PKs are preserved as nullable "legacyId" columns (no default,
-- no constraints). Old integer FK columns are dropped (relationships are
-- re-encoded by the new UUID FKs). Runs in one transaction (Prisma default).

-- ── 1. New UUID PK columns, backfilled ──────────────────────────────
ALTER TABLE "PlaidAccount"         ADD COLUMN "uuid" TEXT;
ALTER TABLE "Report"               ADD COLUMN "uuid" TEXT;
ALTER TABLE "RecurringReport"      ADD COLUMN "uuid" TEXT;
ALTER TABLE "RecurringTransaction" ADD COLUMN "uuid" TEXT;
ALTER TABLE "Transaction"          ADD COLUMN "uuid" TEXT;
ALTER TABLE "Note"                 ADD COLUMN "uuid" TEXT;

UPDATE "PlaidAccount"         SET "uuid" = gen_random_uuid()::text;
UPDATE "Report"               SET "uuid" = gen_random_uuid()::text;
UPDATE "RecurringReport"      SET "uuid" = gen_random_uuid()::text;
UPDATE "RecurringTransaction" SET "uuid" = gen_random_uuid()::text;
UPDATE "Transaction"          SET "uuid" = gen_random_uuid()::text;
UPDATE "Note"                 SET "uuid" = gen_random_uuid()::text;

-- ── 2. New FK columns, backfilled via join on the old integer ids ───
ALTER TABLE "Report" ADD COLUMN "parentReportUuid" TEXT;
UPDATE "Report" c SET "parentReportUuid" = p."uuid"
  FROM "Report" p WHERE c."parentReportId" = p."id";

ALTER TABLE "Transaction" ADD COLUMN "reportUuid" TEXT;
UPDATE "Transaction" t SET "reportUuid" = r."uuid"
  FROM "Report" r WHERE t."reportId" = r."id";

ALTER TABLE "RecurringTransaction" ADD COLUMN "outflowReportUuid" TEXT;
UPDATE "RecurringTransaction" rt SET "outflowReportUuid" = rr."uuid"
  FROM "RecurringReport" rr WHERE rt."outflowReportId" = rr."id";

ALTER TABLE "RecurringTransaction" ADD COLUMN "inflowReportUuid" TEXT;
UPDATE "RecurringTransaction" rt SET "inflowReportUuid" = rr."uuid"
  FROM "RecurringReport" rr WHERE rt."inflowReportId" = rr."id";

ALTER TABLE "SyncedTransaction" ADD COLUMN "plaidAccountUuid" TEXT;
UPDATE "SyncedTransaction" st SET "plaidAccountUuid" = pa."uuid"
  FROM "PlaidAccount" pa WHERE st."plaidAccountId" = pa."id";

ALTER TABLE "PlaidCursor" ADD COLUMN "plaidAccountUuid" TEXT;
UPDATE "PlaidCursor" pc SET "plaidAccountUuid" = pa."uuid"
  FROM "PlaidAccount" pa WHERE pc."plaidAccountId" = pa."id";

ALTER TABLE "PlaidSyncLock" ADD COLUMN "plaidAccountUuid" TEXT;
UPDATE "PlaidSyncLock" pl SET "plaidAccountUuid" = pa."uuid"
  FROM "PlaidAccount" pa WHERE pl."plaidAccountId" = pa."id";

-- ── 3. Abort the transaction if any backfill is incomplete ──────────
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "Transaction" WHERE "reportUuid" IS NULL) THEN
    RAISE EXCEPTION 'backfill incomplete: Transaction.reportId';
  END IF;
  IF EXISTS (SELECT 1 FROM "Report"
             WHERE "parentReportId" IS NOT NULL AND "parentReportUuid" IS NULL) THEN
    RAISE EXCEPTION 'backfill incomplete: Report.parentReportId';
  END IF;
  IF EXISTS (SELECT 1 FROM "RecurringTransaction"
             WHERE ("outflowReportId" IS NOT NULL AND "outflowReportUuid" IS NULL)
                OR ("inflowReportId"  IS NOT NULL AND "inflowReportUuid"  IS NULL)) THEN
    RAISE EXCEPTION 'backfill incomplete: RecurringTransaction report FKs';
  END IF;
  IF EXISTS (SELECT 1 FROM "SyncedTransaction" WHERE "plaidAccountUuid" IS NULL) THEN
    RAISE EXCEPTION 'backfill incomplete: SyncedTransaction.plaidAccountId';
  END IF;
  IF EXISTS (SELECT 1 FROM "PlaidCursor" WHERE "plaidAccountUuid" IS NULL) THEN
    RAISE EXCEPTION 'backfill incomplete: PlaidCursor.plaidAccountId';
  END IF;
  IF EXISTS (SELECT 1 FROM "PlaidSyncLock" WHERE "plaidAccountUuid" IS NULL) THEN
    RAISE EXCEPTION 'backfill incomplete: PlaidSyncLock.plaidAccountId';
  END IF;
END $$;

-- ── 4. Drop old FK constraints, PKs, and FK indexes ─────────────────
ALTER TABLE "Transaction"          DROP CONSTRAINT "Transaction_reportId_fkey";
ALTER TABLE "Report"               DROP CONSTRAINT "Report_parentReportId_fkey";
ALTER TABLE "RecurringTransaction" DROP CONSTRAINT "RecurringTransaction_outflowReportId_fkey";
ALTER TABLE "RecurringTransaction" DROP CONSTRAINT "RecurringTransaction_inflowReportId_fkey";
ALTER TABLE "SyncedTransaction"    DROP CONSTRAINT "SyncedTransaction_plaidAccountId_fkey";
ALTER TABLE "PlaidCursor"          DROP CONSTRAINT "PlaidCursor_plaidAccountId_fkey";
ALTER TABLE "PlaidSyncLock"        DROP CONSTRAINT "PlaidSyncLock_plaidAccountId_fkey";

ALTER TABLE "PlaidAccount"         DROP CONSTRAINT "PlaidAccount_pkey";
ALTER TABLE "Report"               DROP CONSTRAINT "Report_pkey";
ALTER TABLE "RecurringReport"      DROP CONSTRAINT "RecurringReport_pkey";
ALTER TABLE "RecurringTransaction" DROP CONSTRAINT "RecurringTransaction_pkey";
ALTER TABLE "Transaction"          DROP CONSTRAINT "Transaction_pkey";
ALTER TABLE "Note"                 DROP CONSTRAINT "Note_pkey";
ALTER TABLE "PlaidSyncLock"        DROP CONSTRAINT "PlaidSyncLock_pkey";

DROP INDEX "Report_parentReportId_idx";
DROP INDEX "Transaction_reportId_idx";
DROP INDEX "RecurringTransaction_outflowReportId_idx";
DROP INDEX "RecurringTransaction_inflowReportId_idx";
DROP INDEX "SyncedTransaction_plaidAccountId_idx";
DROP INDEX "SyncedTransaction_transaction_id_plaidAccountId_key";
DROP INDEX "PlaidCursor_plaidAccountId_key";

-- ── 5. Keep old PKs as legacy columns; drop old FK columns ──────────
ALTER TABLE "PlaidAccount"         RENAME COLUMN "id" TO "legacyId";
ALTER TABLE "Report"               RENAME COLUMN "id" TO "legacyId";
ALTER TABLE "RecurringReport"      RENAME COLUMN "id" TO "legacyId";
ALTER TABLE "RecurringTransaction" RENAME COLUMN "id" TO "legacyId";
ALTER TABLE "Transaction"          RENAME COLUMN "id" TO "legacyId";
ALTER TABLE "Note"                 RENAME COLUMN "id" TO "legacyId";

ALTER TABLE "PlaidAccount"         ALTER COLUMN "legacyId" DROP DEFAULT, ALTER COLUMN "legacyId" DROP NOT NULL;
ALTER TABLE "Report"               ALTER COLUMN "legacyId" DROP DEFAULT, ALTER COLUMN "legacyId" DROP NOT NULL;
ALTER TABLE "RecurringReport"      ALTER COLUMN "legacyId" DROP DEFAULT, ALTER COLUMN "legacyId" DROP NOT NULL;
ALTER TABLE "RecurringTransaction" ALTER COLUMN "legacyId" DROP DEFAULT, ALTER COLUMN "legacyId" DROP NOT NULL;
ALTER TABLE "Transaction"          ALTER COLUMN "legacyId" DROP DEFAULT, ALTER COLUMN "legacyId" DROP NOT NULL;
ALTER TABLE "Note"                 ALTER COLUMN "legacyId" DROP DEFAULT, ALTER COLUMN "legacyId" DROP NOT NULL;

ALTER TABLE "Report"               DROP COLUMN "parentReportId";
ALTER TABLE "Transaction"          DROP COLUMN "reportId";
ALTER TABLE "RecurringTransaction" DROP COLUMN "outflowReportId";
ALTER TABLE "RecurringTransaction" DROP COLUMN "inflowReportId";
ALTER TABLE "SyncedTransaction"    DROP COLUMN "plaidAccountId";
ALTER TABLE "PlaidCursor"          DROP COLUMN "plaidAccountId";
ALTER TABLE "PlaidSyncLock"        DROP COLUMN "plaidAccountId";

DROP SEQUENCE IF EXISTS "PlaidAccount_id_seq", "Report_id_seq",
  "RecurringReport_id_seq", "RecurringTransaction_id_seq",
  "Transaction_id_seq", "Note_id_seq";

-- ── 6. Rename new columns into place, enforce NOT NULL ──────────────
ALTER TABLE "PlaidAccount"         RENAME COLUMN "uuid" TO "id";
ALTER TABLE "Report"               RENAME COLUMN "uuid" TO "id";
ALTER TABLE "RecurringReport"      RENAME COLUMN "uuid" TO "id";
ALTER TABLE "RecurringTransaction" RENAME COLUMN "uuid" TO "id";
ALTER TABLE "Transaction"          RENAME COLUMN "uuid" TO "id";
ALTER TABLE "Note"                 RENAME COLUMN "uuid" TO "id";

ALTER TABLE "PlaidAccount"         ALTER COLUMN "id" SET NOT NULL;
ALTER TABLE "Report"               ALTER COLUMN "id" SET NOT NULL;
ALTER TABLE "RecurringReport"      ALTER COLUMN "id" SET NOT NULL;
ALTER TABLE "RecurringTransaction" ALTER COLUMN "id" SET NOT NULL;
ALTER TABLE "Transaction"          ALTER COLUMN "id" SET NOT NULL;
ALTER TABLE "Note"                 ALTER COLUMN "id" SET NOT NULL;

ALTER TABLE "Report"               RENAME COLUMN "parentReportUuid" TO "parentReportId";
ALTER TABLE "Transaction"          RENAME COLUMN "reportUuid" TO "reportId";
ALTER TABLE "RecurringTransaction" RENAME COLUMN "outflowReportUuid" TO "outflowReportId";
ALTER TABLE "RecurringTransaction" RENAME COLUMN "inflowReportUuid" TO "inflowReportId";
ALTER TABLE "SyncedTransaction"    RENAME COLUMN "plaidAccountUuid" TO "plaidAccountId";
ALTER TABLE "PlaidCursor"          RENAME COLUMN "plaidAccountUuid" TO "plaidAccountId";
ALTER TABLE "PlaidSyncLock"        RENAME COLUMN "plaidAccountUuid" TO "plaidAccountId";

ALTER TABLE "Transaction"       ALTER COLUMN "reportId" SET NOT NULL;
ALTER TABLE "SyncedTransaction" ALTER COLUMN "plaidAccountId" SET NOT NULL;
ALTER TABLE "PlaidCursor"       ALTER COLUMN "plaidAccountId" SET NOT NULL;
ALTER TABLE "PlaidSyncLock"     ALTER COLUMN "plaidAccountId" SET NOT NULL;

-- ── 7. Recreate PKs, FKs, indexes (Prisma naming conventions) ───────
-- NOTE: reconcile ON DELETE/ON UPDATE actions with the SQL Prisma generated
-- in `migrate dev --create-only` (Step 1) before committing.
ALTER TABLE "PlaidAccount"         ADD CONSTRAINT "PlaidAccount_pkey"         PRIMARY KEY ("id");
ALTER TABLE "Report"               ADD CONSTRAINT "Report_pkey"               PRIMARY KEY ("id");
ALTER TABLE "RecurringReport"      ADD CONSTRAINT "RecurringReport_pkey"      PRIMARY KEY ("id");
ALTER TABLE "RecurringTransaction" ADD CONSTRAINT "RecurringTransaction_pkey" PRIMARY KEY ("id");
ALTER TABLE "Transaction"          ADD CONSTRAINT "Transaction_pkey"          PRIMARY KEY ("id");
ALTER TABLE "Note"                 ADD CONSTRAINT "Note_pkey"                 PRIMARY KEY ("id");
ALTER TABLE "PlaidSyncLock"        ADD CONSTRAINT "PlaidSyncLock_pkey"        PRIMARY KEY ("plaidAccountId");

ALTER TABLE "Report" ADD CONSTRAINT "Report_parentReportId_fkey"
  FOREIGN KEY ("parentReportId") REFERENCES "Report"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_reportId_fkey"
  FOREIGN KEY ("reportId") REFERENCES "Report"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RecurringTransaction" ADD CONSTRAINT "RecurringTransaction_outflowReportId_fkey"
  FOREIGN KEY ("outflowReportId") REFERENCES "RecurringReport"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "RecurringTransaction" ADD CONSTRAINT "RecurringTransaction_inflowReportId_fkey"
  FOREIGN KEY ("inflowReportId") REFERENCES "RecurringReport"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SyncedTransaction" ADD CONSTRAINT "SyncedTransaction_plaidAccountId_fkey"
  FOREIGN KEY ("plaidAccountId") REFERENCES "PlaidAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PlaidCursor" ADD CONSTRAINT "PlaidCursor_plaidAccountId_fkey"
  FOREIGN KEY ("plaidAccountId") REFERENCES "PlaidAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PlaidSyncLock" ADD CONSTRAINT "PlaidSyncLock_plaidAccountId_fkey"
  FOREIGN KEY ("plaidAccountId") REFERENCES "PlaidAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "Report_parentReportId_idx"               ON "Report"("parentReportId");
CREATE INDEX "Transaction_reportId_idx"                ON "Transaction"("reportId");
CREATE INDEX "RecurringTransaction_outflowReportId_idx" ON "RecurringTransaction"("outflowReportId");
CREATE INDEX "RecurringTransaction_inflowReportId_idx"  ON "RecurringTransaction"("inflowReportId");
CREATE INDEX "SyncedTransaction_plaidAccountId_idx"     ON "SyncedTransaction"("plaidAccountId");
CREATE UNIQUE INDEX "SyncedTransaction_transaction_id_plaidAccountId_key"
  ON "SyncedTransaction"("transaction_id", "plaidAccountId");
CREATE UNIQUE INDEX "PlaidCursor_plaidAccountId_key"    ON "PlaidCursor"("plaidAccountId");
```

- [ ] **Step 3: Rehearse against a restored backup (NOT production)**

Restore the latest dump from `../moneyeye-db-backups` into a local Postgres (or a Supabase branch DB), point `DATABASE_URL`/`DIRECT_URL` at it via a temp `.env`, then:

Run: `npx prisma migrate deploy`
Expected: `1 migration applied` with no errors.

- [ ] **Step 4: Verify zero drift between schema and rehearsal DB**

Run: `npx prisma migrate diff --from-schema-datamodel prisma/schema.prisma --to-url "$REHEARSAL_DATABASE_URL" --exit-code`
Expected: exit code 0 / "No difference detected". If it reports differences in FK actions, fix section 7 to match and re-rehearse.

- [ ] **Step 5: Verify data survival on the rehearsal DB**

```sql
SELECT (SELECT count(*) FROM "Transaction") AS tx,
       (SELECT count(*) FROM "Transaction" WHERE "legacyId" IS NULL) AS tx_missing_legacy,
       (SELECT count(*) FROM "Transaction" t LEFT JOIN "Report" r ON t."reportId" = r."id"
        WHERE r."id" IS NULL) AS orphan_tx;
```
Expected: `tx` = pre-migration count, `tx_missing_legacy` = 0, `orphan_tx` = 0. Spot-check the other tables the same way.

- [ ] **Step 6: Regenerate the client**

Run: `npx prisma generate` — Expected: success. (Keep the rehearsal DB around; Tasks 7–12 are verified against it.)

### Task 7: Shared UUID validation helper

Per the repo owner's convention, schemas live in their own module — don't inline regexes in routes.

**Files:**
- Create: `src/lib/validation/uuidSchemas.ts`

- [ ] **Step 1: Create the helper**

```typescript
import { z } from "zod";

// All primary keys are UUID strings (v4 today; treat as opaque).
// Zod v4: z.uuid() is the current API (z.string().uuid() is deprecated).
export const UuidSchema = z.uuid();

export const isUuid = (value: unknown): value is string =>
  UuidSchema.safeParse(value).success;
```

### Task 8: Library functions — `prismaFunctions.ts`

**Files:**
- Modify: `src/lib/prisma/prismaFunctions.ts` (lines ~22, ~113, ~156, ~174, ~379, ~414, ~642-643, ~681, ~729)

- [ ] **Step 1: Type and signature changes**

- Line ~22 `plaidAccount` type: `id: number` → `id: string`.
- `getRecurringTransactions` / `getTransactions`: delete every `Number(reportId)` wrapper — pass `reportId` (already a string param) straight into `where: { id: reportId }` / `where: { reportId }`.
- `deleteReport(reportId: number)` → `deleteReport(reportId: string)`.
- `updateReport(reportId: number, ...)` → `updateReport(reportId: string, ...)`.
- `mergeReports(prisma, reportId_1: number, reportId_2: number, ...)` → both `string`.
- `createAnnualReport(..., monthlyReportIds: number[], ...)` → `monthlyReportIds: string[]`.

- [ ] **Step 2: Fix the duplicate-pruning raw SQL in `mergeReports`**

The window function tiebreaker `ORDER BY "id"` previously meant "keep the oldest"; with UUIDs that ordering is meaningless. Make the intent explicit:

```sql
ROW_NUMBER() OVER (PARTITION BY "transaction_id" ORDER BY "createdAt", "id") AS row_number
```

The other three `$executeRaw` statements need no SQL changes — `${reportId_1}` etc. are bound parameters; with string arguments Prisma binds text, which matches the new column type.

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit` — Expected: remaining errors only in files covered by Tasks 9–11 (callers of these functions). Track them; they must all be gone by Task 12 Step 2.

### Task 9: Library functions — report helpers

**Files:**
- Modify: `src/lib/reports/approveReport.ts` (lines ~14, ~23-26)
- Modify: `src/lib/reports/recomputeFrozenReportTotals.ts` (lines ~17-19)

- [ ] **Step 1: `approveReport.ts`** — change the params type `reportId: number` → `reportId: string` and the result type `report: { id: number; ... }` → `id: string`. Query bodies unchanged.

- [ ] **Step 2: `recomputeFrozenReportTotals.ts`** — change `reportId: number` → `reportId: string`. Body unchanged.

### Task 10: API routes — replace integer parsing with UUID validation

**Files:**
- Modify: `src/app/api/prisma/reports/[id]/approve/route.ts` (~line 12)
- Modify: `src/app/api/mobile/reports/[id]/approve/route.ts` (~line 12)
- Modify: `src/app/api/mobile/reports/[id]/route.ts` (~line 14)
- Modify: `src/app/api/mobile/transactions/frozen/[id]/route.ts` (~line 35)
- Modify: `src/app/api/notes/[id]/route.ts` (~lines 20, 82)
- Modify: `src/app/api/mobile/category-transactions/_utils/schemas.ts` (line 16)
- Modify: `src/app/api/prisma/reports/update/route.ts`, `delete/route.ts`, `merge/route.ts`, `create-anual/route.ts`
- Modify: `src/app/api/prisma/transactions/get/route.ts`, `getRecurring/route.ts` (pass-through check only)

- [ ] **Step 1: Path-param routes — one identical edit, four files**

In `prisma/reports/[id]/approve`, `mobile/reports/[id]/approve`, `mobile/reports/[id]`, and `mobile/transactions/frozen/[id]`:

```typescript
import { isUuid } from "@lib/validation/uuidSchemas";

const { id: rawId } = await params;
if (!isUuid(rawId)) {
  return NextResponse.json({ error: "Invalid id" }, { status: 400 }); // Response.json in mobile routes — keep each file's existing style
}
const id = rawId;
```

This replaces `const id = Number(rawId); if (!Number.isInteger(id) || id <= 0) ...`. Downstream usage (`approveReport({ reportId: id })`, `where: { id, userId }`) compiles unchanged once Tasks 8–9 land.

- [ ] **Step 2: `notes/[id]/route.ts`** — in both PUT and DELETE replace:

```typescript
const { id } = await params;
const noteId = parseInt(id);
```

with:

```typescript
const { id: rawId } = await params;
if (!isUuid(rawId)) {
  return NextResponse.json({ error: "Invalid id" }, { status: 400 });
}
const noteId = rawId;
```

- [ ] **Step 3: `category-transactions/_utils/schemas.ts`**

```typescript
reportId: z.uuid().optional(),   // was: z.coerce.number().int().positive().optional()
```

- [ ] **Step 4: Body-based report routes** — `update`, `delete`, `merge`, `create-anual`. Add validation where the ids are pulled from the body (these currently pass raw body values straight through):

```typescript
// update & delete
if (!isUuid(res.reportId)) {
  return NextResponse.json({ error: "Invalid reportId" }, { status: 400 });
}
// merge
if (!isUuid(res.reportId_1) || !isUuid(res.reportId_2)) {
  return NextResponse.json({ error: "Invalid reportId" }, { status: 400 });
}
// create-anual
if (!Array.isArray(res.reportIds) || !res.reportIds.every(isUuid)) {
  return NextResponse.json({ error: "Invalid reportIds" }, { status: 400 });
}
```

- [ ] **Step 5: Query-param transaction routes** — `transactions/get` and `transactions/getRecurring` read `searchParams.get('reportId')` (already a string) and hand it to the lib functions. After Task 8 removed the `Number()` wrappers, confirm these compile and add the same `isUuid` guard returning 400 for malformed values.

### Task 11: Web frontend — types, hooks, components, pages

**Files:**
- Modify: `src/utils/types.ts` (lines ~25, ~33)
- Modify: `src/hooks/useNotes.ts` (lines ~4-5, ~76, ~110)
- Modify: `src/components/NotesTable/NotesTable.tsx` (~line 21)
- Modify: `src/components/ReportsTable/ReportsTable.tsx` (~lines 31, 185-190)
- Modify: `src/components/ReportsTable/AnnualReportCreationModal.tsx` (~line 55)
- Modify: `src/components/RecurringReportsTable/RecurringReportsTable.tsx` (same pattern as ReportsTable)
- Modify: `src/app/notes/page.tsx` (~lines 26, 63-71)
- Modify: `src/app/reports/ReportsPage.tsx` (~lines 28, 48-54, 74-90)
- Modify: `src/app/insights/page.tsx` (~line 25)

- [ ] **Step 1: Mechanical `number` → `string` flips**

- `types.ts`: `ReportDataDTO.id: string`, `RecurringReportDataDTO.id: string`.
- `useNotes.ts`: `Note.id: string`; `useUpdateNote`/`useDeleteNote` take `id: string`.
- `NotesTable.tsx` / `notes/page.tsx`: `Note.id: string`; `handleDeleteNote(noteId: string)`.
- `ReportsTable.tsx`: `TableRow.id: string`; `handleActions(id: string)`.
- `RecurringReportsTable.tsx`: same flip.
- `ReportsPage.tsx`: `mutationFn: (reportId: string)`; merge mutation `reportId_1: string, reportId_2: string`; annual `reportIds: string[]`.

- [ ] **Step 2: Remove the two `parseInt` call sites**

`insights/page.tsx` (~line 25):

```typescript
const initialReportId = params.reportId ?? undefined;   // was: parseInt(params.reportId, 10)
```

…and flip the `initialReportId` prop type on the insights component from `number | undefined` to `string | undefined`.

`AnnualReportCreationModal.tsx` (~line 55): the comma-separated id splitting drops its `parseInt`:

```typescript
const reportIds = selected.split(",").map((id) => id.trim());  // was: .map((id) => parseInt(id))
```

(match the file's actual variable names — the change is only deleting the `parseInt`.)

- [ ] **Step 3: Sweep for stragglers**

Run: `grep -rn "parseInt\|Number(" src --include="*.ts*" | grep -i "id" | grep -v "node_modules"`
Expected: no remaining integer coercion of a PK. Anything found gets the same treatment.

### Task 12: Whole-repo verification against the rehearsal DB

- [ ] **Step 1: Typecheck**: `npx tsc --noEmit` — Expected: zero errors.
- [ ] **Step 2: Lint + build**: `npm run lint && npm run build` — Expected: clean build.
- [ ] **Step 3: End-to-end against the rehearsal DB** (`.env` still pointed at it): `npm run dev`, then exercise: reports list → open report → transactions load; create a report; update a report (edit transactions); merge two reports; create annual report from monthly reports; delete a report; notes CRUD; insights page with `?reportId=<uuid>`; mobile endpoints via curl with a mobile bearer token: `GET /api/mobile/reports`, `GET /api/mobile/reports/<uuid>`, `GET /api/mobile/category-transactions?key=...&reportId=<uuid>`, `PATCH /api/mobile/transactions/frozen/<uuid>`, `POST /api/mobile/reports/<uuid>/approve`.
- [ ] **Step 4: Confirm new inserts get UUIDs**: create a report + note in the UI, then `SELECT id, "legacyId" FROM "Report" ORDER BY "createdAt" DESC LIMIT 1;` — Expected: `id` is a UUID, `legacyId` is NULL.
- [ ] **Step 5: Commit (with user approval) and open a PR** — do NOT merge yet; merging is the cutover (Task 16).

---

# PART 3 — Cutover runbook

### Task 13: Pre-cutover gates (all must pass)

- [ ] OTA adoption: Expo dashboard shows the Task 4 update adopted by (effectively all) active devices. Any straggler binaries will break on report screens after cutover — acceptable only if confirmed inactive.
- [ ] PR from Task 12 approved and green.
- [ ] Fresh production backup taken NOW: `pg_dump "$DIRECT_URL" -Fc -f ../moneyeye-db-backups/pre-uuid-migration-$(date +%Y%m%d-%H%M).dump`
- [ ] Low-traffic window chosen, avoiding the cron schedules in `.github/workflows` (categorize runs at minute 0 every 6h; keep-alive at minute 0 hourly) and Plaid webhook bursts — start a few minutes past the hour.

### Task 14: Cutover (minutes of code/DB mismatch — sequence tightly)

- [ ] **Step 1:** Run the migration against production: `npx prisma migrate deploy` (env pointed at production `DIRECT_URL`). Expected: `1 migration applied`. If it errors, the transaction rolled back — production is untouched; stop here.
- [ ] **Step 2:** Immediately merge the PR / promote the Vercel deployment so the UUID-aware code goes live. (Between Steps 1 and 2 the live site cannot resolve int ids — that's the accepted brief window.)
- [ ] **Step 3:** Smoke test production: web reports list/open/edit, notes CRUD, mobile app report detail + category + transaction edit + approve, and `curl -X POST https://www.moneyeye.dev/api/cronjob/keep-db-alive -H "Authorization: Bearer $CRON_SECRET"`.
- [ ] **Step 4:** Trigger the categorize-synced-transactions workflow manually (`workflow_dispatch`) and confirm it returns 200.
- [ ] **Step 5:** Watch Vercel logs for 4xx/5xx on `/api/*` for the first hour. A spike of 400 "Invalid id" indicates a client still sending int ids (stale mobile bundle or stale browser tab — the latter resolves on refresh).

### Task 15: Rollback plan (only if cutover fails)

- If `migrate deploy` failed: nothing changed; fix and reschedule.
- If the deploy is broken but the DB migrated: roll the DB back by restoring the Task 13 dump (`pg_restore --clean --if-exists -d "$DIRECT_URL" <dump>`), revert the Vercel deployment, and delete the migration row if needed (`DELETE FROM _prisma_migrations WHERE migration_name LIKE '%int_to_uuid%';`). Writes made between cutover and restore are lost — keep the verification window short.
- The mobile OTA does NOT need rolling back in either case — it works against both schemas.

---

# PART 4 — Deferred cleanup (after ≥2 weeks of stability)

### Task 16: Drop legacy columns

- [ ] **Step 1:** Remove the six `legacyId Int?` fields from `prisma/schema.prisma`.
- [ ] **Step 2:** `npx prisma migrate dev --create-only --name drop_legacy_int_ids` — the generated SQL should be exactly six `ALTER TABLE ... DROP COLUMN "legacyId";` statements. Review, apply to a rehearsal DB, then `migrate deploy` to production. Commit with user approval.
