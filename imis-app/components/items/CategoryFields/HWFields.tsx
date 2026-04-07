"use client";
import type { UseFormRegister, FieldErrors } from "react-hook-form";
import { FieldRow } from "./FieldRow";

interface Props {
  register: UseFormRegister<Record<string, unknown>>;
  errors: FieldErrors<Record<string, unknown>>;
}

export default function HWFields({ register, errors }: Props) {
  return (
    <>
      <FieldRow label="Wire Type" required error={errors.wire_type?.message as string}>
        <input {...register("wire_type")} className="field-input" placeholder="e.g. THHN, USE-2, NM-B" />
      </FieldRow>
      <FieldRow label="Gauge" required error={errors.gauge?.message as string}>
        <input {...register("gauge")} className="field-input" placeholder="e.g. 14 AWG, 3.5 mm²" />
      </FieldRow>
      <FieldRow label="Length (m)" required error={errors.length_m?.message as string}>
        <input {...register("length_m")} type="number" step="0.01" min="0.01" className="field-input" placeholder="0.00" />
      </FieldRow>
      <FieldRow label="Insulation Rating" required error={errors.insulation_rating?.message as string}>
        <input {...register("insulation_rating")} className="field-input" placeholder="e.g. 600V, 1000V" />
      </FieldRow>
    </>
  );
}
