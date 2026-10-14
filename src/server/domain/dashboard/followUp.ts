// Delivery follow-up (spec §6). Pure — no IO.
// Pending orders (not delivered / cancelled) grouped by their promised delivery
// date, an IST calendar date as YYYY-MM-DD:
//   overdue (before today) · today · week (1–7 days ahead) · later (8+ days) · noDate.
// Each group is sorted by date ascending (stable for equal dates).
import { daysBetween } from "@/server/domain/payment/collect";
import type { ProductionStatus } from "@/server/domain/v1_1/workflow";

export type FollowUpItem = {
  id: string;
  deliveryDate: string | null; // YYYY-MM-DD
  customer: string;
  productText: string | null;
  salesperson: string;
  productionStatus: ProductionStatus;
};

export type FollowUpGroups = {
  overdue: FollowUpItem[];
  today: FollowUpItem[];
  week: FollowUpItem[];
  later: FollowUpItem[];
  noDate: FollowUpItem[];
};

export const FOLLOW_UP_GROUPS: { key: keyof FollowUpGroups; label: string }[] = [
  { key: "overdue", label: "Overdue" },
  { key: "today", label: "Today" },
  { key: "week", label: "Next 7 days" },
  { key: "later", label: "Later" },
  { key: "noDate", label: "No date" },
];

export function groupFollowUps(items: FollowUpItem[], todayYmd: string): FollowUpGroups {
  const g: FollowUpGroups = { overdue: [], today: [], week: [], later: [], noDate: [] };
  const sorted = [...items].sort((a, b) => (a.deliveryDate ?? "").localeCompare(b.deliveryDate ?? ""));
  for (const it of sorted) {
    if (!it.deliveryDate) {
      g.noDate.push(it);
      continue;
    }
    const n = daysBetween(todayYmd, it.deliveryDate);
    if (n < 0) g.overdue.push(it);
    else if (n === 0) g.today.push(it);
    else if (n <= 7) g.week.push(it);
    else g.later.push(it);
  }
  return g;
}

/** Short badge for a delivery date: "3 days late" / "Today" / "Tomorrow" / "in 5 days" / "No date". */
export function followUpBadge(deliveryDate: string | null, todayYmd: string): string {
  if (!deliveryDate) return "No date";
  const n = daysBetween(todayYmd, deliveryDate);
  if (n < 0) return `${-n} ${n === -1 ? "day" : "days"} late`;
  if (n === 0) return "Today";
  if (n === 1) return "Tomorrow";
  return `in ${n} days`;
}

export function followUpCount(g: FollowUpGroups): number {
  return g.overdue.length + g.today.length + g.week.length + g.later.length + g.noDate.length;
}
