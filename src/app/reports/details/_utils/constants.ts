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
): string => {
  if (
    typeof month !== "number" ||
    typeof year !== "number" ||
    month < 1 ||
    month > 12
  ) {
    return fallback;
  }
  return `${MONTH_NAMES[month - 1]} ${year}`;
};
