"use client";
import type { UseFormRegister, FieldErrors } from "react-hook-form";
import { FieldRow } from "./FieldRow";

interface Props {
  register: UseFormRegister<Record<string, unknown>>;
  errors: FieldErrors<Record<string, unknown>>;
}

export default function FFFields({ register, errors }: Props) {
  return (
    <>
      <FieldRow label="Room / Location" required error={errors.room_location?.message as string}>
        <input {...register("room_location")} className="field-input" placeholder="e.g. Finance Office, Board Room" />
      </FieldRow>
      <FieldRow label="Acquisition Cost (₱)" required error={errors.acquisition_cost?.message as string}>
        <input {...register("acquisition_cost")} type="number" step="0.01" min="0" className="field-input" placeholder="0.00" />
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
    </>
  );
}
