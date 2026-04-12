import "server-only";
import { cookies } from "next/headers";
import ReportCard from "@/components/reports/ReportCard";

export const metadata = { title: "Reports — IMIS" };
export const dynamic = "force-dynamic";

interface ReportTypeDef {
  report_type: string;
  label: string;
  description: string;
  param_fields: string[];
}

async function getAccessibleReports(): Promise<ReportTypeDef[]> {
  const jar = await cookies();
  const session = jar.get("session")?.value;
  if (!session) return [];

  const baseUrl = process.env.IMIS_APP_URL ?? "http://localhost:3000";

  try {
    const res = await fetch(`${baseUrl}/api/reports`, {
      headers: { Authorization: `Bearer ${session}` },
      cache: "no-store",
    });
    if (!res.ok) return [];
    const json = await res.json() as { data: ReportTypeDef[] };
    return json.data ?? [];
  } catch {
    return [];
  }
}

export default async function ReportsPage() {
  const reports = await getAccessibleReports();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-gray-900">Reports</h1>
        <p className="text-sm text-gray-500">
          Generate CSV or PDF reports. Download links expire after 15 minutes.
        </p>
      </div>

      {reports.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
          <p className="text-sm text-gray-500">No reports are available for your role.</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-1 lg:grid-cols-2">
          {reports.map((r) => (
            <ReportCard
              key={r.report_type}
              reportType={r.report_type}
              label={r.label}
              description={r.description}
              paramFields={r.param_fields}
            />
          ))}
        </div>
      )}

      <p className="text-xs text-gray-400">
        All report downloads are logged to the audit trail per RA 10173 requirements.
        PDF files are stored in a private bucket and accessible only via the timed download link.
      </p>
    </div>
  );
}
