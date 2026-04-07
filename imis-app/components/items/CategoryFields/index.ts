import type { ComponentType } from "react";
import type { UseFormRegister, FieldErrors } from "react-hook-form";

import LMFields from "./LMFields";
import TEFields from "./TEFields";
import FFFields from "./FFFields";
import OSFields from "./OSFields";
import MPFields from "./MPFields";
import HWFields from "./HWFields";
import SEFields from "./SEFields";
import UPISFields from "./UPISFields";
import MSFields from "./MSFields";
import TRFields from "./TRFields";
import CEFields from "./CEFields";
import BMFields from "./BMFields";
import ITFields from "./ITFields";

export type CategoryFieldsProps = {
  register: UseFormRegister<Record<string, unknown>>;
  errors: FieldErrors<Record<string, unknown>>;
};

const FIELDS_MAP: Record<string, ComponentType<CategoryFieldsProps>> = {
  LM: LMFields,
  TE: TEFields,
  FF: FFFields,
  OS: OSFields,
  MP: MPFields,
  HW: HWFields,
  SE: SEFields,
  UPIS: UPISFields,
  MS: MSFields,
  TR: TRFields,
  CE: CEFields,
  BM: BMFields,
  IT: ITFields,
};

/**
 * Returns the category-specific fields component for the given category code.
 * Returns null if the category code is unknown (no extra fields).
 */
export function getCategoryFields(
  code: string
): ComponentType<CategoryFieldsProps> | null {
  return FIELDS_MAP[code] ?? null;
}

export {
  LMFields, TEFields, FFFields, OSFields, MPFields, HWFields,
  SEFields, UPISFields, MSFields, TRFields, CEFields, BMFields, ITFields,
};
