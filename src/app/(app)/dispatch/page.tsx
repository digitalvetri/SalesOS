// v1.1 §1.1 — Dispatch board removed. Status collapsed to Pending/Completed/Cancelled;
// completion happens inline on the order sheet.
import { redirect } from "next/navigation";
import { requireSession } from "@/server/auth/session";

export default async function DispatchRedirect() {
  const s = await requireSession();
  redirect(s.role === "OWNER" || s.role === "ADMIN" || s.role === "ACCOUNTS" ? "/dashboard" : "/home");
}
