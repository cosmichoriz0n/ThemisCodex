"use client";
import type { UseFormRegister, FieldErrors } from "react-hook-form";
import { FieldRow } from "./FieldRow";

interface Props {
  register: UseFormRegister<Record<string, unknown>>;
  errors: FieldErrors<Record<string, unknown>>;
}

export default function TRFields({ register, errors }: Props) {
  return (
    <>
      <FieldRow label="Plate No." required error={errors.plate_no?.message as string}>
        <input {...register("plate_no")} className="field-input" placeholder="e.g. ABC 1234" />
      </FieldRow>
      <FieldRow label="OR No." required error={errors.or_no?.message as string}>
        <input {...register("or_no")} className="field-input" placeholder="Official Receipt number" />
      </FieldRow>
      <FieldRow label="Chassis No." required error={errors.chassis_no?.message as string}>
        <input {...register("chassis_no")} className="field-input" placeholder="Chassis / VIN number" />
      </FieldRow>
      <FieldRow label="Engine No." required error={errors.engine_no?.message as string}>
        <input {...register("engine_no")} className="field-input" placeholder="Engine number" />
      </FieldRow>
      <FieldRow label="Insurance Expiry" error={errors.insurance_expiry?.message as string}>
        <input {...register("insurance_expiry")} type="date" className="field-input" />
      </FieldRow>
    </>
  );
}
