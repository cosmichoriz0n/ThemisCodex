"use client";
import type { UseFormRegister, FieldErrors } from "react-hook-form";
import { FieldRow } from "./FieldRow";

interface Props {
  register: UseFormRegister<Record<string, unknown>>;
  errors: FieldErrors<Record<string, unknown>>;
}

export default function TEFields({ register, errors }: Props) {
  return (
    <>
      <FieldRow label="Tool Type" required error={errors.tool_type?.message as string}>
        <input {...register("tool_type")} className="field-input" placeholder="e.g. Multimeter, Chain saw" />
      </FieldRow>
      <FieldRow label="Condition" required error={errors.condition?.message as string}>
        <select {...register("condition")} className="field-input">
          <option value="">Select condition</option>
          <option value="new">New</option>
          <option value="good">Good</option>
          <option value="fair">Fair</option>
          <option value="poor">Poor</option>
        </select>
      </FieldRow>
      <FieldRow label="Assigned To" error={errors.assigned_to?.message as string}>
        <input {...register("assigned_to")} className="field-input" placeholder="Employee name or ID" />
      </FieldRow>
      <FieldRow label="Calibration Due" error={errors.calibration_due?.message as string}>
        <input {...register("calibration_due")} type="date" className="field-input" />
      </FieldRow>
    </>
  );
}
