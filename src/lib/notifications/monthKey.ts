const pad2 = (n: number) => (n < 10 ? `0${n}` : `${n}`);

// Returns "YYYY-MM" in UTC. UTC-stable so two checks at month-boundary edges
// don't disagree based on server timezone.
export function toMonthKey(date: Date): string {
  return `${date.getUTCFullYear()}-${pad2(date.getUTCMonth() + 1)}`;
}
