# Spending Thresholds + Email Alerts (Phase 1) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship per-category spending thresholds, an editable `/thresholds` page, and a check-and-notify pipeline that fires emails (via Resend, with React Email-rendered templates) when monthly spend crosses 70% / 100% / over a threshold. Phase 2 (Expo push) is a separate plan.

> **Provider note (post-merge):** This plan was originally written assuming `@sendgrid/mail` Dynamic Templates. The merged implementation uses **Resend + React Email** instead. The high-level Goal / Tech Stack / Prerequisites in this header have been revised to match. The deeper Task sections below still contain the original SendGrid-shaped guidance and example code — those are preserved as the historical plan-of-record. When following along, defer to the actual code in `src/lib/notifications/notifier.ts` and the React Email component under `src/lib/notifications/` for the canonical wiring; treat the SendGrid-named env vars and template-ID setup in later sections as superseded by `RESEND_API_KEY` + a sender email.

**Architecture:** Three new Prisma models (`ExpenseThreshold` columnar like `Report`, `NotificationLog` for dedupe, `PushToken` for future use). New `src/lib/notifications/` module holds the pure math + Notifier interface + EmailNotifier. Two integration points: end of `upsertCurrentMonthDraftReport` (Plaid path) and end of `categorize-synced-transactions` cron (after a per-touched-user recompute). The cron integration also fixes a latent stale-totals gap. Verification uses standalone scripts under `scripts/` (codebase has no test framework today; spec defers introducing one).

**Tech Stack:** Next.js 16 + Prisma + PostgreSQL + NextAuth, TanStack Query + HeroUI on the page, **Resend** SDK for delivery with **React Email** for template rendering, `jose` already present (used in Phase 2 only).

**Spec:** `docs/superpowers/specs/2026-04-30-push-notifications-and-thresholds-design.md`

---

## File structure

**New files:**

```
prisma/migrations/<ts>_thresholds_notifications/migration.sql      [generated]

src/lib/notifications/
  monthKey.ts                  # toMonthKey(date) → "YYYY-MM"
  expenseKeys.ts               # EXPENSE_KEYS constant + levelsCrossed() helper
  templates.ts                 # buildAlertEmailData() — returns props for the React Email alert template (rendered + sent via Resend)
  notifier.ts                  # Notifier interface + EmailNotifier (Phase 1 only)
  thresholdCheck.ts            # checkThresholdsAndNotify() — main entrypoint
  index.ts                     # re-exports

src/app/api/prisma/thresholds/
  get/route.ts                 # GET — returns current user's row (creates with defaults if missing)
  update/route.ts              # PUT — partial update of column values

src/app/thresholds/
  page.tsx                     # server shell (session check)

src/components/ThresholdsTable/
  index.tsx                    # client component, per-row save UX

scripts/
  test-month-key.ts            # asserts toMonthKey output
  test-threshold-math.ts       # asserts levelsCrossed cases
  preview-alert-email.ts       # prints the dynamic_template_data payload for eyeball QA
  test-threshold-check.ts      # dryRun against a real userId
```

**Edited files:**

```
prisma/schema.prisma                                            # +3 models, +2 enums
prisma/seed.ts                                                  # backfill ExpenseThreshold for existing users
src/lib/reports/draftReport.ts                                  # call checkThresholdsAndNotify at end
src/app/api/cronjob/categorize-synced-transactions/route.ts     # per-user recompute + check
src/utils/constants.ts                                          # add THRESHOLDS_PAGE
src/components/sidebar/sidebar.tsx                              # add nav entry
.env.example (or .env)                                          # RESEND_API_KEY, RESEND_SENDER_EMAIL, DRY_RUN_NOTIFICATIONS
```

---

## Prerequisites (one-time manual setup before Task 12)

These are not code tasks. Do them once before the canary in Task 16.

**(P1) Build a React Email component** for the threshold alert under `src/lib/notifications/` (e.g., `AlertEmail.tsx`). It consumes the props returned by `buildAlertEmailData` (subject, monthLabel, alertCount, alerts[], ctaUrl, reportsUrl). Brand color `#0F0F1A`, same layout style as the existing biweek-report email. The notifier renders this component to HTML via `@react-email/render` and hands the HTML to Resend's `emails.send`.

**(P2) Provision Resend** in the MoneyEye account: create an API key and verify the sending domain / sender email.

**(P3) Add env vars** to `.env`:

```
RESEND_API_KEY=<from Resend dashboard>
RESEND_SENDER_EMAIL=<verified sender, e.g. alerts@moneyeye.app>
DRY_RUN_NOTIFICATIONS=false
```

---

## Tasks

### Task 1: Add Prisma schema models + enums

**Files:**
- Modify: `prisma/schema.prisma`

- [ ] **Step 1: Append the new models and enums to `prisma/schema.prisma`** (after `model PlaidSyncLock`, before existing `enum ReportType`):

```prisma
model ExpenseThreshold {
  id                 String   @id @default(uuid())
  userId             String   @unique
  user               User     @relation(fields: [userId], references: [id])
  foodAndDrink       Float    @default(400)
  groceries          Float    @default(400)
  entertainment      Float    @default(400)
  shopping           Float    @default(300)
  billsAndUtilities  Float    @default(0)
  car                Float    @default(0)
  healthAndWellness  Float    @default(0)
  personal           Float    @default(0)
  feesAndAdjustments Float    @default(0)
  others             Float    @default(0)
  foster             Float    @default(0)
  createdAt          DateTime @default(now())
  updatedAt          DateTime @updatedAt
}

model NotificationLog {
  id        String              @id @default(uuid())
  userId    String
  user      User                @relation(fields: [userId], references: [id])
  category  String
  level     NotificationLevel
  month     String
  channel   NotificationChannel
  sentAt    DateTime            @default(now())

  @@unique([userId, category, level, month])
  @@index([userId, month])
}

model PushToken {
  id        String   @id @default(uuid())
  userId    String
  user      User     @relation(fields: [userId], references: [id])
  token     String   @unique
  deviceId  String
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@unique([userId, deviceId])
  @@index([userId])
}

enum NotificationLevel {
  WARNING_70
  REACHED_100
  EXCEEDED
}

enum NotificationChannel {
  EMAIL
  PUSH
}
```

- [ ] **Step 2: Add the back-relations to `model User`** (find the existing `model User { ... }` block, add three lines):

```prisma
  expenseThreshold ExpenseThreshold?
  notificationLogs NotificationLog[]
  pushTokens       PushToken[]
```

- [ ] **Step 3: Generate migration**

Run: `npx prisma migrate dev --name thresholds_notifications`

Expected: migration created at `prisma/migrations/<ts>_thresholds_notifications/migration.sql`, applied to local DB, Prisma Client regenerated. Output ends with "Your database is now in sync with your schema."

- [ ] **Step 4: Spot-check the generated SQL**

Run: `cat prisma/migrations/$(ls -t prisma/migrations | head -1)/migration.sql`

Expected: `CREATE TABLE "ExpenseThreshold"`, `CREATE TABLE "NotificationLog"`, `CREATE TABLE "PushToken"`, `CREATE TYPE "NotificationLevel" AS ENUM (...)`, `CREATE TYPE "NotificationChannel" AS ENUM (...)`, three foreign keys to `"User"("id")`, the unique indexes. No `ALTER` or `DROP` on existing tables.

- [ ] **Step 5: Commit**

```bash
git add prisma/schema.prisma prisma/migrations
git commit -m "feat(db): add ExpenseThreshold, NotificationLog, PushToken models"
```

---

### Task 2: Backfill ExpenseThreshold rows for existing users

**Files:**
- Modify: `prisma/seed.ts`

- [ ] **Step 1: Replace the contents of `prisma/seed.ts`** with the backfill logic. This keeps the file idempotent and useful for both fresh setups and existing-user backfill:

```typescript
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("Seeding: backfilling ExpenseThreshold rows for existing users...");

  const users = await prisma.user.findMany({
    select: { id: true, email: true },
  });

  let created = 0;
  let skipped = 0;

  for (const u of users) {
    const existing = await prisma.expenseThreshold.findUnique({
      where: { userId: u.id },
    });
    if (existing) {
      skipped++;
      continue;
    }
    await prisma.expenseThreshold.create({ data: { userId: u.id } });
    created++;
    console.log(`  + ExpenseThreshold for ${u.email}`);
  }

  console.log(`Done. Created ${created}, skipped ${skipped} (already had rows).`);
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
```

- [ ] **Step 2: Run the seed**

Run: `npx ts-node prisma/seed.ts`

Expected: prints one `+ ExpenseThreshold for <email>` line per existing user, ends with `Done. Created N, skipped 0 (already had rows).`

- [ ] **Step 3: Verify with Prisma Studio (manual)**

Run: `npx prisma studio` and open the `ExpenseThreshold` table. Confirm: one row per existing user, `foodAndDrink=400`, `groceries=400`, `entertainment=400`, `shopping=300`, all other category columns `0`. Close Studio.

- [ ] **Step 4: Re-run the seed and confirm it's idempotent**

Run: `npx ts-node prisma/seed.ts`

Expected: `Done. Created 0, skipped N (already had rows).` Same N as before.

- [ ] **Step 5: Commit**

```bash
git add prisma/seed.ts
git commit -m "feat(db): seed ExpenseThreshold rows for existing users"
```

---

### Task 3: `monthKey` module + verification script

**Files:**
- Create: `src/lib/notifications/monthKey.ts`
- Create: `scripts/test-month-key.ts`

- [ ] **Step 1: Write the failing verification script first** at `scripts/test-month-key.ts`:

```typescript
import { toMonthKey } from "@lib/notifications/monthKey";

const cases: Array<[Date, string]> = [
  [new Date(Date.UTC(2026, 0, 1)), "2026-01"],
  [new Date(Date.UTC(2026, 11, 31, 23, 59, 59)), "2026-12"],
  [new Date(Date.UTC(2026, 3, 30)), "2026-04"],
  [new Date(Date.UTC(2025, 8, 5)), "2025-09"],
];

let failed = 0;
for (const [input, expected] of cases) {
  const got = toMonthKey(input);
  if (got !== expected) {
    console.error(`FAIL: ${input.toISOString()} → got "${got}", expected "${expected}"`);
    failed++;
  }
}
if (failed === 0) console.log(`OK: ${cases.length} cases passed`);
else { console.error(`${failed} failure(s)`); process.exit(1); }
```

- [ ] **Step 2: Run the script to confirm it fails (no implementation yet)**

Run: `npx ts-node scripts/test-month-key.ts`

Expected: failure with module-not-found error (`Cannot find module '@lib/notifications/monthKey'`).

- [ ] **Step 3: Implement `src/lib/notifications/monthKey.ts`**

```typescript
const pad2 = (n: number) => (n < 10 ? `0${n}` : `${n}`);

// Returns "YYYY-MM" in UTC. UTC-stable so two checks at month-boundary edges
// don't disagree based on server timezone.
export function toMonthKey(date: Date): string {
  return `${date.getUTCFullYear()}-${pad2(date.getUTCMonth() + 1)}`;
}
```

- [ ] **Step 4: Re-run the script**

Run: `npx ts-node scripts/test-month-key.ts`

Expected: `OK: 4 cases passed`.

- [ ] **Step 5: Commit**

```bash
git add src/lib/notifications/monthKey.ts scripts/test-month-key.ts
git commit -m "feat(notifications): add monthKey helper"
```

---

### Task 4: `EXPENSE_KEYS` + `levelsCrossed` math helper + verification

**Files:**
- Create: `src/lib/notifications/expenseKeys.ts`
- Create: `scripts/test-threshold-math.ts`

- [ ] **Step 1: Write the failing verification script** at `scripts/test-threshold-math.ts`:

```typescript
import { levelsCrossed, EXPENSE_KEYS } from "@lib/notifications/expenseKeys";
import { NotificationLevel } from "@prisma/client";

type Case = { spent: number; limit: number; expected: NotificationLevel[]; label: string };

const cases: Case[] = [
  { spent: 0, limit: 400, expected: [], label: "zero spend" },
  { spent: 279, limit: 400, expected: [], label: "just under 70%" },
  { spent: 280, limit: 400, expected: ["WARNING_70"], label: "exactly 70%" },
  { spent: 350, limit: 400, expected: ["WARNING_70"], label: "between 70 and 100" },
  { spent: 400, limit: 400, expected: ["WARNING_70", "REACHED_100"], label: "exactly 100%" },
  { spent: 400.01, limit: 400, expected: ["WARNING_70", "REACHED_100", "EXCEEDED"], label: "just over 100%" },
  { spent: 800, limit: 400, expected: ["WARNING_70", "REACHED_100", "EXCEEDED"], label: "way over 100%" },
  { spent: 100, limit: 0, expected: [], label: "zero limit means no thresholds" },
  { spent: 100, limit: -5, expected: [], label: "negative limit means no thresholds" },
];

let failed = 0;
for (const c of cases) {
  const got = levelsCrossed(c.spent, c.limit);
  const match =
    got.length === c.expected.length &&
    c.expected.every((e, i) => got[i] === e);
  if (!match) {
    console.error(`FAIL [${c.label}]: spent=${c.spent} limit=${c.limit} → got [${got.join(",")}], expected [${c.expected.join(",")}]`);
    failed++;
  }
}

if (EXPENSE_KEYS.length !== 11) {
  console.error(`FAIL: EXPENSE_KEYS has ${EXPENSE_KEYS.length} entries, expected 11`);
  failed++;
}

if (failed === 0) console.log(`OK: ${cases.length} math cases + EXPENSE_KEYS check passed`);
else { console.error(`${failed} failure(s)`); process.exit(1); }
```

- [ ] **Step 2: Run to confirm it fails**

Run: `npx ts-node scripts/test-threshold-math.ts`

Expected: module-not-found error.

- [ ] **Step 3: Implement `src/lib/notifications/expenseKeys.ts`**

```typescript
import { NotificationLevel } from "@prisma/client";

// Column keys on ExpenseThreshold AND on Report that hold per-category dollar
// totals. Order matches CANONICAL_CATEGORIES (excluding Revenue) for stable
// iteration in alerts.
export const EXPENSE_KEYS = [
  "foodAndDrink",
  "billsAndUtilities",
  "car",
  "entertainment",
  "groceries",
  "healthAndWellness",
  "personal",
  "shopping",
  "feesAndAdjustments",
  "others",
  "foster",
] as const;

export type ExpenseKey = (typeof EXPENSE_KEYS)[number];

// Display name shown in emails / push for each column key.
export const EXPENSE_KEY_TO_DISPLAY: Record<ExpenseKey, string> = {
  foodAndDrink: "Food & Drink",
  billsAndUtilities: "Bills & Utilities",
  car: "Car",
  entertainment: "Entertainment",
  groceries: "Groceries",
  healthAndWellness: "Health & Wellness",
  personal: "Personal",
  shopping: "Shopping",
  feesAndAdjustments: "Fees & Adjustments",
  others: "Others",
  foster: "Foster",
};

// Returns levels in fire order (warning → reached → exceeded). Empty array
// when limit <= 0 (treated as "no threshold for this category").
export function levelsCrossed(spent: number, limit: number): NotificationLevel[] {
  if (limit <= 0) return [];
  const out: NotificationLevel[] = [];
  if (spent >= limit * 0.7) out.push("WARNING_70");
  if (spent >= limit) out.push("REACHED_100");
  if (spent > limit) out.push("EXCEEDED");
  return out;
}
```

- [ ] **Step 4: Re-run the script**

Run: `npx ts-node scripts/test-threshold-math.ts`

Expected: `OK: 9 math cases + EXPENSE_KEYS check passed`.

- [ ] **Step 5: Commit**

```bash
git add src/lib/notifications/expenseKeys.ts scripts/test-threshold-math.ts
git commit -m "feat(notifications): add EXPENSE_KEYS and levelsCrossed math"
```

---

### Task 5: Email template payload builder + preview script

**Files:**
- Create: `src/lib/notifications/templates.ts`
- Create: `scripts/preview-alert-email.ts`

- [ ] **Step 1: Implement `src/lib/notifications/templates.ts`**

```typescript
import type { NotificationLevel } from "@prisma/client";

export type Alert = {
  category: string;            // display name, e.g. "Food & Drink"
  level: NotificationLevel;
  spent: number;
  limit: number;
  monthKey: string;            // "YYYY-MM"
};

const LEVEL_SUBJECT_FRAGMENT: Record<NotificationLevel, string> = {
  WARNING_70: "reached 70%",
  REACHED_100: "reached",
  EXCEEDED: "over budget",
};

const LEVEL_BODY_LABEL: Record<NotificationLevel, string> = {
  WARNING_70: "Warning · 70% reached",
  REACHED_100: "Budget reached · 100%",
  EXCEEDED: "Over budget",
};

const fmtMoney = (n: number) =>
  `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const monthLabel = (monthKey: string): string => {
  const [y, m] = monthKey.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleString("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
};

const buildSubject = (alerts: Alert[]): string => {
  if (alerts.length === 1) {
    const a = alerts[0];
    return `${a.category} budget ${LEVEL_SUBJECT_FRAGMENT[a.level]}`;
  }
  return `${alerts.length} budget alerts for ${monthLabel(alerts[0].monthKey)}`;
};

export type AlertEmailData = {
  subject: string;
  monthLabel: string;
  alertCount: number;
  alerts: Array<{
    category: string;
    levelLabel: string;
    spentFormatted: string;
    limitFormatted: string;
    percent: number;
    overFormatted: string; // empty string when not EXCEEDED
  }>;
  ctaUrl: string;
  reportsUrl: string;
};

// Pure. Takes the alerts batch + base URL; returns the dynamic_template_data
// payload for the SendGrid dynamic template.
export function buildAlertEmailData(
  alerts: Alert[],
  baseUrl: string
): AlertEmailData {
  if (alerts.length === 0) {
    throw new Error("buildAlertEmailData called with empty alerts array");
  }
  return {
    subject: buildSubject(alerts),
    monthLabel: monthLabel(alerts[0].monthKey),
    alertCount: alerts.length,
    alerts: alerts.map((a) => ({
      category: a.category,
      levelLabel: LEVEL_BODY_LABEL[a.level],
      spentFormatted: fmtMoney(a.spent),
      limitFormatted: fmtMoney(a.limit),
      percent: Math.round((a.spent / a.limit) * 100),
      overFormatted: a.level === "EXCEEDED" ? fmtMoney(a.spent - a.limit) : "",
    })),
    ctaUrl: `${baseUrl.replace(/\/$/, "")}/thresholds`,
    reportsUrl: `${baseUrl.replace(/\/$/, "")}/reports`,
  };
}
```

- [ ] **Step 2: Write the preview script** at `scripts/preview-alert-email.ts`:

```typescript
import { buildAlertEmailData, type Alert } from "@lib/notifications/templates";

const BASE = process.env.NEXTAUTH_URL ?? "http://localhost:3000";

const fixtures: Array<{ label: string; alerts: Alert[] }> = [
  {
    label: "single — warning",
    alerts: [{ category: "Groceries", level: "WARNING_70", spent: 290, limit: 400, monthKey: "2026-04" }],
  },
  {
    label: "single — reached",
    alerts: [{ category: "Food & Drink", level: "REACHED_100", spent: 400, limit: 400, monthKey: "2026-04" }],
  },
  {
    label: "single — exceeded",
    alerts: [{ category: "Shopping", level: "EXCEEDED", spent: 450.5, limit: 300, monthKey: "2026-04" }],
  },
  {
    label: "multi — three alerts",
    alerts: [
      { category: "Groceries", level: "WARNING_70", spent: 290, limit: 400, monthKey: "2026-04" },
      { category: "Food & Drink", level: "REACHED_100", spent: 400, limit: 400, monthKey: "2026-04" },
      { category: "Shopping", level: "EXCEEDED", spent: 450, limit: 300, monthKey: "2026-04" },
    ],
  },
];

for (const f of fixtures) {
  console.log(`\n=== ${f.label} ===`);
  console.log(JSON.stringify(buildAlertEmailData(f.alerts, BASE), null, 2));
}
```

- [ ] **Step 3: Run the preview**

Run: `npx ts-node scripts/preview-alert-email.ts`

Expected: four sections of pretty-printed JSON. Sanity check:
- single warning: `subject: "Groceries budget reached 70%"`, `alertCount: 1`, `alerts[0].percent: 73`, `alerts[0].overFormatted: ""`.
- single exceeded: `subject: "Shopping budget over budget"`, `alerts[0].overFormatted: "$150.50"`.
- multi: `subject: "3 budget alerts for April 2026"`, `alertCount: 3`, three entries in `alerts`.

If subjects or numbers look wrong, fix `templates.ts` and re-run before continuing.

- [ ] **Step 4: Commit**

```bash
git add src/lib/notifications/templates.ts scripts/preview-alert-email.ts
git commit -m "feat(notifications): add email payload builder + preview script"
```

---

### Task 6: `Notifier` interface + `EmailNotifier`

**Files:**
- Create: `src/lib/notifications/notifier.ts`

- [ ] **Step 1: Implement `src/lib/notifications/notifier.ts`**

```typescript
import sgMail from "@sendgrid/mail";
import type { NotificationChannel } from "@prisma/client";
import prisma from "@lib/prisma/prismaClient";
import { buildAlertEmailData, type Alert } from "./templates";

export type { Alert } from "./templates";

export interface Notifier {
  channel: NotificationChannel;
  dispatch(userId: string, alerts: Alert[]): Promise<void>;
}

const baseUrl = (): string =>
  process.env.NEXTAUTH_URL ?? "http://localhost:3000";

export class EmailNotifier implements Notifier {
  readonly channel: NotificationChannel = "EMAIL";

  async dispatch(userId: string, alerts: Alert[]): Promise<void> {
    if (alerts.length === 0) return;

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { email: true },
    });
    if (!user?.email) {
      console.warn(`[notifier] no email for userId=${userId}; skipping`);
      return;
    }

    const templateId = process.env.SENDGRID_THRESHOLD_ALERT_TEMPLATE_ID;
    const sender = process.env.SENDGRID_SENDER_EMAIL;
    if (!templateId || !sender) {
      console.error(
        "[notifier] missing SENDGRID_THRESHOLD_ALERT_TEMPLATE_ID or SENDGRID_SENDER_EMAIL"
      );
      return;
    }

    sgMail.setApiKey(process.env.SENDGRID_API_KEY ?? "");

    const data = buildAlertEmailData(alerts, baseUrl());
    const msg = {
      templateId,
      from: sender,
      personalizations: [
        {
          to: user.email,
          dynamic_template_data: data,
        },
      ],
    };

    console.log(
      `[notifier] sending email to ${user.email}: ${data.subject} (${alerts.length} alert${alerts.length === 1 ? "" : "s"})`
    );
    await sgMail.send(msg);
  }
}

// Logs intended sends without dispatching. Selected when DRY_RUN_NOTIFICATIONS=true.
export class DryRunNotifier implements Notifier {
  readonly channel: NotificationChannel = "EMAIL";

  async dispatch(userId: string, alerts: Alert[]): Promise<void> {
    if (alerts.length === 0) return;
    console.log(
      `[notifier:DRY_RUN] would email user=${userId}, ${alerts.length} alert(s):`,
      alerts.map((a) => `${a.category}/${a.level}`).join(", ")
    );
  }
}

export function getDefaultNotifier(): Notifier {
  if (process.env.DRY_RUN_NOTIFICATIONS === "true") return new DryRunNotifier();
  return new EmailNotifier();
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/notifications/notifier.ts
git commit -m "feat(notifications): add Notifier interface + EmailNotifier + DryRunNotifier"
```

---

### Task 7: `checkThresholdsAndNotify` main function

**Files:**
- Create: `src/lib/notifications/thresholdCheck.ts`
- Create: `src/lib/notifications/index.ts`

- [ ] **Step 1: Implement `src/lib/notifications/thresholdCheck.ts`**

```typescript
import { Prisma, type NotificationLevel } from "@prisma/client";
import prisma from "@lib/prisma/prismaClient";
import {
  EXPENSE_KEYS,
  EXPENSE_KEY_TO_DISPLAY,
  levelsCrossed,
  type ExpenseKey,
} from "./expenseKeys";
import { toMonthKey } from "./monthKey";
import {
  getDefaultNotifier,
  type Notifier,
} from "./notifier";
import type { Alert } from "./templates";

export type CheckOptions = {
  dryRun?: boolean;
};

export async function checkThresholdsAndNotify(
  userId: string,
  now: Date = new Date(),
  notifier: Notifier = getDefaultNotifier(),
  options: CheckOptions = {}
): Promise<{ fired: Alert[] }> {
  const monthKey = toMonthKey(now);
  const month = now.getUTCMonth() + 1;
  const year = now.getUTCFullYear();

  const [thresholds, report, existingLogs] = await Promise.all([
    prisma.expenseThreshold.findUnique({ where: { userId } }),
    prisma.report.findFirst({
      where: {
        userId,
        month,
        year,
        reportType: "MONTHLY",
        autoMaintainedAt: { not: null },
      },
    }),
    prisma.notificationLog.findMany({
      where: { userId, month: monthKey },
      select: { category: true, level: true },
    }),
  ]);

  if (!thresholds || !report) return { fired: [] };

  const firedKey = (category: string, level: NotificationLevel) =>
    `${category}::${level}`;
  const alreadyFired = new Set(
    existingLogs.map((l) => firedKey(l.category, l.level))
  );

  const candidates: Alert[] = [];
  for (const key of EXPENSE_KEYS) {
    const limit = (thresholds as unknown as Record<ExpenseKey, number>)[key];
    const spent = (report as unknown as Record<ExpenseKey, number>)[key];
    const display = EXPENSE_KEY_TO_DISPLAY[key];
    for (const level of levelsCrossed(spent, limit)) {
      if (alreadyFired.has(firedKey(display, level))) continue;
      candidates.push({ category: display, level, spent, limit, monthKey });
    }
  }

  if (candidates.length === 0) return { fired: [] };
  if (options.dryRun) return { fired: candidates };

  const dispatched: Alert[] = [];
  for (const alert of candidates) {
    try {
      await prisma.notificationLog.create({
        data: {
          userId,
          category: alert.category,
          level: alert.level,
          month: alert.monthKey,
          channel: notifier.channel,
        },
      });
      dispatched.push(alert);
    } catch (e) {
      // P2002 = another concurrent worker already wrote this log row; skip dispatch.
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === "P2002"
      ) {
        continue;
      }
      console.error(
        `[thresholdCheck] failed to write NotificationLog for user=${userId} ${alert.category}/${alert.level}:`,
        e
      );
    }
  }

  if (dispatched.length > 0) {
    try {
      await notifier.dispatch(userId, dispatched);
    } catch (e) {
      console.error(
        `[thresholdCheck] notifier.dispatch failed for user=${userId} (${dispatched.length} alerts) — log rows committed, alerts will not retry:`,
        e
      );
    }
  }

  return { fired: dispatched };
}
```

- [ ] **Step 2: Implement `src/lib/notifications/index.ts`**

```typescript
export { checkThresholdsAndNotify } from "./thresholdCheck";
export type { Alert } from "./templates";
export { EXPENSE_KEYS, EXPENSE_KEY_TO_DISPLAY, levelsCrossed } from "./expenseKeys";
export type { ExpenseKey } from "./expenseKeys";
export { toMonthKey } from "./monthKey";
export {
  EmailNotifier,
  DryRunNotifier,
  getDefaultNotifier,
} from "./notifier";
export type { Notifier } from "./notifier";
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/lib/notifications/thresholdCheck.ts src/lib/notifications/index.ts
git commit -m "feat(notifications): add checkThresholdsAndNotify entrypoint"
```

---

### Task 8: Standalone dry-run script for `checkThresholdsAndNotify`

**Files:**
- Create: `scripts/test-threshold-check.ts`

- [ ] **Step 1: Implement the script**

```typescript
import prisma from "@lib/prisma/prismaClient";
import { checkThresholdsAndNotify } from "@lib/notifications";

async function main() {
  const userIdOrEmail = process.argv[2];
  if (!userIdOrEmail) {
    console.error("Usage: ts-node scripts/test-threshold-check.ts <userId-or-email>");
    process.exit(1);
  }

  const user = userIdOrEmail.includes("@")
    ? await prisma.user.findUnique({ where: { email: userIdOrEmail } })
    : await prisma.user.findUnique({ where: { id: userIdOrEmail } });

  if (!user) {
    console.error(`No user found for "${userIdOrEmail}"`);
    process.exit(1);
  }

  console.log(`Running dryRun check for user=${user.email} (${user.id})...`);
  const { fired } = await checkThresholdsAndNotify(
    user.id,
    new Date(),
    undefined,
    { dryRun: true }
  );

  if (fired.length === 0) {
    console.log("No alerts would fire.");
  } else {
    console.log(`${fired.length} alert(s) would fire:`);
    for (const a of fired) {
      console.log(
        `  - ${a.category} / ${a.level} — spent $${a.spent.toFixed(2)} / limit $${a.limit.toFixed(2)} (${a.monthKey})`
      );
    }
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
```

- [ ] **Step 2: Run against your own user (replace `<your-email>`)**

Run: `npx ts-node scripts/test-threshold-check.ts <your-email>`

Expected: either "No alerts would fire." (if you're under all thresholds for the current month) or a list of `(category, level)` pairs that would fire. No emails are sent (dryRun). No `NotificationLog` rows are written.

- [ ] **Step 3: Verify no `NotificationLog` rows were created (manual)**

Run: `npx prisma studio` and inspect the `NotificationLog` table — it should still be empty (or contain only rows from prior tests).

- [ ] **Step 4: Commit**

```bash
git add scripts/test-threshold-check.ts
git commit -m "feat(notifications): add dry-run threshold check script"
```

---

### Task 9: Integrate threshold check into Plaid sync path

**Files:**
- Modify: `src/lib/reports/draftReport.ts`

- [ ] **Step 1: Add the import at the top of `src/lib/reports/draftReport.ts`** (after the existing imports):

```typescript
import { checkThresholdsAndNotify } from "@lib/notifications";
```

- [ ] **Step 2: Add the threshold-check call at the end of `upsertCurrentMonthDraftReport`** (after the existing `for (const target of months) { ... }` loop, just before the function closes):

```typescript
  try {
    await checkThresholdsAndNotify(userId, now);
  } catch (err) {
    console.error(`[draftReport] threshold check failed for user=${userId}:`, err);
  }
```

The complete tail of the function should now look like:

```typescript
  for (const target of months) {
    // ... existing body ...
  }

  try {
    await checkThresholdsAndNotify(userId, now);
  } catch (err) {
    console.error(`[draftReport] threshold check failed for user=${userId}:`, err);
  }
}
```

The `try/catch` is essential — a failed notification check must not interfere with the report write that just completed.

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`

Expected: no errors.

- [ ] **Step 4: End-to-end smoke test (manual)**

In a separate terminal, run `pnpm dev`. Then in another terminal, fire a webhook against your dev server using the existing harness:

Run: `npx ts-node scripts/fire-sync-webhook.ts`

Watch the dev server logs. Expected: usual sync log lines, followed by either silence (no alerts crossed) or one `[notifier] sending email to ...` line if your current spend crosses a threshold.

If any email actually sends, check your inbox and confirm the SendGrid template renders correctly. (If you have not yet completed the `Prerequisites` SendGrid template setup, the notifier will log `missing SENDGRID_THRESHOLD_ALERT_TEMPLATE_ID` and skip — that's fine for now; revisit during Task 16 canary.)

- [ ] **Step 5: Commit**

```bash
git add src/lib/reports/draftReport.ts
git commit -m "feat(notifications): trigger threshold check after Plaid-driven report recompute"
```

---

### Task 10: Integrate recompute + threshold check into categorize cron

**Files:**
- Modify: `src/app/api/cronjob/categorize-synced-transactions/route.ts`

This task fixes the latent stale-totals gap: today the cron updates `userCategoryOverride` but never re-recomputes the affected `Report` rows. We add the recompute, then run the threshold check.

- [ ] **Step 1: Add imports near the top of the file** (alongside the existing imports):

```typescript
import { upsertCurrentMonthDraftReport } from "@lib/reports/draftReport";
import { checkThresholdsAndNotify } from "@lib/notifications";
```

- [ ] **Step 2: Track which users were touched.** Inside the existing `for (const [userId, rows] of byUser) { ... }` loop, after the `for (const [category, ids] of byCategory) { ... }` inner loop, add a per-user "did we update anything" check. Find the existing block:

```typescript
        for (const [category, ids] of byCategory) {
          try {
            const { count } = await prisma.syncedTransaction.updateMany({
              where: { id: { in: ids } },
              data: { userCategoryOverride: category },
            });
            totalUpdated += count;
            if (count < ids.length) {
              totalFailed += ids.length - count;
            }
          } catch (err) {
            console.error(
              `DB update failed for user=${userId} category=${category}:`,
              err
            );
            totalFailed += ids.length;
          }
        }
      }
    }
```

Replace the very last `}` (the close of `for (const [userId, rows] of byUser)`) with:

```typescript
        for (const [category, ids] of byCategory) {
          try {
            const { count } = await prisma.syncedTransaction.updateMany({
              where: { id: { in: ids } },
              data: { userCategoryOverride: category },
            });
            totalUpdated += count;
            userTotalUpdated += count;
            if (count < ids.length) {
              totalFailed += ids.length - count;
            }
          } catch (err) {
            console.error(
              `DB update failed for user=${userId} category=${category}:`,
              err
            );
            totalFailed += ids.length;
          }
        }
      }

      // Recompute the user's auto-maintained Report rows so the new
      // categorizations land in the totals, then run the threshold check.
      // Skip if nothing changed for this user.
      if (userTotalUpdated > 0) {
        try {
          const now = new Date();
          await upsertCurrentMonthDraftReport(userId, now);
          await checkThresholdsAndNotify(userId, now);
        } catch (err) {
          console.error(
            `[categorize-cron] post-categorize work failed for user=${userId}:`,
            err
          );
        }
      }
    }
```

- [ ] **Step 3: Add the `userTotalUpdated` declaration.** At the top of the `for (const [userId, rows] of byUser) { ... }` body (immediately after the line `for (const [userId, rows] of byUser) {`), add:

```typescript
      let userTotalUpdated = 0;
```

So the loop now starts:

```typescript
    for (const [userId, rows] of byUser) {
      let userTotalUpdated = 0;
      // Pull user's labeled history from Transaction (legacy data with curated category[0]).
      const history = await prisma.transaction.findMany({
        // ... existing ...
```

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit`

Expected: no errors.

- [ ] **Step 5: Smoke test (manual)**

The cron only runs on schedule in prod; for local testing, hit the route directly. With `pnpm dev` running and `CRON_SECRET` set in `.env`:

Run: `curl -X POST -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cronjob/categorize-synced-transactions`

Expected behavior — three cases:
- No pending rows → response `{ "processed": 0 }`, no recompute, no notification check.
- Pending rows exist → response `{ "processed": N, ... }`. In dev server logs, exactly one `[categorize-cron]`-tagged section per user with updates. Then either a `[notifier]` line (if a threshold crossed) or silence.
- One user errors → other users still process; the error appears in logs but the response still completes.

- [ ] **Step 6: Commit**

```bash
git add src/app/api/cronjob/categorize-synced-transactions/route.ts
git commit -m "feat(cron): recompute reports + check thresholds after categorize"
```

---

### Task 11: GET endpoint — `/api/prisma/thresholds/get`

**Files:**
- Create: `src/app/api/prisma/thresholds/get/route.ts`

- [ ] **Step 1: Implement the route**

```typescript
import { options } from "@api/auth/[...nextauth]/options";
import { getServerSession } from "next-auth";
import prisma from "@lib/prisma/prismaClient";

export async function GET() {
  const session = await getServerSession(options);
  const email = session?.user?.email;
  if (!email) {
    return Response.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      return Response.json({ success: false, error: "User not found" }, { status: 404 });
    }

    // Lazily create the row if it doesn't exist (covers any race on the seed
    // backfill). @default values populate the columns.
    const thresholds = await prisma.expenseThreshold.upsert({
      where: { userId: user.id },
      update: {},
      create: { userId: user.id },
    });

    return Response.json({ success: true, response: thresholds });
  } catch (error) {
    console.error("[/api/prisma/thresholds/get]", error);
    return Response.json({ success: false, error: String(error) }, { status: 500 });
  }
}
```

- [ ] **Step 2: Smoke test (manual, with dev server running and a real session cookie)**

Open the browser dev tools while signed in to `http://localhost:3000`, copy the `next-auth.session-token` cookie value, then:

Run: `curl -H "Cookie: next-auth.session-token=<value>" http://localhost:3000/api/prisma/thresholds/get`

Expected: `{ "success": true, "response": { "id": "...", "userId": "...", "foodAndDrink": 400, "groceries": 400, "entertainment": 400, "shopping": 300, "billsAndUtilities": 0, ... } }`.

Run again with no Cookie header: `{ "success": false, "error": "Unauthorized" }` and HTTP 401.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/prisma/thresholds/get/route.ts
git commit -m "feat(api): add GET /api/prisma/thresholds/get"
```

---

### Task 12: PUT endpoint — `/api/prisma/thresholds/update`

**Files:**
- Create: `src/app/api/prisma/thresholds/update/route.ts`

- [ ] **Step 1: Implement the route**

```typescript
import { options } from "@api/auth/[...nextauth]/options";
import { getServerSession } from "next-auth";
import { z } from "zod";
import prisma from "@lib/prisma/prismaClient";
import { EXPENSE_KEYS } from "@lib/notifications";

const ExpenseKeyEnum = z.enum(EXPENSE_KEYS as unknown as [string, ...string[]]);

// Partial body: any subset of expense column keys, each a non-negative
// number under 1_000_000. Reject unknown keys.
const BodySchema = z
  .object(
    Object.fromEntries(
      EXPENSE_KEYS.map((k) => [
        k,
        z.number().min(0).lt(1_000_000).optional(),
      ])
    )
  )
  .strict();

export async function PUT(request: Request) {
  const session = await getServerSession(options);
  const email = session?.user?.email;
  if (!email) {
    return Response.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ success: false, error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { success: false, error: parsed.error.flatten() },
      { status: 400 }
    );
  }

  // Empty body is a no-op success — guard against it to avoid an empty update.
  if (Object.keys(parsed.data).length === 0) {
    return Response.json({ success: false, error: "No fields to update" }, { status: 400 });
  }

  try {
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      return Response.json({ success: false, error: "User not found" }, { status: 404 });
    }

    const updated = await prisma.expenseThreshold.upsert({
      where: { userId: user.id },
      update: parsed.data,
      create: { userId: user.id, ...parsed.data },
    });

    return Response.json({ success: true, response: updated });
  } catch (error) {
    console.error("[/api/prisma/thresholds/update]", error);
    return Response.json({ success: false, error: String(error) }, { status: 500 });
  }
}
```

- [ ] **Step 2: Add `ExpenseKeyEnum` to a stray export if linter complains**

If `tsc --noEmit` flags `ExpenseKeyEnum` as unused, delete that line — it's a remnant. The strict object schema doesn't need it.

- [ ] **Step 3: Smoke tests (manual, dev server + session cookie)**

Valid update:

Run: `curl -X PUT -H "Content-Type: application/json" -H "Cookie: next-auth.session-token=<value>" -d '{"foodAndDrink": 450}' http://localhost:3000/api/prisma/thresholds/update`

Expected: `{ "success": true, "response": { ..., "foodAndDrink": 450, ... } }`.

Negative number:

Run: `curl -X PUT ... -d '{"foodAndDrink": -1}' ...`

Expected: HTTP 400 with `success: false` and a Zod error.

Unknown key:

Run: `curl -X PUT ... -d '{"revenue": 100}' ...`

Expected: HTTP 400 (revenue is not in `EXPENSE_KEYS`; `.strict()` rejects).

Empty body:

Run: `curl -X PUT ... -d '{}' ...`

Expected: HTTP 400 with "No fields to update".

- [ ] **Step 4: Commit**

```bash
git add src/app/api/prisma/thresholds/update/route.ts
git commit -m "feat(api): add PUT /api/prisma/thresholds/update with zod validation"
```

---

### Task 13: `/thresholds` page route + `<ThresholdsTable />` component

**Files:**
- Create: `src/app/thresholds/page.tsx`
- Create: `src/components/ThresholdsTable/index.tsx`

- [ ] **Step 1: Implement the server shell `src/app/thresholds/page.tsx`**

```typescript
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { options } from "@api/auth/[...nextauth]/options";
import { appRoutes } from "utils/constants";
import { ThresholdsTable } from "@components/ThresholdsTable";

export default async function ThresholdsPage() {
  const session = await getServerSession(options);
  if (!session?.user?.email) redirect(appRoutes.LOGIN_PAGE);

  return (
    <div className="flex flex-col gap-4 p-4 md:p-6">
      <div>
        <h1 className="text-2xl font-semibold">Spending Thresholds</h1>
        <p className="text-sm text-default-500 mt-1">
          Set monthly spending limits per category. Get notified at 70%, 100%, and over budget.
          Set a category to <span className="font-mono">$0</span> to disable alerts for it.
        </p>
      </div>
      <ThresholdsTable />
    </div>
  );
}
```

- [ ] **Step 2: Implement the client component `src/components/ThresholdsTable/index.tsx`**

```typescript
"use client";

import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Input, Button, Spinner } from "@heroui/react";
import { EXPENSE_KEYS, EXPENSE_KEY_TO_DISPLAY, type ExpenseKey } from "@lib/notifications";

type ThresholdsRow = Record<ExpenseKey, number> & {
  id: string;
  userId: string;
};

async function fetchThresholds(): Promise<ThresholdsRow> {
  const res = await fetch("/api/prisma/thresholds/get");
  const json = await res.json();
  if (!json.success) throw new Error(json.error ?? "Failed to load thresholds");
  return json.response as ThresholdsRow;
}

async function saveThreshold(
  key: ExpenseKey,
  value: number
): Promise<ThresholdsRow> {
  const res = await fetch("/api/prisma/thresholds/update", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ [key]: value }),
  });
  const json = await res.json();
  if (!json.success) throw new Error(typeof json.error === "string" ? json.error : "Save failed");
  return json.response as ThresholdsRow;
}

export const ThresholdsTable = () => {
  const queryClient = useQueryClient();
  const { data, isLoading, error } = useQuery({
    queryKey: ["thresholds"],
    queryFn: fetchThresholds,
  });

  if (isLoading) return <Spinner label="Loading thresholds..." />;
  if (error) return <div className="text-danger">Failed to load: {String(error)}</div>;
  if (!data) return null;

  return (
    <div className="flex flex-col gap-2">
      {EXPENSE_KEYS.map((key) => (
        <ThresholdRow
          key={key}
          columnKey={key}
          initialValue={data[key]}
          onSave={async (value) => {
            const updated = await saveThreshold(key, value);
            queryClient.setQueryData(["thresholds"], updated);
          }}
        />
      ))}
    </div>
  );
};

function ThresholdRow({
  columnKey,
  initialValue,
  onSave,
}: {
  columnKey: ExpenseKey;
  initialValue: number;
  onSave: (value: number) => Promise<void>;
}) {
  const [value, setValue] = useState<string>(String(initialValue));
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const parsed = useMemo(() => {
    const n = Number(value);
    return Number.isFinite(n) && n >= 0 ? n : null;
  }, [value]);

  const dirty = parsed !== null && parsed !== initialValue;
  const placeholder = initialValue === 0 ? "No threshold" : "";

  const handleSave = async () => {
    if (!dirty || parsed === null) return;
    setSaving(true);
    setErrorMsg(null);
    try {
      await onSave(parsed);
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex items-center gap-3 p-3 rounded-lg border border-default-200">
      <div className="w-40 text-sm font-medium">{EXPENSE_KEY_TO_DISPLAY[columnKey]}</div>
      <Input
        type="number"
        value={value}
        onValueChange={setValue}
        placeholder={placeholder}
        startContent={<span className="text-default-400">$</span>}
        min={0}
        step={1}
        size="sm"
        className="max-w-40"
        aria-label={`${EXPENSE_KEY_TO_DISPLAY[columnKey]} threshold`}
      />
      <Button
        size="sm"
        color="primary"
        isDisabled={!dirty}
        isLoading={saving}
        onPress={handleSave}
      >
        Save
      </Button>
      {errorMsg && <span className="text-danger text-xs">{errorMsg}</span>}
    </div>
  );
}
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`

Expected: no errors.

- [ ] **Step 4: Manual UI smoke test**

`pnpm dev`. Sign in. Navigate to `http://localhost:3000/thresholds`. Confirm:
- 11 rows render in `EXPENSE_KEYS` order (Food & Drink first, Foster last).
- Pre-seeded categories show `400` / `400` / `400` / `300`.
- Other 7 rows show `0` (placeholder "No threshold" visible when input is unfocused).
- Editing a value enables the per-row Save button. Clicking Save: button shows the loading spinner briefly, then becomes disabled again (no longer dirty).
- Hard-refresh: the new value persists.
- Setting a value to `-1`: Save fails with the Zod validation error displayed inline.

- [ ] **Step 5: Commit**

```bash
git add src/app/thresholds/page.tsx src/components/ThresholdsTable
git commit -m "feat(thresholds): add /thresholds page and per-row save UI"
```

---

### Task 14: Add `THRESHOLDS_PAGE` route + sidebar nav entry

**Files:**
- Modify: `src/utils/constants.ts`
- Modify: `src/components/sidebar/sidebar.tsx`

- [ ] **Step 1: Add the route to `appRoutes`**

In `src/utils/constants.ts`, find the `appRoutes` object and add the new entry between `RECURRING_TRANSACTIONS_PAGE` and `NOTES_PAGE`:

```typescript
export const appRoutes = {
  ROOT: "/",
  ACCOUNTS_PAGE: "/accounts",
  TRANSACTIONS_PAGE: "/transactions",
  REPORTS_PAGE: "/reports",
  INSIGHTS_PAGE: "/insights",
  LOGIN_PAGE: "/login",
  LOG_OUT_PAGE: "/logout",
  RECURRING_TRANSACTIONS_PAGE: "/recurring-transactions",
  THRESHOLDS_PAGE: "/thresholds",
  NOTES_PAGE: "/notes",
};
```

- [ ] **Step 2: Add the sidebar entry**

In `src/components/sidebar/sidebar.tsx`, inside the existing `<SidebarMenu title="Main Menu">` block, add a new `<SidebarItem>` adjacent to the existing entries (place it after the "Recurring" entry, before the next item — match the surrounding indentation):

```tsx
<SidebarItem
  isActive={pathname.includes(appRoutes.THRESHOLDS_PAGE)}
  title="Thresholds"
  icon={<InsightsIcon />}
  href={appRoutes.THRESHOLDS_PAGE}
/>
```

(`InsightsIcon` is already imported at the top of the file. Reusing it keeps this task scoped — designing a custom icon is out of plan scope; swap to a dedicated icon later as a polish task.)

- [ ] **Step 3: Manual UI test**

`pnpm dev`. Sidebar should now show a "Thresholds" entry. Click it → navigates to `/thresholds`. Active styling appears on that entry while the page is open.

- [ ] **Step 4: Commit**

```bash
git add src/utils/constants.ts src/components/sidebar/sidebar.tsx
git commit -m "feat(thresholds): add /thresholds route + sidebar entry"
```

---

### Task 15: Document env vars in `.env.example`

**Files:**
- Modify: `.env.example` (create if it doesn't exist)

- [ ] **Step 1: If `.env.example` doesn't exist, create it from `.env`** (sanitize values):

Run: `test -f .env.example || cp .env .env.example`

Then open `.env.example` and replace any real secrets/keys/URLs with placeholder values (e.g., `DATABASE_URL=postgresql://...`).

- [ ] **Step 2: Append the new env vars to `.env.example`**

```
# Resend (Phase 1 email delivery). API key from the Resend dashboard,
# sender must be a verified domain/email in Resend.
RESEND_API_KEY=
RESEND_SENDER_EMAIL=

# When "true", the threshold check logs intended sends but does not call Resend.
# Useful during initial deploy to verify wiring without spamming.
DRY_RUN_NOTIFICATIONS=false
```

- [ ] **Step 3: Add the same keys to your local `.env`** with real values (the actual `RESEND_API_KEY` + verified `RESEND_SENDER_EMAIL` once Prerequisites P1/P2 are done; `DRY_RUN_NOTIFICATIONS=false`).

- [ ] **Step 4: Commit**

```bash
git add .env.example
git commit -m "chore: document threshold-alert env vars"
```

---

### Task 16: Production canary

This is a manual checklist — no code changes. Run after all prior tasks land and the React Email component + Resend account (Prerequisites P1/P2) are ready.

- [ ] **Step 1: Confirm production env**

In Vercel (or wherever this deploys), set:
- `RESEND_API_KEY=<from Resend dashboard>`
- `RESEND_SENDER_EMAIL=<verified sender>`
- `DRY_RUN_NOTIFICATIONS=false`

(Existing `NEXTAUTH_URL` is already configured.)

- [ ] **Step 2: Apply migration to prod DB**

Run: `npx prisma migrate deploy` (against the prod connection string). Then run the seed against prod once: `npx ts-node prisma/seed.ts`. Verify each existing prod user has an `ExpenseThreshold` row via Supabase studio / `psql`.

- [ ] **Step 3: Deploy the app.**

- [ ] **Step 4: Verify the page loads in prod.** Sign in, visit `/thresholds`, confirm the seeded values render. Adjust your own thresholds to values that match the way you actually budget.

- [ ] **Step 5: Force at least one alert.** Pick a category where you've already spent some this month and lower the threshold below the current spend. (E.g., if you've spent $250 on Groceries this month, set Groceries to $200 — `EXCEEDED` should fire on the next sync.)

- [ ] **Step 6: Trigger a sync.**

Either wait for the next Plaid webhook (if you've made a recent transaction) or fire one manually:

Run: `npx ts-node scripts/fire-sync-webhook.ts` — pointed at prod (set the URL in the script's env or args; check the script for how).

- [ ] **Step 7: Verify in Resend dashboard**

Open Resend → Logs/Emails → expect to see exactly one delivery to your email within ~30 seconds. Open the email and confirm:
- Subject matches the level you forced.
- Per-alert block renders with correct numbers and percentage.
- "Adjust your thresholds" CTA links to the prod `/thresholds` URL.

- [ ] **Step 8: Verify dedupe**

Trigger a second sync immediately. Expected: no second email (the `NotificationLog` row from the first dispatch suppresses re-fire).

- [ ] **Step 9: Restore your thresholds** to sane values for the rest of the month.

- [ ] **Step 10: Watch for one week.** No "Step 11" — just check the Resend dashboard daily for any unexpected fires. If anything looks off (multiple emails for the same level, no email when one was expected, malformed copy), file an issue and patch.

---

## Self-review summary

**Spec coverage check:** All Phase 1 punch-list items from the spec are mapped to tasks above:

- Schema migration → Task 1
- Seed backfill → Task 2
- `monthKey.ts` → Task 3
- `expenseKeys.ts` (covers EXPENSE_KEYS + level math) → Task 4
- `templates.ts` (props builder for the React Email alert component; the notifier renders that component to HTML and ships via Resend) → Task 5
- `notifier.ts` (Notifier interface + EmailNotifier + DryRunNotifier covering DRY_RUN safety knob) → Task 6
- `thresholdCheck.ts` → Task 7
- Dry-run script → Task 8
- Plaid sync integration → Task 9
- Categorize cron integration with stale-totals fix → Task 10
- GET endpoint → Task 11
- PUT endpoint → Task 12
- `/thresholds` page + table → Task 13
- Sidebar + appRoutes → Task 14
- Env documentation → Task 15
- Production canary → Task 16

**Spec / plan deviation noted:** The spec described inline HTML/text email rendering in `formatAlertEmail`. An earlier draft of this plan instead used SendGrid Dynamic Templates (matching what was then the codebase's email pattern). The merged implementation pivoted again to **Resend + React Email**, which keeps the "rendering lives in code, not in a vendor dashboard" property of the spec while picking up better DX (typed props, local preview). `buildAlertEmailData` survives unchanged as the props builder feeding the React Email component. Treat any remaining SendGrid-specific text in this document as historical context rather than current instruction; defer to the merged code.

**Phase 2 coverage:** `verifySupabaseJwt`, `/api/push-tokens`, `ExpoPushNotifier`, `formatAlertPush`, mobile cleanups — all explicitly out of scope, will be addressed by a separate plan when the mobile app is ready.

---

Plan complete and saved to `docs/superpowers/plans/2026-04-30-thresholds-and-email-alerts-phase1.md`. Two execution options:

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration.

**2. Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints.

Which approach?
