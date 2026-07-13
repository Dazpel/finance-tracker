import { ItemStatus, SyncNowResult } from "./types";

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

export type StatusChipInfo = {
  color: "danger" | "warning" | "success";
  label: string;
  message: string | null;
};

export const formatDateTime = (isoDate: string | null): string => {
  return isoDate ? new Date(isoDate).toLocaleString() : "—";
};

export const isConsentExpiringSoon = (consentExpirationTime: string | null): boolean => {
  if (!consentExpirationTime) return false;

  const expiresAt = new Date(consentExpirationTime).getTime();
  if (Number.isNaN(expiresAt)) return false;

  const msUntilExpiry = expiresAt - Date.now();
  // Already-expired consent surfaces via Plaid's item.error instead — this flag is
  // only for the "expiring soon" warning window, not the "already expired" state.
  return msUntilExpiry > 0 && msUntilExpiry <= THIRTY_DAYS_MS;
};

export const getStatusChipInfo = (item: ItemStatus): StatusChipInfo => {
  if (item.requestFailed) {
    return { color: "danger", label: item.requestFailed.code, message: item.requestFailed.message };
  }
  if (item.error) {
    return { color: "danger", label: item.error.code, message: item.error.message };
  }
  if (
    item.lastFailedUpdate &&
    (!item.lastSuccessfulUpdate || new Date(item.lastFailedUpdate) > new Date(item.lastSuccessfulUpdate))
  ) {
    return {
      color: "warning",
      label: "Refresh failed",
      message: "The last transaction refresh failed. Try Sync now.",
    };
  }
  return { color: "success", label: "Healthy", message: null };
};

export const formatSyncResultMessage = (result: SyncNowResult): string => {
  return `Re-sync complete: ${result.added} added, ${result.modified} modified, ${result.removed} removed`;
};
