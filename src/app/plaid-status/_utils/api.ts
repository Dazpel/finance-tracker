import { ItemStatus, ItemStatusResponse, SyncNowResponse, SyncNowResult } from "@lib/plaid/status/types";

export async function fetchItemStatus(): Promise<ItemStatus[]> {
  const response = await fetch("/api/plaid/itemStatus");

  if (response.status === 401) {
    throw new Error("You must be signed in to check item status.");
  }

  const data = (await response.json().catch(() => null)) as ItemStatusResponse | null;

  if (!response.ok || !data?.success) {
    throw new Error(`Failed to fetch item status (${response.status})`);
  }

  return data.items;
}

export async function syncNow(plaidAccountId: string): Promise<SyncNowResult> {
  const response = await fetch("/api/plaid/syncNow", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ plaidAccountId }),
  });

  const data = (await response.json().catch(() => null)) as SyncNowResponse | null;

  if (!data || !data.success) {
    const message = data && !data.success && data.error
      ? data.error
      : `Sync request failed (${response.status})`;
    throw new Error(message);
  }

  return data.result;
}
