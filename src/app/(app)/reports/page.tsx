// v1.1 §1.1 — Reports removed. The Orders sheet has a "Download Excel" button
// for the current filtered view (admin only, built in a later phase).
import { redirect } from "next/navigation";
import { requireSession } from "@/server/auth/session";

export default async function ReportsRedirect() {
  const s = await requireSession();
  redirect(s.role === "OWNER" || s.role === "ADMIN" || s.role === "ACCOUNTS" ? "/dashboard" : "/home");
}
