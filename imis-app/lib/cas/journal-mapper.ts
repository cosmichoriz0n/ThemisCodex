/**
 * NEA COA Journal Mapper
 *
 * Maps IMIS movement types to NEA Uniform System of Accounts journal entries.
 * Pure function — no DB access, no side effects.
 *
 * Account codes per §5.2 of the IMIS master document:
 *   5110  Cost of Goods Sold
 *   5120  Inventory Adjustment Expense
 *   5130  Loss on Disposal
 *   5310  Depreciation Expense - UPIS
 *   1540  Materials and Supplies
 *   1920  Utility Plant in Service
 *   1990  Accumulated Depreciation
 *   2110  Accounts Payable
 *
 * NOTE: Confirm sub-account codes with the cooperative Finance Officer before
 * going live — cooperatives may have additional sub-account suffixes.
 */

export type MovementType =
  | "issue"      // stock_out — COGS journal
  | "adjust"     // manual adjustment
  | "dispose"    // asset disposal write-off
  | "receive"    // stock receiving (goods in from supplier)
  | "return"     // return from member — reverses an issue
  | "transfer";  // internal transfer — no journal required

export type JournalType =
  | "COGS"
  | "ADJUSTMENT"
  | "DISPOSAL"
  | "STOCK_IN"
  | "REVERSAL"
  | "UPIS_DEPRECIATION"
  | "NONE";

export interface JournalEntry {
  account_code: string;
  type: "Debit" | "Credit";
  amount: number;
}

export interface JournalResult {
  journal_type: JournalType;
  description: string;
  entries: JournalEntry[];
}

export class JournalBalanceError extends Error {
  constructor(debitSum: number, creditSum: number) {
    super(
      `Journal does not balance: debits=${debitSum.toFixed(4)} credits=${creditSum.toFixed(4)}`
    );
    this.name = "JournalBalanceError";
  }
}

/**
 * Validates that the sum of debits equals the sum of credits.
 * Throws JournalBalanceError if not balanced.
 */
function validateBalance(entries: JournalEntry[]): void {
  const debitSum  = entries.filter((e) => e.type === "Debit").reduce((s, e) => s + e.amount, 0);
  const creditSum = entries.filter((e) => e.type === "Credit").reduce((s, e) => s + e.amount, 0);
  // Use rounding to avoid floating-point drift
  if (Math.abs(debitSum - creditSum) > 0.0001) {
    throw new JournalBalanceError(debitSum, creditSum);
  }
}

/**
 * Maps a stock movement type + amount to NEA COA journal entries.
 *
 * @param movementType - IMIS movement_type from stock_movements table
 * @param amount       - transaction total in PHP (must be positive)
 * @param description  - human-readable description for the journal header
 * @returns JournalResult with journal_type, description, and balanced entries
 */
export function mapJournal(
  movementType: MovementType,
  amount: number,
  description: string
): JournalResult {
  if (amount <= 0) {
    throw new RangeError(`Journal amount must be positive, got ${amount}`);
  }

  let result: JournalResult;

  switch (movementType) {
    case "issue":
      result = {
        journal_type: "COGS",
        description,
        entries: [
          { account_code: "5110", type: "Debit",  amount },
          { account_code: "1540", type: "Credit", amount },
        ],
      };
      break;

    case "adjust":
      result = {
        journal_type: "ADJUSTMENT",
        description,
        entries: [
          { account_code: "5120", type: "Debit",  amount },
          { account_code: "1540", type: "Credit", amount },
        ],
      };
      break;

    case "dispose":
      result = {
        journal_type: "DISPOSAL",
        description,
        entries: [
          { account_code: "5130", type: "Debit",  amount },
          { account_code: "1920", type: "Credit", amount },
        ],
      };
      break;

    case "receive":
      result = {
        journal_type: "STOCK_IN",
        description,
        entries: [
          { account_code: "1540", type: "Debit",  amount },
          { account_code: "2110", type: "Credit", amount },
        ],
      };
      break;

    case "return":
      // Reversal of a COGS entry
      result = {
        journal_type: "REVERSAL",
        description,
        entries: [
          { account_code: "1540", type: "Debit",  amount },
          { account_code: "5110", type: "Credit", amount },
        ],
      };
      break;

    case "transfer":
      // Internal transfer — no accounting journal required
      result = {
        journal_type: "NONE",
        description,
        entries: [],
      };
      break;

    default: {
      const exhaustive: never = movementType;
      throw new Error(`Unknown movement type: ${exhaustive}`);
    }
  }

  if (result.entries.length > 0) {
    validateBalance(result.entries);
  }

  return result;
}

/**
 * Builds the annual UPIS depreciation journal entry.
 * Dr 5310 Depreciation Expense - UPIS / Cr 1990 Accumulated Depreciation
 *
 * @param annualDepreciation - computed as acquisition_cost × (depreciation_rate / 100)
 */
export function buildUpisDepreciationJournal(annualDepreciation: number): JournalResult {
  if (annualDepreciation <= 0) {
    throw new RangeError(
      `UPIS depreciation amount must be positive, got ${annualDepreciation}`
    );
  }

  const result: JournalResult = {
    journal_type: "UPIS_DEPRECIATION",
    description:  "Annual UPIS depreciation",
    entries: [
      { account_code: "5310", type: "Debit",  amount: annualDepreciation },
      { account_code: "1990", type: "Credit", amount: annualDepreciation },
    ],
  };

  validateBalance(result.entries);
  return result;
}
