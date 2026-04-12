import "server-only";
import { uploadFile, getSignedUrl } from "@/lib/storage";

export interface StoredReport {
  storagePath: string;
  signedUrl: string;
  expiresAt: string; // ISO timestamp ~15 min from now
}

/**
 * Upload a report buffer to Firebase Storage (private bucket) and return a
 * signed URL with 15-minute expiry.
 *
 * Storage path: reports/{userId}/{reportType}/{timestamp}.{ext}
 *
 * Security:
 *  - Bucket is private — no public access
 *  - Signed URL expires in 15 minutes (SIGNED_URL_EXPIRY_MINUTES in lib/storage/index.ts)
 *  - Path scoped to userId so one user cannot guess another user's report URL
 */
export async function uploadReportAndSign(
  buffer: Buffer,
  format: "pdf" | "csv",
  reportType: string,
  userId: string
): Promise<StoredReport> {
  const ext = format === "pdf" ? "pdf" : "csv";
  const contentType = format === "pdf" ? "application/pdf" : "text/csv;charset=utf-8";
  const timestamp = Date.now();

  // Sanitize reportType for use in path (strip non-alphanumeric/hyphen/underscore)
  const safeType = reportType.replace(/[^a-z0-9_-]/gi, "_");
  const safeUserId = userId.replace(/[^a-z0-9_-]/gi, "_");

  const storagePath = `reports/${safeUserId}/${safeType}/${timestamp}.${ext}`;

  await uploadFile(storagePath, buffer, contentType);
  const signedUrl = await getSignedUrl(storagePath);

  // Expiry is 15 minutes from now (matches SIGNED_URL_EXPIRY_MINUTES in lib/storage/index.ts)
  const expiresAt = new Date(timestamp + 15 * 60 * 1000).toISOString();

  return { storagePath, signedUrl, expiresAt };
}
