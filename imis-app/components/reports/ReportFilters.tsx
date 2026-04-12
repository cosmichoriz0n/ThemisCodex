"use client";
import { useState } from "react";
import type { ReportParams } from "@/lib/reports/types";

const CATEGORY_OPTIONS = [
  { value: "", label: "All Categories" },
  { value: "LM",   label: "LM — Line Materials" },
  { value: "TE",   label: "TE — Tools & Equipment" },
  { value: "FF",   label: "FF — Furniture & Fixtures" },
  { value: "OS",   label: "OS — Office Supplies" },
  { value: "MP",   label: "MP — Motor Pool" },
  { value: "HW",   label: "HW — House Wiring Materials" },
  { value: "SE",   label: "SE — Special Equipment" },
  { value: "UPIS", label: "UPIS — Utility Plant in Service" },
  { value: "MS",   label: "MS — Medical Supplies" },
  { value: "TR",   label: "TR — Transportation Equipment" },
  { value: "CE",   label: "CE — Communication Equipment" },
  { value: "BM",   label: "BM — Building Repair Materials" },
  { value: "IT",   label: "IT — IT Equipment & Software" },
];

const MOVEMENT_OPTIONS = [
  { value: "", label: "All Types" },
  { value: "receive",  label: "Receive" },
  { value: "issue",    label: "Issue" },
  { value: "return",   label: "Return" },
  { value: "adjust",   label: "Adjust" },
  { value: "transfer", label: "Transfer" },
  { value: "dispose",  label: "Dispose" },
];

type ParamField =
  | "date_range"
  | "category_code"
  | "item_id"
  | "member_id"
  | "movement_type"
  | "location"
  | "pms_window";

interface Props {
  paramFields: ParamField[];
  onChange: (params: ReportParams) => void;
}

export default function ReportFilters({ paramFields, onChange }: Props) {
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [categoryCode, setCategoryCode] = useState("");
  const [memberId, setMemberId] = useState("");
  const [movementType, setMovementType] = useState("");
  const [location, setLocation] = useState("");
  const [pmsWindow, setPmsWindow] = useState<30 | 60 | 90>(30);

  function emit(overrides: Partial<{
    dateFrom: string; dateTo: string; categoryCode: string;
    memberId: string; movementType: string; location: string;
    pmsWindow: 30 | 60 | 90;
  }> = {}) {
    const df    = overrides.dateFrom      ?? dateFrom;
    const dt    = overrides.dateTo        ?? dateTo;
    const cat   = overrides.categoryCode  ?? categoryCode;
    const mem   = overrides.memberId      ?? memberId;
    const mov   = overrides.movementType  ?? movementType;
    const loc   = overrides.location      ?? location;
    const win   = overrides.pmsWindow     ?? pmsWindow;

    const params: ReportParams = {};
    if (df)  params.date_from      = df;
    if (dt)  params.date_to        = dt;
    if (cat) params.category_code  = cat;
    if (mem) params.member_id      = mem;
    if (mov) params.movement_type  = mov;
    if (loc) params.location       = loc;
    if (paramFields.includes("pms_window")) params.pms_window_days = win;
    onChange(params);
  }

  if (paramFields.length === 0) {
    return null;
  }

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 mt-3 p-3 bg-gray-50 rounded-lg border border-gray-200">
      {paramFields.includes("date_range") && (
        <>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">From</label>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => { setDateFrom(e.target.value); emit({ dateFrom: e.target.value }); }}
              className="w-full text-sm border border-gray-300 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">To</label>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => { setDateTo(e.target.value); emit({ dateTo: e.target.value }); }}
              className="w-full text-sm border border-gray-300 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>
        </>
      )}

      {paramFields.includes("category_code") && (
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Category</label>
          <select
            value={categoryCode}
            onChange={(e) => { setCategoryCode(e.target.value); emit({ categoryCode: e.target.value }); }}
            className="w-full text-sm border border-gray-300 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            {CATEGORY_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>
      )}

      {paramFields.includes("movement_type") && (
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Movement Type</label>
          <select
            value={movementType}
            onChange={(e) => { setMovementType(e.target.value); emit({ movementType: e.target.value }); }}
            className="w-full text-sm border border-gray-300 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            {MOVEMENT_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>
      )}

      {paramFields.includes("member_id") && (
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Member ID</label>
          <input
            type="text"
            placeholder="e.g. MIMS-0001"
            value={memberId}
            onChange={(e) => { setMemberId(e.target.value); emit({ memberId: e.target.value }); }}
            className="w-full text-sm border border-gray-300 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>
      )}

      {paramFields.includes("location") && (
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Location</label>
          <input
            type="text"
            placeholder="e.g. main_warehouse"
            value={location}
            onChange={(e) => { setLocation(e.target.value); emit({ location: e.target.value }); }}
            className="w-full text-sm border border-gray-300 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>
      )}

      {paramFields.includes("pms_window") && (
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">PMS Window</label>
          <select
            value={pmsWindow}
            onChange={(e) => {
              const val = parseInt(e.target.value, 10) as 30 | 60 | 90;
              setPmsWindow(val);
              emit({ pmsWindow: val });
            }}
            className="w-full text-sm border border-gray-300 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            <option value={30}>Due in 30 days</option>
            <option value={60}>Due in 60 days</option>
            <option value={90}>Due in 90 days</option>
          </select>
        </div>
      )}
    </div>
  );
}
