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
