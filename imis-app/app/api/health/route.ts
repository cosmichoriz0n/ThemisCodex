import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({ status: "ok", service: "imis-app", ts: new Date().toISOString() });
}
