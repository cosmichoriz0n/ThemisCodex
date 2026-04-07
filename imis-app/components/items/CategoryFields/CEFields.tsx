"use client";
import type { UseFormRegister, FieldErrors } from "react-hook-form";
import { FieldRow } from "./FieldRow";

interface Props {
  register: UseFormRegister<Record<string, unknown>>;
  errors: FieldErrors<Record<string, unknown>>;
}

export default function CEFields({ register, errors }: Props) {
  return (
    <>
      <FieldRow label="Serial No." required error={errors.serial_no?.message as string}>
        <input {...register("serial_no")} className="field-input" placeholder="Serial number" />
      </FieldRow>
      <FieldRow label="NTC License No." error={errors.ntc_license_no?.message as string}>
        <input {...register("ntc_license_no")} className="field-input" placeholder="NTC license number" />
      </FieldRow>
      <FieldRow label="NTC Expiry" error={errors.ntc_expiry?.message as string}>
        <input {...register("ntc_expiry")} type="date" className="field-input" />
      </FieldRow>
    </>
  );
}
