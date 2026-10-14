// Download Excel of the production board tab (spec 2026-10-15 §4 / §7). NO money.
// Production / Owner / Admin only.
import ExcelJS from "exceljs";
import { NextResponse, type NextRequest } from "next/server";
import { getSession } from "@/server/auth/session";
import { listProductionOrders, PRODUCTION_TABS, type ProductionTab } from "@/server/repo/production";
import { BRAND } from "@/config/brand";
import { PRODUCTION_LABEL } from "@/server/domain/v1_1/workflow";
import { initialsOf } from "@/app/(app)/orders/_components/sheet/sheetFormat";

function ddmmyyyy(d: Date): string {
  // @db.Date values are UTC midnight of the calendar day.
  return d.toISOString().slice(0, 10).split("-").reverse().join("-");
}

export async function GET(req: NextRequest) {
  const s = await getSession();
  if (!s) {
    return NextResponse.json({ ok: false, error: "UNAUTHENTICATED" }, { status: 401 });
  }
  if (s.role !== "PRODUCTION" && s.role !== "OWNER" && s.role !== "ADMIN") {
    return NextResponse.json({ ok: false, error: "FORBIDDEN" }, { status: 403 });
  }
  const t = req.nextUrl.searchParams.get("tab");
  const tab: ProductionTab = t && (PRODUCTION_TABS as readonly string[]).includes(t) ? (t as ProductionTab) : "todo";
  const q = req.nextUrl.searchParams.get("q")?.trim() || undefined;

  const rows = await listProductionOrders({ tenantId: s.tenantId, tab, q });

  const wb = new ExcelJS.Workbook();
  wb.creator = BRAND.name;
  wb.created = new Date();
  const ws = wb.addWorksheet("Production");
  ws.columns = [
    { header: "S.No", key: "sno", width: 10 },
    { header: "Order date", key: "date", width: 12 },
    { header: "Delivery date", key: "delivery", width: 14 },
    { header: "Customer", key: "cust", width: 24 },
    { header: "Contact", key: "contact", width: 20 },
    { header: "Products", key: "prod", width: 48 },
    { header: "Salesperson", key: "sp", width: 18 },
    { header: "Comments", key: "comments", width: 36 },
    { header: "Production status", key: "production", width: 18 },
  ];
  ws.views = [{ state: "frozen", ySplit: 1 }];
  ws.getRow(1).font = { bold: true };
  ws.getRow(1).alignment = { vertical: "middle" };

  for (const r of rows) {
    const row = ws.addRow({
      sno: r.serialNo === null ? "" : `${initialsOf(r.salesperson)}-${r.serialNo}`,
      date: ddmmyyyy(r.orderDate),
      delivery: r.deliveryDate ? ddmmyyyy(r.deliveryDate) : (r.deliveryNote ?? ""),
      cust: r.customer === "—" ? "" : r.customer,
      contact: r.contact === "—" ? "" : r.contact,
      prod: r.productText ?? "",
      sp: r.salesperson,
      comments: r.notes ?? "",
      production: PRODUCTION_LABEL[r.productionStatus],
    });
    row.alignment = { vertical: "top", wrapText: true };
  }

  const buf = await wb.xlsx.writeBuffer();
  return new NextResponse(buf, {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="production-${tab}.xlsx"`,
    },
  });
}
