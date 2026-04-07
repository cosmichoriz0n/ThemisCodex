"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { getSchemaForCategory } from "@/lib/validation/items";
import { getCategoryFields } from "@/components/items/CategoryFields";

const CATEGORIES = [
  { code: "LM", name: "Line Materials", icon: "⚡" },
  { code: "TE", name: "Tools & Equipment", icon: "🔧" },
  { code: "FF", name: "Furniture & Fixtures", icon: "🪑" },
  { code: "OS", name: "Office Supplies", icon: "📎" },
  { code: "MP", name: "Motor Pool", icon: "🚛" },
  { code: "HW", name: "House Wiring", icon: "🔌" },
  { code: "SE", name: "Special Equipment", icon: "📡" },
  { code: "UPIS", name: "UPIS", icon: "🏗️" },
  { code: "MS", name: "Medical Supplies", icon: "🏥" },
  { code: "TR", name: "Transportation", icon: "🚗" },
  { code: "CE", name: "Communication Equip.", icon: "📻" },
  { code: "BM", name: "Building Materials", icon: "🧱" },
  { code: "IT", name: "IT Equipment", icon: "💻" },
];

export default function NewItemPage() {
  const router = useRouter();
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const schema = selectedCategory ? getSchemaForCategory(selectedCategory) : null;

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

  function handleCategorySelect(code: string) {
    setSelectedCategory(code);
    reset();
    setServerError(null);
  }

  async function onSubmit(data: Record<string, unknown>) {
    if (!selectedCategory) return;
    setSubmitting(true);
    setServerError(null);

    try {
      const res = await fetch("/api/items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...data, category_code: selectedCategory }),
      });

      if (!res.ok) {
        const body = await res.json();
        setServerError(body?.error ?? "Failed to create item.");
        return;
      }

      const { data: created } = await res.json();
      router.push(`/items/${created.item_id}`);
    } catch {
      setServerError("Network error. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  const CategoryFields = selectedCategory ? getCategoryFields(selectedCategory) : null;

  // Step 1: category selection
  if (!selectedCategory) {
    return (
      <div className="space-y-6 max-w-4xl">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">New Item</h1>
          <p className="text-sm text-gray-500 mt-1">Select the asset category to continue.</p>
        </div>
        <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
          {CATEGORIES.map((cat) => (
            <button
              key={cat.code}
              type="button"
              onClick={() => handleCategorySelect(cat.code)}
              className="flex flex-col items-center gap-2 p-4 rounded-xl border-2 border-gray-200 bg-white hover:border-blue-400 hover:bg-blue-50 transition-all text-center"
            >
              <span className="text-2xl">{cat.icon}</span>
              <span className="text-xs font-semibold text-indigo-700">{cat.code}</span>
              <span className="text-xs text-gray-600 leading-tight">{cat.name}</span>
            </button>
          ))}
        </div>
      </div>
    );
  }

  const catMeta = CATEGORIES.find((c) => c.code === selectedCategory)!;

  // Step 2: item form
  return (
    <div className="space-y-6 max-w-2xl">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => setSelectedCategory(null)}
          className="text-sm text-blue-600 hover:underline"
        >
          ← Change category
        </button>
        <span className="text-gray-300">|</span>
        <span className="inline-flex items-center gap-1 px-2 py-1 bg-indigo-50 text-indigo-700 rounded text-sm font-medium">
          {catMeta.icon} {catMeta.code} — {catMeta.name}
        </span>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 bg-white p-6 rounded-xl border border-gray-200">
        <h2 className="text-base font-semibold text-gray-800">Item Details</h2>

        {/* Base fields */}
        <div className="grid grid-cols-1 gap-4">
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-gray-700">
              Item Name <span className="text-red-500">*</span>
            </label>
            <input
              {...register("item_name")}
              className="field-input"
              placeholder="Descriptive item name"
            />
            {errors.item_name && (
              <p className="text-xs text-red-600">{errors.item_name.message as string}</p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium text-gray-700">SKU</label>
              <input {...register("sku")} className="field-input" placeholder="Optional SKU" />
              {errors.sku && <p className="text-xs text-red-600">{errors.sku.message as string}</p>}
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium text-gray-700">Location</label>
              <input {...register("location")} className="field-input" placeholder="Storage location" />
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-gray-700">Description</label>
            <textarea
              {...register("description")}
              className="field-input"
              rows={2}
              placeholder="Optional description"
            />
          </div>
        </div>

        {/* Category-specific fields */}
        {CategoryFields && (
          <>
            <hr className="border-gray-100" />
            <h2 className="text-base font-semibold text-gray-800">{catMeta.name} Details</h2>
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
            {submitting ? "Creating…" : "Create Item"}
          </button>
          <button
            type="button"
            onClick={() => router.push("/items")}
            className="px-5 py-2 bg-white text-gray-700 text-sm font-medium rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
