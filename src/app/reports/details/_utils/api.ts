export type ApproveReportResult =
  | { ok: true; transactionsAdded: number }
  | { ok: false; status: number; error: string };

export async function approveReport(
  reportId: string | number
): Promise<ApproveReportResult> {
  try {
    const res = await fetch(`/api/prisma/reports/${reportId}/approve`, {
      method: "POST",
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || !json.success) {
      return {
        ok: false,
        status: res.status,
        error: json.error ?? "Failed to approve report",
      };
    }
    return { ok: true, transactionsAdded: json.transactionsAdded ?? 0 };
  } catch {
    return { ok: false, status: 0, error: "Failed to approve report" };
  }
}
