# Home Page Dashboard — Design Spec

**Date:** 2026-07-12
**Status:** Approved direction (Concept C), pending spec review
**Route:** `/` (`src/app/page.tsx`) — default post-login landing page and top sidebar item

## Problem

The post-login Home page renders a literal `"Work in progress..."` placeholder (`src/components/home/content.tsx`). Every user lands here first, on a dead page. We want Home to be immediately useful without duplicating the rich pages that already exist (Insights, Reports, Accounts, Recurring).

## Chosen direction — Concept C: "Mission Hub"

A **thin launcher**, not a full dashboard. It surfaces only what needs action and routes to the deep pages that already do the work. This ships fast, reuses the in-progress `plaid-status` connection-health work, and lets us decide the "redirect vs. dashboard" question with real usage before investing in Concepts A/B (roadmapped below).

### Layout (top to bottom)

1. **Greeting** — "Welcome back, {firstName}" + a one-line count of outstanding items ("3 things need your attention" / "You're all caught up").
2. **Action items** — a prioritized list, each row = icon + title + subtext + a status pill routing to the fix:
   - **Connection health** — any Plaid item needing reconnect / re-auth (from live item status). Loads async.
   - **Pending report approvals** — `Report.status ∈ {DRAFT, PENDING_APPROVAL}` for the current period.
   - **Exceeded budgets** — categories where current-month spend ≥ threshold cap.
   - When there are none, this section collapses into a single "all caught up" state.
3. **This month at a glance** — three numbers: In / Out / Net, from the current-month report.
4. **Jump back in** — quick-launch tiles to Insights, Reports, Accounts, Recurring.

### Empty / first-run state

If the user has **zero connected accounts** (`PlaidAccount` count = 0), replace the whole hub with a single centered "Connect your first account" CTA (reusing `PlaidButton`) + one line on the value of linking. Never show a dead grid. This state is built in the same phase, not deferred.

## Data model & sources

All reads are per-user (`userId`) via the existing server-action pattern (`session → email → user.id → prisma`, mirroring `src/app/insights/actions.ts`).

| Section | Source | How computed |
|---|---|---|
| Greeting name | NextAuth session (`session.user.name`) | First token of name |
| Account count / empty state | `PlaidAccount` | `count({ where: { userId } })` |
| Month summary (In/Out/Net) | `Report` (current month, `reportType=MONTHLY`, `autoMaintainedAt != null`) | `revenue` / `expenses` / `total` |
| Pending reports | `Report.status` | count of `DRAFT` + `PENDING_APPROVAL` |
| Exceeded budgets | `Report` category columns + `ExpenseThreshold` | reuse `lib/notifications/thresholdCheck` + `expenseKeys` to derive over-cap categories |
| Connection health | live Plaid `itemGet` per `PlaidAccount` (+ `PlaidCursor.lastSyncAt`) | classify each item → healthy / needs-attention |

**Not used:** net worth / balances (not stored; deferred to Concept A, needs a live `accountsGet`).

## Architecture

### Server component + async health

- `src/app/page.tsx` becomes a **server component** (drop `'use client'`). It fetches DB-backed data on the server (fast) and renders the shell with no loading spinner for the primary content.
- **Connection health loads client-side** (it does live Plaid calls — slow and failure-prone — and must not block first paint). A small client subcomponent fetches it via TanStack Query and shows a skeleton row while loading.

### Data layer (new files, split by concern per repo convention)

- `src/components/home/actions.ts` — `"use server"` server actions:
  - `getHomeSummary()` → `{ accountCount, month: {in,out,net,label}, pendingReports, exceededBudgets }` (single DB round-trip group).
  - `getConnectionHealth()` → **redacted** summary `{ items: { institutionName, status, reason }[] }`. Never returns Plaid secrets — mirrors `/api/plaid/itemStatus`, which already identifies connections by `plaidAccountId` rather than `accessToken`. Reuses the item-status classification logic, not its response shape.
- `src/components/home/types.ts` — `HomeSummary`, `ConnectionHealthItem`, `ActionItem`, status enums.
- `src/components/home/constants.ts` — quick-launch tile config (label, icon, route from `appRoutes`), status→pill styling map.
- `src/components/home/helpers.ts` — pure functions: `classifyConnection(itemStatus)`, `buildActionItems(summary, health)`, `formatMoney`.

### Components (compose in `src/components/home/`)

- `content.tsx` — **rewritten** to compose the sections (replaces the placeholder).
- `HomeGreeting.tsx`, `ActionItems.tsx` (client — owns the health query), `MonthGlance.tsx`, `JumpBackIn.tsx`, `EmptyState.tsx`.
- Reuse HeroUI `Card`/`Chip`/`Button` and existing `PlaidButton`, `Loader`. Delete the dead commented-out `PieChart.tsx` / `TransactionsChart.tsx` in this folder while we're here.

### Redirect question (decision)

**Default: no auto-redirect.** Always render the hub. The redirect-returning-users-to-`/insights` idea is recorded as a future option to revisit once we have usage data — not built now. (Open question below.)

## States

- **Loading:** DB-backed shell renders immediately; only the connection-health rows show a skeleton.
- **Health fetch error:** show a single non-blocking "Couldn't check connections — retry" row; the rest of the hub is unaffected.
- **Empty (no accounts):** first-run CTA replaces the hub.
- **All caught up:** action-items section shows a positive empty state instead of a list.

## Testing

- Unit (Vitest) on `helpers.ts`: `classifyConnection` for each Plaid error class (item error, consent expired, request failed, healthy); `buildActionItems` ordering and the empty/all-caught-up cases; `formatMoney`.
- Server actions: assert `userId` scoping is present on every query (guard against cross-tenant reads) and the redacted health payload contains **no** `accessToken`.

## Verification ladder

Narrowest first: `pnpm vitest run` on the new helper/action tests → `pnpm typecheck` (new types + Prisma reads) → `pnpm lint` → `pnpm build` (root route becomes a server component — rendering behavior changed).

---

## Roadmap — Concepts A & B (future phases, not this change)

Home is designed to **grow into** the fuller dashboards without a rewrite: the hub becomes the top band, new widgets stack below.

### Phase 2 — Concept A additions ("Command Center")
Turn the hub into a desktop dashboard by adding, below the action band:
- **KPI stat row:** Net cash flow, Spend this month, 50/30/20 health. Reuse `calculateFiftyThirtyTwenty` (`src/utils/insights.ts`) and `FiftyThirtyTwentyCard`.
- **Spending-by-category donut:** reuse `src/components/PieChart/PieChart.tsx`, fed by current-month transactions via `insights/actions.ts`.
- **Budget progress bars:** promote "exceeded budgets" into a full per-category progress card (reuse `ThresholdsTable` logic).
- **Upcoming recurring** + **Recent transactions** feeds (from `RecurringTransaction` / `SyncedTransaction`).
- **Net worth (optional, gated):** requires a live Plaid `accountsGet` (as the Accounts page does) — evaluate cost/latency before adding; render behind a loading state like connection health.
- *Cost: Medium. Mostly composition of existing components; new work is layout + the recurring/recent feeds.*

### Phase 3 — Concept B additions ("Daily Glance")
Borrow the highest-value mobile-first ideas into Home (and keep web/mobile parity):
- **"Safe to spend" hero** — one number = income − spend-to-date for the month.
- **Spending trend sparkline** — reuse `CategoryMonthlyChart` / `useCategoryMonthlyData`.
- **Tap-to-review** on recent transactions (categorization habit loop).
- *Cost: Medium. The "safe to spend" figure is derivable from the same month report; trend chart already exists.*

Order rationale: C establishes the data layer and the action surface; A reuses existing chart/KPI components on top of it; B layers engagement features once the dashboard exists. Each phase is independently shippable.

## Open questions

1. **Redirect variant** — keep the always-hub default, or A/B a redirect to `/insights` for users with an approved current-month report? (Recommend: ship hub, revisit with data.)
2. **Connection-health cost** — `getConnectionHealth()` does one live Plaid call per item. Acceptable on every Home load, or cache briefly (e.g. 60s) / move behind an explicit "check now"? (Recommend: client-async now, add short cache if it feels slow.)
