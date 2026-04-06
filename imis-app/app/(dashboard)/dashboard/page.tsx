export const metadata = { title: "Dashboard — IMIS" };

const CATEGORY_CARDS = [
  { code: "LM", name: "Line Materials", account: "154" },
  { code: "TE", name: "Tools & Equipment", account: "163" },
  { code: "FF", name: "Furniture & Fixtures", account: "391" },
  { code: "OS", name: "Office Supplies", account: "—" },
  { code: "MP", name: "Motor Pool", account: "392" },
  { code: "HW", name: "House Wiring", account: "154" },
  { code: "SE", name: "Special Equipment", account: "163" },
  { code: "UPIS", name: "Utility Plant in Service", account: "101-199" },
  { code: "MS", name: "Medical Supplies", account: "—" },
  { code: "TR", name: "Transportation", account: "392" },
  { code: "CE", name: "Communication Equip", account: "163" },
  { code: "BM", name: "Building Repair Mats", account: "—" },
  { code: "IT", name: "IT Equipment", account: "391" },
];

export default function DashboardPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-gray-900">Dashboard</h1>
        <p className="text-sm text-gray-500">System overview and quick stats</p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {[
          { label: "Total Items", value: "—" },
          { label: "Open Alerts", value: "—" },
          { label: "Active Members", value: "—" },
          { label: "Integration Health", value: "—" },
        ].map((card) => (
          <div key={card.label} className="bg-white rounded-lg border border-gray-200 p-4">
            <p className="text-xs text-gray-500">{card.label}</p>
            <p className="text-2xl font-bold text-gray-900 mt-1">{card.value}</p>
          </div>
        ))}
      </div>

      {/* Category inventory cards — wired in Sprint 3 */}
      <div>
        <h2 className="text-sm font-medium text-gray-700 mb-3">Stock by Asset Category</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {CATEGORY_CARDS.map((cat) => (
            <div
              key={cat.code}
              className="bg-white rounded-lg border border-gray-200 p-3 hover:border-blue-400 transition-colors"
            >
              <div className="flex items-start justify-between">
                <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-50 text-blue-700">
                  {cat.code}
                </span>
                <span className="text-xs text-gray-400">Acct {cat.account}</span>
              </div>
              <p className="text-sm font-medium text-gray-800 mt-2 leading-tight">{cat.name}</p>
              <p className="text-lg font-bold text-gray-900 mt-1">—</p>
              <p className="text-xs text-gray-400">items on hand</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
