import { z } from "zod";
import {
  baseItemSchema,
  LMSchema,
  TESchema,
  FFSchema,
  OSSchema,
  MPSchema,
  HWSchema,
  SESchema,
  UPISSchema,
  MSSchema,
  TRSchema,
  CESchema,
  BMSchema,
  ITSchema,
} from "./schemas";

// Base fields that go into the items table
const BASE_FIELDS = new Set([
  "item_name",
  "category_code",
  "sku",
  "description",
  "location",
]);

// Category-specific fields that go into item_attributes (EAV)
const CATEGORY_ATTRIBUTE_FIELDS: Record<string, string[]> = {
  LM: ["conductor_type", "gauge", "length_m", "voltage_rating", "lot_no"],
  TE: ["tool_type", "condition", "assigned_to", "calibration_due"],
  FF: ["room_location", "acquisition_cost", "condition"],
  OS: ["brand", "pack_size", "unit", "reorder_level"],
  MP: ["plate_no", "or_no", "make", "model", "year", "mileage"],
  HW: ["wire_type", "gauge", "length_m", "insulation_rating"],
  SE: ["serial_no", "calibration_cert", "calibration_expiry"],
  UPIS: ["nea_asset_code", "feeder", "depreciation_rate", "installation_date"],
  MS: ["lot_no", "expiry_date", "batch_no", "storage_temp", "doh_class"],
  TR: ["plate_no", "or_no", "chassis_no", "engine_no", "insurance_expiry"],
  CE: ["serial_no", "ntc_license_no", "ntc_expiry"],
  BM: ["material_type", "unit", "supplier", "work_order_ref"],
  IT: ["serial_no", "mac_address", "os_version", "license_key", "license_expiry", "assigned_user"],
};

const SCHEMA_MAP: Record<string, z.ZodTypeAny> = {
  LM: LMSchema,
  TE: TESchema,
  FF: FFSchema,
  OS: OSSchema,
  MP: MPSchema,
  HW: HWSchema,
  SE: SESchema,
  UPIS: UPISSchema,
  MS: MSSchema,
  TR: TRSchema,
  CE: CESchema,
  BM: BMSchema,
  IT: ITSchema,
};

export function getSchemaForCategory(code: string): z.ZodTypeAny {
  return SCHEMA_MAP[code] ?? baseItemSchema;
}

export interface ParsedItem {
  item: {
    item_name: string;
    category_code: string;
    sku?: string;
    description?: string;
    location?: string;
  };
  attributes: Array<{ name: string; value: string }>;
}

export interface ParseError {
  success: false;
  errors: z.ZodError;
}

export type ParseResult = { success: true; data: ParsedItem } | ParseError;

/**
 * Validates the request body against the category-specific schema.
 * Splits the result into base item fields and EAV attribute rows.
 */
export function parseItemWithAttributes(
  body: unknown,
  categoryCode: string
): ParseResult {
  const schema = getSchemaForCategory(categoryCode);
  const result = schema.safeParse(body);

  if (!result.success) {
    return { success: false, errors: result.error };
  }

  const data = result.data as Record<string, unknown>;
  const attrFields = CATEGORY_ATTRIBUTE_FIELDS[categoryCode] ?? [];

  const item: ParsedItem["item"] = {
    item_name: data.item_name as string,
    category_code: data.category_code as string,
    sku: data.sku as string | undefined,
    description: data.description as string | undefined,
    location: data.location as string | undefined,
  };

  const attributes: Array<{ name: string; value: string }> = [];
  for (const field of attrFields) {
    const val = data[field];
    if (val !== undefined && val !== null && val !== "") {
      attributes.push({ name: field, value: String(val) });
    }
  }

  return { success: true, data: { item, attributes } };
}

export { baseItemSchema, CATEGORY_ATTRIBUTE_FIELDS };
export * from "./schemas";
