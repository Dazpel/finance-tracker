# AGENTS.md

This file provides comprehensive guidance for AI agents working with this codebase.

## Project Overview

The **MoneyEye Finance Tracker** is a Next.js 16 application that serves as a personal finance management platform. It enables users to connect their bank accounts via Plaid integration, track transactions, generate financial reports, manage recurring transactions, and gain insights into their spending patterns across various categories.

## Development Commands

### Important
When working with Next.js, always call the init tool from next-devtools-mcp at the start of the session to establish proper context and documentation requirements.

### Core Development

- `pnpm dev` - Start development server with Turbo mode
- `pnpm build` - Build the application for production
- `pnpm start` - Start the production server
- `pnpm lint` - Run ESLint on the codebase

### Database Management

- `pnpm postinstall` - Generate Prisma client (runs automatically after install)
- `npx prisma generate` - Generate Prisma client
- `npx prisma db push` - Push schema changes to database
- `npx prisma migrate dev` - Create and apply database migrations
- `npx prisma studio` - Open Prisma Studio for database management

## Architecture Overview

This is a **Next.js 16** application with the following key architectural components:

### Framework Stack

- **Next.js 16** with App Router (not Pages Router)
- **React 19** with TypeScript
- **Prisma** for database ORM with PostgreSQL
- **NextAuth.js** for authentication
- **Plaid API** for bank account integration
- **TanStack Query** for client-side data management
- **HeroUI** (NextUI) for UI components
- **Tailwind CSS** for styling
- **Recharts** for data visualization
- **Framer Motion** for animations

### Project Structure

```
src/
├── app/                          # Next.js App Router pages and API routes
│   ├── accounts/                 # Bank accounts management
│   ├── api/                     # API routes
│   │   ├── auth/                # NextAuth.js authentication
│   │   ├── plaid/               # Plaid integration endpoints
│   │   ├── prisma/              # Database operations
│   │   ├── reports/             # Financial reports API
│   │   ├── notes/               # Notes management API
│   │   └── cronjob/             # Scheduled tasks
│   ├── insights/                # Financial insights and analytics
│   ├── notes/                   # Notes management
│   ├── recurring-transactions/  # Recurring transaction management
│   │   └── _utils/              # Page-private helpers (private folder)
│   ├── reports/                 # Financial reports
│   │   └── details/
│   │       └── _utils/          # Page-private helpers (constants, api wrappers)
│   ├── settings/                # User settings
│   ├── transactions/            # Transaction management
│   └── providers.tsx            # Global providers
├── components/                   # Reusable React components
│   ├── home/                    # Home page components
│   ├── layout/                  # Layout components
│   ├── navbar/                  # Navigation components
│   ├── sidebar/                 # Sidebar components
│   ├── TransactionsTable/       # Transaction management
│   ├── ReportsTable/            # Reports management
│   ├── RecurringTransactionsTable/ # Recurring transactions
│   ├── EditTransactionModal/    # Reusable edit-transaction modal
│   ├── ApproveReportModal/      # Reusable approve-report confirmation modal
│   └── CategoryInsightsTable/   # Category analytics
├── hooks/                       # Custom React hooks
├── lib/                         # Utility libraries
│   ├── prisma/                  # Prisma client and functions
│   └── plaid.ts                 # Plaid API configuration
└── utils/                       # General utility functions
```

### Component & Page Organization (separation of concerns)

Page components in `src/app/<route>/page.tsx` should stay focused on **state, composition, and event wiring**. Heavy logic, helper constants, API wrappers, and UI subcomponents belong in dedicated files. Backed by Next.js docs on [colocation](https://nextjs.org/docs/app/getting-started/project-structure#colocation) and [private folders](https://nextjs.org/docs/app/getting-started/project-structure#private-folders).

**Where things live:**

- **Reusable UI components** (modals, tables, cards used by more than one page, or that have non-trivial markup): `src/components/<ComponentName>/<ComponentName>.tsx`. Examples: `EditTransactionModal/`, `ApproveReportModal/`, `ReportsTable/`. Each component is its own folder so siblings (subcomponents, tests, styles) can colocate later without churn.
- **Page-private helpers** (constants, formatters, fetch wrappers used only by one page or one route segment): `src/app/<route>/_utils/<file>.ts`. The leading underscore makes it a [private folder](https://nextjs.org/docs/app/getting-started/project-structure#private-folders) — Next.js excludes it from routing, so files inside cannot accidentally become routes. Split by concern: `constants.ts`, `api.ts`, `helpers.ts`, etc. Existing examples: `src/app/recurring-transactions/_utils/`, `src/app/reports/details/_utils/`.
- **Cross-route helpers** (functions used by ≥2 routes): `src/utils/` (general) or `src/lib/<domain>/` (domain-specific, e.g., `src/lib/reports/`).
- **Inline `fetch` / `axios`** in a page is OK for one-shot reads. The moment a page does mutation calls or has more than one endpoint touch, extract to `_utils/api.ts` so the page handler reads as plain control flow.
- **Modal pairs** that are tightly coupled to a single component (e.g., `BulkDeleteConfirmModal` next to `TransactionsTable`): colocate as siblings inside that component's folder. Standalone modals that any page can mount go in `src/components/`.

**Rule of thumb:** if `page.tsx` grows past ~200 lines, or if a `useState` block sits next to a 30-line `async` handler that does its own `fetch` + JSON shaping + error mapping, that's a signal to extract.

### Database Schema

The application uses **PostgreSQL** with **Prisma ORM** and includes the following main models:

- **User**: User accounts with authorization status
- **PlaidAccount**: Connected bank accounts via Plaid
- **Transaction**: Individual financial transactions
- **Report**: Financial reports (monthly/annual) with categorized spending
- **RecurringReport**: Reports for recurring income/expenses
- **RecurringTransaction**: Recurring financial transactions
- **Note**: User notes and annotations

### Authentication & Session Management

- Uses **NextAuth.js v4** for authentication
- Custom proxy (middleware) for route protection in `src/proxy.ts`
- User authorization system with email-based access control
- Session management with secure cookie handling

### Plaid Integration

- **Plaid API** integration for bank account connectivity
- Support for multiple financial institutions
- Real-time transaction synchronization
- Secure token management for bank access

### State Management

- **TanStack Query** for server state management
- **NextAuth session** for authentication state
- React Context for application-wide state
- Local component state for UI interactions

### Styling & UI

- **HeroUI (NextUI)** component library
- **Tailwind CSS** for utility-first styling
- **Framer Motion** for smooth animations
- **Recharts** for data visualization
- **Next Themes** for dark/light mode support
- **Roboto Flex** font for typography

### Code Style Guidelines

- Use clear, descriptive variable and method names
- Follow camelCase naming conventions for variables and methods
- Use PascalCase for component names and types
- Use Function-based React components instead of class components
- Use TypeScript for type safety
- Add meaningful comments for complex logic
- Keep methods focused and under 50 lines when possible
- Use consistent indentation (2 spaces)
- Break long lines at 120 characters for better readability
- Avoid deep nesting; use early returns to simplify logic
- Use meaningful constants instead of magic numbers or strings
- Do not use abbreviations unless they are widely recognized
- Do not use wildcard imports; import only what is necessary
- Use single quotes for imports and JavaScript/TypeScript strings
- Use double quotes for JSX attributes and class names in JSX
- Use `const` for variables that should not change after initialization
- Follow the existing code style in each file

### React Best Practices

- Prefer functional components with hooks over class components
- Use React Server Components where appropriate (Next.js App Router)
- Implement proper error boundaries
- Use `React.memo()` for performance optimization when needed
- Follow the rules of hooks (always call at top level)
- Use TypeScript interfaces for component props
- Use Suspense for loading states

## Important Notes

### Environment Configuration

This application requires specific environment variables for:
- **Database**: `DATABASE_URL` and `DIRECT_URL` for PostgreSQL connection
- **Plaid Integration**: `PLAID_CLIENT_ID`, `PLAID_SECRET`, and `PLAID_ENV`
- **NextAuth**: `NEXTAUTH_SECRET` and `NEXTAUTH_URL`
- **Email**: Resend configuration (`RESEND_API_KEY`, sender email) for notifications, with templates rendered via React Email
- **Vercel**: Analytics and Speed Insights configuration

### Database Management

- Uses **Prisma** as the ORM with PostgreSQL
- Database migrations are stored in `prisma/migrations/`
- Schema changes should be made in `prisma/schema.prisma`
- Run `npx prisma migrate dev` after schema changes
- Use `npx prisma studio` for database inspection

### Plaid Integration

- Supports sandbox, development, and production environments
- Handles bank account linking and transaction synchronization
- Manages access tokens securely
- Implements proper error handling for API failures

### Performance Considerations

- Uses Next.js 16 with App Router for optimal performance
- Implements proper caching strategies with TanStack Query
- Server-side rendering where appropriate
- Code splitting through Next.js App Router
- Image optimization with Next.js Image component
- Vercel Analytics and Speed Insights for monitoring

### Security Considerations

- Authentication handled through NextAuth.js
- Route protection via custom middleware
- Secure session management
- CSRF protection through NextAuth.js
- Proper error handling to avoid information leakage
- Secure handling of financial data through Plaid

## Mobile API & Security

REQUIRED reading before any change to `/api/mobile/*`, `/api/push-tokens`, or anything that uses `requireMobileUser`.

### Architecture

- Mobile clients (Expo, repo `finance-tracker-mobile`) authenticate with Google → exchange the Google ID token for a Supabase JWT (`supabase.auth.signInWithIdToken`).
- The mobile app uses Supabase **only** for `auth.*` (sign-in, session refresh, sign-out). It must NEVER call `supabase.from(...)`, `supabase.rpc(...)`, `supabase.storage`, or `supabase.functions`. All data goes through Next.js.
- All mobile data flows: `Authorization: Bearer <supabase JWT>` → Next.js (`/api/mobile/*`, `/api/push-tokens`) → Prisma → Postgres.
- JWT verification: `src/lib/auth/verifySupabaseJwt.ts` (jose + Supabase JWKS).
- Auth gate: `src/lib/auth/requireMobileUser.ts` — verifies the JWT, looks up the user by email, enforces `User.authorized = true`. This is the only function that enforces the whitelist.

### RLS posture (do not weaken)

- Every table in the `public` schema has Postgres RLS enabled with **no policies** — i.e. deny-all to every role except superusers. This includes Prisma's own `_prisma_migrations` table; any new public table (including tooling tables) must get RLS too.
- Prisma connects as the `postgres` superuser via the Supabase pooler and bypasses RLS, so backend code keeps working unchanged.
- The Supabase anon key shipped in the mobile binary is therefore powerless against `public` data — direct REST/PostgREST attempts return empty.
- **Do not add policies that grant access to the `anon` or `authenticated` Postgres roles.** That re-opens the direct-Supabase data path.
- **Do not switch Prisma's connection role away from `postgres` without also writing per-table RLS policies.** The current invariant is "all data access via Next.js, none direct."

### Authorization rules for every mobile route

1. **Always use `requireMobileUser`** as the first line of the handler:
   ```ts
   const auth = await requireMobileUser(request);
   if (!auth.ok) return auth.response;
   ```
   Do not roll your own JWT verification.

   **Sole exception: `/api/mobile/me`.** That route reports the whitelist verdict so the mobile app can render the "not authorized" screen, which means a non-`authorized` user must get a 200 with `{ authorized: false }` rather than the 403 `requireMobileUser` would return. It still verifies the JWT directly via `verifySupabaseJwt` and exposes no user-scoped data. Do not extend this carve-out to any other route.

2. **Every Prisma query touching user-scoped data MUST filter by `userId: auth.user.id`** in `where`. This applies to `findFirst`, `findMany`, `findUnique` (when keyed on a non-`userId` column), `update`, `delete`, `updateMany`, `deleteMany`, `aggregate`, `groupBy`, `count`, `upsert`.

3. **`updateMany` and `deleteMany` without a `userId` clause are forbidden.** Scoping by another field that "feels" identifying (a token, a transaction id, a name, a deviceId) is not authorization. If you genuinely need a cross-user mutation (rare — usually only cron / webhook code), it does not belong on a mobile route.

4. **Never trust body- or URL-supplied user identifiers.** If the route accepts an entity id, verify ownership before mutating:
   ```ts
   const row = await prisma.transaction.findUnique({ where: { id }, select: { userId: true } });
   if (!row || row.userId !== auth.user.id) {
     return Response.json({ success: false, error: "Not found" }, { status: 404 });
   }
   ```

5. **Validate request bodies with Zod.** Pattern: `src/app/api/push-tokens/route.ts`. Reject before touching the DB.

6. **Response shape:** `{ success: true, response: <data> }` on success, `{ success: false, error: <string|object> }` on failure. The mobile `authenticatedFetch` helper (`finance-tracker-mobile/services/api.ts`) parses this shape.

### Checklist for any new mobile route or any change to an existing one

- [ ] First line of the handler is `const auth = await requireMobileUser(request); if (!auth.ok) return auth.response;`
- [ ] Every Prisma call in the handler has `userId: auth.user.id` in `where` (or, for `upsert`, in the unique-key composite).
- [ ] No `deleteMany` / `updateMany` without `userId: auth.user.id` in `where`.
- [ ] If the body contains an entity id, an explicit ownership check is in place.
- [ ] Body validated with Zod.
- [ ] Response shape matches `{ success, response | error }`.

### Why this matters

The RLS deny-all closes the direct-Supabase-REST attack vector but does **not** protect data from a malicious authenticated mobile user — Prisma bypasses RLS, so all authorization for mobile-API requests happens in route code. A single missing `userId` filter is an immediate cross-tenant data hole.

## Development Workflow

1. **Setup**: Run `pnpm i` to install dependencies
2. **Database**: Set up PostgreSQL and configure environment variables
3. **Development**: Use `pnpm dev` to start the development server
4. **Database Changes**: Update `prisma/schema.prisma` and run `npx prisma migrate dev`
5. **Linting**: Run `pnpm lint` before committing
6. **Building**: Use `pnpm build` for production builds

## Key Features

- **Bank Account Integration**: Connect multiple bank accounts via Plaid
- **Transaction Management**: View and categorize all financial transactions
- **Financial Reports**: Generate monthly and annual spending reports
- **Category Insights**: Analyze spending patterns across different categories
- **Recurring Transactions**: Track and manage recurring income and expenses
- **Notes System**: Add personal notes to transactions and reports
- **Dark/Light Mode**: Theme switching for better user experience
- **Responsive Design**: Mobile-friendly interface
- **Real-time Data**: Automatic synchronization with bank accounts
