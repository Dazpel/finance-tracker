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
} from "./_utils/helpers";
import { ItemStatus } from "./_utils/types";

export default function PlaidStatusPage() {
  const { successToast, errorToast, warningToast } = useToast();
  const [items, setItems] = useState<ItemStatus[] | null>(null);
  const [isChecking, setIsChecking] = useState(false);
  const [syncingTokens, setSyncingTokens] = useState<Record<string, boolean>>({});

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
    async (accessToken: string) => {
      setSyncingTokens((prev) => ({ ...prev, [accessToken]: true }));
      try {
        const result = await syncNow(accessToken);
        if (result.skipped) {
          warningToast("Sync already running");
        } else {
          successToast(formatSyncResultMessage(result));
        }
      } catch (error) {
        errorToast(error instanceof Error ? error.message : "Sync failed");
      } finally {
        setSyncingTokens((prev) => ({ ...prev, [accessToken]: false }));
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
        case "actions":
          return (
            <div className="flex items-center gap-2">
              <PlaidButton
                updateMode
                accessToken={item.accessToken}
                buttonText="Update"
                variant="update"
                size="sm"
                onSuccessCallback={() => handleSyncNow(item.accessToken)}
              />
              <Button
                size="sm"
                variant="flat"
                isLoading={!!syncingTokens[item.accessToken]}
                onPress={() => handleSyncNow(item.accessToken)}
              >
                Sync now
              </Button>
            </div>
          );
        default:
          return <span>{item.institutionName}</span>;
      }
    },
    [handleSyncNow, syncingTokens]
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
