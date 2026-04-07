"use client";
import type { UseFormRegister, FieldErrors } from "react-hook-form";
import { FieldRow } from "./FieldRow";

interface Props {
  register: UseFormRegister<Record<string, unknown>>;
  errors: FieldErrors<Record<string, unknown>>;
}

export default function OSFields({ register, errors }: Props) {
  return (
    <>
      <FieldRow label="Brand" required error={errors.brand?.message as string}>
        <input {...register("brand")} className="field-input" placeholder="Brand name" />
      </FieldRow>
      <FieldRow label="Pack Size" required error={errors.pack_size?.message as string}>
        <input {...register("pack_size")} className="field-input" placeholder="e.g. 500 sheets, 12 pcs" />
      </FieldRow>
      <FieldRow label="Unit" required error={errors.unit?.message as string}>
        <input {...register("unit")} className="field-input" placeholder="e.g. ream, box, piece" />
      </FieldRow>
      <FieldRow label="Reorder Level" required error={errors.reorder_level?.message as string}>
        <input {...register("reorder_level")} type="number" min="0" className="field-input" placeholder="0" />
      </FieldRow>
    </>
  );
}
