"use client";
import type { UseFormRegister, FieldErrors } from "react-hook-form";
import { FieldRow } from "./FieldRow";

interface Props {
  register: UseFormRegister<Record<string, unknown>>;
  errors: FieldErrors<Record<string, unknown>>;
}

export default function UPISFields({ register, errors }: Props) {
  return (
    <>
      <FieldRow label="NEA Asset Code" required error={errors.nea_asset_code?.message as string}>
        <input {...register("nea_asset_code")} className="field-input" placeholder="e.g. 101, 131, 154" />
      </FieldRow>
      <FieldRow label="Feeder" required error={errors.feeder?.message as string}>
        <input {...register("feeder")} className="field-input" placeholder="e.g. Feeder 1, F1-Line A" />
      </FieldRow>
      <FieldRow label="Depreciation Rate (%)" required error={errors.depreciation_rate?.message as string}>
        <input
          {...register("depreciation_rate")}
          type="number"
          step="0.01"
          min="0"
          max="100"
          className="field-input"
          placeholder="e.g. 5.00"
        />
      </FieldRow>
      <FieldRow label="Installation Date" required error={errors.installation_date?.message as string}>
        <input {...register("installation_date")} type="date" className="field-input" />
      </FieldRow>
    </>
  );
}
