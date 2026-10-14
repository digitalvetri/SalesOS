// Production progress pill: Not started · On progress · Finished. Flat colours only.
import { Factory, Hammer, PackageCheck } from "lucide-react";
import { PRODUCTION_LABEL, type ProductionStatus } from "@/server/domain/v1_1/workflow";

export const PRODUCTION_PILL: Record<ProductionStatus, string> = {
  NOT_STARTED: "bg-[color:var(--color-surface-2)] text-[color:var(--color-ink-3)]",
  IN_PROGRESS: "bg-[#FFF4DB] text-[#8A5A00]",
  FINISHED: "bg-[color:var(--color-ok-bg)] text-[color:var(--color-ok)]",
};
const ICON = { NOT_STARTED: Factory, IN_PROGRESS: Hammer, FINISHED: PackageCheck } as const;

export function ProductionBadge({ status, className = "" }: { status: ProductionStatus; className?: string }) {
  const Icon = ICON[status];
  return (
    <span
      className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold ${PRODUCTION_PILL[status]} ${className}`}
      title={`Production: ${PRODUCTION_LABEL[status]}`}
    >
      <Icon className="h-3 w-3" aria-hidden />
      {PRODUCTION_LABEL[status]}
    </span>
  );
}
