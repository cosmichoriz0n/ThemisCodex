import "server-only";
import { adminStorage } from "@/lib/auth/firebase-admin";
import { getDownloadURL } from "firebase-admin/storage";

const BUCKET = process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET!;
const SIGNED_URL_EXPIRY_MINUTES = 15;

/**
 * Upload a file buffer to Firebase Storage.
 * Returns the storage path.
 */
export async function uploadFile(
  storagePath: string,
  buffer: Buffer,
  contentType: string
): Promise<string> {
  const bucket = adminStorage.bucket(BUCKET);
  const file = bucket.file(storagePath);

  await file.save(buffer, {
    metadata: { contentType },
    resumable: false,
  });

  return storagePath;
}

/**
 * Generate a signed URL for a stored file.
 * URL expires in 15 minutes (RA 10173 principle of minimal exposure).
 */
export async function getSignedUrl(storagePath: string): Promise<string> {
  const bucket = adminStorage.bucket(BUCKET);
  const file = bucket.file(storagePath);

  const expires = Date.now() + SIGNED_URL_EXPIRY_MINUTES * 60 * 1000;

  const [url] = await file.getSignedUrl({
    action: "read",
    expires,
  });

  return url;
}

/**
 * Delete a file from Firebase Storage.
 */
export async function deleteFile(storagePath: string): Promise<void> {
  const bucket = adminStorage.bucket(BUCKET);
  await bucket.file(storagePath).delete({ ignoreNotFound: true });
}
