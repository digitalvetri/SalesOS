// Download Excel of the current filtered Orders view — every order detail.
// Owner / Admin / Accounts: all orders. Sales: only their own orders.
// Mirrors the same filters the OrderSheet UI uses.
import ExcelJS from "exceljs";
import { NextResponse } from "next/server";
import { getSession } from "@/server/auth/session";
import { listOrdersV2 } from "@/server/repo/ordersV2";
import { amountMissing, summarise } from "@/lib/orderDisplay";
import { BRAND } from "@/config/brand";
import { ORDER_STATUS_LABEL, PRODUCTION_LABEL } from "@/server/domain/v1_1/workflow";

const MODE_LABEL: Record<string, string> = { UPI: "UPI", CASH: "Cash", BANK_TRANSFER: "Bank", CHEQUE: "Cheque", CARD: "Card" };

const STATUS_VALUES = ["all", "pending", "completed", "balance_due"] as const;

export async function GET(req: Request) {
  const s = await getSession();
  if (!s) {
    return NextResponse.json({ ok: false, error: "UNAUTHENTICATED" }, { status: 401 });
  }
  const ownOnly = s.role === "SALES";
  if (s.role !== "OWNER" && s.role !== "ADMIN" && s.role !== "ACCOUNTS" && !ownOnly) {
    return NextResponse.json({ ok: false, error: "FORBIDDEN" }, { status: 403 });
  }
  const url = new URL(req.url);
  const m = url.searchParams.get("m");
  const f = url.searchParams.get("f");
  const q = url.searchParams.get("q");
  const sp = ownOnly ? s.userId : url.searchParams.get("sp");
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
  wb.creator = BRAND.name;
  wb.created = new Date();
  const ws = wb.addWorksheet("Orders");

  ws.columns = [
    { header: "S.No", key: "sno", width: 10 },
    { header: "Order date", key: "date", width: 12, style: { numFmt: "dd-mm-yyyy" } },
    { header: "Delivery date", key: "delivery", width: 14 },
    { header: "Employee", key: "sp", width: 18 },
    { header: "Customer", key: "cust", width: 24 },
    { header: "Contact", key: "contact", width: 20 },
    { header: "Products", key: "prod", width: 42 },
    { header: "Total", key: "total", width: 13, style: { numFmt: "#,##0.00" } },
    { header: "Received", key: "paid", width: 13, style: { numFmt: "#,##0.00" } },
    { header: "Balance", key: "bal", width: 13, style: { numFmt: "#,##0.00" } },
    { header: "Payment mode", key: "mode", width: 13 },
    { header: "Account name", key: "acc", width: 22 },
    { header: "Production", key: "production", width: 13 },
    { header: "Status", key: "status", width: 12 },
    { header: "Comments", key: "comments", width: 32 },
  ];
  ws.views = [{ state: "frozen", ySplit: 1 }];
  ws.getRow(1).font = { bold: true };
  ws.getRow(1).alignment = { vertical: "middle" };

  for (const r of rows) {
    // Blank (not 0) money cells when the sheet had no TOTAL.
    const blank = amountMissing(r);
    ws.addRow({
      sno: initialsNumber(r.salespersonName, r.serialNo),
      date: r.orderDate,
      sp: r.salespersonName,
      cust: r.customerLabel === "—" ? "" : r.customerLabel,
      contact: r.contactLabel === "—" ? "" : r.contactLabel,
      prod: r.productText ?? "",
      total: blank ? null : Number(r.total),
      paid: blank ? null : Number(r.paidTotal),
      bal: blank ? null : Number(r.balanceDue),
      delivery: r.promisedDeliveryDate ? r.promisedDeliveryDate.toISOString().slice(0, 10).split("-").reverse().join("-") : (r.sheetRow?.delivery ?? ""),
      mode: r.paymentMode ? (MODE_LABEL[r.paymentMode] ?? r.paymentMode) : "",
      acc: r.accDetails ?? r.sheetRow?.acc ?? "",
      production: r.simpleStatus === "CANCELLED" ? "" : PRODUCTION_LABEL[r.productionStatus],
      status: ORDER_STATUS_LABEL[r.simpleStatus],
      comments: r.notes ?? r.sheetRow?.comments ?? "",
    });
  }

  // Totals row — same rule as the on-screen summary: cancelled orders and
  // orders without a total are counted separately, not summed.
  if (rows.length > 0) {
    const s = summarise(rows);
    const extra = [
      s.noAmount ? `${s.noAmount} without amount` : "",
      s.cancelled ? `${s.cancelled} cancelled` : "",
    ].filter(Boolean);
    const totalsRow = ws.addRow({
      prod: `${s.orders} orders${extra.length ? ` (${extra.join(", ")})` : ""}`,
      total: s.total,
      paid: s.paid,
      bal: s.balance,
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
