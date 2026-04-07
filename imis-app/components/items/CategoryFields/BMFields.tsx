"use client";
import type { UseFormRegister, FieldErrors } from "react-hook-form";
import { FieldRow } from "./FieldRow";

interface Props {
  register: UseFormRegister<Record<string, unknown>>;
  errors: FieldErrors<Record<string, unknown>>;
}

export default function BMFields({ register, errors }: Props) {
  return (
    <>
      <FieldRow label="Material Type" required error={errors.material_type?.message as string}>
        <input {...register("material_type")} className="field-input" placeholder="e.g. Cement, Steel bar, Paint" />
      </FieldRow>
      <FieldRow label="Unit" required error={errors.unit?.message as string}>
        <input {...register("unit")} className="field-input" placeholder="e.g. bag, kg, litre, piece" />
      </FieldRow>
      <FieldRow label="Supplier" error={errors.supplier?.message as string}>
        <input {...register("supplier")} className="field-input" placeholder="Supplier name" />
      </FieldRow>
      <FieldRow label="Work Order Ref." error={errors.work_order_ref?.message as string}>
        <input {...register("work_order_ref")} className="field-input" placeholder="Work order reference number" />
      </FieldRow>
    </>
  );
}
