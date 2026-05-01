"use client";

import { useState, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Input, Button, Spinner } from "@heroui/react";
import { EXPENSE_KEYS, EXPENSE_KEY_TO_DISPLAY, type ExpenseKey } from "@lib/notifications/expenseKeys";

type ThresholdsRow = Record<ExpenseKey, number> & {
  id: string;
  userId: string;
};

async function fetchThresholds(): Promise<ThresholdsRow> {
  const res = await fetch("/api/prisma/thresholds/get");
  const json = await res.json();
  if (!json.success) throw new Error(json.error ?? "Failed to load thresholds");
  return json.response as ThresholdsRow;
}

async function saveThreshold(
  key: ExpenseKey,
  value: number
): Promise<ThresholdsRow> {
  const res = await fetch("/api/prisma/thresholds/update", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ [key]: value }),
  });
  const json = await res.json();
  if (!json.success) throw new Error(typeof json.error === "string" ? json.error : "Save failed");
  return json.response as ThresholdsRow;
}

export const ThresholdsTable = () => {
  const queryClient = useQueryClient();
  const { data, isLoading, error } = useQuery({
    queryKey: ["thresholds"],
    queryFn: fetchThresholds,
  });

  if (isLoading) return <Spinner label="Loading thresholds..." />;
  if (error) return <div className="text-danger">Failed to load: {String(error)}</div>;
  if (!data) return null;

  return (
    <div className="flex flex-col gap-2">
      {EXPENSE_KEYS.map((key) => (
        <ThresholdRow
          key={key}
          columnKey={key}
          initialValue={data[key]}
          onSave={async (value) => {
            const updated = await saveThreshold(key, value);
            queryClient.setQueryData(["thresholds"], updated);
          }}
        />
      ))}
    </div>
  );
};

function ThresholdRow({
  columnKey,
  initialValue,
  onSave,
}: {
  columnKey: ExpenseKey;
  initialValue: number;
  onSave: (value: number) => Promise<void>;
}) {
  const [value, setValue] = useState<string>(String(initialValue));
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const parsed = useMemo(() => {
    const n = Number(value);
    return Number.isFinite(n) && n >= 0 ? n : null;
  }, [value]);

  const dirty = parsed !== null && parsed !== initialValue;
  const placeholder = initialValue === 0 ? "No threshold" : "";

  const handleSave = async () => {
    if (!dirty || parsed === null) return;
    setSaving(true);
    setErrorMsg(null);
    try {
      await onSave(parsed);
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex items-center gap-3 p-3 rounded-lg border border-default-200">
      <div className="w-40 text-sm font-medium">{EXPENSE_KEY_TO_DISPLAY[columnKey]}</div>
      <Input
        type="number"
        value={value}
        onValueChange={setValue}
        placeholder={placeholder}
        startContent={<span className="text-default-400">$</span>}
        min={0}
        step={1}
        size="sm"
        className="max-w-40"
        aria-label={`${EXPENSE_KEY_TO_DISPLAY[columnKey]} threshold`}
      />
      <Button
        size="sm"
        color="primary"
        isDisabled={!dirty}
        isLoading={saving}
        onPress={handleSave}
      >
        Save
      </Button>
      {errorMsg && <span className="text-danger text-xs">{errorMsg}</span>}
    </div>
  );
}
