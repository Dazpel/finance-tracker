export type ItemStatus = {
  institutionName: string;
  itemId: string;
  plaidAccountId: string;
  linkedAt: string;
  lastLocalSyncAt: string | null;
  error: { code: string; message: string } | null;
  requestFailed: { code: string; message: string } | null;
  updateType: string | null;
  consentExpirationTime: string | null;
  lastSuccessfulUpdate: string | null;
  lastFailedUpdate: string | null;
  lastWebhook: { sentAt: string | null; code: string | null } | null;
};

export type ItemStatusResponse = {
  success: boolean;
  items: ItemStatus[];
};

export type SyncNowResult = {
  added: number;
  modified: number;
  removed: number;
  pages: number;
  skipped: boolean;
};

export type SyncNowResponse =
  | { success: true; result: SyncNowResult }
  | { success: false; error: string };
