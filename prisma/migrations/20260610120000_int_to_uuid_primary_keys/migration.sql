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

-- ── 6. Rename staging columns into place, enforce NOT NULL ──────────
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
