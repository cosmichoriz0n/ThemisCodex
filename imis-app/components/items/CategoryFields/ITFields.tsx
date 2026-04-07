"use client";
import type { UseFormRegister, FieldErrors } from "react-hook-form";
import { FieldRow } from "./FieldRow";

interface Props {
  register: UseFormRegister<Record<string, unknown>>;
  errors: FieldErrors<Record<string, unknown>>;
}

export default function ITFields({ register, errors }: Props) {
  return (
    <>
      <FieldRow label="Serial No." required error={errors.serial_no?.message as string}>
        <input {...register("serial_no")} className="field-input" placeholder="Serial number" />
      </FieldRow>
      <FieldRow label="MAC Address" error={errors.mac_address?.message as string}>
        <input {...register("mac_address")} className="field-input" placeholder="e.g. AA:BB:CC:DD:EE:FF" />
      </FieldRow>
      <FieldRow label="OS / Version" error={errors.os_version?.message as string}>
        <input {...register("os_version")} className="field-input" placeholder="e.g. Windows 11, Ubuntu 22.04" />
      </FieldRow>
      <FieldRow label="License Key" error={errors.license_key?.message as string}>
        <input {...register("license_key")} className="field-input" placeholder="Software license key" />
      </FieldRow>
      <FieldRow label="License Expiry" error={errors.license_expiry?.message as string}>
        <input {...register("license_expiry")} type="date" className="field-input" />
      </FieldRow>
      <FieldRow label="Assigned User" error={errors.assigned_user?.message as string}>
        <input {...register("assigned_user")} className="field-input" placeholder="Employee name or ID" />
      </FieldRow>
    </>
  );
}
