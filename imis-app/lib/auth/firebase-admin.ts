import "server-only";
import * as admin from "firebase-admin";

let _app: admin.app.App | null = null;

function getAdminApp(): admin.app.App {
  if (_app) return _app;
  if (admin.apps.length > 0) {
    _app = admin.apps[0]!;
    return _app;
  }

  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n");

  if (!projectId || !clientEmail || !privateKey) {
    throw new Error(
      "Firebase Admin SDK: FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, and FIREBASE_PRIVATE_KEY must be set."
    );
  }

  _app = admin.initializeApp({
    credential: admin.credential.cert({ projectId, clientEmail, privateKey }),
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  });

  return _app;
}

// Lazy getters — Firebase Admin is never initialized at module load time
export function getAdminAuth(): admin.auth.Auth {
  return admin.auth(getAdminApp());
}

export function getAdminStorage(): admin.storage.Storage {
  return admin.storage(getAdminApp());
}

// Convenience proxy objects — call getAdminAuth()/getAdminStorage() at call site
export const adminAuth: admin.auth.Auth = new Proxy({} as admin.auth.Auth, {
  get(_target, prop) {
    const auth = getAdminAuth();
    const value = (auth as unknown as Record<string, unknown>)[prop as string];
    return typeof value === "function" ? value.bind(auth) : value;
  },
});

export const adminStorage: admin.storage.Storage = new Proxy({} as admin.storage.Storage, {
  get(_target, prop) {
    const storage = getAdminStorage();
    const value = (storage as unknown as Record<string, unknown>)[prop as string];
    return typeof value === "function" ? value.bind(storage) : value;
  },
});
