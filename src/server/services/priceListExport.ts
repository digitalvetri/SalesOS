// Price-list Excel export — matches the pilot "PRICE LIST KI - KFM - 2026" format.
import ExcelJS from "exceljs";
import { prisma } from "@/server/repo/client";

export async function exportPriceList(opts: {
  tenantId: string;
}): Promise<Buffer> {
  const [categories, products] = await Promise.all([
    prisma.productCategory.findMany({
      where: { tenantId: opts.tenantId },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      select: { id: true, name: true },
    }),
    prisma.product.findMany({
      where: { tenantId: opts.tenantId, active: true },
      orderBy: [{ categoryId: "asc" }, { name: "asc" }],
    }),
  ]);

  const wb = new ExcelJS.Workbook();
  wb.creator = "Kumaar Industries";
  wb.created = new Date();
  const ws = wb.addWorksheet("PRICE LIST");

  // Header row.
  ws.addRow(["PRODUCT", "HP", "DEALER PRICE w/o MOTOR", "DEALER PRICE", "CUSTOMER PRICE"]);
  const headerRow = ws.getRow(1);
  headerRow.font = { bold: true };
  headerRow.alignment = { horizontal: "left" };

  // Group products by category.
  const grouped = new Map<string, typeof products>();
  for (const p of products) {
    if (!grouped.has(p.categoryId)) grouped.set(p.categoryId, []);
    grouped.get(p.categoryId)!.push(p);
  }

  for (const cat of categories) {
    const items = grouped.get(cat.id);
    if (!items || items.length === 0) continue;
    // Section header row.
    const sectionRow = ws.addRow([cat.name.toUpperCase()]);
    sectionRow.font = { bold: true };
    // Product rows.
    for (const p of items) {
      ws.addRow([
        p.name,
        p.spec ?? "",
        p.dealerPriceWoMotor ? Number(p.dealerPriceWoMotor.toString()) : "",
        p.dealerPrice ? Number(p.dealerPrice.toString()) : "",
        p.customerPrice ? Number(p.customerPrice.toString()) : "",
      ]);
    }
    ws.addRow([]); // spacer
  }

  // Column widths + ₹ format on the price columns.
  const widths = [40, 14, 20, 18, 18];
  ws.columns.forEach((col, idx) => {
    col.width = widths[idx] ?? 15;
    if (idx >= 2) col.numFmt = `[$₹-4009] #,##,##0;[Red]-[$₹-4009] #,##,##0`;
  });

  // Freeze header
  ws.views = [{ state: "frozen", ySplit: 1 }];

  const buffer = await wb.xlsx.writeBuffer();
  return Buffer.from(buffer);
}
