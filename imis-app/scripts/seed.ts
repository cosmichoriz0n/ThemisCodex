/**
 * IMIS Demo Seed Script — Sprint 4 MVP
 *
 * Seeds all 13 asset categories with realistic items for demo/staging.
 * Run with: npx tsx scripts/seed.ts
 *
 * Requires DATABASE_URL in environment.
 * Safe to re-run — checks for existing seeded items first.
 */

import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { eq, count } from "drizzle-orm";
import * as schema from "../lib/db/schema";

const SEED_USER_ID = "seed-script";

const client = postgres(process.env.DATABASE_URL!, { max: 1 });
const db = drizzle(client, { schema });

// ── Item seed data per category ──────────────────────────────────────────────

const SEED_ITEMS = [
  // LM — Line Materials
  { category_code: "LM", item_name: "ACSR Conductor 336.4 MCM", location: "main_warehouse", attrs: { conductor_type: "ACSR", gauge: "336.4 MCM", length_m: "500", voltage_rating: "69kV", lot_no: "LM-2026-001" }},
  { category_code: "LM", item_name: "ACSR Conductor 4/0 AWG", location: "main_warehouse", attrs: { conductor_type: "ACSR", gauge: "4/0 AWG", length_m: "300", voltage_rating: "13.8kV", lot_no: "LM-2026-002" }},
  { category_code: "LM", item_name: "Preformed Guy Grip Set", location: "warehouse_b", attrs: { conductor_type: "Steel", gauge: "3/8\"", length_m: "2", voltage_rating: "N/A", lot_no: "LM-2026-003" }},
  { category_code: "LM", item_name: "Porcelain Disc Insulator", location: "main_warehouse", attrs: { conductor_type: "N/A", gauge: "N/A", length_m: "0.15", voltage_rating: "15kV", lot_no: "LM-2026-004" }},
  { category_code: "LM", item_name: "Overhead Ground Wire 3/8\"", location: "main_warehouse", attrs: { conductor_type: "EHS Steel", gauge: "3/8\"", length_m: "1000", voltage_rating: "N/A", lot_no: "LM-2026-005" }},

  // TE — Tools and Equipment
  { category_code: "TE", item_name: "Clamp Meter True RMS 600A", location: "tool_room", attrs: { tool_type: "Electrical Tester", condition: "good", assigned_to: "", calibration_due: "2026-12-01" }},
  { category_code: "TE", item_name: "Hot Stick 12ft Fiberglass", location: "tool_room", attrs: { tool_type: "Live Line Tool", condition: "good", assigned_to: "", calibration_due: "2027-03-15" }},
  { category_code: "TE", item_name: "Hydraulic Compression Tool", location: "tool_room", attrs: { tool_type: "Hand Tool", condition: "fair", assigned_to: "Lineman Team A", calibration_due: "" }},
  { category_code: "TE", item_name: "Digital Insulation Tester 5kV", location: "tool_room", attrs: { tool_type: "Electrical Tester", condition: "good", assigned_to: "", calibration_due: "2026-06-30" }},
  { category_code: "TE", item_name: "Safety Harness Full Body", location: "tool_room", attrs: { tool_type: "PPE", condition: "new", assigned_to: "", calibration_due: "2027-01-01" }},

  // FF — Furniture and Fixtures
  { category_code: "FF", item_name: "Executive Office Chair Ergonomic", location: "admin_office", attrs: { room_location: "Executive Office", acquisition_cost: "8500", condition: "good" }},
  { category_code: "FF", item_name: "Steel Filing Cabinet 4-Drawer", location: "records_room", attrs: { room_location: "Records Room", acquisition_cost: "5200", condition: "good" }},
  { category_code: "FF", item_name: "Conference Table 10-Seater", location: "conference_room", attrs: { room_location: "Conference Room", acquisition_cost: "35000", condition: "new" }},
  { category_code: "FF", item_name: "Fluorescent Lighting Fixture 2x40W", location: "main_office", attrs: { room_location: "Main Office", acquisition_cost: "1800", condition: "fair" }},
  { category_code: "FF", item_name: "Steel Office Desk with Drawers", location: "main_office", attrs: { room_location: "Main Office", acquisition_cost: "7500", condition: "good" }},

  // OS — Office Supplies
  { category_code: "OS", item_name: "Bond Paper A4 80gsm", location: "supply_room", attrs: { brand: "Navigator", pack_size: "500 sheets/ream", unit: "ream", reorder_level: "10" }},
  { category_code: "OS", item_name: "Ballpen Black 0.5mm", location: "supply_room", attrs: { brand: "Pilot G-Tec", pack_size: "12 pcs/box", unit: "box", reorder_level: "5" }},
  { category_code: "OS", item_name: "Correction Tape 5mmx6m", location: "supply_room", attrs: { brand: "Kokuyo", pack_size: "1 pc", unit: "piece", reorder_level: "8" }},
  { category_code: "OS", item_name: "Stapler Heavy Duty 70-Sheet", location: "supply_room", attrs: { brand: "Max", pack_size: "1 pc", unit: "piece", reorder_level: "2" }},
  { category_code: "OS", item_name: "Folder Expanded Long Brown", location: "supply_room", attrs: { brand: "National Bookstore", pack_size: "50 pcs/pack", unit: "pack", reorder_level: "3" }},

  // MP — Motor Pool Equipment & Supplies
  { category_code: "MP", item_name: "Service Vehicle Toyota Hilux 4x4", location: "motor_pool", attrs: { plate_no: "VLB-8234", or_no: "OR-2024-00112", make: "Toyota", model: "Hilux 2.4 G DSL", year: "2023", mileage: "28450" }},
  { category_code: "MP", item_name: "Line Truck Isuzu NHR 4WD", location: "motor_pool", attrs: { plate_no: "WMB-1120", or_no: "OR-2023-00089", make: "Isuzu", model: "NHR 55/90", year: "2021", mileage: "64200" }},
  { category_code: "MP", item_name: "Motorcycle Honda XR150L", location: "motor_pool", attrs: { plate_no: "7801-TEM", or_no: "OR-2025-00034", make: "Honda", model: "XR150L", year: "2024", mileage: "5120" }},
  { category_code: "MP", item_name: "Generator Portable 6.5kVA", location: "motor_pool", attrs: { plate_no: "N/A", or_no: "N/A", make: "Firman", model: "SPG8500E2", year: "2022", mileage: "0" }},
  { category_code: "MP", item_name: "Pickup Truck Mitsubishi L300", location: "motor_pool", attrs: { plate_no: "TRK-4489", or_no: "OR-2022-00067", make: "Mitsubishi", model: "L300 FB", year: "2020", mileage: "87600" }},

  // HW — House Wiring Materials
  { category_code: "HW", item_name: "THHN Wire 2.0mm² Black", location: "main_warehouse", attrs: { wire_type: "THHN", gauge: "2.0mm²", length_m: "200", insulation_rating: "600V" }},
  { category_code: "HW", item_name: "Duplex Service Wire 2x10 AWG", location: "main_warehouse", attrs: { wire_type: "Duplex", gauge: "2x10 AWG", length_m: "500", insulation_rating: "600V" }},
  { category_code: "HW", item_name: "PVC Conduit 1/2\" 10ft", location: "main_warehouse", attrs: { wire_type: "Conduit", gauge: "1/2\"", length_m: "3.05", insulation_rating: "N/A" }},
  { category_code: "HW", item_name: "Romex NMB 14/2 with Ground", location: "main_warehouse", attrs: { wire_type: "NMB", gauge: "14/2", length_m: "150", insulation_rating: "600V" }},
  { category_code: "HW", item_name: "Flexible Cord SPT-2 2x18 AWG", location: "main_warehouse", attrs: { wire_type: "SPT-2", gauge: "2x18 AWG", length_m: "100", insulation_rating: "300V" }},

  // SE — Special Equipment
  { category_code: "SE", item_name: "Network Analyzer Fluke DSX-5000", location: "test_lab", attrs: { serial_no: "FLK-DSX-002341", calibration_cert: "CAL-2025-0088", calibration_expiry: "2026-08-15" }},
  { category_code: "SE", item_name: "Power Quality Analyzer Class A", location: "test_lab", attrs: { serial_no: "PQA-338891", calibration_cert: "CAL-2025-0107", calibration_expiry: "2026-05-30" }},
  { category_code: "SE", item_name: "Transformer Turns Ratio Tester", location: "test_lab", attrs: { serial_no: "TTR-20041", calibration_cert: "CAL-2024-0221", calibration_expiry: "2025-11-30" }},
  { category_code: "SE", item_name: "Earth Resistance Tester 4-Point", location: "test_lab", attrs: { serial_no: "ERT-50092", calibration_cert: "CAL-2025-0045", calibration_expiry: "2026-07-01" }},
  { category_code: "SE", item_name: "Partial Discharge Detector UHF", location: "test_lab", attrs: { serial_no: "PDD-UHF-00881", calibration_cert: "CAL-2025-0198", calibration_expiry: "2026-11-20" }},

  // UPIS — Utility Plant in Service
  { category_code: "UPIS", item_name: "69kV Distribution Transformer 10MVA", location: "substation_a", attrs: { nea_asset_code: "UPIS-TR-001", feeder: "Feeder 1", depreciation_rate: "5", installation_date: "2018-06-15" }},
  { category_code: "UPIS", item_name: "13.8kV Sectionalizer Outdoor", location: "distribution_line_2", attrs: { nea_asset_code: "UPIS-SW-012", feeder: "Feeder 2", depreciation_rate: "10", installation_date: "2020-03-10" }},
  { category_code: "UPIS", item_name: "Primary Recloser Single Phase", location: "distribution_line_4", attrs: { nea_asset_code: "UPIS-RC-007", feeder: "Feeder 4", depreciation_rate: "10", installation_date: "2021-11-22" }},
  { category_code: "UPIS", item_name: "Concrete Transmission Pole 40ft Class 1", location: "substation_a", attrs: { nea_asset_code: "UPIS-PL-0441", feeder: "Feeder 1", depreciation_rate: "4", installation_date: "2015-08-30" }},
  { category_code: "UPIS", item_name: "Voltage Regulator 69kV Single Phase", location: "substation_b", attrs: { nea_asset_code: "UPIS-VR-003", feeder: "Feeder 3", depreciation_rate: "6.67", installation_date: "2019-02-14" }},

  // MS — Medical Supplies & Equipment
  { category_code: "MS", item_name: "Paracetamol 500mg Tablet", location: "clinic", attrs: { lot_no: "MS-LOT-2024-112", expiry_date: "2026-07-31", batch_no: "BN-2024-0567", storage_temp: "Below 30°C", doh_class: "OTC" }},
  { category_code: "MS", item_name: "Povidone Iodine 10% 120ml", location: "clinic", attrs: { lot_no: "MS-LOT-2025-008", expiry_date: "2027-03-15", batch_no: "BN-2025-0112", storage_temp: "Below 25°C", doh_class: "OTC" }},
  { category_code: "MS", item_name: "Sterile Gauze Pad 4x4 inch", location: "clinic", attrs: { lot_no: "MS-LOT-2024-234", expiry_date: "2026-09-30", batch_no: "BN-2024-1001", storage_temp: "Dry place", doh_class: "Class 2" }},
  { category_code: "MS", item_name: "Amoxicillin 500mg Capsule", location: "clinic", attrs: { lot_no: "MS-LOT-2025-041", expiry_date: "2026-05-01", batch_no: "BN-2025-0201", storage_temp: "Below 25°C", doh_class: "Rx" }},
  { category_code: "MS", item_name: "Blood Pressure Monitor Digital", location: "clinic", attrs: { lot_no: "BPM-2024-SER-009", expiry_date: "2030-01-01", batch_no: "SER-009", storage_temp: "Normal", doh_class: "Class 2" }},

  // TR — Transportation Equipment
  { category_code: "TR", item_name: "Service Car Toyota Avanza 1.3E", location: "motor_pool", attrs: { plate_no: "VLA-4412", or_no: "OR-2023-00145", chassis_no: "MHFM1FH20N4001234", engine_no: "3SZ1234567", insurance_expiry: "2026-12-31" }},
  { category_code: "TR", item_name: "Crew Cab Ford Ranger 4x4 XLT", location: "motor_pool", attrs: { plate_no: "WKB-8823", or_no: "OR-2024-00088", chassis_no: "MNAZZZNJZM1234567", engine_no: "P5AT1234567", insurance_expiry: "2026-09-15" }},
  { category_code: "TR", item_name: "Ambulance Toyota Hi-Ace", location: "motor_pool", attrs: { plate_no: "EMG-0012", or_no: "OR-2022-00031", chassis_no: "JTFHX02P0D0012345", engine_no: "2KD1234567", insurance_expiry: "2026-06-30" }},
  { category_code: "TR", item_name: "Electric Bike Yamaha Mio i125", location: "motor_pool", attrs: { plate_no: "8834-YBK", or_no: "OR-2025-00012", chassis_no: "RKDBSE312PC012345", engine_no: "SE3PC012345", insurance_expiry: "2027-01-31" }},
  { category_code: "TR", item_name: "10-Wheeler Dump Truck Hino 700", location: "motor_pool", attrs: { plate_no: "TRK-9901", or_no: "OR-2021-00056", chassis_no: "JHDFU2JP5BX012345", engine_no: "E13C012345", insurance_expiry: "2026-08-20" }},

  // CE — Communication Equipment
  { category_code: "CE", item_name: "VHF Base Radio Kenwood TK-8302H", location: "control_room", attrs: { serial_no: "KW-8302-04412", ntc_license_no: "NTC-2024-08891", ntc_expiry: "2026-08-31" }},
  { category_code: "CE", item_name: "UHF Handheld Radio Hytera PD685G", location: "control_room", attrs: { serial_no: "HYT-PD685-00231", ntc_license_no: "NTC-2024-08892", ntc_expiry: "2026-08-31" }},
  { category_code: "CE", item_name: "Satellite Phone Iridium 9555", location: "emergency_kit", attrs: { serial_no: "IRD-9555-12345", ntc_license_no: "NTC-2025-00341", ntc_expiry: "2027-03-31" }},
  { category_code: "CE", item_name: "SCADA Communication Unit RTU900", location: "substation_a", attrs: { serial_no: "RTU-900-A001", ntc_license_no: "", ntc_expiry: "" }},
  { category_code: "CE", item_name: "Fiber Optic Modem 1Gbps Industrial", location: "server_room", attrs: { serial_no: "FOM-GB-00789", ntc_license_no: "NTC-2025-00890", ntc_expiry: "2027-11-30" }},

  // BM — Building Repair Materials
  { category_code: "BM", item_name: "Portland Cement 40kg bag", location: "materials_yard", attrs: { material_type: "Cement", unit: "bag", supplier: "Republic Cement", work_order_ref: "WO-2026-0011" }},
  { category_code: "BM", item_name: "Deformed Steel Bar 10mm x 6m", location: "materials_yard", attrs: { material_type: "Rebar", unit: "pc", supplier: "Pag-asa Steel", work_order_ref: "WO-2026-0011" }},
  { category_code: "BM", item_name: "Roofing Sheet Long Span 0.4mm", location: "materials_yard", attrs: { material_type: "Roofing", unit: "sheet", supplier: "Union Galvasteel", work_order_ref: "WO-2026-0023" }},
  { category_code: "BM", item_name: "CHB 4\" Hollow Block", location: "materials_yard", attrs: { material_type: "Masonry", unit: "pc", supplier: "Local Supplier", work_order_ref: "WO-2026-0011" }},
  { category_code: "BM", item_name: "Latex Paint White 4L", location: "materials_yard", attrs: { material_type: "Paint", unit: "gallon", supplier: "Davies Paints", work_order_ref: "WO-2026-0041" }},

  // IT — IT Equipment and Software
  { category_code: "IT", item_name: "Desktop Computer Acer Veriton i5 12th Gen", location: "main_office", attrs: { serial_no: "ACER-VT-00223", mac_address: "AA:BB:CC:11:22:33", os_version: "Windows 11 Pro 23H2", license_key: "XXXXX-XXXXX-XXXXX-XXXXX-XXXXX", license_expiry: "2026-09-30", assigned_user: "Maria Santos" }},
  { category_code: "IT", item_name: "Laptop Dell Latitude 5540 i7", location: "main_office", attrs: { serial_no: "DELL-LAT-00891", mac_address: "DD:EE:FF:44:55:66", os_version: "Windows 11 Pro 23H2", license_key: "YYYYY-YYYYY-YYYYY-YYYYY-YYYYY", license_expiry: "2026-06-15", assigned_user: "Juan Dela Cruz" }},
  { category_code: "IT", item_name: "Network Switch 24-Port Cisco SG350", location: "server_room", attrs: { serial_no: "CISCO-SG350-00112", mac_address: "CC:DD:EE:77:88:99", os_version: "Cisco IOS 2.5.9", license_key: "", license_expiry: "", assigned_user: "" }},
  { category_code: "IT", item_name: "SCADA Server HPE ProLiant DL380", location: "server_room", attrs: { serial_no: "HPE-DL380-00041", mac_address: "11:22:33:AA:BB:CC", os_version: "Windows Server 2022", license_key: "ZZZZZ-ZZZZZ-ZZZZZ-ZZZZZ-ZZZZZ", license_expiry: "2027-11-30", assigned_user: "IT Admin" }},
  { category_code: "IT", item_name: "UPS 1500VA APC Smart-UPS", location: "server_room", attrs: { serial_no: "APC-UPS-00678", mac_address: "", os_version: "", license_key: "", license_expiry: "", assigned_user: "" }},
];

// PMS schedules for Motor Pool items (due within 14 days to trigger alerts)
const PMS_DUE_SOON = [
  { item_name: "Service Vehicle Toyota Hilux 4x4",  pms_type: "Oil Change & Filter",        due_date: new Date(Date.now() + 7 * 86400000) },
  { item_name: "Line Truck Isuzu NHR 4WD",          pms_type: "Brake System Inspection",    due_date: new Date(Date.now() + 10 * 86400000) },
  { item_name: "Pickup Truck Mitsubishi L300",       pms_type: "Annual PMS Complete",        due_date: new Date(Date.now() + 3 * 86400000) },
];

async function main() {
  console.log("🌱 Starting IMIS demo seed...");

  // Check if already seeded
  const [{ existingCount }] = await db
    .select({ existingCount: count() })
    .from(schema.items);

  if (existingCount > 0) {
    console.log(`ℹ️  Database already has ${existingCount} items. Skipping item seed.`);
    console.log("   To force re-seed, truncate the items table first.");
  } else {
    // Insert items + attributes
    for (const item of SEED_ITEMS) {
      const [inserted] = await db
        .insert(schema.items)
        .values({
          categoryCode:    item.category_code,
          itemName:        item.item_name,
          location:        item.location,
          lifecycleStatus: "in_stock",
          createdBy:       SEED_USER_ID,
        })
        .returning({ itemId: schema.items.itemId });

      const itemId = inserted.itemId;

      // Insert category-specific attributes
      for (const [attrName, attrValue] of Object.entries(item.attrs)) {
        if (attrValue === undefined || attrValue === null) continue;
        await db.insert(schema.itemAttributes).values({
          itemId,
          attributeName:  attrName,
          attributeValue: String(attrValue),
        });
      }

      // Insert inventory_stock record
      await db.insert(schema.inventoryStock).values({
        itemId,
        location:     item.location,
        qtyOnHand:    getInitialQty(item.category_code),
        qtyReserved:  0,
        reorderLevel: getReorderLevel(item.category_code),
      }).onConflictDoNothing();

      console.log(`  ✓ [${item.category_code}] ${item.item_name}`);
    }

    console.log(`\n✅ Seeded ${SEED_ITEMS.length} items across 13 categories.`);
  }

  // Seed PMS schedules for Motor Pool items (even if items exist)
  const existingPms = await db
    .select({ id: schema.pmsSchedules.id })
    .from(schema.pmsSchedules)
    .limit(1);

  if (existingPms.length === 0) {
    for (const pms of PMS_DUE_SOON) {
      // Find the item by name
      const [found] = await db
        .select({ itemId: schema.items.itemId })
        .from(schema.items)
        .where(eq(schema.items.itemName, pms.item_name))
        .limit(1);

      if (!found) {
        console.log(`  ⚠️  Item not found for PMS: ${pms.item_name}`);
        continue;
      }

      await db.insert(schema.pmsSchedules).values({
        itemId:    found.itemId,
        pmsType:   pms.pms_type,
        dueDate:   pms.due_date,
        status:    "pending",
        createdBy: SEED_USER_ID,
      });

      console.log(`  ✓ PMS [${pms.pms_type}] for ${pms.item_name} — due ${pms.due_date.toLocaleDateString()}`);
    }
    console.log(`✅ Seeded ${PMS_DUE_SOON.length} PMS schedules (due within 14 days to trigger alerts).`);
  } else {
    console.log("ℹ️  PMS schedules already exist. Skipping.");
  }

  console.log("\n🎉 Seed complete. Run /api/alerts/check to generate alert rows.");
  await client.end();
}

function getInitialQty(categoryCode: string): number {
  // Consumables get higher quantities; fixed assets get 1
  const consumables = ["LM", "HW", "OS", "BM", "MS"];
  const vehicles    = ["MP", "TR"];
  if (consumables.includes(categoryCode)) return Math.floor(Math.random() * 50) + 10;
  if (vehicles.includes(categoryCode))    return 1;
  return Math.floor(Math.random() * 5) + 1;
}

function getReorderLevel(categoryCode: string): number {
  const consumables = ["LM", "HW", "OS", "BM", "MS"];
  if (consumables.includes(categoryCode)) return 5;
  return 0;
}

main().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
