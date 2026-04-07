import "server-only";
import { NextRequest, NextResponse } from "next/server";
// eslint-disable-next-line @typescript-eslint/no-require-imports
const _bwipjs = require("bwip-js");
import { PDFDocument, rgb, StandardFonts } from "pdf-lib";

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
    (_bwipjs as any).toBuffer(opts, (err: unknown, png: Buffer) => {
      if (err) reject(err);
      else resolve(png);
    });
  });
}
import { eq } from "drizzle-orm";
import { withAuth } from "@/lib/auth/withAuth";
import { withRole } from "@/lib/db/with-role";
import { MANAGER_ABOVE } from "@/lib/auth/permissions";
import { items } from "@/lib/db/schema/items";
import { uploadFile, getSignedUrl } from "@/lib/storage";

export const GET = withAuth(async (req: NextRequest, { user, role, params }) => {
  const { id } = params;
  const { searchParams } = new URL(req.url);
  const format = searchParams.get("format") ?? "a4";

  const item = await withRole(user.uid, role, async (tx) => {
    const [row] = await tx
      .select({
        itemId: items.itemId,
        assetTag: items.assetTag,
        itemName: items.itemName,
        categoryCode: items.categoryCode,
        location: items.location,
      })
      .from(items)
      .where(eq(items.itemId, id))
      .limit(1);
    return row;
  });

  if (!item?.assetTag) {
    return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  }

  // Narrow assetTag to string after null guard
  const assetTag: string = item.assetTag;

  // Generate barcode images
  const [code128Png, qrPng] = await Promise.all([
    toBarcode({
      bcid: "code128",
      text: assetTag,
      scale: 2,
      height: 8,
      includetext: true,
      textxalign: "center",
    }),
    toBarcode({
      bcid: "qrcode",
      text: assetTag,
      scale: 3,
      eclevel: "M",
    }),
  ]);

  const labelItem = { ...item, assetTag };
  let pdfBytes: Uint8Array;

  if (format === "thermal") {
    pdfBytes = await buildThermalLabel(labelItem, code128Png, qrPng);
  } else {
    pdfBytes = await buildA4Sheet(labelItem, code128Png, qrPng);
  }

  const storagePath = `labels/${item.itemId}/${format}-${Date.now()}.pdf`;
  await uploadFile(storagePath, Buffer.from(pdfBytes), "application/pdf");
  const signedUrl = await getSignedUrl(storagePath);

  return NextResponse.redirect(signedUrl, { status: 302 });
}, MANAGER_ABOVE);

// ─── A4 sheet: 4 columns × 5 rows = 20 labels per page ────────────────────

async function buildA4Sheet(
  item: { assetTag: string; itemName: string; categoryCode: string; location: string | null },
  code128Png: Uint8Array,
  qrPng: Uint8Array
): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const fontSmall = await pdfDoc.embedFont(StandardFonts.Helvetica);

  // A4 in points: 595 × 842
  const page = pdfDoc.addPage([595, 842]);

  const cols = 4;
  const rows = 5;
  const marginX = 20;
  const marginY = 20;
  const labelW = (595 - marginX * 2) / cols;
  const labelH = (842 - marginY * 2) / rows;
  const padding = 4;

  const code128Img = await pdfDoc.embedPng(code128Png);
  const qrImg = await pdfDoc.embedPng(qrPng);

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const x = marginX + col * labelW;
      // PDF y-axis: 0 at bottom, so invert rows
      const y = 842 - marginY - (row + 1) * labelH;

      // Border
      page.drawRectangle({
        x: x + 1,
        y: y + 1,
        width: labelW - 2,
        height: labelH - 2,
        borderColor: rgb(0.7, 0.7, 0.7),
        borderWidth: 0.5,
      });

      // Asset tag
      page.drawText(item.assetTag, {
        x: x + padding,
        y: y + labelH - padding - 10,
        size: 7,
        font,
        color: rgb(0, 0, 0),
      });

      // Category badge
      page.drawText(item.categoryCode, {
        x: x + labelW - padding - fontSmall.widthOfTextAtSize(item.categoryCode, 6),
        y: y + labelH - padding - 10,
        size: 6,
        font: fontSmall,
        color: rgb(0.3, 0.3, 0.7),
      });

      // Item name (truncated)
      const nameDisplay =
        item.itemName.length > 22 ? item.itemName.slice(0, 22) + "…" : item.itemName;
      page.drawText(nameDisplay, {
        x: x + padding,
        y: y + labelH - padding - 20,
        size: 6,
        font: fontSmall,
        color: rgb(0.2, 0.2, 0.2),
      });

      // Location
      if (item.location) {
        page.drawText(item.location, {
          x: x + padding,
          y: y + labelH - padding - 29,
          size: 5,
          font: fontSmall,
          color: rgb(0.5, 0.5, 0.5),
        });
      }

      // Code128 barcode
      const barcodeH = 20;
      const barcodeW = labelW - padding * 2 - 24;
      page.drawImage(code128Img, {
        x: x + padding,
        y: y + padding + 2,
        width: barcodeW,
        height: barcodeH,
      });

      // QR code (small, bottom-right)
      const qrSize = 20;
      page.drawImage(qrImg, {
        x: x + labelW - padding - qrSize,
        y: y + padding + 2,
        width: qrSize,
        height: qrSize,
      });
    }
  }

  return pdfDoc.save();
}

// ─── 58mm thermal label: single label, 58mm × 40mm ─────────────────────────

async function buildThermalLabel(
  item: { assetTag: string; itemName: string; categoryCode: string; location: string | null },
  code128Png: Uint8Array,
  qrPng: Uint8Array
): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const fontNormal = await pdfDoc.embedFont(StandardFonts.Helvetica);

  // 58mm × 40mm in points (1mm = 2.835 pts)
  const W = Math.round(58 * 2.835); // ~164pt
  const H = Math.round(40 * 2.835); // ~113pt
  const page = pdfDoc.addPage([W, H]);

  const code128Img = await pdfDoc.embedPng(code128Png);
  const qrImg = await pdfDoc.embedPng(qrPng);

  const pad = 4;

  // Asset tag (top)
  page.drawText(item.assetTag, {
    x: pad,
    y: H - pad - 10,
    size: 8,
    font,
    color: rgb(0, 0, 0),
  });

  // Category
  page.drawText(item.categoryCode, {
    x: W - pad - fontNormal.widthOfTextAtSize(item.categoryCode, 7),
    y: H - pad - 10,
    size: 7,
    font: fontNormal,
    color: rgb(0.3, 0.3, 0.7),
  });

  // Item name
  const nameDisplay = item.itemName.length > 24 ? item.itemName.slice(0, 24) + "…" : item.itemName;
  page.drawText(nameDisplay, {
    x: pad,
    y: H - pad - 20,
    size: 6,
    font: fontNormal,
    color: rgb(0.2, 0.2, 0.2),
  });

  // Location
  if (item.location) {
    page.drawText(item.location, {
      x: pad,
      y: H - pad - 29,
      size: 5,
      font: fontNormal,
      color: rgb(0.5, 0.5, 0.5),
    });
  }

  // Code128 (bottom-left)
  const qrSize = 30;
  const barcodeW = W - pad * 3 - qrSize;
  const barcodeH = 22;
  page.drawImage(code128Img, {
    x: pad,
    y: pad,
    width: barcodeW,
    height: barcodeH,
  });

  // QR code (bottom-right)
  page.drawImage(qrImg, {
    x: W - pad - qrSize,
    y: pad,
    width: qrSize,
    height: qrSize,
  });

  return pdfDoc.save();
}
