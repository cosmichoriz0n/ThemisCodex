import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/auth/withAuth";
import { MANAGER_ABOVE } from "@/lib/auth/permissions";
import { validateFileInput, parseCSV } from "@/lib/import/parser";
import { validateAllRows } from "@/lib/import/validate";
import { bulkInsertItems } from "@/lib/import/insert";
import type { ImportPreviewResponse } from "@/lib/import/types";

// Disable Next.js body parser — we read multipart/form-data manually
export const dynamic = "force-dynamic";

export const POST = withAuth(async (req: NextRequest, { user, role }) => {
  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json(
      { error: "INVALID_REQUEST: Expected multipart/form-data" },
      { status: 400 }
    );
  }

  const phase = formData.get("phase");
  if (phase !== "preview" && phase !== "commit") {
    return NextResponse.json(
      { error: 'INVALID_PHASE: Must be "preview" or "commit"' },
      { status: 400 }
    );
  }

  const file = formData.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json(
      { error: "MISSING_FILE: file field is required" },
      { status: 400 }
    );
  }

  try {
    validateFileInput(file);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "INVALID_FILE";
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  let buffer: Buffer;
  try {
    buffer = Buffer.from(await file.arrayBuffer());
  } catch {
    return NextResponse.json(
      { error: "FILE_READ_ERROR: Could not read file contents" },
      { status: 400 }
    );
  }

  let parsed;
  try {
    parsed = parseCSV(buffer);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "CSV_PARSE_ERROR";
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  if (parsed.totalRows === 0) {
    return NextResponse.json(
      { error: "EMPTY_FILE: CSV contains no data rows" },
      { status: 400 }
    );
  }

  const validated = validateAllRows(parsed.rows);

  if (phase === "preview") {
    const validCount = validated.filter((r) => r.valid).length;
    const response: ImportPreviewResponse = {
      phase: "preview",
      filename: file.name,
      total_rows: parsed.totalRows,
      preview_rows: validated.slice(0, 20),
      valid_count: validCount,
      invalid_count: parsed.totalRows - validCount,
    };
    return NextResponse.json(response);
  }

  // phase === "commit"
  try {
    const result = await bulkInsertItems(
      validated,
      parsed.rows,
      user.uid,
      role,
      file.name
    );
    return NextResponse.json(result, { status: result.inserted > 0 ? 201 : 200 });
  } catch (e) {
    console.error("[import] bulk insert failed:", e);
    return NextResponse.json(
      { error: "IMPORT_FAILED: Transaction rolled back. No items were inserted." },
      { status: 500 }
    );
  }
}, MANAGER_ABOVE);
