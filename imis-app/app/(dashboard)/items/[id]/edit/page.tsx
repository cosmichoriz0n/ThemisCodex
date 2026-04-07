"use client";

import { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { getSchemaForCategory } from "@/lib/validation/items";
import { getCategoryFields } from "@/components/items/CategoryFields";

const CATEGORY_NAMES: Record<string, string> = {
  LM: "Line Materials", TE: "Tools & Equipment", FF: "Furniture & Fixtures",
  OS: "Office Supplies", MP: "Motor Pool", HW: "House Wiring Materials",
  SE: "Special Equipment", UPIS: "Utility Plant in Service", MS: "Medical Supplies",
  TR: "Transportation Equipment", CE: "Communication Equipment",
  BM: "Building Repair Materials", IT: "IT Equipment & Software",
};

const ATTR_TO_FIELD: Record<string, string> = {
  conductor_type: "conductor_type", gauge: "gauge", length_m: "length_m",
  voltage_rating: "voltage_rating", lot_no: "lot_no", tool_type: "tool_type",
  condition: "condition", assigned_to: "assigned_to", calibration_due: "calibration_due",
  room_location: "room_location", acquisition_cost: "acquisition_cost",
  brand: "brand", pack_size: "pack_size", unit: "unit", reorder_level: "reorder_level",
  plate_no: "plate_no", or_no: "or_no", make: "make", model: "model",
  year: "year", mileage: "mileage", wire_type: "wire_type",
  insulation_rating: "insulation_rating", serial_no: "serial_no",
  calibration_cert: "calibration_cert", calibration_expiry: "calibration_expiry",
  nea_asset_code: "nea_asset_code", feeder: "feeder",
  depreciation_rate: "depreciation_rate", installation_date: "installation_date",
  expiry_date: "expiry_date", batch_no: "batch_no", storage_temp: "storage_temp",
  doh_class: "doh_class", chassis_no: "chassis_no", engine_no: "engine_no",
  insurance_expiry: "insurance_expiry", ntc_license_no: "ntc_license_no",
  ntc_expiry: "ntc_expiry", material_type: "material_type", supplier: "supplier",
  work_order_ref: "work_order_ref", mac_address: "mac_address",
  os_version: "os_version", license_key: "license_key",
  license_expiry: "license_expiry", assigned_user: "assigned_user",
};

interface ItemDetail {
  item: {
    itemId: string;
    categoryCode: string;
    itemName: string;
    sku: string | null;
    description: string | null;
    location: string | null;
    lifecycleStatus: string;
  };
  attributes: Array<{ attributeName: string; attributeValue: string | null }>;
}

export default function EditItemPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const id = params.id;

  const [loading, setLoading] = useState(true);
  const [itemDetail, setItemDetail] = useState<ItemDetail | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const schema = itemDetail ? getSchemaForCategory(itemDetail.item.categoryCode) : null;

  const {
    register,
    handleSubmit,
    formState: { errors },
    reset,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } = useForm<Record<string, unknown>>({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: schema ? zodResolver(schema as any) : undefined,
  });

  useEffect(() => {
    fetch(`/api/items/${id}`)
      .then((r) => {
        if (r.status === 403) {
          router.push(`/items/${id}`);
          return null;
        }
        return r.json();
      })
      .then((body) => {
        if (!body) return;
        const detail: ItemDetail = body.data;
        setItemDetail(detail);

        // Populate form defaults
        const defaults: Record<string, unknown> = {
          item_name: detail.item.itemName,
          category_code: detail.item.categoryCode,
          sku: detail.item.sku ?? "",
          description: detail.item.description ?? "",
          location: detail.item.location ?? "",
        };
        for (const attr of detail.attributes) {
          const fieldName = ATTR_TO_FIELD[attr.attributeName] ?? attr.attributeName;
          defaults[fieldName] = attr.attributeValue ?? "";
        }
        reset(defaults);
      })
      .catch(() => setServerError("Failed to load item."))
      .finally(() => setLoading(false));
  }, [id, router, reset]);

  async function onSubmit(data: Record<string, unknown>) {
    if (!itemDetail) return;
    setSubmitting(true);
    setServerError(null);

    try {
      const res = await fetch(`/api/items/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...data, category_code: itemDetail.item.categoryCode }),
      });

      if (res.status === 403) {
        setServerError("You do not have permission to edit this item.");
        return;
      }
      if (!res.ok) {
        const body = await res.json();
        setServerError(body?.error ?? "Failed to save changes.");
        return;
      }

      router.push(`/items/${id}`);
    } catch {
      setServerError("Network error. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return <div className="py-10 text-center text-gray-400 text-sm">Loading…</div>;
  }

  if (!itemDetail) {
    return <div className="py-10 text-center text-red-500 text-sm">Item not found.</div>;
  }

  const { item } = itemDetail;
  const catName = CATEGORY_NAMES[item.categoryCode] ?? item.categoryCode;
  const CategoryFields = getCategoryFields(item.categoryCode);

  return (
    <div className="space-y-6 max-w-2xl">
      {/* Breadcrumb */}
      <nav className="text-sm text-gray-500">
        <a href="/items" className="hover:text-blue-600">Item Catalog</a>
        <span className="mx-2">›</span>
        <a href={`/items/${id}`} className="hover:text-blue-600">{item.itemName}</a>
        <span className="mx-2">›</span>
        <span className="text-gray-900">Edit</span>
      </nav>

      <div className="flex items-center gap-2">
        <span className="px-2 py-0.5 bg-indigo-50 text-indigo-700 rounded text-xs font-medium">
          {item.categoryCode}
        </span>
        <h1 className="text-xl font-semibold text-gray-900">Edit — {item.itemName}</h1>
      </div>

      <form
        onSubmit={handleSubmit(onSubmit)}
        className="space-y-4 bg-white p-6 rounded-xl border border-gray-200"
      >
        <h2 className="text-base font-semibold text-gray-800">Item Details</h2>

        <div className="grid grid-cols-1 gap-4">
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-gray-700">
              Item Name <span className="text-red-500">*</span>
            </label>
            <input {...register("item_name")} className="field-input" />
            {errors.item_name && (
              <p className="text-xs text-red-600">{errors.item_name.message as string}</p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium text-gray-700">SKU</label>
              <input {...register("sku")} className="field-input" />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium text-gray-700">Location</label>
              <input {...register("location")} className="field-input" />
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-gray-700">Description</label>
            <textarea {...register("description")} className="field-input" rows={2} />
          </div>
        </div>

        {CategoryFields && (
          <>
            <hr className="border-gray-100" />
            <h2 className="text-base font-semibold text-gray-800">{catName} Details</h2>
            <div className="grid grid-cols-1 gap-4">
              <CategoryFields register={register} errors={errors} />
            </div>
          </>
        )}

        {serverError && (
          <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded">{serverError}</p>
        )}

        <div className="flex gap-3 pt-2">
          <button
            type="submit"
            disabled={submitting}
            className="px-5 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {submitting ? "Saving…" : "Save Changes"}
          </button>
          <button
            type="button"
            onClick={() => router.push(`/items/${id}`)}
            className="px-5 py-2 bg-white text-gray-700 text-sm font-medium rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
