"use client";
import type { UseFormRegister, FieldErrors } from "react-hook-form";
import { FieldRow } from "./FieldRow";

interface Props {
  register: UseFormRegister<Record<string, unknown>>;
  errors: FieldErrors<Record<string, unknown>>;
}

export default function LMFields({ register, errors }: Props) {
  return (
    <>
      <FieldRow label="Conductor Type" required error={errors.conductor_type?.message as string}>
        <input {...register("conductor_type")} className="field-input" placeholder="e.g. ACSR, AAC, AAAC" />
      </FieldRow>
      <FieldRow label="Gauge" required error={errors.gauge?.message as string}>
        <input {...register("gauge")} className="field-input" placeholder="e.g. 4/0 AWG" />
      </FieldRow>
      <FieldRow label="Length (m)" required error={errors.length_m?.message as string}>
        <input {...register("length_m")} type="number" step="0.01" className="field-input" placeholder="0.00" />
      </FieldRow>
      <FieldRow label="Voltage Rating" required error={errors.voltage_rating?.message as string}>
        <input {...register("voltage_rating")} className="field-input" placeholder="e.g. 13.2 kV" />
      </FieldRow>
      <FieldRow label="Lot No." error={errors.lot_no?.message as string}>
        <input {...register("lot_no")} className="field-input" placeholder="Lot number" />
      </FieldRow>
    </>
  );
}
