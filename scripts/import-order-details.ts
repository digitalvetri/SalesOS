// Import the KI/KFM "ORDER DETAILS.xlsx" workbook (employees, products, orders).
//
// Dry run (default) — writes an Excel report, touches nothing:
//   pnpm exec dotenv run -f .env.local -- tsx scripts/import-order-details.ts --file "ORDER DETAILS.xlsx"
// Commit:
//   EMPLOYEE_PASSWORD='…' … tsx scripts/import-order-details.ts --file "…" --commit
//
// Options:
//   --exclude "MURUGAN,TURBO ORDER"   sheets to skip (default shown)
//   --actor <email>                   who the import is recorded as (default: first Owner)
//   --report <path.xlsx>              report path (default: ./import-report.xlsx)
// Safe to re-run: orders already imported (same sheet + row) are skipped.
import { readFile } from "node:fs/promises";
import path from "node:path";
import ExcelJS from "exceljs";
import { prisma } from "../src/server/repo/client";
import { planOrderDetailsImport, commitOrderDetailsImport, type ImportPlan } from "../src/server/services/orderDetailsImport";

const arg = (name: string, def?: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : def;
};
const COMMIT = process.argv.includes("--commit");
const istToday = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());
const inr = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;

async function writeReport(plan: ImportPlan, file: string) {
  const wb = new ExcelJS.Workbook();
  const sum = wb.addWorksheet("Summary");
  sum.columns = [{ header: "Employee", key: "e", width: 14 }, { header: "Login email", key: "m", width: 26 },
    { header: "Orders", key: "n", width: 9 }, { header: "Value", key: "v", width: 16 }, { header: "Paid", key: "p", width: 16 },
    { header: "Balance", key: "b", width: 16 }, { header: "Completed", key: "c", width: 11 }, { header: "Pending", key: "pe", width: 9 },
    { header: "Cancelled", key: "x", width: 10 }, { header: "No price (₹1)", key: "np", width: 13 }];
  for (const e of plan.employees) {
    const os = plan.orders.filter((o) => o.sheet === e.sheet);
    const s = (k: "total" | "paid" | "balance") => os.reduce((a, o) => a + Number(o[k]), 0);
    sum.addRow({ e: e.name, m: e.email, n: os.length, v: s("total"), p: s("paid"), b: s("balance"),
      c: os.filter((o) => o.status === "COMPLETED").length, pe: os.filter((o) => o.status === "PENDING").length,
      x: os.filter((o) => o.status === "CANCELLED").length, np: os.filter((o) => o.priceMissing).length });
  }
  const cols = [{ header: "Ref (sheet!row)", key: "ref", width: 15 }, { header: "Date", key: "date", width: 11 },
    { header: "Customer", key: "customerName", width: 26 }, { header: "Phone", key: "phone", width: 12 },
    { header: "Products", key: "productText", width: 50 }, { header: "Total", key: "total", width: 11 },
    { header: "Paid", key: "paid", width: 11 }, { header: "Balance", key: "balance", width: 11 },
    { header: "Status", key: "status", width: 11 }, { header: "Paid by", key: "method", width: 13 },
    { header: "Bill from", key: "entityCode", width: 9 }, { header: "Notes / checks", key: "checks", width: 60 }];
  const orders = wb.addWorksheet("Orders");
  orders.columns = cols;
  const review = wb.addWorksheet("Needs review");
  review.columns = cols;
  const why = (o: ImportPlan["orders"][number]) => [
    o.priceMissing ? "PRICE MISSING (₹1 placeholder)" : "",
    o.flags.includes("DATE_SWAPPED") ? "date read day/month-swapped" : "",
    o.flags.includes("DATE_GUESSED") ? "date guessed from neighbouring rows" : "",
    o.flags.includes("NO_NAME") ? "no customer name" : "",
    !o.phone ? "no valid mobile number" : "",
    o.flags.includes("POSSIBLE_DUPLICATE") ? "possible duplicate of another row" : "",
    o.flags.includes("FORMULA_UNRESOLVED") ? "amount was a formula — check it" : "",
    o.note ?? "",
  ].filter(Boolean).join("; ");
  for (const o of plan.orders) {
    const row = { ...o, total: Number(o.total), paid: Number(o.paid), balance: Number(o.balance), checks: why(o) };
    orders.addRow(row);
    if (row.checks) review.addRow(row);
  }
  if (plan.products) {
    const p = wb.addWorksheet("Products");
    p.columns = [{ header: "Category", key: "category", width: 26 }, { header: "Product", key: "name", width: 40 },
      { header: "HP / spec", key: "spec", width: 14 }, { header: "Dealer w/o motor", key: "a", width: 16 },
      { header: "Dealer", key: "b", width: 12 }, { header: "Customer", key: "c", width: 12 }];
    for (const r of plan.products.rows)
      p.addRow({ category: r.category, name: r.name, spec: r.spec, a: r.dealerPriceWoMotor?.toNumber() ?? null,
        b: r.dealerPrice?.toNumber() ?? null, c: r.customerPrice?.toNumber() ?? null });
  }
  for (const ws of wb.worksheets) ws.getRow(1).font = { bold: true };
  await wb.xlsx.writeFile(file);
}

async function main() {
  const file = arg("file");
  if (!file) throw new Error('Usage: tsx scripts/import-order-details.ts --file "ORDER DETAILS.xlsx" [--commit]');
  const exclude = (arg("exclude", "MURUGAN,TURBO ORDER") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  const plan = await planOrderDetailsImport(await readFile(file), { excludeSheets: exclude, latest: istToday() });

  const reportPath = path.resolve(arg("report", "import-report.xlsx")!);
  await writeReport(plan, reportPath);

  const total = plan.orders.reduce((a, o) => a + Number(o.total), 0);
  const paid = plan.orders.reduce((a, o) => a + Number(o.paid), 0);
  console.log(`Excluded sheets: ${plan.excludedSheets.join(", ") || "(none)"}`);
  console.log(`Employees: ${plan.employees.map((e) => `${e.name} <${e.email}> (${e.orders})`).join(", ")}`);
  console.log(`Orders: ${plan.orders.length} · value ${inr(total)} · paid ${inr(paid)} · balance ${inr(total - paid)}`);
  const needsReview = plan.orders.filter(
    (o) => o.priceMissing || !o.phone || o.flags.some((f) => f !== "BALANCE_MISMATCH" && f !== "NO_PHONE"),
  ).length;
  console.log(`  needs review: ${needsReview} rows (see "Needs review" in the report)`);
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
