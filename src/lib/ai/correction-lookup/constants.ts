// Merchant prefixes too generic to learn a stable category from (Square/POS
// passthroughs, bare payments, transfers, refunds). Centralized here so both
// the correction-lookup layer and categorize.ts consult one source of truth.
export const GENERIC_MERCHANT = /^(sq|pos|payment|transfer|refund)/i;
