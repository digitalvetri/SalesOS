// v1.1 §1.1 — the Payments page was removed. Payment entries now live inside
// each order (added via the order detail). Any direct nav here redirects to
// the role's Overview.
import { redirect } from "next/navigation";
import { requireSession } from "@/server/auth/session";

export default async function PaymentsRedirect() {
  const s = await requireSession();
  redirect(s.role === "OWNER" || s.role === "ADMIN" || s.role === "ACCOUNTS" ? "/dashboard" : "/home");
}
