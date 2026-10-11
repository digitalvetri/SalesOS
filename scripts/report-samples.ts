// Evidence helper (§17-P5): build each §11.14 report for the seeded pilot tenant,
// re-open the .xlsx with exceljs and print the header row + first 3 rows as markdown.
//   pnpm tsx scripts/report-samples.ts [from] [to]
import ExcelJS from "exceljs";
import { PrismaClient } from "@prisma/client";
import { buildReport, REPORTS } from "@/server/services/reportService";

const prisma = new PrismaClient();

function cell(v: ExcelJS.CellValue, fmt: string | undefined): string {
  if (v == null) return "";
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === "number" && fmt?.includes("₹")) return `₹${v.toLocaleString("en-IN")}`;
  return String(v).replace(/\|/g, "/");
}

async function main() {
  const tenant = await prisma.tenant.findUniqueOrThrow({ where: { slug: "ki-kfm-pilot" } });
  const today = new Date().toISOString().slice(0, 10);
  const from = process.argv[2] ?? `${new Date(Date.now() - 180 * 86_400_000).toISOString().slice(0, 10)}`;
  const to = process.argv[3] ?? today;
  for (const kind of REPORTS) {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load((await buildReport(kind, { tenantId: tenant.id, from, to })) as unknown as ArrayBuffer);
    const ws = wb.worksheets[0]!;
    const head = (ws.getRow(1).values as ExcelJS.CellValue[]).slice(1);
    console.log(`\n#### ${kind} — sheet "${ws.name}", ${ws.rowCount - 1} rows, frozen ySplit=${ws.views[0]?.ySplit}\n`);
    console.log(`| ${head.join(" | ")} |`);
    console.log(`|${head.map(() => "---").join("|")}|`);
    for (let r = 2; r <= Math.min(4, ws.rowCount); r++) {
      const row = ws.getRow(r);
      console.log(`| ${head.map((_, i) => cell(row.getCell(i + 1).value, row.getCell(i + 1).numFmt)).join(" | ")} |`);
    }
  }
}

main().finally(() => prisma.$disconnect());
