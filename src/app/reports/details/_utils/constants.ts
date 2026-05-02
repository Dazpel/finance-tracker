export const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

export const formatMonthLabel = (
  month: number | null | undefined,
  year: number | null | undefined,
  fallback: string
): string =>
  typeof month === "number" && typeof year === "number"
    ? `${MONTH_NAMES[month - 1]} ${year}`
    : fallback;
