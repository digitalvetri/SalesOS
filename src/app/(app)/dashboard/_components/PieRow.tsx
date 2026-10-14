// Spec §6 — donuts for the selected period: order status · payment modes ·
// (admin) sales by employee. 1 column on phones, 3 on desktop.
import { DonutChart } from "@/components/app/charts/DonutChart";
import { compactInr } from "@/lib/compactInr";
import { formatInr } from "@/lib/formatInr";
import { employeeSlices, paymentModeSlices, statusSlices } from "@/server/domain/dashboard/pies";
import type { OpsOverview } from "@/server/services/opsOverviewService";

const inr = (n: number) => formatInr(n.toFixed(2));

export function PieRow({
  ops,
  periodLabel,
  showEmployees = true,
}: {
  ops: Pick<OpsOverview, "status" | "paymentModes" | "salesByEmployee">;
  periodLabel: string;
  showEmployees?: boolean;
}) {
  const status = statusSlices(ops.status);
  const modes = paymentModeSlices(ops.paymentModes);
  const emp = employeeSlices(ops.salesByEmployee);
  const sum = (xs: { value: number }[]) => xs.reduce((a, x) => a + x.value, 0);
  return (
    <div className={`grid min-w-0 gap-4 sm:gap-5 ${showEmployees ? "lg:grid-cols-3" : "md:grid-cols-2"}`}>
      <DonutChart title="Order status" subtitle={`Orders booked in ${periodLabel}`} slices={status} caption="orders" />
      <DonutChart
        title="Payment modes"
        subtitle={`Money received in ${periodLabel}`}
        slices={modes}
        formatValue={inr}
        centerValue={compactInr(sum(modes))}
        caption="received"
      />
      {showEmployees && (
        <DonutChart
          title="Sales by employee"
          subtitle={`Order value booked in ${periodLabel}`}
          slices={emp}
          formatValue={inr}
          centerValue={compactInr(sum(emp))}
          caption="booked"
        />
      )}
    </div>
  );
}
