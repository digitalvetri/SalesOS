// Import the KI/KFM "ORDER DETAILS.xlsx" workbook (employees, products, orders).
//
// Dry run (default) — writes an Excel report, touches nothing:
//   pnpm exec dotenv run -f .env.local -- tsx scripts/import-order-details.ts --file "ORDER DETAILS.xlsx"
// Commit:
//   EMPLOYEE_PASSWORD='…' … tsx scripts/import-order-details.ts --file "…" --commit
//
// Options:
//   --exclude "MURUGAN,TURBO ORDER"   sheets to skip (default shown)
//   --unrecorded paid-if-delivered|unpaid|paid-if-account
//                                     rows with no ADV and no BAL: paid when STATUS says
//                                     delivered/completed (default, client's rule), else unpaid
//   --actor <email>                   who the import is recorded as (default: first Owner)
//   --report <path.xlsx>              report path (default: ./import-report.xlsx)
// Safe to re-run: orders already imported (same sheet + row) are skipped.
import { readFile } from "node:fs/promises";
import path from "node:path";
import ExcelJS from "exceljs";
import { prisma } from "../src/server/repo/client";
import {
  planOrderDetailsImport,
  commitOrderDetailsImport,
  type ImportPlan,
  type UnrecordedPayment,
} from "../src/server/services/orderDetailsImport";

const arg = (name: string, def?: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : def;
};
const COMMIT = process.argv.includes("--commit");
const istToday = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());
const inr = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;

const REASONS: Record<string, string> = {
  AMOUNT_MISSING: "no amount in the sheet (left empty)",
  PAYMENT_NOT_RECORDED: "ADV and BAL both empty — payment not recorded",
  ADV_BAL_CONFLICT: "ADV, BAL and TOTAL don't add up — check what was paid",
  AMOUNTS_ADDED: "several priced lines — amounts added up",
  DATE_SWAPPED: "Excel date read day/month-swapped",
  DATE_GUESSED: "date had a typo / was empty — corrected from the neighbouring rows",
  NO_NAME: "no customer name",
  NO_PHONE: "no valid mobile number",
  POSSIBLE_DUPLICATE: "same customer + amount + month on another sheet",
  FORMULA_UNRESOLVED: "a formula could not be worked out",
  CANCEL_MENTIONED: "a remark mentions cancelling — order kept as is",
};

async function writeReport(plan: ImportPlan, file: string) {
  const wb = new ExcelJS.Workbook();
  const money = (n: string) => Number(n);
  const sum = wb.addWorksheet("Summary");
  sum.columns = [{ header: "Employee", key: "e", width: 14 }, { header: "Login email", key: "m", width: 26 },
    { header: "Orders", key: "n", width: 9 }, { header: "Value", key: "v", width: 16 }, { header: "Paid", key: "p", width: 16 },
    { header: "Balance", key: "b", width: 16 }, { header: "Completed", key: "c", width: 11 }, { header: "Pending", key: "pe", width: 9 },
    { header: "Cancelled", key: "x", width: 10 }, { header: "No amount", key: "na", width: 11 },
    { header: "Payment not recorded", key: "nr", width: 20 }];
  for (const e of plan.employees) {
    const os = plan.orders.filter((o) => o.sheet === e.sheet);
    const live = os.filter((o) => o.status !== "CANCELLED");
    const s = (k: "total" | "paid" | "balance") => live.reduce((a, o) => a + money(o[k]), 0);
    sum.addRow({ e: e.name, m: e.email, n: os.length, v: s("total"), p: s("paid"), b: s("balance"),
      c: os.filter((o) => o.status === "COMPLETED").length, pe: os.filter((o) => o.status === "PENDING").length,
      x: os.filter((o) => o.status === "CANCELLED").length, na: os.filter((o) => o.totalMissing).length,
      nr: live.filter((o) => !o.paymentRecorded && !o.totalMissing).length });
  }

  const rec = wb.addWorksheet("Check vs sheet TOTALs");
  rec.columns = [{ header: "Sheet", key: "sheet", width: 12 }, { header: "Month", key: "month", width: 10 },
    { header: "Imported (sum of rows)", key: "computed", width: 22 }, { header: "Sheet's TOTAL row", key: "stated", width: 18 },
    { header: "Difference", key: "diff", width: 14 }, { header: "Note", key: "note", width: 70 }];
  for (const r of plan.reconciliation) {
    const diff = r.stated === null ? null : Number(r.computed) - Number(r.stated);
    rec.addRow({ sheet: r.sheet, month: r.month, computed: Number(r.computed), stated: r.stated === null ? "—" : Number(r.stated),
      diff: diff ?? "—", note: r.stated === null ? "no TOTAL row for this month in the sheet" : diff === 0 ? "matches" : "the TOTAL row was typed by hand — every row of the month is imported; please compare" });
  }

  const cols = [{ header: "Ref (sheet!row)", key: "ref", width: 15 }, { header: "Date", key: "date", width: 11 },
    { header: "Customer", key: "customerName", width: 26 }, { header: "Phone", key: "phone", width: 12 },
    { header: "Products", key: "productText", width: 50 }, { header: "Total", key: "total", width: 11 },
    { header: "Paid", key: "paid", width: 11 }, { header: "Balance", key: "balance", width: 11 },
    { header: "Status", key: "status", width: 11 }, { header: "Paid by", key: "method", width: 13 },
    { header: "Bill from", key: "entityCode", width: 9 }, { header: "Sheet: ADV", key: "adv", width: 12 },
    { header: "Sheet: BAL", key: "bal", width: 12 }, { header: "Sheet: ACC DETAILS", key: "acc", width: 22 },
    { header: "Sheet: comments", key: "comments", width: 40 }, { header: "Checks", key: "checks", width: 70 }];
  const orders = wb.addWorksheet("Orders");
  orders.columns = cols;
  const review = wb.addWorksheet("Needs review");
  review.columns = cols;
  const reviewFlags = new Set(["AMOUNT_MISSING", "ADV_BAL_CONFLICT", "AMOUNTS_ADDED", "DATE_GUESSED", "POSSIBLE_DUPLICATE", "FORMULA_UNRESOLVED", "CANCEL_MENTIONED"]);
  for (const o of plan.orders) {
    const checks = o.flags.map((f) => REASONS[f] ?? f).join("; ");
    const row = {
      ...o,
      total: o.totalMissing ? "" : money(o.total),
      paid: money(o.paid),
      balance: o.totalMissing ? "" : money(o.balance),
      adv: o.sheetRow.adv ?? "",
      bal: o.sheetRow.bal ?? "",
      acc: o.sheetRow.acc ?? "",
      comments: o.sheetRow.comments ?? "",
      checks,
    };
    orders.addRow(row);
    if (o.flags.some((f) => reviewFlags.has(f))) review.addRow(row);
  }

  const sk = wb.addWorksheet("Rows not imported");
  sk.columns = [{ header: "Ref (sheet!row)", key: "ref", width: 18 }, { header: "Why", key: "reason", width: 60 }];
  for (const s of plan.skipped) sk.addRow(s);

  if (plan.products) {
    const p = wb.addWorksheet("Products");
    p.columns = [{ header: "Category", key: "category", width: 26 }, { header: "Product", key: "name", width: 40 },
      { header: "HP / spec", key: "spec", width: 14 }, { header: "Dealer w/o motor", key: "a", width: 16 },
      { header: "Dealer", key: "b", width: 12 }, { header: "Customer", key: "c", width: 12 }];
    for (const r of plan.products.rows)
      p.addRow({ category: r.category, name: r.name, spec: r.spec, a: r.dealerPriceWoMotor?.toNumber() ?? null,
        b: r.dealerPrice?.toNumber() ?? null, c: r.customerPrice?.toNumber() ?? null });
  }
  for (const ws of wb.worksheets) {
    ws.getRow(1).font = { bold: true };
    ws.views = [{ state: "frozen", ySplit: 1 }];
  }
  await wb.xlsx.writeFile(file);
}

async function main() {
  const file = arg("file");
  if (!file) throw new Error('Usage: tsx scripts/import-order-details.ts --file "ORDER DETAILS.xlsx" [--commit]');
  const exclude = (arg("exclude", "MURUGAN,TURBO ORDER") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  const unrecordedArg = arg("unrecorded", "paid-if-delivered");
  const unrecordedPayment: UnrecordedPayment =
    unrecordedArg === "paid-if-account" ? "PAID_IF_ACCOUNT" : unrecordedArg === "unpaid" ? "UNPAID" : "PAID_IF_DELIVERED";
  const plan = await planOrderDetailsImport(await readFile(file), { excludeSheets: exclude, latest: istToday(), unrecordedPayment });

  const reportPath = path.resolve(arg("report", "import-report.xlsx")!);
  await writeReport(plan, reportPath);

  const live = plan.orders.filter((o) => o.status !== "CANCELLED");
  const total = live.reduce((a, o) => a + Number(o.total), 0);
  const paid = live.reduce((a, o) => a + Number(o.paid), 0);
  const bal = live.reduce((a, o) => a + Number(o.balance), 0);
  console.log(`Excluded sheets: ${plan.excludedSheets.join(", ") || "(none)"}`);
  console.log(`Employees: ${plan.employees.map((e) => `${e.name} <${e.email}> (${e.orders})`).join(", ")}`);
  console.log(`Orders: ${plan.orders.length} (${plan.orders.length - live.length} cancelled) · value ${inr(total)} · paid ${inr(paid)} · balance ${inr(bal)}`);
  console.log(`  no amount: ${plan.orders.filter((o) => o.totalMissing).length} · no phone: ${plan.orders.filter((o) => !o.phone).length} · payment not recorded: ${live.filter((o) => !o.paymentRecorded && !o.totalMissing).length} (${unrecordedPayment})`);
  console.log(`  rows not imported (summary tables / repeated rows): ${plan.skipped.length}`);
  const off = plan.reconciliation.filter((r) => r.stated !== null && r.diffPct !== 0);
  console.log(`  months matching the sheet's TOTAL row: ${plan.reconciliation.filter((r) => r.diffPct === 0).length}/${plan.reconciliation.filter((r) => r.stated !== null).length}${off.length ? ` (differs: ${off.map((r) => `${r.sheet} ${r.month} ${r.diffPct}%`).join(", ")})` : ""}`);
  console.log(`Products: ${plan.products?.rows.length ?? 0} in ${plan.products?.categories.length ?? 0} categories`);
  console.log(`Report: ${reportPath}`);

  if (!COMMIT) {
    console.log("\nDry run — nothing written. Re-run with --commit to import.");
    return;
  }
  const password = process.env.EMPLOYEE_PASSWORD;
  if (!password || password.length < 6) throw new Error("Set EMPLOYEE_PASSWORD (temporary password for the new employee logins).");
  const tenant = await prisma.tenant.findFirst({ orderBy: { createdAt: "asc" }, select: { id: true, name: true } });
  if (!tenant) throw new Error("No company (tenant) found — start the app once to run first-run setup.");
  const actorEmail = arg("actor");
  const actor = await prisma.user.findFirst({
    where: { tenantId: tenant.id, ...(actorEmail ? { email: actorEmail.toLowerCase() } : { role: "OWNER" }) },
    select: { id: true, name: true },
  });
  if (!actor) throw new Error("No Owner (or --actor) user found.");
  console.log(`\nCommitting into "${tenant.name}" as ${actor.name}…`);
  const s = await commitOrderDetailsImport(plan, { tenantId: tenant.id, actorId: actor.id, employeePassword: password });
  console.log(JSON.stringify(s, null, 2));
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
