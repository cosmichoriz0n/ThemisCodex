"use client";
import type { ReactNode } from "react";

interface FieldRowProps {
  label: string;
  required?: boolean;
  error?: string;
  children: ReactNode;
}

export function FieldRow({ label, required, error, children }: FieldRowProps) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-sm font-medium text-gray-700">
        {label}
        {required && <span className="text-red-500 ml-1">*</span>}
      </label>
      {children}
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
