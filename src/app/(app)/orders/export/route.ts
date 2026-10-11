// v1.1 §5.3 — Download Excel of the current filtered Orders view.
// Admin / Owner only. Mirrors the same filters the OrderSheet UI uses.
import ExcelJS from "exceljs";
import { NextResponse } from "next/server";
import { requireSession } from "@/server/auth/session";
import { listOrdersV2 } from "@/server/repo/ordersV2";

const STATUS_VALUES = ["all", "pending", "completed", "balance_due"] as const;

export async function GET(req: Request) {
  const s = await requireSession();
  if (s.role !== "OWNER" && s.role !== "ADMIN" && s.role !== "ACCOUNTS") {
    return NextResponse.json({ ok: false, error: "FORBIDDEN" }, { status: 403 });
  }
  const url = new URL(req.url);
  const m = url.searchParams.get("m");
  const f = url.searchParams.get("f");
  const q = url.searchParams.get("q");
  const sp = url.searchParams.get("sp");
  const month = m && /^\d{4}-\d{2}$/.test(m) ? m : null;
  const status = f && (STATUS_VALUES as readonly string[]).includes(f)
    ? (f as (typeof STATUS_VALUES)[number])
    : "all";
  const rows = await listOrdersV2({
    tenantId: s.tenantId,
    salespersonId: sp ?? undefined,
    month,
    status,
    search: q ?? undefined,
    limit: 5000,
  });

  const wb = new ExcelJS.Workbook();
  wb.creator = "SalesOS";
  wb.created = new Date();
  const ws = wb.addWorksheet("Orders");

  ws.columns = [
    { header: "S.No", key: "sno", width: 10 },
    { header: "Date", key: "date", width: 12 },
    { header: "Employee", key: "sp", width: 20 },
    { header: "Customer", key: "cust", width: 24 },
    { header: "Product", key: "prod", width: 40 },
    { header: "Contact", key: "contact", width: 16 },
    { header: "Total", key: "total", width: 14, style: { numFmt: "#,##0.00" } },
    { header: "Paid", key: "paid", width: 14, style: { numFmt: "#,##0.00" } },
    { header: "Balance", key: "bal", width: 14, style: { numFmt: "#,##0.00" } },
    { header: "Status", key: "status", width: 14 },
  ];
  ws.getRow(1).font = { bold: true };
  ws.getRow(1).alignment = { vertical: "middle" };

  for (const r of rows) {
    ws.addRow({
      sno: initialsNumber(r.salespersonName, r.serialNo),
      date: r.orderDate,
      sp: r.salespersonName,
      cust: r.customerName,
      prod: r.productText ?? "",
      contact: r.customerPhoneE164,
      total: Number(r.total),
      paid: Number(r.paidTotal),
      bal: Number(r.balanceDue),
      status: r.simpleStatus.toLowerCase(),
    });
  }

  // Totals row
  const n = rows.length;
  if (n > 0) {
    const totalsRow = ws.addRow({
      sno: "",
      date: "",
      sp: "",
      cust: "",
      prod: `${n} orders`,
      contact: "",
      total: rows.reduce((s, r) => s + Number(r.total), 0),
      paid: rows.reduce((s, r) => s + Number(r.paidTotal), 0),
      bal: rows.reduce((s, r) => s + Number(r.balanceDue), 0),
      status: "",
    });
    totalsRow.font = { bold: true };
  }

  const buf = await wb.xlsx.writeBuffer();
  const filename = `orders${month ? `-${month}` : ""}${sp ? `-${sp.slice(-6)}` : ""}.xlsx`;
  return new NextResponse(buf, {
    status: 200,
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}

function initialsNumber(name: string, serial: number | null): string {
  if (serial === null) return "";
  const init = name
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
  return `${init || "??"}-${serial}`;
}
