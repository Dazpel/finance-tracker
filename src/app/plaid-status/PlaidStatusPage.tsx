"use client";

import React, { useCallback, useState } from "react";
import {
  Button,
  Chip,
  Table,
  TableBody,
  TableCell,
  TableColumn,
  TableHeader,
  TableRow,
} from "@heroui/react";
import PlaidButton from "@components/PlaidButton/PlaidButton";
import { useToast } from "@hooks/useToast";
import { fetchItemStatus, syncNow } from "./_utils/api";
import { columns } from "./_utils/constants";
import {
  formatDateTime,
  formatSyncResultMessage,
  getStatusChipInfo,
  isConsentExpiringSoon,
} from "@lib/plaid/status/helpers";
import { ItemStatus } from "@lib/plaid/status/types";

export default function PlaidStatusPage() {
  const { successToast, errorToast, warningToast } = useToast();
  const [items, setItems] = useState<ItemStatus[] | null>(null);
  const [isChecking, setIsChecking] = useState(false);
  const [syncingAccounts, setSyncingAccounts] = useState<Record<string, boolean>>({});

  const checkStatus = useCallback(async () => {
    setIsChecking(true);
    try {
      const result = await fetchItemStatus();
      setItems(result);
    } catch (error) {
      errorToast(error instanceof Error ? error.message : "Failed to check item status");
    } finally {
      setIsChecking(false);
    }
  }, [errorToast]);

  const handleSyncNow = useCallback(
    async (plaidAccountId: string) => {
      setSyncingAccounts((prev) => ({ ...prev, [plaidAccountId]: true }));
      try {
        const result = await syncNow(plaidAccountId);
        if (result.skipped) {
          warningToast("Sync already running");
        } else {
          successToast(formatSyncResultMessage(result));
        }
      } catch (error) {
        errorToast(error instanceof Error ? error.message : "Sync failed");
      } finally {
        setSyncingAccounts((prev) => ({ ...prev, [plaidAccountId]: false }));
        await checkStatus();
      }
    },
    [checkStatus, successToast, errorToast, warningToast]
  );

  const renderCell = useCallback(
    (item: ItemStatus, columnKey: React.Key) => {
      switch (columnKey) {
        case "institutionName":
          return <span>{item.institutionName}</span>;
        case "status": {
          const chip = getStatusChipInfo(item);
          return (
            <div className="flex flex-col gap-1">
              <Chip color={chip.color} variant="flat" size="sm">
                {chip.label}
              </Chip>
              {chip.message && (
                <p className="text-xs text-gray-600">{chip.message}</p>
              )}
              {isConsentExpiringSoon(item.consentExpirationTime) && (
                <p className="text-xs text-warning">
                  Consent expires {formatDateTime(item.consentExpirationTime)}
                </p>
              )}
            </div>
          );
        }
        case "lastSuccessfulUpdate":
          return <span>{formatDateTime(item.lastSuccessfulUpdate)}</span>;
        case "lastFailedUpdate":
          return (
            <span className={item.lastFailedUpdate ? "text-danger" : undefined}>
              {formatDateTime(item.lastFailedUpdate)}
            </span>
          );
        case "lastWebhook":
          if (!item.lastWebhook || (!item.lastWebhook.code && !item.lastWebhook.sentAt)) {
            return <span>—</span>;
          }
          return (
            <div className="flex flex-col">
              <span>{item.lastWebhook.code ?? "—"}</span>
              <span className="text-xs text-gray-600">
                {formatDateTime(item.lastWebhook.sentAt)}
              </span>
            </div>
          );
        case "lastLocalSyncAt":
          return <span>{formatDateTime(item.lastLocalSyncAt)}</span>;
        case "actions": {
          // Only mount PlaidButton (which eagerly requests an update-mode link token)
          // for items that actually need reconnecting — otherwise every row would
          // fire a Plaid linkTokenCreate call on every status check. Expiring
          // consent is included because renewing it also requires update-mode
          // Link (a plain "Sync now" cannot extend consent).
          const needsUpdate =
            Boolean(item.error) ||
            Boolean(item.requestFailed) ||
            isConsentExpiringSoon(item.consentExpirationTime);
          return (
            <div className="flex items-center gap-2">
              {needsUpdate && (
                <PlaidButton
                  updateMode
                  plaidAccountId={item.plaidAccountId}
                  buttonText="Update"
                  variant="update"
                  size="sm"
                  onSuccessCallback={() => handleSyncNow(item.plaidAccountId)}
                />
              )}
              <Button
                size="sm"
                variant="flat"
                isLoading={!!syncingAccounts[item.plaidAccountId]}
                onPress={() => handleSyncNow(item.plaidAccountId)}
              >
                Sync now
              </Button>
            </div>
          );
        }
        default:
          return <span>{item.institutionName}</span>;
      }
    },
    [handleSyncNow, syncingAccounts]
  );

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-gray-600">
        Repairing a connection re-authenticates the existing item — your transaction history is preserved.
      </p>
      <Button
        color="primary"
        className="w-fit"
        isLoading={isChecking}
        onPress={checkStatus}
      >
        Check item status
      </Button>
      {items === null ? (
        <p className="text-sm text-gray-500">
          Click &quot;Check item status&quot; to review the health of your bank connections.
        </p>
      ) : (
        <Table aria-label="Plaid connection health" className="min-h-[200px]">
          <TableHeader columns={columns}>
            {(column) => (
              <TableColumn key={column.key}>{column.label}</TableColumn>
            )}
          </TableHeader>
          <TableBody items={items} emptyContent="No connected items found.">
            {(item) => (
              <TableRow key={item.itemId}>
                {(columnKey) => (
                  <TableCell>{renderCell(item, columnKey)}</TableCell>
                )}
              </TableRow>
            )}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
