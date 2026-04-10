import "server-only";
import type { JournalEntry, JournalType } from "@/lib/cas/journal-mapper";

export interface CasCsvJournal {
  transactionId: string;
  journalType: JournalType;
  description: string;
  referenceNo?: string | null;
  transactionDate: Date;
  createdBy: string;
  entries: JournalEntry[];
}

/** Wraps a CSV field per RFC 4180. */
function csvField(value: string | number | null | undefined): string {
  const s = value == null ? "" : String(value);
  if (s.includes(",") || s.includes('"') || s.includes("\n") || s.includes("\r")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

/**
 * Generates a CAS2000-compatible flat-file CSV for journal import.
 * Used as fallback when the CAS2000 REST API is unavailable.
 *
 * One row per journal entry (debit or credit line).
 *
 * Columns:
 *   transaction_id, journal_type, description, account_code, entry_type,
 *   amount, reference_no, transaction_date_pht, created_by
 */
export function generateCasCsv(journal: CasCsvJournal): string {
  const header = [
    "transaction_id",
    "journal_type",
    "description",
    "account_code",
    "entry_type",
    "amount",
    "reference_no",
    "transaction_date_pht",
    "created_by",
  ].join(",");

  // Format date as PHT (UTC+8)
  const phtDate = new Date(journal.transactionDate.getTime() + 8 * 60 * 60 * 1000)
    .toISOString()
    .replace("Z", "+08:00");

  const rows = journal.entries.map((entry) =>
    [
      csvField(journal.transactionId),
      csvField(journal.journalType),
      csvField(journal.description),
      csvField(entry.account_code),
      csvField(entry.type),
      csvField(entry.amount.toFixed(4)),
      csvField(journal.referenceNo),
      csvField(phtDate),
      csvField(journal.createdBy),
    ].join(",")
  );

  return [header, ...rows].join("\r\n");
}
