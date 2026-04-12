import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { adminAuth } from "@/lib/auth/firebase-admin";
import ImportFlow from "@/components/import/ImportFlow";

export const metadata = { title: "Bulk Import — IMIS" };
export const dynamic = "force-dynamic";

export default async function ImportPage() {
  const cookieStore = await cookies();
  const session = cookieStore.get("session")?.value;
  if (!session) redirect("/login");

  try {
    const decoded = await adminAuth.verifyIdToken(session);
    const role = decoded.role as string;
    if (role !== "inventory_manager" && role !== "system_admin") {
      redirect("/dashboard");
    }
  } catch {
    redirect("/login");
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-xl font-semibold text-gray-900">Bulk Import</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          Import multiple items from a CSV file. All rows are validated before any data is written.
          Invalid rows are skipped and reported — they do not cause the entire import to fail.
        </p>
      </div>
      <ImportFlow />
    </div>
  );
}
