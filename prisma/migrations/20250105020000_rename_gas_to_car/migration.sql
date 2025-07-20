-- Rename the gas column to car
ALTER TABLE "Report" RENAME COLUMN "gas" TO "car";

-- Update any existing data if needed (optional - since we're just renaming)
-- The data will remain the same, just under a new column name 