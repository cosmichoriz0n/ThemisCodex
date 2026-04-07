"use client";
import type { UseFormRegister, FieldErrors } from "react-hook-form";
import { FieldRow } from "./FieldRow";

interface Props {
  register: UseFormRegister<Record<string, unknown>>;
  errors: FieldErrors<Record<string, unknown>>;
}

export default function SEFields({ register, errors }: Props) {
  return (
    <>
      <FieldRow label="Serial No." required error={errors.serial_no?.message as string}>
        <input {...register("serial_no")} className="field-input" placeholder="Serial number" />
      </FieldRow>
      <FieldRow label="Calibration Certificate No." error={errors.calibration_cert?.message as string}>
        <input {...register("calibration_cert")} className="field-input" placeholder="Certificate number" />
      </FieldRow>
      <FieldRow label="Calibration Expiry" error={errors.calibration_expiry?.message as string}>
        <input {...register("calibration_expiry")} type="date" className="field-input" />
      </FieldRow>
    </>
  );
}
