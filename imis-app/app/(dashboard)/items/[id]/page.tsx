import "server-only";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { adminAuth } from "@/lib/auth/firebase-admin";
import { withRole } from "@/lib/db/with-role";
import { items } from "@/lib/db/schema/items";
import { itemAttributes } from "@/lib/db/schema/item-attributes";
import { lifecycleEvents } from "@/lib/db/schema/lifecycle-events";
import { eq } from "drizzle-orm";
import type { Role } from "@/types/auth";
import LifecycleStatusBadge from "@/components/items/LifecycleStatusBadge";

export const dynamic = "force-dynamic";

const CATEGORY_NAMES: Record<string, string> = {
  LM: "Line Materials", TE: "Tools & Equipment", FF: "Furniture & Fixtures",
  OS: "Office Supplies", MP: "Motor Pool", HW: "House Wiring Materials",
  SE: "Special Equipment", UPIS: "Utility Plant in Service", MS: "Medical Supplies",
  TR: "Transportation Equipment", CE: "Communication Equipment",
  BM: "Building Repair Materials", IT: "IT Equipment & Software",
};

const ATTR_LABELS: Record<string, string> = {
  conductor_type: "Conductor Type", gauge: "Gauge", length_m: "Length (m)",
  voltage_rating: "Voltage Rating", lot_no: "Lot No.", tool_type: "Tool Type",
  condition: "Condition", assigned_to: "Assigned To", calibration_due: "Calibration Due",
  room_location: "Room / Location", acquisition_cost: "Acquisition Cost",
  brand: "Brand", pack_size: "Pack Size", unit: "Unit", reorder_level: "Reorder Level",
  plate_no: "Plate No.", or_no: "OR No.", make: "Make", model: "Model",
  year: "Year", mileage: "Mileage (km)", wire_type: "Wire Type",
  insulation_rating: "Insulation Rating", serial_no: "Serial No.",
  calibration_cert: "Calibration Cert.", calibration_expiry: "Calibration Expiry",
  nea_asset_code: "NEA Asset Code", feeder: "Feeder",
  depreciation_rate: "Depreciation Rate (%)", installation_date: "Installation Date",
  expiry_date: "Expiry Date", batch_no: "Batch No.", storage_temp: "Storage Temp.",
  doh_class: "DOH Classification", chassis_no: "Chassis No.", engine_no: "Engine No.",
  insurance_expiry: "Insurance Expiry", ntc_license_no: "NTC License No.",
  ntc_expiry: "NTC Expiry", material_type: "Material Type", supplier: "Supplier",
  work_order_ref: "Work Order Ref.", mac_address: "MAC Address",
  os_version: "OS / Version", license_key: "License Key",
  license_expiry: "License Expiry", assigned_user: "Assigned User",
};

export default async function ItemDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const cookieStore = await cookies();
  const session = cookieStore.get("session")?.value;
  if (!session) redirect("/login");

  let role: Role;
  let uid: string;
  try {
    const decoded = await adminAuth.verifyIdToken(session);
    role = decoded.role as Role;
    uid = decoded.uid;
  } catch {
    redirect("/login");
  }

  const data = await withRole(uid, role, async (tx) => {
    const [item] = await tx.select().from(items).where(eq(items.itemId, id)).limit(1);
    if (!item) return null;

    const attrs = await tx.select().from(itemAttributes).where(eq(itemAttributes.itemId, id));
    const events = await tx
      .select()
      .from(lifecycleEvents)
      .where(eq(lifecycleEvents.itemId, id))
      .orderBy(lifecycleEvents.eventAt);

    return { item, attributes: attrs, lifecycleHistory: events };
  });

  if (!data) notFound();

  const { item, attributes, lifecycleHistory } = data;
  const canEdit = role === "inventory_manager" || role === "system_admin";
  const catName = CATEGORY_NAMES[item.categoryCode] ?? item.categoryCode;

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Breadcrumb */}
      <nav className="text-sm text-gray-500">
        <Link href="/items" className="hover:text-blue-600">Item Catalog</Link>
        <span className="mx-2">›</span>
        <span className="text-gray-900">{item.assetTag ?? item.itemId}</span>
      </nav>

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="font-mono text-sm text-blue-700 bg-blue-50 px-2 py-0.5 rounded">
              {item.assetTag}
            </span>
            <span className="px-2 py-0.5 bg-indigo-50 text-indigo-700 rounded text-xs font-medium">
              {item.categoryCode}
            </span>
            <LifecycleStatusBadge status={item.lifecycleStatus} />
          </div>
          <h1 className="text-2xl font-bold text-gray-900">{item.itemName}</h1>
          <p className="text-sm text-gray-500">{catName}</p>
        </div>
        <div className="flex gap-2">
          <Link
            href={`/movements/${id}`}
            className="px-4 py-2 bg-white border border-gray-200 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors whitespace-nowrap"
          >
            Movement History
          </Link>
          {canEdit && (
            <Link
              href={`/items/${id}/edit`}
              className="px-4 py-2 bg-white border border-gray-200 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors whitespace-nowrap"
            >
              Edit Item
            </Link>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left column: barcodes + label print */}
        <div className="space-y-4">
          <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-4">
            <h2 className="text-sm font-semibold text-gray-700">Barcodes</h2>

            <div>
              <p className="text-xs text-gray-400 mb-1">Code128</p>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`/api/items/${id}/barcode?type=code128`}
                alt={`Code128 barcode for ${item.assetTag}`}
                className="w-full max-w-xs"
              />
            </div>

            <div>
              <p className="text-xs text-gray-400 mb-1">QR Code</p>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`/api/items/${id}/barcode?type=qr`}
                alt={`QR code for ${item.assetTag}`}
                className="w-24 h-24"
              />
            </div>

            <div className="flex flex-col gap-2 pt-2 border-t border-gray-100">
              <p className="text-xs font-medium text-gray-600">Print Label</p>
              <a
                href={`/api/items/${id}/label?format=a4`}
                target="_blank"
                rel="noreferrer"
                className="flex items-center justify-center gap-2 px-3 py-2 border border-gray-200 rounded-lg text-xs font-medium text-gray-700 hover:bg-gray-50 transition-colors"
              >
                A4 Sheet (20 labels)
              </a>
              <a
                href={`/api/items/${id}/label?format=thermal`}
                target="_blank"
                rel="noreferrer"
                className="flex items-center justify-center gap-2 px-3 py-2 border border-gray-200 rounded-lg text-xs font-medium text-gray-700 hover:bg-gray-50 transition-colors"
              >
                58mm Thermal Label
              </a>
            </div>
          </div>
        </div>

        {/* Right column: details + attributes + timeline */}
        <div className="lg:col-span-2 space-y-4">
          {/* Core details */}
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <h2 className="text-sm font-semibold text-gray-700 mb-3">Item Details</h2>
            <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
              {item.sku && (
                <>
                  <dt className="text-gray-500">SKU</dt>
                  <dd className="font-mono text-gray-900">{item.sku}</dd>
                </>
              )}
              {item.location && (
                <>
                  <dt className="text-gray-500">Location</dt>
                  <dd className="text-gray-900">{item.location}</dd>
                </>
              )}
              <dt className="text-gray-500">Created</dt>
              <dd className="text-gray-900">
                {new Date(item.createdAt).toLocaleDateString("en-PH", {
                  year: "numeric", month: "short", day: "numeric",
                })}
              </dd>
              {item.description && (
                <>
                  <dt className="text-gray-500 col-span-2 border-t border-gray-50 pt-2">Description</dt>
                  <dd className="col-span-2 text-gray-700">{item.description}</dd>
                </>
              )}
            </dl>
          </div>

          {/* Category-specific attributes */}
          {attributes.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <h2 className="text-sm font-semibold text-gray-700 mb-3">{catName} Attributes</h2>
              <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
                {attributes.map((attr) => (
                  <div key={attr.id} className="contents">
                    <dt className="text-gray-500">{ATTR_LABELS[attr.attributeName] ?? attr.attributeName}</dt>
                    <dd className="text-gray-900 font-mono">{attr.attributeValue ?? "—"}</dd>
                  </div>
                ))}
              </dl>
            </div>
          )}

          {/* Lifecycle timeline */}
          {lifecycleHistory.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <h2 className="text-sm font-semibold text-gray-700 mb-3">Lifecycle History</h2>
              <ol className="relative border-l border-gray-200 ml-2 space-y-4">
                {lifecycleHistory.map((event) => (
                  <li key={event.eventId} className="ml-4">
                    <div className="absolute -left-1.5 mt-1 w-3 h-3 rounded-full border-2 border-white bg-blue-500" />
                    <div className="text-xs text-gray-400">
                      {new Date(event.eventAt).toLocaleString("en-PH")}
                    </div>
                    <div className="text-sm font-medium text-gray-800 mt-0.5">
                      {event.fromState ? `${event.fromState} → ` : ""}
                      <span className="text-blue-700">{event.toState}</span>
                    </div>
                    {event.remarks && (
                      <p className="text-xs text-gray-500 mt-0.5">{event.remarks}</p>
                    )}
                  </li>
                ))}
              </ol>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
