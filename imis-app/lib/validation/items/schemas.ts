import { z } from "zod";

// CSV injection prevention — reject values starting with formula-trigger characters
const csvSafe = z
  .string()
  .refine((v) => !/^[=+\-@]/.test(v), {
    message: "Value cannot start with =, +, -, or @ (CSV injection prevention)",
  });

const csvSafeOptional = z
  .string()
  .optional()
  .refine((v) => v === undefined || !/^[=+\-@]/.test(v), {
    message: "Value cannot start with =, +, -, or @ (CSV injection prevention)",
  });

// Base schema shared by all 13 categories
export const baseItemSchema = z.object({
  item_name: csvSafe.min(1, "Item name is required"),
  category_code: z.string().min(1, "Category is required"),
  sku: csvSafeOptional,
  description: csvSafeOptional,
  location: csvSafeOptional,
});

// ─── 13 Category-specific schemas ──────────────────────────────────────────

export const LMSchema = baseItemSchema.extend({
  conductor_type: csvSafe.min(1, "Conductor type is required"),
  gauge: csvSafe.min(1, "Gauge is required"),
  length_m: z.coerce.number().positive("Length must be positive"),
  voltage_rating: csvSafe.min(1, "Voltage rating is required"),
  lot_no: csvSafeOptional,
});

export const TESchema = baseItemSchema.extend({
  tool_type: csvSafe.min(1, "Tool type is required"),
  condition: z.enum(["new", "good", "fair", "poor"], {
    error: "Condition must be new, good, fair, or poor",
  }),
  assigned_to: csvSafeOptional,
  calibration_due: z.string().optional(),
});

export const FFSchema = baseItemSchema.extend({
  room_location: csvSafe.min(1, "Room/location is required"),
  acquisition_cost: z.coerce.number().nonnegative("Acquisition cost must be 0 or greater"),
  condition: z.enum(["new", "good", "fair", "poor"], {
    error: "Condition must be new, good, fair, or poor",
  }),
});

export const OSSchema = baseItemSchema.extend({
  brand: csvSafe.min(1, "Brand is required"),
  pack_size: csvSafe.min(1, "Pack size is required"),
  unit: csvSafe.min(1, "Unit is required"),
  reorder_level: z.coerce.number().int().nonnegative("Reorder level must be 0 or greater"),
});

export const MPSchema = baseItemSchema.extend({
  plate_no: csvSafe.min(1, "Plate number is required"),
  or_no: csvSafe.min(1, "OR number is required"),
  make: csvSafe.min(1, "Make is required"),
  model: csvSafe.min(1, "Model is required"),
  year: z.coerce
    .number()
    .int()
    .min(1900)
    .max(new Date().getFullYear() + 1, "Year cannot be in the future"),
  mileage: z.coerce.number().nonnegative("Mileage must be 0 or greater"),
  insurance_expiry: z.string().optional(),
});

export const HWSchema = baseItemSchema.extend({
  wire_type: csvSafe.min(1, "Wire type is required"),
  gauge: csvSafe.min(1, "Gauge is required"),
  length_m: z.coerce.number().positive("Length must be positive"),
  insulation_rating: csvSafe.min(1, "Insulation rating is required"),
});

export const SESchema = baseItemSchema.extend({
  serial_no: csvSafe.min(1, "Serial number is required"),
  calibration_cert: csvSafeOptional,
  calibration_expiry: z.string().optional(),
});

export const UPISSchema = baseItemSchema.extend({
  nea_asset_code: csvSafe.min(1, "NEA asset code is required"),
  feeder: csvSafe.min(1, "Feeder is required"),
  depreciation_rate: z.coerce
    .number()
    .min(0)
    .max(100, "Depreciation rate must be between 0 and 100"),
  installation_date: z.string().min(1, "Installation date is required"),
});

export const MSSchema = baseItemSchema.extend({
  lot_no: csvSafe.min(1, "Lot number is required"),
  expiry_date: z.string().min(1, "Expiry date is required"),
  batch_no: csvSafe.min(1, "Batch number is required"),
  storage_temp: csvSafeOptional,
  doh_class: csvSafeOptional,
});

export const TRSchema = baseItemSchema.extend({
  plate_no: csvSafe.min(1, "Plate number is required"),
  or_no: csvSafe.min(1, "OR number is required"),
  chassis_no: csvSafe.min(1, "Chassis number is required"),
  engine_no: csvSafe.min(1, "Engine number is required"),
  insurance_expiry: z.string().optional(),
  lto_expiry: z.string().optional(),
  emission_due: z.string().optional(),
});

export const CESchema = baseItemSchema.extend({
  serial_no: csvSafe.min(1, "Serial number is required"),
  ntc_license_no: csvSafeOptional,
  ntc_expiry: z.string().optional(),
});

export const BMSchema = baseItemSchema.extend({
  material_type: csvSafe.min(1, "Material type is required"),
  unit: csvSafe.min(1, "Unit is required"),
  supplier: csvSafeOptional,
  work_order_ref: csvSafeOptional,
});

export const ITSchema = baseItemSchema.extend({
  serial_no: csvSafe.min(1, "Serial number is required"),
  mac_address: csvSafeOptional,
  os_version: csvSafeOptional,
  license_key: csvSafeOptional,
  license_expiry: z.string().optional(),
  assigned_user: csvSafeOptional,
});

export type LMInput = z.infer<typeof LMSchema>;
export type TEInput = z.infer<typeof TESchema>;
export type FFInput = z.infer<typeof FFSchema>;
export type OSInput = z.infer<typeof OSSchema>;
export type MPInput = z.infer<typeof MPSchema>;
export type HWInput = z.infer<typeof HWSchema>;
export type SEInput = z.infer<typeof SESchema>;
export type UPISInput = z.infer<typeof UPISSchema>;
export type MSInput = z.infer<typeof MSSchema>;
export type TRInput = z.infer<typeof TRSchema>;
export type CEInput = z.infer<typeof CESchema>;
export type BMInput = z.infer<typeof BMSchema>;
export type ITInput = z.infer<typeof ITSchema>;
