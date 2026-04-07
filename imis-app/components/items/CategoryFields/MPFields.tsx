"use client";
import type { UseFormRegister, FieldErrors } from "react-hook-form";
import { FieldRow } from "./FieldRow";

interface Props {
  register: UseFormRegister<Record<string, unknown>>;
  errors: FieldErrors<Record<string, unknown>>;
}

export default function MPFields({ register, errors }: Props) {
  return (
    <>
      <FieldRow label="Plate No." required error={errors.plate_no?.message as string}>
        <input {...register("plate_no")} className="field-input" placeholder="e.g. ABC 1234" />
      </FieldRow>
      <FieldRow label="OR No." required error={errors.or_no?.message as string}>
        <input {...register("or_no")} className="field-input" placeholder="Official Receipt number" />
      </FieldRow>
      <FieldRow label="Make" required error={errors.make?.message as string}>
        <input {...register("make")} className="field-input" placeholder="e.g. Toyota, Isuzu" />
      </FieldRow>
      <FieldRow label="Model" required error={errors.model?.message as string}>
        <input {...register("model")} className="field-input" placeholder="e.g. Hi-Ace, D-Max" />
      </FieldRow>
      <FieldRow label="Year" required error={errors.year?.message as string}>
        <input {...register("year")} type="number" min="1900" max={new Date().getFullYear() + 1} className="field-input" placeholder="2024" />
      </FieldRow>
      <FieldRow label="Mileage (km)" required error={errors.mileage?.message as string}>
        <input {...register("mileage")} type="number" min="0" className="field-input" placeholder="0" />
      </FieldRow>
    </>
  );
}
