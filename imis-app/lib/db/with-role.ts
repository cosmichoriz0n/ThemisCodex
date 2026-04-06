import "server-only";
import { sql } from "drizzle-orm";
import { db } from "./index";
import type { Role } from "@/types/auth";

type AnyFn<T> = (tx: typeof db) => Promise<T>;

/**
 * Wraps a database operation in a transaction with PostgreSQL session variables
 * set for RLS enforcement. Every API handler must use this wrapper.
 *
 * Sets:
 *   app.user_id   → used by get_user_id() in RLS policies
 *   app.user_role → used by get_user_role() in RLS policies
 */
export async function withRole<T>(
  userId: string,
  role: Role,
  fn: AnyFn<T>
): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`SET LOCAL app.user_id = ${userId}`);
    await tx.execute(sql`SET LOCAL app.user_role = ${role}`);
    return fn(tx as unknown as typeof db);
  });
}
