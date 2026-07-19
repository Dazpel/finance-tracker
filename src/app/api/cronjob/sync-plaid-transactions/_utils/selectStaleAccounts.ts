// Threshold + priority logic for the Plaid backstop cron. Matches the mobile
// sync-current-month PLAID_STALE_MS (6h) so both paths treat "stale" consistently.
export const STALE_THRESHOLD_MS = 6 * 60 * 60 * 1000;

export const MAX_ACCOUNTS_PER_RUN = 20;

export type StaleCandidate = {
  id: string;
  cursor: { lastSyncAt: Date } | null;
};

// Never-synced accounts (no cursor row) sort first, then synced accounts oldest
// lastSyncAt first. Sorts a copy — never mutates the input — and caps to `max`.
export const prioritizeStaleAccounts = (
  candidates: StaleCandidate[],
  max: number
): StaleCandidate[] => {
  const sortKey = (c: StaleCandidate) =>
    c.cursor === null ? -Infinity : c.cursor.lastSyncAt.getTime();

  return [...candidates]
    .sort((a, b) => sortKey(a) - sortKey(b))
    .slice(0, max);
};
