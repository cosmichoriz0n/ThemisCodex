import "server-only";
import { NextRequest, NextResponse } from "next/server";
// Use the node-specific bwip-js entry to get correct types (toBuffer returns Promise<Buffer>)
// eslint-disable-next-line @typescript-eslint/no-require-imports
const bwipjs = require("bwip-js") as typeof import("bwip-js");
import { eq } from "drizzle-orm";
import { withAuth } from "@/lib/auth/withAuth";
import { withRole } from "@/lib/db/with-role";
import { ALL_ROLES } from "@/lib/auth/permissions";
import { items } from "@/lib/db/schema/items";

async function toBarcode(opts: {
  bcid: string;
  text: string;
  scale?: number;
  height?: number;
  includetext?: boolean;
  textxalign?: string;
  eclevel?: string;
}): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (bwipjs as any).toBuffer(opts, (err: unknown, png: Buffer) => {
      if (err) reject(err);
      else resolve(png);
    });
  });
}

export const GET = withAuth(async (req: NextRequest, { user, role, params }) => {
  const { id } = params;
  const { searchParams } = new URL(req.url);
  const type = searchParams.get("type") ?? "code128";

  const item = await withRole(user.uid, role, async (tx) => {
    const [row] = await tx
      .select({ assetTag: items.assetTag, itemName: items.itemName })
      .from(items)
      .where(eq(items.itemId, id))
      .limit(1);
    return row;
  });

  if (!item?.assetTag) {
    return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  }

  let png: Buffer;
  try {
    if (type === "qr") {
      png = await toBarcode({
        bcid: "qrcode",
        text: item.assetTag,
        scale: 4,
        eclevel: "M",
      });
    } else {
      png = await toBarcode({
        bcid: "code128",
        text: item.assetTag,
        scale: 3,
        height: 10,
        includetext: true,
        textxalign: "center",
      });
    }
  } catch {
    return NextResponse.json({ error: "BARCODE_GENERATION_FAILED" }, { status: 500 });
  }

  return new Response(new Uint8Array(png), {
    status: 200,
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "public, max-age=3600, immutable",
    },
  });
}, ALL_ROLES);
