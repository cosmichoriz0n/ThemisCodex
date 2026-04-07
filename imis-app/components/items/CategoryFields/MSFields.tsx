"use client";
import type { UseFormRegister, FieldErrors } from "react-hook-form";
import { FieldRow } from "./FieldRow";

interface Props {
  register: UseFormRegister<Record<string, unknown>>;
  errors: FieldErrors<Record<string, unknown>>;
}

export default function MSFields({ register, errors }: Props) {
  return (
    <>
      <FieldRow label="Lot No." required error={errors.lot_no?.message as string}>
        <input {...register("lot_no")} className="field-input" placeholder="Lot number" />
      </FieldRow>
      <FieldRow label="Expiry Date" required error={errors.expiry_date?.message as string}>
        <input {...register("expiry_date")} type="date" className="field-input" />
      </FieldRow>
      <FieldRow label="Batch No." required error={errors.batch_no?.message as string}>
        <input {...register("batch_no")} className="field-input" placeholder="Batch number" />
      </FieldRow>
      <FieldRow label="Storage Temperature" error={errors.storage_temp?.message as string}>
        <input {...register("storage_temp")} className="field-input" placeholder="e.g. 2-8°C, Room temperature" />
      </FieldRow>
      <FieldRow label="DOH Classification" error={errors.doh_class?.message as string}>
        <input {...register("doh_class")} className="field-input" placeholder="DOH drug classification" />
      </FieldRow>
    </>
  );
}
